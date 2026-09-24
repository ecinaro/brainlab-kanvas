import { api } from '../api';
import { PROJECT_ID, useCanvas } from '../store';
import type { Job } from './types';

/**
 * Sunucudaki görev güncellemelerini SSE ile dinler. EventSource özel başlık gönderemediği için
 * fetch akışı kullanılır. Bağlantı koparsa yeniden bağlanır ve tam durumu yeniden çeker.
 */
export function startJobStream(): () => void {
  let stopped = false;
  let ctrl: AbortController | null = null;

  async function loop() {
    while (!stopped) {
      try {
        ctrl = new AbortController();
        const res = await fetch('/api/events', { headers: { 'X-Canvas-Client': '1' }, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
        // Bağlandıktan sonra kaçırılan güncellemeler için tam liste.
        useCanvas.getState().setJobs(await api<Job[]>(`/jobs?projectId=${PROJECT_ID}`));

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const data = chunk
              .split('\n')
              .filter((l) => l.startsWith('data: '))
              .map((l) => l.slice(6))
              .join('\n');
            if (!data || !chunk.includes('event: job')) continue;
            const job = JSON.parse(data) as Job;
            if (job.projectId === PROJECT_ID) useCanvas.getState().upsertJob(job);
          }
        }
      } catch {
        /* yeniden bağlanılacak */
      }
      if (!stopped) await new Promise((r) => setTimeout(r, 2000));
    }
  }

  loop();
  return () => {
    stopped = true;
    ctrl?.abort();
  };
}
