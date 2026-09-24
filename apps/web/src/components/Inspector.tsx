import { getModel, selectVariant, withDefaults } from '@brainlab-kanvas/catalog';
import { useMemo } from 'react';
import type { ModelData } from '../lib/types';
import { useCanvas } from '../store';
import { ParamField } from './ParamField';

/** Seçili model node'unun tüm parametreleri (gelişmişler dahil) ve katalog bilgisi. */
export function Inspector() {
  const nodes = useCanvas((s) => s.nodes);
  const edges = useCanvas((s) => s.edges);
  const jobs = useCanvas((s) => s.jobs);
  const updateData = useCanvas((s) => s.updateData);
  const selected = nodes.filter((n) => n.selected);
  const node = selected.length === 1 && selected[0].type === 'model' ? selected[0] : undefined;

  const info = useMemo(() => {
    if (!node) return null;
    const s = useCanvas.getState();
    const { inputs } = s.gatherInputs(node.id);
    return { inputs, issues: s.issuesFor(node.id) };
  }, [node, edges, jobs]);

  if (!node || !info) return null;
  const d = node.data as unknown as ModelData;
  const def = getModel(d.modelId);
  if (!def) return null;
  const params = withDefaults(def, d.params);
  const variant = selectVariant(def, info.inputs);
  const cost = def.cost(params, info.inputs);

  return (
    <aside className="absolute right-3 top-3 bottom-3 z-10 flex w-72 flex-col overflow-hidden rounded-xl border border-line bg-surface/95 shadow-2xl backdrop-blur">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{def.name}</span>
          {def.status === 'experimental' && (
            <span className="rounded bg-raised px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted" title="Gerçek key ile henüz doğrulanmadı">
              deneysel
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted">{def.description}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {def.params.map((p) => (
          <ParamField
            key={p.key}
            def={p}
            value={params[p.key]}
            invalid={info.issues.some((i) => i.param === p.key)}
            onChange={(v) => updateData(node.id, { params: { ...d.params, [p.key]: v }, runError: undefined })}
          />
        ))}

        {info.issues.length > 0 && (
          <ul className="space-y-1 rounded-md border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger">
            {info.issues.map((i, k) => (
              <li key={k}>• {i.message}</li>
            ))}
          </ul>
        )}
      </div>

      <dl className="space-y-1.5 border-t border-line px-4 py-3 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Kie modeli</dt>
          <dd className="truncate font-mono text-[10px]">{variant.kieModel}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted">Tahmini maliyet</dt>
          <dd className="tabular-nums">
            ~{cost?.credits ?? '?'} kredi <span className="text-muted">(≈${((cost?.credits ?? 0) * 0.005).toFixed(3)})</span>
          </dd>
        </div>
        {cost?.note && <p className="text-[10px] text-muted">{cost.note}</p>}
        <div className="flex flex-wrap gap-x-2 pt-1">
          {def.docUrls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="text-[10px] text-muted underline hover:text-fg">
              doküman
            </a>
          ))}
          <span className="text-[10px] text-muted">· doğrulama {def.verifiedAt}</span>
        </div>
      </dl>
    </aside>
  );
}
