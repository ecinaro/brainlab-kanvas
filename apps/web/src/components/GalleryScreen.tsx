import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { modelForKie, type SavedGeneration } from '../lib/rebuild';
import { goProject, setPendingInsert } from '../lib/route';
import { MediaView } from '../nodes/shared';

interface GalleryItem extends SavedGeneration {
  projectId: string;
  projectName: string | null;
  nodeId: string;
  credits: number | null;
  taskId: string | null;
  createdAt: number;
  finishedAt: number | null;
  starred: boolean;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function GalleryScreen() {
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [model, setModel] = useState('');
  const [type, setType] = useState<'' | 'image' | 'video'>('');
  const [starredOnly, setStarredOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [g, p] = await Promise.all([api<GalleryItem[]>('/gallery'), api<ProjectOption[]>('/projects')]);
      setItems(g);
      setProjects(p);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const models = useMemo(() => [...new Set((items ?? []).map((i) => i.kieModel))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return (items ?? []).filter(
      (i) =>
        (!model || i.kieModel === model) &&
        (!type || (i.outputType ?? 'image') === type) &&
        (!starredOnly || i.starred) &&
        (!q || String(i.input.prompt ?? '').toLocaleLowerCase('tr').includes(q) || (i.projectName ?? '').toLocaleLowerCase('tr').includes(q)),
    );
  }, [items, query, model, type, starredOnly]);

  const open = filtered.find((i) => i.id === openId) ?? items?.find((i) => i.id === openId) ?? null;
  const totalCredits = (items ?? []).reduce((s, i) => s + (i.credits ?? 0), 0);

  async function toggleStar(item: GalleryItem) {
    await api(`/jobs/${item.id}/star`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: !item.starred }),
    });
    setItems((prev) => prev?.map((i) => (i.id === item.id ? { ...i, starred: !i.starred } : i)) ?? prev);
  }

  const field = 'rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs outline-none focus:border-muted';

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Galeri</h1>
              <p className="text-xs text-muted">
                Tüm projelerdeki üretimler · {items?.length ?? 0} çıktı · toplam {totalCredits.toLocaleString('tr-TR')} kredi
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Prompt ya da proje ara…" className={`${field} w-56`} />
              <select value={model} onChange={(e) => setModel(e.target.value)} className={field}>
                <option value="">Tüm modeller</option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {modelForKie(m)?.name ?? m}
                  </option>
                ))}
              </select>
              <select value={type} onChange={(e) => setType(e.target.value as '' | 'image' | 'video')} className={field}>
                <option value="">Görsel + video</option>
                <option value="image">Görsel</option>
                <option value="video">Video</option>
              </select>
              <button
                onClick={() => setStarredOnly((s) => !s)}
                className={`${field} ${starredOnly ? 'border-accent text-accent-soft' : 'text-muted'}`}
              >
                ★ Yıldızlılar
              </button>
            </div>
          </div>

          {error && <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</div>}

          {items === null ? (
            <div className="text-sm text-muted">Yükleniyor…</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
              {items.length ? 'Filtreye uyan çıktı yok.' : 'Henüz üretim yok.'}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {filtered.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setOpenId(i.id)}
                  className={`group relative overflow-hidden rounded-lg border bg-bg text-left ${openId === i.id ? 'border-accent' : 'border-line hover:border-muted'}`}
                >
                  <div className="aspect-square">
                    {i.outputType === 'video' ? (
                      <video src={i.mediaUrls[0]} muted className="h-full w-full object-cover" />
                    ) : (
                      <img src={i.mediaUrls[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                  </div>
                  {i.starred && <span className="absolute right-1.5 top-1.5 text-sm text-accent-soft">★</span>}
                  {i.outputType === 'video' && (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] uppercase text-muted">video</span>
                  )}
                  <div className="px-2 py-1.5">
                    <div className="truncate text-[11px]">{modelForKie(i.kieModel)?.name ?? i.kieModel}</div>
                    <div className="truncate text-[10px] text-muted">{i.projectName ?? 'projesi bulunamadı'}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <GalleryDetail
          item={open}
          projects={projects}
          onClose={() => setOpenId(null)}
          onStar={() => toggleStar(open)}
        />
      )}
    </div>
  );
}

function GalleryDetail({
  item,
  projects,
  onClose,
  onStar,
}: {
  item: GalleryItem;
  projects: ProjectOption[];
  onClose: () => void;
  onStar: () => void;
}) {
  const def = modelForKie(item.kieModel);
  const [target, setTarget] = useState(item.projectName ? item.projectId : (projects[0]?.id ?? ''));
  useEffect(() => setTarget(item.projectName ? item.projectId : (projects[0]?.id ?? '')), [item.id, item.projectId, item.projectName, projects]);
  const params = Object.entries(item.input).filter(([k]) => k !== 'prompt' && !Array.isArray(item.input[k]) && typeof item.input[k] !== 'object');

  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-l border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="truncate text-sm font-medium">{def?.name ?? item.kieModel}</span>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg" title="Kapat">
          ✕
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <MediaView url={item.mediaUrls[0]} type={item.outputType ?? 'image'} className="max-h-96" />
        <div className="flex flex-wrap gap-2 text-[11px]">
          <button onClick={onStar} className={`rounded-md border px-2 py-1 ${item.starred ? 'border-accent text-accent-soft' : 'border-line text-muted hover:text-fg'}`}>
            ★ {item.starred ? 'Yıldızlı' : 'Yıldızla'}
          </button>
          <a href={item.mediaUrls[0]} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
            Yeni sekmede aç
          </a>
          <a href={item.mediaUrls[0]} download className="rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
            İndir
          </a>
        </div>

        {typeof item.input.prompt === 'string' && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">Prompt</div>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-bg p-2 text-[11px] leading-relaxed">{item.input.prompt}</p>
          </div>
        )}

        <dl className="space-y-1 text-[11px]">
          <Row k="Proje" v={item.projectName ?? 'projesi bulunamadı'} />
          <Row k="Kie modeli" v={item.kieModel} mono />
          {params.map(([k, v]) => (
            <Row key={k} k={k} v={String(v)} mono />
          ))}
          <Row k="Harcanan" v={item.credits != null ? `${item.credits} kredi` : '—'} />
          <Row k="Tarih" v={new Date(item.createdAt).toLocaleString('tr-TR')} />
          {item.finishedAt && <Row k="Süre" v={`${Math.round((item.finishedAt - item.createdAt) / 1000)} sn`} />}
          {item.taskId && <Row k="taskId" v={item.taskId} mono />}
          <Row k="Dosya" v={item.files[0]} mono />
        </dl>
      </div>

      <div className="space-y-2 border-t border-line p-4">
        <div className="text-[11px] text-muted">
          {def
            ? 'Bu çıktıyı üreten zinciri (prompt, girdi görselleri, model ve ayarlar) bir projeye kur. Çıktı node\'a sabitlenir; yeniden üretilmez.'
            : 'Bu modelin katalog kaydı yok; kanvasa kurulamaz.'}
        </div>
        <div className="flex gap-2">
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!def || !projects.length} className="min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 py-1.5 text-xs outline-none">
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            disabled={!def || !target}
            onClick={() => {
              setPendingInsert(target, item);
              goProject(target);
            }}
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            Projeye kur
          </button>
        </div>
      </div>
    </aside>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{k}</dt>
      <dd className={`min-w-0 truncate text-right ${mono ? 'font-mono text-[10px]' : ''}`} title={v}>
        {v}
      </dd>
    </div>
  );
}
