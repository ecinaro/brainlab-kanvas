import { getModel } from '@brainlab-kanvas/catalog';
import { useEffect, useMemo } from 'react';
import { selectedJob } from '../lib/ports';
import type { Job, ModelData } from '../lib/types';
import { MediaView } from '../nodes/shared';
import { useCanvas } from '../store';

interface Candidate {
  nodeId: string;
  job: Job;
  title: string;
  subtitle: string;
  selected: boolean;
}

/**
 * Karşılaştırma görünümü.
 * - node: bir node'un tüm başarılı çıktıları; seçilen çıktı aşağı akışa verilir.
 * - fanout: aynı girdilerle çalışan farklı model node'larının seçili çıktıları; kazananın
 *   seçilmesi, diğerlerinin çıkış kablolarını kazanana taşır.
 */
export function CompareDialog() {
  const compare = useCanvas((s) => s.compare);
  const nodes = useCanvas((s) => s.nodes);
  const jobs = useCanvas((s) => s.jobs);
  const { closeCompare, pickOutput, promoteWinner, showToast, jobsFor } = useCanvas.getState();

  useEffect(() => {
    if (!compare) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeCompare();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compare, closeCompare]);

  const candidates = useMemo<Candidate[]>(() => {
    if (!compare) return [];
    const success = (id: string) => jobsFor(id).filter((j) => j.state === 'success' && j.mediaUrls.length);
    if (compare.mode === 'node') {
      const node = nodes.find((n) => n.id === compare.nodeId);
      if (!node) return [];
      const current = selectedJob(node, jobsFor(node.id));
      return success(node.id).map((job, i, all) => ({
        nodeId: node.id,
        job,
        title: `#${all.length - i}`,
        subtitle: `${new Date(job.createdAt).toLocaleString('tr-TR')}${job.credits != null ? ` · ${job.credits} kr` : ''}`,
        selected: current?.id === job.id,
      }));
    }
    return compare.nodeIds.flatMap((id) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return [];
      const job = selectedJob(node, jobsFor(id));
      if (!job) return [];
      const def = getModel((node.data as unknown as ModelData).modelId);
      return [
        {
          nodeId: id,
          job,
          title: def?.name ?? id,
          subtitle: `${def?.vendor ?? ''}${job.credits != null ? ` · ${job.credits} kr` : ''}`,
          selected: false,
        },
      ];
    });
    // jobs değişince (yeni çıktı geldiğinde) yeniden hesaplanır
  }, [compare, nodes, jobs, jobsFor]);

  if (!compare) return null;
  const missing = compare.mode === 'fanout' ? compare.nodeIds.length - candidates.length : 0;
  const cols = candidates.length <= 2 ? 2 : candidates.length <= 4 ? 2 : 3;

  function choose(c: Candidate) {
    if (compare!.mode === 'node') {
      pickOutput(c.nodeId, c.job.id);
      showToast(`${c.title} seçildi; aşağı akışa bu çıktı verilecek`);
    } else {
      pickOutput(c.nodeId, c.job.id);
      const moved = promoteWinner(c.nodeId, compare!.nodeIds);
      showToast(moved ? `${c.title} kazandı; ${moved} bağlantı ona taşındı` : `${c.title} kazanan olarak işaretlendi`);
    }
    closeCompare();
  }

  // Yıldız kaldırma galeriden yapılır; burada yalnızca işaretlenir.
  async function star(job: Job) {
    await fetch(`/api/jobs/${job.id}/star`, {
      method: 'PUT',
      headers: { 'X-Canvas-Client': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    });
    showToast('Galeride yıldızlandı');
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-[1100px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{compare.mode === 'node' ? 'Çıktıları karşılaştır' : 'Modelleri karşılaştır'}</h2>
            <p className="text-[11px] text-muted">
              {compare.mode === 'node'
                ? 'Seçtiğin çıktı bu node\'dan aşağı akışa verilir.'
                : 'Kazananı seç: diğer node\'ların çıkış bağlantıları kazanana taşınır.'}
              {missing > 0 && ` ${missing} node'un henüz çıktısı yok.`}
            </p>
          </div>
          <button onClick={closeCompare} className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg" title="Kapat (Esc)">
            ✕
          </button>
        </div>
        {candidates.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted">Karşılaştırılacak çıktı yok. Önce node'ları çalıştır.</div>
        ) : (
          <div className="grid gap-3 overflow-y-auto p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {candidates.map((c) => (
              <div
                key={`${c.nodeId}-${c.job.id}`}
                className={`overflow-hidden rounded-lg border bg-bg ${c.selected ? 'border-accent' : 'border-line'}`}
              >
                <MediaView url={c.job.mediaUrls[0]} type={c.job.outputType ?? 'image'} className="max-h-[420px]" />
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {c.title}
                      {c.selected && <span className="ml-1.5 text-[10px] text-accent-soft">seçili</span>}
                    </div>
                    <div className="truncate text-[10px] text-muted">{c.subtitle}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      onClick={() => star(c.job)}
                      title="Galeride yıldızla"
                      className="rounded-md border border-line px-2 py-1 text-[11px] text-muted hover:text-fg"
                    >
                      ★
                    </button>
                    <button onClick={() => choose(c)} className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110">
                      {compare.mode === 'node' ? 'Bunu kullan' : 'Kazanan'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** İki ya da daha fazla model node'u seçiliyken kanvasın üstünde beliren karşılaştırma çubuğu. */
export function SelectionBar() {
  const selectedModels = useCanvas((s) => s.nodes.filter((n) => n.selected && n.type === 'model').map((n) => n.id).join(','));
  const openCompare = useCanvas((s) => s.openCompare);
  const ids = selectedModels ? selectedModels.split(',') : [];
  if (ids.length < 2) return null;
  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-1.5 text-[11px] shadow-xl backdrop-blur">
      <span className="text-muted">{ids.length} model seçili</span>
      <button onClick={() => openCompare({ mode: 'fanout', nodeIds: ids })} className="font-semibold text-accent-soft hover:underline">
        Yan yana karşılaştır
      </button>
    </div>
  );
}
