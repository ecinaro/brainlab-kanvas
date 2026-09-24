/** Faz 2 rotaları: görsel yükleme, katalogla çalıştırma, proje kaydı. */
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { buildRequest, getModel, type ParamValues, type PortValues, ValidationError } from '@brainlab-kanvas/catalog';
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobManager } from '../jobs/manager.js';
import { projectRoutes } from './projects.js';

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};
const MAX_UPLOAD = 30 * 1024 * 1024;

export async function canvasRoutes(
  app: FastifyInstance,
  opts: { jobs: JobManager; dataDir: string; publicJob: (j: any) => unknown },
) {
  const { jobs, dataDir } = opts;
  const uploadsDir = join(dataDir, 'uploads');
  const projectsDir = join(dataDir, 'projects');
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(projectsDir, { recursive: true });

  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD, files: 1 } });
  await app.register(fastifyStatic, { root: uploadsDir, prefix: '/uploads/', decorateReply: false });

  // Görsel yükleme: içerik hash'iyle adlandırılır, aynı dosya iki kez saklanmaz.
  app.post('/api/uploads', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'Dosya yok' });
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) return reply.code(415).send({ error: `Desteklenmeyen tür: ${file.mimetype} (png, jpg, webp)` });
    const buf = await file.toBuffer();
    if (file.file.truncated) return reply.code(413).send({ error: 'Dosya 30 MB sınırını aşıyor' });
    const name = createHash('sha256').update(buf).digest('hex').slice(0, 32) + ext;
    const target = join(uploadsDir, name);
    if (!existsSync(target)) {
      await writeFile(target + '.part', buf);
      await rename(target + '.part', target);
    }
    return { ref: `local:uploads/${name}`, url: `/uploads/${name}`, originalName: file.filename, size: buf.length };
  });

  // Katalog üzerinden çalıştırma: doğrulama sunucuda da yapılır.
  app.post<{
    Body: { projectId?: string; nodeId?: string; modelId?: string; params?: ParamValues; inputs?: PortValues };
  }>('/api/run', async (req, reply) => {
    const { projectId, nodeId, modelId, params = {}, inputs = {} } = req.body ?? {};
    if (!projectId || !nodeId || !modelId) return reply.code(400).send({ error: 'projectId, nodeId ve modelId zorunlu' });
    const def = getModel(modelId);
    if (!def) return reply.code(404).send({ error: `Bilinmeyen model: ${modelId}` });
    for (const values of Object.values(inputs)) {
      for (const v of values) {
        if (v.startsWith('local:') && !/^local:(uploads|media)\//.test(v)) {
          return reply.code(400).send({ error: `Geçersiz dosya referansı: ${v}` });
        }
      }
    }
    try {
      const built = buildRequest(def, params, inputs);
      const job = jobs.create({
        projectId,
        nodeId,
        kieModel: built.kieModel,
        input: built.input,
        outputType: def.output,
        timeoutSec: def.timeoutSec,
      });
      return reply.code(201).send(opts.publicJob(job));
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(422).send({ error: err.message, issues: err.issues });
      throw err;
    }
  });

  await app.register(projectRoutes, { projectsDir, jobs });
}
