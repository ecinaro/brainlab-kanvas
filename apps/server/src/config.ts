import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(here, '../../..');

// Önce süreç ortamı (örn. sahte mod betiği), sonra .env; loadEnvFile mevcut değişkenleri ezmez.
const envPath = resolve(ROOT_DIR, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

export const DATA_DIR = resolve(ROOT_DIR, process.env.DATA_DIR ?? 'data');

export const config = {
  host: '127.0.0.1',
  port: Number(process.env.SERVER_PORT ?? 8787),
  /** true: gerçek Kie yerine bellek içi taklit kullanılır, kredi harcanmaz */
  mock: process.env.KIE_MOCK === '1',
  kieApiKey: (process.env.KIE_API_KEY ?? '').trim(),
  kieBaseUrl: 'https://api.kie.ai',
  kieUploadBaseUrl: 'https://kieai.redpandaai.co',
};

export function maskKey(key: string): string {
  if (!key) return '(yok)';
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}
