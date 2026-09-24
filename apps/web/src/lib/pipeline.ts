/** Zincirli çalıştırmanın saf (UI'dan bağımsız) yardımcıları. */
import type { AppEdge, AppNode, Job } from './types';

/** Bir model node'unun doğrudan bağlı olduğu upstream model node'ları. */
export function directModelDeps(nodeId: string, nodes: AppNode[], edges: AppEdge[]): string[] {
  const models = new Set(nodes.filter((n) => n.type === 'model').map((n) => n.id));
  return [...new Set(edges.filter((e) => e.target === nodeId && models.has(e.source)).map((e) => e.source))];
}

/** Hedefler ve tüm upstream model node'ları, bağımlılıklar önce gelecek şekilde sıralı. */
export function planRun(targets: string[], nodes: AppNode[], edges: AppEdge[]): string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') throw new Error('Grafta döngü var');
    state.set(id, 'visiting');
    for (const dep of directModelDeps(id, nodes, edges)) visit(dep);
    state.set(id, 'done');
    order.push(id);
  };
  for (const t of targets) visit(t);
  return order;
}

/** Anahtar sırasından bağımsız JSON; önbellek karşılaştırması için. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Aynı model ve birebir aynı girdiyle daha önce başarılı üretilmiş görev.
 * Girdide upstream çıktılarının dosya referansları bulunduğu için upstream değişirse eşleşme bozulur.
 */
export function findCachedJob(jobs: Job[], kieModel: string, input: Record<string, unknown>): Job | undefined {
  const key = stableStringify(input);
  return jobs.find((j) => j.state === 'success' && j.files.length && j.kieModel === kieModel && stableStringify(j.input) === key);
}
