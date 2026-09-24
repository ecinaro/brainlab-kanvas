/** Kopyala / yapıştır ve dışa aktarma için graf parçası. */
import { type NodeOutput, outputOf, selectedJob } from './ports';
import type { AppEdge, AppNode, Job, PinnedOutput } from './types';

export const CLIP_MARKER = 'brainlab-kanvas/clip';

export interface ClipPayload {
  app: typeof CLIP_MARKER;
  v: 1;
  nodes: AppNode[];
  edges: AppEdge[];
}

/**
 * Seçili node'ları ve aralarındaki kabloları paketler. Model node'larının o anki çıktısı
 * "pinned" olarak eklenir; böylece kopya (başka projede bile) aynı çıktıyı aşağı akışa verir.
 */
export function packNodes(nodes: AppNode[], edges: AppEdge[], jobsFor: (id: string) => Job[]): ClipPayload {
  const ids = new Set(nodes.map((n) => n.id));
  return {
    app: CLIP_MARKER,
    v: 1,
    nodes: nodes.map((n) => {
      const data: Record<string, unknown> = { ...n.data };
      delete data.runError;
      delete data.uploading;
      if (n.type === 'model') {
        const jobs = jobsFor(n.id);
        const out = outputOf(n, jobs);
        const job = selectedJob(n, jobs);
        if (out) data.pinned = pinnedFrom(out, job);
        delete data.selectedJobId;
      }
      return { id: n.id, type: n.type, position: n.position, data };
    }),
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map(({ id, source, sourceHandle, target, targetHandle, data, className }) => ({
        id,
        source,
        sourceHandle,
        target,
        targetHandle,
        data,
        className,
      })),
  };
}

function pinnedFrom(out: NodeOutput, job: Job | undefined): PinnedOutput {
  // Model ve girdi saklanır: önbellek kontrolü kopyanın gereksiz yere yeniden üretilmesini önler.
  return { type: out.type, ref: out.ref, url: out.url, kieModel: job?.kieModel, input: job?.input };
}

export function parseClip(text: string | null | undefined): ClipPayload | null {
  if (!text || !text.includes(CLIP_MARKER)) return null;
  try {
    const p = JSON.parse(text) as ClipPayload;
    if (p.app !== CLIP_MARKER || !Array.isArray(p.nodes) || !Array.isArray(p.edges)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Yeni id'lerle ve kaydırılmış konumla kopya üretir; kablolar yeni id'lere bağlanır. */
export function cloneWithNewIds(p: ClipPayload, offset: { x: number; y: number }, newId: (kind: string) => string) {
  const map = new Map<string, string>();
  const nodes: AppNode[] = p.nodes.map((n) => {
    const id = newId(n.type ?? 'node');
    map.set(n.id, id);
    return {
      ...n,
      id,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
      selected: true,
      data: { ...n.data },
    };
  });
  const edges: AppEdge[] = p.edges.map((e) => {
    const source = map.get(e.source)!;
    const target = map.get(e.target)!;
    return { ...e, id: `e-${source}-${e.sourceHandle}-${target}-${e.targetHandle}`, source, target };
  });
  return { nodes, edges };
}
