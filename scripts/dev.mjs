// Sunucu ve web'i birlikte başlatır; biri kapanınca diğeri de kapanır.
// --mock: gerçek Kie yerine taklit sunucu, ayrı veri klasörü (data-mock) ve ayrı portlar. Kredi harcanmaz.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const mock = process.argv.includes('--mock');
const env = mock
  ? { ...process.env, KIE_MOCK: '1', SERVER_PORT: '8788', WEB_PORT: '5174', DATA_DIR: 'data-mock' }
  : process.env;

if (mock) console.log('SAHTE MOD: http://127.0.0.1:5174 (gerçek Kie kullanılmaz)');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  ['server', ['run', 'dev', '-w', '@brainlab-kanvas/server']],
  ['web', ['run', 'dev', '-w', '@brainlab-kanvas/web']],
].map(([name, args]) => {
  const p = spawn(npm, args, {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  const tag = `[${name}]`;
  p.stdout.on('data', (d) => process.stdout.write(prefix(tag, d)));
  p.stderr.on('data', (d) => process.stderr.write(prefix(tag, d)));
  p.on('exit', (code) => {
    console.log(`${tag} çıktı (${code})`);
    shutdown();
  });
  return p;
});

function prefix(tag, data) {
  return data
    .toString()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => `${tag} ${l}\n`)
    .join('');
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const p of procs) if (p.exitCode === null) p.kill();
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
