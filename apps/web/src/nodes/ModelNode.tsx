import { getModel, MODELS, withDefaults } from '@brainlab-kanvas/catalog';
import type { NodeProps } from '@xyflow/react';
import { useMemo } from 'react';
import { ParamField } from '../components/ParamField';
import { inputsOf, outputsOf, selectedJob } from '../lib/ports';
import { type AppNode, type ModelData, RUNNING_STATES, STATE_LABEL } from '../lib/types';
import { useCanvas } from '../store';
import { InputRow, MediaView, NodeShell, OutputHandle } from './shared';

const KIND_GROUPS = [
  ['image', 'Görsel'],
  ['video', 'Video'],
  ['tool', 'Araçlar'],
] as const;

export const KIND_COLOR = {
  image: 'var(--color-port-image)',
  video: 'var(--color-port-video)',
  tool: 'var(--color-muted)',
} as const;

export function ModelNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as unknown as ModelData;
  const def = getModel(d.modelId);
  const node = useCanvas((s) => s.nodes.find((n) => n.id === id))!;
  const nodes = useCanvas((s) => s.nodes);
  const edges = useCanvas((s) => s.edges);
  const allJobs = useCanvas((s) => s.jobs);
  const updateData = useCanvas((s) => s.updateData);
  const changeModel = useCanvas((s) => s.changeModel);
  const runNode = useCanvas((s) => s.runNode);
  const runStatus = useCanvas((s) => s.runStatus[id]);

  const jobs = useMemo(
    () => Object.values(allJobs).filter((j) => j.nodeId === id).sort((a, b) => b.createdAt - a.createdAt),
    [allJobs, id],
  );
  const issues = useMemo(() => useCanvas.getState().issuesFor(id), [nodes, edges, allJobs, id]);

  if (!node) return null;
  if (!def) {
    return (
      <NodeShell title={`Bilinmeyen model: ${d.modelId}`} selected={selected}>
        <div className="p-3 text-xs text-danger">Bu model katalogda yok.</div>
      </NodeShell>
    );
  }

  const latest = jobs[0];
  const running = latest && RUNNING_STATES.includes(latest.state);
  const pending = runStatus?.state === 'pending' && !running;
  const blocked = runStatus?.state === 'blocked';
  const shown = selectedJob(node, jobs);
  // Önbellekteki başarılı çıktı kullanıldıysa son başarısız deneme artık hata olarak gösterilmez.
  const failed =
    latest && (latest.state === 'fail' || latest.state === 'timeout') && runStatus?.state !== 'cached' ? latest : undefined;
  const connectedCount = (port: string) => edges.filter((e) => e.target === id && e.targetHandle === port).length;
  const cost = def.cost(withDefaults(def, d.params), useCanvas.getState().gatherInputs(id).inputs);
  const quickParams = def.params.filter((p) => !p.advanced);
  const successJobs = jobs.filter((j) => j.state === 'success' && j.mediaUrls.length);

  const errors = issues.filter((i) => !i.pendingUpstream);
  const info = issues.find((i) => i.pendingUpstream);
  const errorText = d.runError ?? (failed ? `${STATE_LABEL[failed.state]}: ${failed.errorMsg}` : errors[0]?.message);

  return (
    <NodeShell
      title={def.name}
      accent={running || pending ? 'var(--color-accent)' : failed || blocked ? 'var(--color-danger)' : KIND_COLOR[def.kind]}
      selected={selected}
      status={running ? 'running' : failed ? 'error' : 'ok'}
      width={320}
      right={
        <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-[10px] tabular-nums text-muted" title={cost?.note ?? 'Tahmini maliyet'}>
          ~{cost?.credits ?? '?'} kr
        </span>
      }
    >
      {outputsOf(node).map((p) => (
        <OutputHandle key={p.id} port={p} />
      ))}

      <div className="px-3 pt-2">
        <select
          value={d.modelId}
          onChange={(e) => changeModel(id, e.target.value)}
          className="nodrag w-full rounded-md border border-line bg-bg px-2 py-1 text-[11px] text-fg outline-none focus:border-muted"
        >
          {KIND_GROUPS.map(([kind, label]) => (
            <optgroup key={kind} label={label}>
              {MODELS.filter((m) => m.kind === kind).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.vendor}
                  {m.status === 'experimental' ? ' (deneysel)' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="py-1.5">
        {inputsOf(node).map((p) => (
          <InputRow key={p.id} port={p} count={connectedCount(p.id)} />
        ))}
      </div>

      <div className="mx-2 overflow-hidden rounded-lg border border-line bg-bg">
        {shown ? (
          <MediaView url={shown.mediaUrls[0]} type={shown.outputType ?? 'image'} className="max-h-80" />
        ) : d.pinned?.url ? (
          <div className="relative">
            <MediaView url={d.pinned.url} type={d.pinned.type} className="max-h-80" />
            <span
              className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-muted"
              title="Bu çıktı kopyalanan node'dan geldi; çalıştırınca yenisi üretilir"
            >
              kopyadan
            </span>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-[11px] text-muted">
            {running || pending ? '' : 'Henüz çıktı yok'}
          </div>
        )}
        {running && (
          <div className="border-t border-line px-2 py-1.5 text-[11px] text-accent-soft">
            {STATE_LABEL[latest.state]}
            {latest.progress ? ` · %${Math.round(latest.progress)}` : ''}…
          </div>
        )}
        {pending && (
          <div className="border-t border-line px-2 py-1.5 text-[11px] text-accent-soft">Sırada · yukarı akış bekleniyor…</div>
        )}
        {runStatus?.state === 'cached' && !running && (
          <div className="border-t border-line px-2 py-1.5 text-[11px] text-muted">Önbellekten · girdiler değişmedi, yeniden üretilmedi</div>
        )}
      </div>

      {successJobs.length > 1 && (
        <div className="nodrag nowheel mx-2 mt-1.5 flex gap-1 overflow-x-auto pb-1">
          {successJobs.slice(0, 12).map((j) => (
            <button
              key={j.id}
              onClick={() => updateData(id, { selectedJobId: j.id })}
              title={new Date(j.createdAt).toLocaleString('tr-TR')}
              className={`h-10 w-10 shrink-0 overflow-hidden rounded-md border ${
                shown?.id === j.id ? 'border-accent' : 'border-line opacity-70 hover:opacity-100'
              }`}
            >
              {j.outputType === 'video' ? (
                <video src={j.mediaUrls[0]} muted className="h-full w-full object-cover" />
              ) : (
                <img src={j.mediaUrls[0]} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 px-2 pt-2">
        {quickParams.slice(0, 2).map((p) => (
          <ParamField
            key={p.key}
            def={p}
            compact
            value={d.params[p.key] ?? p.default}
            invalid={issues.some((i) => i.param === p.key)}
            onChange={(v) => updateData(id, { params: { ...d.params, [p.key]: v }, runError: undefined })}
          />
        ))}
      </div>

      {blocked ? (
        <div className="mx-2 mt-2 rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5 text-[11px] leading-snug text-danger">
          {runStatus?.message}
        </div>
      ) : errorText ? (
        <div className="mx-2 mt-2 rounded-md border border-danger/30 bg-danger/5 px-2 py-1.5 text-[11px] leading-snug text-danger">
          {errorText}
        </div>
      ) : (
        info &&
        !running &&
        !pending && (
          <div className="mx-2 mt-2 rounded-md border border-line bg-raised px-2 py-1.5 text-[11px] leading-snug text-muted">
            {info.message}
          </div>
        )
      )}

      <div className="flex items-center justify-between gap-2 p-2">
        <span className="truncate text-[10px] text-muted">
          {latest?.credits != null && latest.state === 'success' ? `Son: ${latest.credits} kr harcandı` : ''}
        </span>
        <button
          onClick={() => runNode(id)}
          disabled={running || pending}
          title="Bu node'u yeniden üretir; güncel olmayan yukarı akış node'ları önce çalışır (Ctrl+Enter)"
          className="nodrag rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? 'Çalışıyor…' : pending ? 'Sırada…' : failed || blocked ? 'Tekrar dene' : 'Çalıştır'}
        </button>
      </div>
    </NodeShell>
  );
}
