import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';
import type { JobRow, JobState, Store } from '../db.js';
import { KieError, type KieClient } from '../kie/client.js';
import { RateLimiter } from '../kie/rateLimiter.js';

/** Girdi değerlerinde yerel dosya referansı: "local:uploads/abc.png" (data klasörüne göre). */
export const LOCAL_PREFIX = 'local:';

export interface JobManagerOptions {
  kie: KieClient;
  store: Store;
  dataDir: string;
  limiter?: RateLimiter;
  pollInitialMs?: number;
  pollMaxMs?: number;
  pollFactor?: number;
  /** Yüklenen / üretilen Kie URL'leri bu süreden eskiyse bayat sayılır. */
  uploadTtlMs?: number;
  submitRetries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface CreateJobInput {
  projectId: string;
  nodeId: string;
  kieModel: string;
  input: Record<string, unknown>;
  outputType?: 'image' | 'video' | null;
  timeoutSec?: number;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
};

export class JobManager extends EventEmitter {
  private readonly o: Required<Omit<JobManagerOptions, 'limiter'>> & { limiter: RateLimiter };
  private active = new Set<string>();
  private stopped = false;

  constructor(opts: JobManagerOptions) {
    super();
    this.o = {
      limiter: opts.limiter ?? new RateLimiter(),
      pollInitialMs: 3000,
      pollMaxMs: 20_000,
      pollFactor: 1.5,
      uploadTtlMs: 20 * 3600_000,
      submitRetries: 3,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      ...opts,
    } as JobManager['o'];
  }

  get mediaDir() {
    return join(this.o.dataDir, 'media');
  }

  /** Veri klasörü dışına çıkan yolları reddeder. */
  resolveDataPath(rel: string): string {
    const root = resolve(this.o.dataDir);
    const full = resolve(root, rel);
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`Geçersiz yol: ${rel}`);
    return full;
  }

  create(req: CreateJobInput): JobRow {
    const now = this.o.now();
    const job: JobRow = {
      id: randomUUID(),
      projectId: req.projectId,
      nodeId: req.nodeId,
      kieModel: req.kieModel,
      input: req.input,
      outputType: req.outputType ?? null,
      state: 'submitting',
      taskId: null,
      progress: null,
      resultUrls: [],
      files: [],
      credits: null,
      errorCode: null,
      errorMsg: null,
      timeoutSec: req.timeoutSec ?? (req.outputType === 'video' ? 1200 : 600),
      createdAt: now,
      submittedAt: null,
      finishedAt: null,
      updatedAt: now,
    };
    this.o.store.insertJob(job);
    this.emitJob(job.id);
    this.track(job.id, () => this.submit(job.id));
    return this.o.store.getJob(job.id)!;
  }

  /** Sunucu açılışında yarım kalan görevleri kaldığı yerden sürdürür. */
  resume(): number {
    const jobs = this.o.store.unfinishedJobs();
    for (const job of jobs) {
      if (job.state === 'submitting' || !job.taskId) {
        // Gönderim sırasında kapandıysa istek Kie'ye ulaşmış olabilir; çift ücret riski yüzünden otomatik tekrar yok.
        this.patch(job.id, {
          state: 'fail',
          errorCode: 'interrupted',
          errorMsg: 'Sunucu görev gönderilirken kapandı. Kie panelinden kontrol edip gerekirse tekrar deneyin.',
          finishedAt: this.o.now(),
        });
      } else if (job.state === 'downloading') {
        this.track(job.id, () => this.download(job.id));
      } else {
        this.track(job.id, () => this.poll(job.id));
      }
    }
    return jobs.length;
  }

  /** Zaman aşımına uğramış bir görevi yeniden izlemeye alır (taskId korunur, yeni ücret yok). */
  keepWatching(id: string) {
    const job = this.o.store.getJob(id);
    if (!job || job.state !== 'timeout' || !job.taskId) throw new Error('Görev izlemeye alınamaz');
    this.patch(id, { state: 'waiting', errorCode: null, errorMsg: null, submittedAt: this.o.now(), finishedAt: null });
    this.track(id, () => this.poll(id));
  }

  get(id: string) {
    return this.o.store.getJob(id);
  }

  list(projectId?: string) {
    return this.o.store.listJobs(projectId);
  }

  get store() {
    return this.o.store;
  }

  /** Testler ve kapanış için: aktif işlerin bitmesini bekler. */
  async idle() {
    while (this.active.size) await new Promise((r) => setTimeout(r, 5));
  }

  stop() {
    this.stopped = true;
  }

  // ---------------------------------------------------------------------------

  private track(id: string, fn: () => Promise<void>) {
    this.active.add(id);
    fn()
      .catch((err) => {
        this.patch(id, {
          state: 'fail',
          errorCode: err instanceof KieError ? String(err.code) : 'internal',
          errorMsg: (err as Error).message,
          finishedAt: this.o.now(),
        });
      })
      .finally(() => this.active.delete(id));
  }

  private patch(id: string, patch: Partial<JobRow>) {
    this.o.store.updateJob(id, patch);
    this.emitJob(id);
  }

  private emitJob(id: string) {
    const job = this.o.store.getJob(id);
    if (job) this.emit('job', job);
  }

  private async submit(id: string) {
    const job = this.o.store.getJob(id)!;
    const input = await this.resolveLocalRefs(job.input);
    let attempt = 0;
    for (;;) {
      await this.o.limiter.acquire();
      try {
        const taskId = await this.o.kie.createTask(job.kieModel, input);
        this.patch(id, { taskId, state: 'waiting', submittedAt: this.o.now() });
        break;
      } catch (err) {
        if (err instanceof KieError && err.retryable && attempt < this.o.submitRetries) {
          attempt++;
          await this.o.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
    await this.poll(id);
  }

  private async poll(id: string) {
    let delay = this.o.pollInitialMs;
    let transientErrors = 0;
    while (!this.stopped) {
      const job = this.o.store.getJob(id)!;
      if (this.o.now() - (job.submittedAt ?? job.createdAt) > job.timeoutSec * 1000) {
        this.patch(id, {
          state: 'timeout',
          errorCode: 'timeout',
          errorMsg: `${Math.round(job.timeoutSec / 60)} dakikada tamamlanmadı. taskId saklandı, izlemeye devam edilebilir.`,
          finishedAt: this.o.now(),
        });
        return;
      }
      await this.o.sleep(delay);
      delay = Math.min(this.o.pollMaxMs, Math.round(delay * this.o.pollFactor));

      let info;
      try {
        info = await this.o.kie.getTask(job.taskId!);
        transientErrors = 0;
      } catch (err) {
        // Durum sorgusu ücretsiz; geçici hatalarda sabırla devam edilir.
        if (err instanceof KieError && err.retryable && ++transientErrors <= 10) continue;
        throw err;
      }

      if (info.state === 'success') {
        this.patch(id, {
          state: 'downloading',
          resultUrls: info.resultUrls,
          credits: info.creditsConsumed,
          progress: 100,
        });
        await this.download(id);
        return;
      }
      if (info.state === 'fail') {
        this.patch(id, {
          state: 'fail',
          errorCode: info.failCode || '501',
          errorMsg: info.failMsg || 'Üretim başarısız',
          credits: info.creditsConsumed,
          finishedAt: this.o.now(),
        });
        return;
      }
      const state = (['waiting', 'queuing', 'generating'] as JobState[]).includes(info.state as JobState)
        ? (info.state as JobState)
        : job.state;
      if (state !== job.state || info.progress !== job.progress) {
        this.patch(id, { state, progress: info.progress });
      }
    }
  }

  private async download(id: string) {
    const job = this.o.store.getJob(id)!;
    if (!job.resultUrls.length) {
      this.patch(id, {
        state: 'fail',
        errorCode: 'no_result',
        errorMsg: 'Görev başarılı ama sonuç URL\'i dönmedi',
        finishedAt: this.o.now(),
      });
      return;
    }
    const dir = join(this.mediaDir, safeSegment(job.projectId), safeSegment(job.nodeId));
    await mkdir(dir, { recursive: true });

    const files: string[] = [];
    for (const [i, url] of job.resultUrls.entries()) {
      files.push(await this.downloadOne(url, dir, `${job.id}_${i}`));
    }
    const rel = files.map((f) => relative(this.o.dataDir, f).split(sep).join('/'));
    const finishedAt = this.o.now();
    const done = { ...job, files: rel, state: 'success' as const, finishedAt };
    await writeFile(join(dir, `${job.id}.json`), JSON.stringify(sidecar(done), null, 2));
    this.patch(id, { files: rel, state: 'success', finishedAt });
  }

  private async downloadOne(url: string, dir: string, base: string): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.o.kie.fetchImpl(url, { signal: AbortSignal.timeout(300_000) });
        if (!res.ok || !res.body) throw new Error(`İndirme HTTP ${res.status}`);
        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
        const urlExt = extname(new URL(url).pathname).toLowerCase();
        const ext = /^\.[a-z0-9]{2,5}$/.test(urlExt) ? urlExt : (EXT_BY_TYPE[type] ?? '.bin');
        const target = join(dir, base + ext);
        const tmp = target + '.part';
        await pipeline(Readable.fromWeb(res.body as unknown as NodeWebStream), createWriteStream(tmp));
        await rename(tmp, target);
        return target;
      } catch (err) {
        lastErr = err;
        await this.o.sleep(1000 * (attempt + 1));
      }
    }
    throw new KieError(0, `Sonuç indirilemedi: ${(lastErr as Error)?.message}`);
  }

  /** "local:..." referanslarını Kie'ye yükleyip URL'e çevirir. Aynı içerik 20 saat içinde tekrar yüklenmez. */
  private async resolveLocalRefs(value: unknown): Promise<any> {
    if (typeof value === 'string' && value.startsWith(LOCAL_PREFIX)) {
      return this.uploadLocal(value.slice(LOCAL_PREFIX.length));
    }
    if (Array.isArray(value)) return Promise.all(value.map((v) => this.resolveLocalRefs(v)));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = await this.resolveLocalRefs(v);
      return out;
    }
    return value;
  }

  private async uploadLocal(rel: string): Promise<string> {
    const full = this.resolveDataPath(rel);
    const hash = await hashFile(full);
    const cached = this.o.store.getUpload(hash);
    if (cached && this.o.now() - cached.uploadedAt < this.o.uploadTtlMs) return cached.url;
    const url = await this.o.kie.uploadFile(full, `${hash.slice(0, 16)}${extname(full)}`);
    this.o.store.putUpload(hash, url, this.o.now());
    return url;
  }
}

function safeSegment(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || '_';
}

async function hashFile(path: string) {
  const h = createHash('sha256');
  await pipeline(createReadStream(path), h);
  return h.digest('hex');
}

/** Dosyanın yanına yazılan metadata: sonucun nasıl üretildiği. */
function sidecar(job: JobRow) {
  return {
    app: 'BrainLab Kanvas',
    jobId: job.id,
    projectId: job.projectId,
    nodeId: job.nodeId,
    model: job.kieModel,
    input: job.input,
    taskId: job.taskId,
    credits: job.credits,
    files: job.files,
    createdAt: new Date(job.createdAt).toISOString(),
    finishedAt: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
  };
}
