import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { mkdirSync } from 'node:fs';
import type { JobRow } from './db.js';
import type { JobManager } from './jobs/manager.js';
import { KieClient, KieError } from './kie/client.js';
import { canvasRoutes } from './routes/canvas.js';
import { registerSecurity } from './security.js';

export interface AppDeps {
  kie: KieClient;
  jobs?: JobManager;
  dataDir?: string;
  logger?: boolean;
  mock?: boolean;
}

/** Tarayıcıya giden görev görünümü: yerel dosyalar /media URL'lerine çevrilir. */
export function publicJob(job: JobRow) {
  return {
    ...job,
    // files data klasörüne göre "media/<proje>/<node>/<dosya>" biçiminde; /media/ statik olarak sunuluyor.
    mediaUrls: job.files.map((f) => `/${f}`),
  };
}

export function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger:
      deps.logger === false
        ? false
        : { level: 'info', redact: ['req.headers.authorization'] },
  });

  registerSecurity(app);

  app.get('/api/health', async () => ({
    ok: true,
    keyConfigured: deps.kie.hasKey,
    ...(deps.mock ? { mock: true } : {}),
  }));

  app.get('/api/credits', async (_req, reply) => {
    try {
      return { credits: await deps.kie.getCredits() };
    } catch (err) {
      if (err instanceof KieError) {
        return reply.code(err.code === 401 ? 401 : 502).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  const jobs = deps.jobs;
  if (jobs) {
    mkdirSync(jobs.mediaDir, { recursive: true });
    app.register(fastifyStatic, { root: jobs.mediaDir, prefix: '/media/', decorateReply: false });
    if (deps.dataDir) app.register(canvasRoutes, { jobs, dataDir: deps.dataDir, publicJob });

    app.post<{
      Body: {
        projectId?: string;
        nodeId?: string;
        kieModel?: string;
        input?: Record<string, unknown>;
        outputType?: 'image' | 'video';
        timeoutSec?: number;
      };
    }>('/api/jobs', async (req, reply) => {
      const b = req.body ?? {};
      if (!b.projectId || !b.nodeId || !b.kieModel || !b.input || typeof b.input !== 'object') {
        return reply.code(400).send({ error: 'projectId, nodeId, kieModel ve input zorunlu' });
      }
      const job = jobs.create({
        projectId: b.projectId,
        nodeId: b.nodeId,
        kieModel: b.kieModel,
        input: b.input,
        outputType: b.outputType ?? null,
        timeoutSec: b.timeoutSec,
      });
      return reply.code(201).send(publicJob(job));
    });

    app.get<{ Querystring: { projectId?: string } }>('/api/jobs', async (req) =>
      jobs.list(req.query.projectId).map(publicJob),
    );

    app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
      const job = jobs.get(req.params.id);
      return job ? publicJob(job) : reply.code(404).send({ error: 'Görev bulunamadı' });
    });

    app.post<{ Params: { id: string } }>('/api/jobs/:id/keep-watching', async (req, reply) => {
      try {
        jobs.keepWatching(req.params.id);
        return publicJob(jobs.get(req.params.id)!);
      } catch (err) {
        return reply.code(409).send({ error: (err as Error).message });
      }
    });

    // Server-Sent Events: istemci fetch ile okur (özel güvenlik başlığı gönderebilmek için).
    app.get('/api/events', (req, reply) => {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(': bağlandı\n\n');
      const onJob = (job: JobRow) => res.write(`event: job\ndata: ${JSON.stringify(publicJob(job))}\n\n`);
      jobs.on('job', onJob);
      const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
      req.raw.on('close', () => {
        clearInterval(ping);
        jobs.off('job', onJob);
      });
    });
  }

  return app;
}
