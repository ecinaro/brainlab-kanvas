import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app.js';
import { config, DATA_DIR, maskKey, ROOT_DIR } from './config.js';
import { Store } from './db.js';
import { JobManager } from './jobs/manager.js';
import { KieClient } from './kie/client.js';
import { FakeKie } from './test/fakeKie.js';

function createKie(): KieClient {
  if (!config.mock) {
    return new KieClient({ apiKey: config.kieApiKey, baseUrl: config.kieBaseUrl, uploadBaseUrl: config.kieUploadBaseUrl });
  }
  // Sahte mod: gerçek Kie'ye hiçbir istek gitmez. Prompt'ta "[fail]" geçen görevler başarısız olur.
  const samplePath = join(ROOT_DIR, 'scripts', 'mock-sample.png');
  const fake = new FakeKie({
    // Yaklaşık 12-15 saniye süren bir üretim (sayfa yenileme gibi durumları deneyebilmek için).
    script: [
      { state: 'queuing' },
      { state: 'generating', progress: 20 },
      { state: 'generating', progress: 45 },
      { state: 'generating', progress: 70 },
      { state: 'generating', progress: 90 },
      { state: 'success', credits: 0 },
    ],
    failWhen: (input) => JSON.stringify(input).includes('[fail]'),
    sampleImage: existsSync(samplePath) ? readFileSync(samplePath) : undefined,
  });
  return new KieClient({ apiKey: 'mock', baseUrl: 'https://kie.test', uploadBaseUrl: 'https://upload.kie.test', fetchImpl: fake.fetch });
}

const kie = createKie();
const store = new Store(join(DATA_DIR, 'canvas.db'));
const jobs = new JobManager({
  kie,
  store,
  dataDir: DATA_DIR,
  ...(config.mock ? { pollInitialMs: 1500, pollMaxMs: 3000 } : {}),
});
const app = buildApp({ kie, jobs, dataDir: DATA_DIR, mock: config.mock });

app.log.info(
  config.mock
    ? `SAHTE MOD: Kie taklit ediliyor, kredi harcanmaz · veri klasörü: ${DATA_DIR}`
    : `Kie API key: ${maskKey(config.kieApiKey)} · veri klasörü: ${DATA_DIR}`,
);

const resumed = jobs.resume();
if (resumed) app.log.info(`${resumed} yarım görev devam ettiriliyor`);

await app.listen({ host: config.host, port: config.port });
