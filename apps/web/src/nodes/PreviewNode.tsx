import { Handle, type NodeProps, Position } from '@xyflow/react';
import { useMemo } from 'react';
import { outputOf, PORT_COLOR } from '../lib/ports';
import type { AppNode } from '../lib/types';
import { useCanvas } from '../store';
import { MediaView, NodeShell } from './shared';

export function PreviewNode({ id, selected }: NodeProps<AppNode>) {
  const edges = useCanvas((s) => s.edges);
  const nodes = useCanvas((s) => s.nodes);
  const jobs = useCanvas((s) => s.jobs);

  const out = useMemo(() => {
    const edge = edges.find((e) => e.target === id);
    const src = edge && nodes.find((n) => n.id === edge.source);
    return src ? outputOf(src, useCanvas.getState().jobsFor(src.id)) : null;
  }, [edges, nodes, jobs, id]);

  return (
    <NodeShell title="Önizleme" selected={selected} width={420}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="port-handle"
        style={{ background: PORT_COLOR.image, left: -6, top: 20 }}
        title="Girdi: Görsel/Video"
      />
      <div className="p-2">
        {out?.url ? (
          <>
            <MediaView url={out.url} type={out.type} className="max-h-[520px]" />
            <div className="mt-2 flex gap-2 text-[11px]">
              <a href={out.url} target="_blank" rel="noreferrer" className="nodrag rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
                Yeni sekmede aç
              </a>
              <a href={out.url} download className="nodrag rounded-md border border-line px-2 py-1 text-muted hover:text-fg">
                İndir
              </a>
            </div>
          </>
        ) : (
          <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-line text-[11px] text-muted">
            Bir görsel veya video çıkışı bağla
          </div>
        )}
      </div>
    </NodeShell>
  );
}
