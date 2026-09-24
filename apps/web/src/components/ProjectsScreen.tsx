import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { goProject } from '../lib/route';
import { starterGraph } from '../store';

interface ProjectSummary {
  id: string;
  name: string;
  savedAt: string | null;
  nodeCount: number;
  generations: number;
  thumbnail: { url: string; type: string } | null;
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} saat önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
}

export function ProjectsScreen() {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setList(await api<ProjectSummary[]>('/projects'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    const p = await api<{ id: string }>('/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Yeni proje', ...starterGraph() }),
    });
    goProject(p.id);
  }

  async function importFile(file: File) {
    try {
      const doc = JSON.parse(await file.text());
      if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) throw new Error('Geçerli bir BrainLab Kanvas proje dosyası değil');
      const p = await api<{ id: string }>('/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${doc.name || file.name.replace(/\.json$/i, '')} (içe aktarıldı)`,
          nodes: doc.nodes,
          edges: doc.edges,
          viewport: doc.viewport,
        }),
      });
      goProject(p.id);
    } catch (err) {
      setError(`İçe aktarılamadı: ${(err as Error).message}`);
    }
  }

  async function remove(p: ProjectSummary) {
    if (!confirm(`"${p.name}" silinsin mi?\nDosya data/projects/.trash klasörüne taşınır, üretilen görseller silinmez.`)) return;
    await api(`/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Projeler</h1>
            <p className="text-xs text-muted">Her proje kendi kanvası, çıktıları ve geçmişiyle birlikte saklanır.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => importInput.current?.click()}
              className="rounded-lg border border-line bg-raised px-3 py-1.5 text-xs hover:border-muted"
            >
              İçe aktar
            </button>
            <button onClick={create} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110">
              Yeni proje
            </button>
          </div>
          <input
            ref={importInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>

        {error && <div className="mb-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">{error}</div>}

        {list === null ? (
          <div className="text-sm text-muted">Yükleniyor…</div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Henüz proje yok. "Yeni proje" ile başla.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {list.map((p) => (
              <div key={p.id} className="group overflow-hidden rounded-xl border border-line bg-surface transition hover:border-muted">
                <button onClick={() => goProject(p.id)} className="block w-full text-left">
                  <div className="aspect-video bg-bg">
                    {p.thumbnail ? (
                      p.thumbnail.type === 'video' ? (
                        <video src={p.thumbnail.url} muted className="h-full w-full object-cover" />
                      ) : (
                        <img src={p.thumbnail.url} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center text-[11px] text-muted">Çıktı yok</div>
                    )}
                  </div>
                  <div className="px-3 pt-2.5">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {timeAgo(p.savedAt)} · {p.nodeCount} node · {p.generations} üretim
                    </div>
                  </div>
                </button>
                <div className="flex justify-end px-2 pb-2">
                  <button
                    onClick={() => remove(p)}
                    className="rounded-md px-2 py-1 text-[11px] text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
