/** Uygulama ayarları: data/settings.json. */
import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Settings {
  /** Tahmini toplam bu değeri (kredi) aşarsa çalıştırmadan önce onay istenir */
  costConfirmThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = { costConfirmThreshold: 20 };

export async function settingsRoutes(app: FastifyInstance, opts: { dataDir: string }) {
  const file = join(opts.dataDir, 'settings.json');

  async function read(): Promise<Settings> {
    if (!existsSync(file)) return { ...DEFAULT_SETTINGS };
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(file, 'utf8')) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  app.get('/api/settings', read);

  app.put<{ Body: Partial<Settings> }>('/api/settings', async (req, reply) => {
    const next = { ...(await read()) };
    const t = req.body?.costConfirmThreshold;
    if (t !== undefined) {
      if (typeof t !== 'number' || !Number.isFinite(t) || t < 0 || t > 1_000_000) {
        return reply.code(400).send({ error: 'Onay eşiği 0 ile 1.000.000 arasında bir sayı olmalı' });
      }
      next.costConfirmThreshold = t;
    }
    await writeFile(file + '.part', JSON.stringify(next, null, 2));
    await rename(file + '.part', file);
    return next;
  });
}
