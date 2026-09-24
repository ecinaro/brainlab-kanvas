import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type JobRow, Store } from '../db.js';
import { KieClient, parseResultJson } from '../kie/client.js';
import { RateLimiter } from '../kie/rateLimiter.js';
import { FakeKie, type FakeKieOptions, fakeClock } from '../test/fakeKie.js';
import { JobManager } from './manager.js';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'blk-'));
});
afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

function setup(fakeOpts: FakeKieOptions = {}, storeFile = ':memory:') {
  const fake = new FakeKie(fakeOpts);
  const clock = fakeClock();
  const kie = new KieClient({
    apiKey: 'k',
    baseUrl: 'https://kie.test',
    uploadBaseUrl: 'https://upload.kie.test',
    fetchImpl: fake.fetch,
  });
  const store = new Store(storeFile);
  const manager = new JobManager({
    kie,
    store,
    dataDir,
    now: clock.now,
    sleep: clock.sleep,
    limiter: new RateLimiter(20, 10_000, clock.now, clock.sleep),
  });
  const events: JobRow[] = [];
  manager.on('job', (j) => events.push(j));
  return { fake, clock, kie, store, manager, events };
}

const base = { projectId: 'p1', nodeId: 'n1', kieModel: 'nano-banana-2', input: { prompt: 'kedi' } };

describe('parseResultJson', () => {
  it('resultUrls string JSON içinden çıkarılır', () => {
    expect(parseResultJson('{"resultUrls":["https://a/x.png"]}').resultUrls).toEqual(['https://a/x.png']);
  });
  it('resultObject biçimi desteklenir', () => {
    expect(parseResultJson('{"resultObject":{"a":1}}')).toEqual({ resultUrls: [], resultObject: { a: 1 } });
  });
  it('bozuk veya boş değer hata atmaz', () => {
    expect(parseResultJson('{bozuk').resultUrls).toEqual([]);
    expect(parseResultJson(null).resultUrls).toEqual([]);
  });
});

describe('JobManager', () => {
  it('başarılı görev: durumlar ilerler, dosya ve sidecar diske yazılır, kredi kaydedilir', async () => {
    const { manager, events, fake } = setup({
      script: [{ state: 'queuing' }, { state: 'generating', progress: 40 }, { state: 'success', credits: 12 }],
    });
    const job = manager.create(base);
    await manager.idle();

    const done = manager.get(job.id)!;
    expect(done.state).toBe('success');
    expect(done.credits).toBe(12);
    expect(done.files).toHaveLength(1);
    expect(done.files[0]).toMatch(/^media\/p1\/n1\/.+_0\.png$/);
    expect(existsSync(join(dataDir, done.files[0]))).toBe(true);

    const meta = JSON.parse(readFileSync(join(dataDir, 'media/p1/n1', `${job.id}.json`), 'utf8'));
    expect(meta).toMatchObject({ model: 'nano-banana-2', taskId: 'task_1', credits: 12, input: { prompt: 'kedi' } });

    expect(fake.createCalls).toEqual([{ model: 'nano-banana-2', input: { prompt: 'kedi' } }]);
    const states = events.map((e) => e.state);
    expect(states).toEqual(expect.arrayContaining(['submitting', 'waiting', 'queuing', 'generating', 'downloading', 'success']));
  });

  it('fail durumu failCode/failMsg ile kaydedilir, otomatik tekrar yok', async () => {
    const { manager, fake } = setup({ script: [{ state: 'fail', failCode: '400', failMsg: 'policy' }] });
    const job = manager.create(base);
    await manager.idle();
    expect(manager.get(job.id)).toMatchObject({ state: 'fail', errorCode: '400', errorMsg: 'policy' });
    expect(fake.createCalls).toHaveLength(1);
  });

  it('zaman aşımında taskId korunur ve izlemeye devam edilebilir', async () => {
    const { manager, fake } = setup({ script: [{ state: 'generating' }] });
    const job = manager.create({ ...base, timeoutSec: 60 });
    await manager.idle();
    const timedOut = manager.get(job.id)!;
    expect(timedOut.state).toBe('timeout');
    expect(timedOut.taskId).toBe('task_1');

    fake.seedTask('task_1', [{ state: 'success' }]);
    manager.keepWatching(job.id);
    await manager.idle();
    expect(manager.get(job.id)!.state).toBe('success');
    expect(fake.createCalls).toHaveLength(1); // yeni ücretli istek yok
  });

  it('429 ve 500 geçici hatalarında createTask yeniden denenir', async () => {
    const { manager, fake } = setup({ createErrors: [429, 500] });
    const job = manager.create(base);
    await manager.idle();
    expect(manager.get(job.id)!.state).toBe('success');
    expect(fake.createCalls).toHaveLength(3);
  });

  it('402 kredi yetersiz: yeniden denenmez', async () => {
    const { manager, fake } = setup({ createErrors: [402] });
    const job = manager.create(base);
    await manager.idle();
    expect(manager.get(job.id)).toMatchObject({ state: 'fail', errorCode: '402' });
    expect(fake.createCalls).toHaveLength(1);
  });

  it('indirme geçici olarak başarısız olursa tekrar denenir', async () => {
    const { manager } = setup({ downloadFailures: 2 });
    const job = manager.create(base);
    await manager.idle();
    expect(manager.get(job.id)!.state).toBe('success');
  });

  it('yerel dosya referansı yüklenir ve 20 saat içinde tekrar yüklenmez', async () => {
    mkdirSync(join(dataDir, 'uploads'));
    writeFileSync(join(dataDir, 'uploads/a.png'), 'png-bytes');
    const { manager, fake, clock } = setup();
    manager.create({ ...base, input: { prompt: 'x', image_input: ['local:uploads/a.png'] } });
    await manager.idle();
    manager.create({ ...base, input: { prompt: 'y', image_input: ['local:uploads/a.png'] } });
    await manager.idle();
    expect(fake.uploads).toHaveLength(1);
    expect(fake.createCalls[0].input.image_input).toEqual([`https://tmp.kie.test/${fake.uploads[0]}`]);

    clock.advance(21 * 3600_000);
    manager.create({ ...base, input: { prompt: 'z', image_input: ['local:uploads/a.png'] } });
    await manager.idle();
    expect(fake.uploads).toHaveLength(2);
  });

  it('veri klasörü dışına çıkan yerel yol reddedilir', async () => {
    const { manager, fake } = setup();
    const job = manager.create({ ...base, input: { image_url: 'local:../../etc/passwd' } });
    await manager.idle();
    expect(manager.get(job.id)!.state).toBe('fail');
    expect(fake.createCalls).toHaveLength(0);
  });

  it('sunucu yeniden başlayınca yarım görev devam eder; gönderimde kalan görev tekrar gönderilmez', async () => {
    const dbFile = join(dataDir, 'canvas.db');
    const first = setup({}, dbFile);
    const now = first.clock.now();
    const row = (id: string, state: JobRow['state'], taskId: string | null): JobRow => ({
      id, projectId: 'p1', nodeId: 'n1', kieModel: 'nano-banana-2', input: { prompt: 'a' }, outputType: 'image',
      state, taskId, progress: null, resultUrls: [], files: [], credits: null, errorCode: null, errorMsg: null,
      timeoutSec: 600, createdAt: now, submittedAt: now, finishedAt: null, updatedAt: now,
    });
    first.store.insertJob(row('j-running', 'generating', 'task_old'));
    first.store.insertJob(row('j-submitting', 'submitting', null));
    first.store.db.close();

    const second = setup({}, dbFile);
    second.fake.seedTask('task_old', [{ state: 'generating' }, { state: 'success', credits: 5 }]);
    expect(second.manager.resume()).toBe(2);
    await second.manager.idle();

    expect(second.manager.get('j-running')).toMatchObject({ state: 'success', credits: 5 });
    expect(second.manager.get('j-submitting')).toMatchObject({ state: 'fail', errorCode: 'interrupted' });
    expect(second.fake.createCalls).toHaveLength(0);
    second.store.db.close();
  });
});

describe('RateLimiter', () => {
  it('10 saniyede 20 isteği aşmaz', async () => {
    const clock = fakeClock();
    const limiter = new RateLimiter(20, 10_000, clock.now, clock.sleep);
    const start = clock.now();
    const times: number[] = [];
    await Promise.all(Array.from({ length: 25 }, () => limiter.acquire().then(() => times.push(clock.now() - start))));
    expect(times.filter((t) => t < 10_000)).toHaveLength(20);
    expect(Math.max(...times)).toBeGreaterThanOrEqual(10_000);
  });
});
