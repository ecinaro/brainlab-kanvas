import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { Store } from '../db.js';
import { JobManager } from '../jobs/manager.js';
import { KieClient } from '../kie/client.js';
import { FakeKie, fakeClock } from '../test/fakeKie.js';

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'blk-routes-'));
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

const headers = { host: '127.0.0.1:8787', 'x-canvas-client': '1' };

function setup() {
  const fake = new FakeKie();
  const clock = fakeClock();
  const kie = new KieClient({ apiKey: 'k', baseUrl: 'https://kie.test', uploadBaseUrl: 'https://u.test', fetchImpl: fake.fetch });
  const jobs = new JobManager({ kie, store: new Store(':memory:'), dataDir, now: clock.now, sleep: clock.sleep });
  const app = buildApp({ kie, jobs, dataDir, logger: false });
  return { app, fake, jobs };
}

function multipart(filename: string, type: string, content: Buffer) {
  const boundary = '----blk';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('/api/run', () => {
  it('katalogdan istek üretir ve görevi başlatır', async () => {
    const { app, fake, jobs } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/run',
      headers,
      payload: { projectId: 'p', nodeId: 'n', modelId: 'gpt-image-2', params: { resolution: '1K' }, inputs: { prompt: ['afiş'] } },
    });
    expect(res.statusCode).toBe(201);
    await jobs.idle();
    expect(fake.createCalls[0]).toEqual({
      model: 'gpt-image-2-text-to-image',
      input: { prompt: 'afiş', aspect_ratio: 'auto', resolution: '1K', background: 'auto' },
    });
  });

  it('doğrulama hatasında 422 döner ve Kie\'ye istek gitmez', async () => {
    const { app, fake } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/run',
      headers,
      payload: { projectId: 'p', nodeId: 'n', modelId: 'nano-banana-2', inputs: {} },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().issues[0].port).toBe('prompt');
    expect(fake.createCalls).toHaveLength(0);
  });

  it('veri klasörü dışını gösteren referans reddedilir', async () => {
    const { app } = setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/run',
      headers,
      payload: { projectId: 'p', nodeId: 'n', modelId: 'nano-banana-2', inputs: { prompt: ['x'], images: ['local:../x.png'] } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('/api/uploads', () => {
  it('görseli hash adıyla kaydeder ve aynı dosyayı tekrar yazmaz', async () => {
    const { app } = setup();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const a = await app.inject({ method: 'POST', url: '/api/uploads', ...multipart('a.png', 'image/png', png) });
    const b = await app.inject({ method: 'POST', url: '/api/uploads', ...multipart('b.png', 'image/png', png) });
    expect(a.statusCode).toBe(200);
    expect(a.json().ref).toMatch(/^local:uploads\/[0-9a-f]{32}\.png$/);
    expect(b.json().ref).toBe(a.json().ref);
    const served = await app.inject({ url: a.json().url, headers: { host: '127.0.0.1:8787' } });
    expect(served.statusCode).toBe(200);
  });

  it('desteklenmeyen türü reddeder', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/uploads', ...multipart('a.txt', 'text/plain', Buffer.from('x')) });
    expect(res.statusCode).toBe(415);
  });
});

describe('/api/projects', () => {
  it('kaydeder ve geri yükler', async () => {
    const { app } = setup();
    expect((await app.inject({ url: '/api/projects/default', headers })).statusCode).toBe(404);
    await app.inject({ method: 'PUT', url: '/api/projects/default', headers, payload: { nodes: [{ id: 'a' }], edges: [] } });
    const res = await app.inject({ url: '/api/projects/default', headers });
    expect(res.json()).toMatchObject({ id: 'default', nodes: [{ id: 'a' }] });
  });

  it('oluşturur, listeler, adı korur/değiştirir ve silince çöpe taşır', async () => {
    const { app } = setup();
    const created = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { name: '  Deneme  ' } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    expect(created.json().name).toBe('Deneme');

    // Ad gönderilmeden kaydetmek adı korur
    await app.inject({ method: 'PUT', url: `/api/projects/${id}`, headers, payload: { nodes: [{ id: 'n' }], edges: [] } });
    let list = (await app.inject({ url: '/api/projects', headers })).json();
    expect(list).toEqual([expect.objectContaining({ id, name: 'Deneme', nodeCount: 1, thumbnail: null })]);

    await app.inject({ method: 'PUT', url: `/api/projects/${id}`, headers, payload: { name: 'Yeni ad' } });
    expect((await app.inject({ url: `/api/projects/${id}`, headers })).json()).toMatchObject({ name: 'Yeni ad', nodes: [{ id: 'n' }] });

    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${id}`, headers });
    expect(del.statusCode).toBe(200);
    list = (await app.inject({ url: '/api/projects', headers })).json();
    expect(list).toEqual([]);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(join(dataDir, 'projects/.trash'))).toHaveLength(1);
  });

  it('içe aktarmada nodes dizi değilse reddedilir', async () => {
    const { app } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/projects', headers, payload: { nodes: 'x' } });
    expect(res.statusCode).toBe(400);
  });

  it('geçersiz proje id reddedilir', async () => {
    const { app } = setup();
    const res = await app.inject({ url: '/api/projects/..%2F..%2Fx', headers });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
