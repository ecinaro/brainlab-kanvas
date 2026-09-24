// Derlenmiş ön yüz paketinde API key'in (veya adının) geçmediğini doğrular.
// Key değeri asla ekrana yazdırılmaz.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'apps/web/dist');
if (!existsSync(dist)) {
  console.error('apps/web/dist yok. Önce "npm run build" çalıştırın.');
  process.exit(2);
}

const envPath = join(root, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);
const key = (process.env.KIE_API_KEY ?? '').trim();

const needles = ['KIE_API_KEY', 'api.kie.ai', 'redpandaai.co'];
if (key) needles.push(key);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let files = 0;
const hits = [];
for (const file of walk(dist)) {
  files++;
  const text = readFileSync(file, 'utf8');
  needles.forEach((n, i) => {
    if (text.includes(n)) hits.push(`${file} → ${i === 3 ? '(API key değeri)' : n}`);
  });
}

console.log(`${files} dosya tarandı. Key ${key ? 'tanımlı, değeri de arandı' : 'tanımlı değil, sadece adlar arandı'}.`);
if (hits.length) {
  console.error('SIZINTI BULUNDU:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('Temiz: pakette key veya Kie adresi yok.');
