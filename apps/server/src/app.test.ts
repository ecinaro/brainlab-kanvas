import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { KieClient } from './kie/client.js';

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

function makeApp(fetchImpl: typeof fetch = fakeFetch({ code: 200, msg: 'success', data: 1234 })) {
  const kie = new KieClient({
    apiKey: 'test-key',
    baseUrl: 'https://kie.test',
    uploadBaseUrl: 'https://upload.kie.test',
    fetchImpl,
  });
  return buildApp({ kie, logger: false });
}

const okHeaders = { host: '127.0.0.1:8787', 'x-canvas-client': '1' };

describe('güvenlik katmanı', () => {
  it('istemci başlığı olmadan /api reddedilir', async () => {
    const res = await makeApp().inject({ url: '/api/health', headers: { host: '127.0.0.1:8787' } });
    expect(res.statusCode).toBe(403);
  });

  it('yerel olmayan Host reddedilir (DNS rebinding)', async () => {
    const res = await makeApp().inject({ url: '/api/health', headers: { ...okHeaders, host: 'evil.com' } });
    expect(res.statusCode).toBe(403);
  });

  it('yabancı Origin reddedilir', async () => {
    const res = await makeApp().inject({
      url: '/api/credits',
      headers: { ...okHeaders, origin: 'https://evil.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('yerel istek kabul edilir', async () => {
    const res = await makeApp().inject({
      url: '/api/health',
      headers: { ...okHeaders, host: 'localhost:5173', origin: 'http://localhost:5173' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, keyConfigured: true });
  });
});

describe('/api/credits', () => {
  it('bakiyeyi döner', async () => {
    const res = await makeApp().inject({ url: '/api/credits', headers: okHeaders });
    expect(res.json()).toEqual({ credits: 1234 });
  });

  it('geçersiz key 401 olarak iletilir ve key yanıtta yer almaz', async () => {
    const res = await makeApp(fakeFetch({ code: 401, msg: 'Unauthorized', data: null }, 401)).inject({
      url: '/api/credits',
      headers: okHeaders,
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('test-key');
  });

  it('gövde code alanı hata ise HTTP 200 olsa da hata sayılır', async () => {
    const res = await makeApp(fakeFetch({ code: 402, msg: 'no credits', data: null })).inject({
      url: '/api/credits',
      headers: okHeaders,
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe(402);
  });
});
