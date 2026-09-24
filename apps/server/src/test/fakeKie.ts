/** Kie.ai'yi taklit eden bellek içi fetch. Gerçek ağ ve kredi kullanılmaz. */

export type FakeStep =
  | { state: 'waiting' | 'queuing' | 'generating'; progress?: number }
  | { state: 'success'; urls?: string[]; credits?: number }
  | { state: 'fail'; failCode?: string; failMsg?: string; credits?: number };

export interface FakeKieOptions {
  /** Her yeni görev için durum senaryosu; son adım tekrarlanır. */
  script?: FakeStep[];
  /** createTask'ın sırayla döndüreceği hata kodları (boşalınca başarı). */
  createErrors?: number[];
  /** Sonuç dosyası indirmesinin ilk N denemede başarısız olması. */
  downloadFailures?: number;
  /** true dönerse görev "fail" ile biter (sahte modda "[fail]" içeren prompt'lar için) */
  failWhen?: (input: Record<string, unknown>) => boolean;
  /** Sayı dönerse createTask bu Kie hata koduyla reddedilir (sahte modda "[402]" için) */
  createErrorWhen?: (input: Record<string, unknown>) => number | undefined;
  /** Sonuç indirmelerinde döndürülecek gerçek dosya içerikleri (sahte mod önizlemesi için) */
  sampleImage?: Uint8Array;
  sampleVideo?: Uint8Array;
}

export class FakeKie {
  createCalls: { model: string; input: Record<string, unknown> }[] = [];
  recordCalls = 0;
  uploads: string[] = [];
  private tasks = new Map<string, { step: number; script: FakeStep[] }>();
  private seq = 0;
  private downloadFailures: number;

  constructor(private opts: FakeKieOptions = {}) {
    this.downloadFailures = opts.downloadFailures ?? 0;
  }

  /** Mevcut bir görevi (örn. resume testi için) kayıtlı hale getirir. */
  seedTask(taskId: string, script: FakeStep[]) {
    this.tasks.set(taskId, { step: 0, script });
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? 'GET';
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

    if (url.pathname === '/api/v1/jobs/createTask' && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      this.createCalls.push(body);
      const err = this.opts.createErrors?.shift() ?? this.opts.createErrorWhen?.(body.input);
      if (err) return json({ code: err, msg: `fake error ${err}`, data: null }, err >= 500 ? err : 200);
      const taskId = `task_${++this.seq}`;
      const isVideo = /video|kling|seedance|hailuo/.test(String(body.model));
      const script: FakeStep[] = this.opts.failWhen?.(body.input)
        ? [{ state: 'generating' }, { state: 'fail', failCode: '500', failMsg: 'Sahte hata ([fail] prompt)' }]
        : (this.opts.script ?? [{ state: 'success' }]).map((s) =>
            s.state === 'success' && !s.urls ? { ...s, urls: [`https://files.kie.test/${taskId}.${isVideo ? 'mp4' : 'png'}`] } : s,
          );
      this.tasks.set(taskId, { step: 0, script });
      return json({ code: 200, msg: 'success', data: { taskId } });
    }

    if (url.pathname === '/api/v1/jobs/recordInfo') {
      this.recordCalls++;
      const taskId = url.searchParams.get('taskId')!;
      const task = this.tasks.get(taskId);
      if (!task) return json({ code: 404, msg: 'not found', data: null });
      const step = task.script[Math.min(task.step, task.script.length - 1)];
      task.step++;
      const data: Record<string, unknown> = { taskId, state: step.state, resultJson: '', failCode: '', failMsg: '' };
      if (step.state === 'success') {
        data.resultJson = JSON.stringify({ resultUrls: step.urls ?? [`https://files.kie.test/${taskId}.png`] });
        data.creditsConsumed = step.credits ?? 8;
      } else if (step.state === 'fail') {
        data.failCode = step.failCode ?? '500';
        data.failMsg = step.failMsg ?? 'content policy';
        data.creditsConsumed = step.credits ?? 0;
      } else {
        data.progress = step.progress ?? null;
      }
      return json({ code: 200, msg: 'success', data });
    }

    if (url.pathname === '/api/file-stream-upload' && method === 'POST') {
      const form = init?.body as FormData;
      const name = String(form.get('fileName'));
      this.uploads.push(name);
      return json({ success: true, code: 200, msg: 'ok', data: { downloadUrl: `https://tmp.kie.test/${name}` } });
    }

    if (url.hostname === 'files.kie.test') {
      if (this.downloadFailures > 0) {
        this.downloadFailures--;
        return new Response('boom', { status: 503 });
      }
      const isVideo = url.pathname.endsWith('.mp4');
      const body = (isVideo ? this.opts.sampleVideo : this.opts.sampleImage) ?? new Uint8Array([1, 2, 3, 4]);
      return new Response(new Blob([body as Uint8Array<ArrayBuffer>]), {
        status: 200,
        headers: { 'content-type': isVideo ? 'video/mp4' : 'image/png' },
      });
    }

    if (url.pathname === '/api/v1/chat/credit') return json({ code: 200, msg: 'success', data: 80 });

    return json({ code: 404, msg: 'unknown route', data: null }, 404);
  };
}

/** Uyku çağrılarında sanal saati ilerleten sahte zaman. */
export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
      await new Promise((r) => setImmediate(r));
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}
