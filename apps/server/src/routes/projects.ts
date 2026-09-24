/** Proje dosyaları: data/projects/<id>.json. Silinen projeler .trash klasörüne taşınır (kalıcı silme yok). */
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobManager } from '../jobs/manager.js';

const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

interface ProjectFile {
  id: string;
  name?: string;
  schemaVersion?: number;
  nodes?: unknown[];
  edges?: unknown[];
  viewport?: unknown;
  createdAt?: string;
  savedAt?: string;
}

export async function projectRoutes(app: FastifyInstance, opts: { projectsDir: string; jobs: JobManager }) {
  const { projectsDir, jobs } = opts;
  const trashDir = join(projectsDir, '.trash');
  mkdirSync(trashDir, { recursive: true });

  const fileOf = (id: string) => {
    if (!ID_RE.test(id)) throw Object.assign(new Error('Geçersiz proje id'), { statusCode: 400 });
    return join(projectsDir, `${id}.json`);
  };

  async function read(id: string): Promise<ProjectFile | null> {
    const f = fileOf(id);
    if (!existsSync(f)) return null;
    return JSON.parse(await readFile(f, 'utf8'));
  }

  async function write(p: ProjectFile) {
    const f = fileOf(p.id);
    await writeFile(f + '.part', JSON.stringify(p));
    await rename(f + '.part', f);
  }

  const newId = () => `p-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

  // Liste: ad, tarih, node sayısı ve son başarılı görselden küçük resim.
  app.get('/api/projects', async () => {
    const names = (await readdir(projectsDir)).filter((n) => n.endsWith('.json'));
    const list = [];
    for (const n of names) {
      try {
        const p: ProjectFile = JSON.parse(await readFile(join(projectsDir, n), 'utf8'));
        const done = jobs.list(p.id).filter((j) => j.state === 'success' && j.files.length);
        const thumb = done.find((j) => j.outputType !== 'video') ?? done[0];
        list.push({
          id: p.id,
          name: p.name || 'Adsız proje',
          savedAt: p.savedAt ?? null,
          createdAt: p.createdAt ?? null,
          nodeCount: p.nodes?.length ?? 0,
          generations: done.length,
          thumbnail: thumb ? { url: `/${thumb.files[0]}`, type: thumb.outputType ?? 'image' } : null,
        });
      } catch {
        /* bozuk dosya listede gösterilmez */
      }
    }
    return list.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const p = await read(req.params.id);
    return p ?? reply.code(404).send({ error: 'Proje yok' });
  });

  // Yeni proje (boş, içe aktarma ya da kopya). Gövdede nodes/edges gelebilir.
  app.post<{ Body: Partial<ProjectFile> }>('/api/projects', async (req, reply) => {
    const b = req.body ?? {};
    if (b.nodes !== undefined && !Array.isArray(b.nodes)) return reply.code(400).send({ error: 'nodes dizi olmalı' });
    if (b.edges !== undefined && !Array.isArray(b.edges)) return reply.code(400).send({ error: 'edges dizi olmalı' });
    const now = new Date().toISOString();
    const p: ProjectFile = {
      id: newId(),
      name: (b.name ?? '').toString().trim().slice(0, 120) || 'Yeni proje',
      schemaVersion: 1,
      nodes: b.nodes ?? [],
      edges: b.edges ?? [],
      viewport: b.viewport,
      createdAt: now,
      savedAt: now,
    };
    await write(p);
    return reply.code(201).send(p);
  });

  // Kaydet: gelen alanlar mevcut dosyanın üzerine yazılır; ad gelmezse korunur.
  app.put<{ Params: { id: string }; Body: Partial<ProjectFile> }>('/api/projects/:id', async (req) => {
    const prev = (await read(req.params.id)) ?? { id: req.params.id, createdAt: new Date().toISOString() };
    const next: ProjectFile = { ...prev, ...req.body, id: req.params.id, savedAt: new Date().toISOString() };
    if (typeof next.name === 'string') next.name = next.name.trim().slice(0, 120) || prev.name || 'Adsız proje';
    await write(next);
    return { ok: true, savedAt: next.savedAt, name: next.name };
  });

  // Galeri: tüm projelerdeki başarılı çıktılar, proje adı ve yıldız bilgisiyle.
  app.get<{ Querystring: { limit?: string } }>('/api/gallery', async (req) => {
    const names = new Map<string, string>();
    for (const n of (await readdir(projectsDir)).filter((f) => f.endsWith('.json'))) {
      try {
        const p: ProjectFile = JSON.parse(await readFile(join(projectsDir, n), 'utf8'));
        names.set(p.id, p.name || 'Adsız proje');
      } catch {
        /* bozuk dosya atlanır */
      }
    }
    const stars = jobs.store.starredIds();
    const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 1000);
    return jobs.store
      .listSuccessful(limit)
      .filter((j) => j.files.length)
      .map((j) => ({
        id: j.id,
        projectId: j.projectId,
        // Silinmiş (çöpe taşınmış) projelerin çıktıları da görünür; proje adı yoksa belirtilir.
        projectName: names.get(j.projectId) ?? null,
        nodeId: j.nodeId,
        kieModel: j.kieModel,
        input: j.input,
        outputType: j.outputType,
        mediaUrls: j.files.map((f) => `/${f}`),
        files: j.files,
        credits: j.credits,
        taskId: j.taskId,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
        starred: stars.has(j.id),
      }));
  });

  app.put<{ Params: { id: string }; Body: { starred?: boolean } }>('/api/jobs/:id/star', async (req, reply) => {
    if (!jobs.get(req.params.id)) return reply.code(404).send({ error: 'Görev bulunamadı' });
    jobs.store.setStar(req.params.id, !!req.body?.starred);
    return { id: req.params.id, starred: !!req.body?.starred };
  });

  app.delete<{ Params: { id: string } }>('/api/projects/:id', async (req, reply) => {
    const f = fileOf(req.params.id);
    if (!existsSync(f)) return reply.code(404).send({ error: 'Proje yok' });
    await rename(f, join(trashDir, `${req.params.id}-${Date.now()}.json`));
    return { ok: true, movedTo: 'data/projects/.trash' };
  });
}
