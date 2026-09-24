import { useReactFlow } from '@xyflow/react';
import { useMemo, useState } from 'react';
import { RUNNING_STATES, STATE_LABEL } from '../lib/types';
import { useCanvas } from '../store';

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`;
}

/** Projenin görev geçmişi: durum, süre, gerçek harcanan kredi ve hatalar. */
export function JobTray() {
  const jobs = useCanvas((s) => s.jobs);
  const nodes = useCanvas((s) => s.nodes);
  const [open, setOpen] = useState(false);
  const flow = useReactFlow();

  const list = useMemo(() => Object.values(jobs).sort((a, b) => b.createdAt - a.createdAt), [jobs]);
  const running = list.filter((j) => RUNNING_STATES.includes(j.state)).length;
  const spent = list.reduce((s, j) => s + (j.credits ?? 0), 0);
  const failed = list.filter((j) => j.state === 'fail' || j.state === 'timeout').length;

  function focusNode(nodeId: string) {
    const n = nodes.find((x) => x.id === nodeId);
    if (!n) return;
    useCanvas.setState({ nodes: nodes.map((x) => ({ ...x, selected: x.id === nodeId })) });
    flow.fitView({ nodes: [{ id: nodeId }], padding: 0.6, duration: 300, maxZoom: 1.2 });
  }

  return (
    <div className="absolute bottom-3 left-1/2 z-10 w-[560px] max-w-[calc(100%-200px)] -translate-x-1/2">
      {open && (
        <div className="mb-2 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface/95 shadow-2xl backdrop-blur">
          {list.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted">Bu projede henüz görev yok.</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-surface text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-2 py-2 font-medium">Durum</th>
                  <th className="px-2 py-2 font-medium">Süre</th>
                  <th className="px-3 py-2 text-right font-medium">Kredi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.slice(0, 50).map((j) => {
                  const isRunning = RUNNING_STATES.includes(j.state);
                  const bad = j.state === 'fail' || j.state === 'timeout';
                  return (
                    <tr
                      key={j.id}
                      onClick={() => focusNode(j.nodeId)}
                      className="cursor-pointer hover:bg-raised"
                      title={`${new Date(j.createdAt).toLocaleString('tr-TR')}${j.taskId ? ` · taskId ${j.taskId}` : ''}`}
                    >
                      <td className="max-w-48 truncate px-3 py-1.5 font-mono text-[10px]">{j.kieModel}</td>
                      <td className={`px-2 py-1.5 ${bad ? 'text-danger' : isRunning ? 'text-accent-soft' : 'text-muted'}`}>
                        <span className="block max-w-56 truncate" title={j.errorMsg ?? undefined}>
                          {STATE_LABEL[j.state]}
                          {bad && j.errorMsg ? ` · ${j.errorMsg}` : ''}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-muted">
                        {duration((j.finishedAt ?? Date.now()) - j.createdAt)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{j.credits != null ? j.credits : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="mx-auto flex items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-1.5 text-[11px] shadow-xl backdrop-blur hover:border-muted"
      >
        <span className="font-medium">Görevler</span>
        {running > 0 && <span className="text-accent-soft">{running} çalışıyor</span>}
        {failed > 0 && <span className="text-danger">{failed} hata</span>}
        <span className="text-muted">
          Toplam harcanan: <span className="tabular-nums text-fg">{spent.toLocaleString('tr-TR')}</span> kredi
        </span>
        <span className="text-muted">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  );
}
