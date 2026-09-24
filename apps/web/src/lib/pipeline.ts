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

export interface EstimateItem {
  nodeId: string;
  /** null: fiyatı bilinmiyor */
  credits: number | null;
  reason: 'forced' | 'changed' | 'upstream';
}

export interface RunEstimate {
  items: EstimateItem[];
  /** Bilinen maliyetlerin toplamı */
  total: number;
  /** Fiyatı bilinmeyen node sayısı */
  unknown: number;
}

/**
 * Bir zincir çalıştırmasında hangi node'ların gerçekten üretim yapacağını ve tahmini maliyeti hesaplar.
 * Upstream'i yeniden üretilecek bir node, girdisi değişeceği için kendisi de üretilir.
 */
export function estimatePlan(
  order: string[],
  depsOf: (id: string) => string[],
  isFresh: (id: string) => boolean,
  costOf: (id: string) => number | null,
  forced: Set<string>,
): RunEstimate {
  const willRun = new Set<string>();
  const items: EstimateItem[] = [];
  for (const id of order) {
    let reason: EstimateItem['reason'] | null = null;
    if (forced.has(id)) reason = 'forced';
    else if (depsOf(id).some((d) => willRun.has(d))) reason = 'upstream';
    else if (!isFresh(id)) reason = 'changed';
    if (!reason) continue;
    willRun.add(id);
    items.push({ nodeId: id, credits: costOf(id), reason });
  }
  return {
    items,
    total: items.reduce((s, i) => s + (i.credits ?? 0), 0),
    unknown: items.filter((i) => i.credits === null).length,
  };
}

/** Onay gerekip gerekmediği; nedenleri kullanıcıya gösterilir. */
export function confirmReasons(est: RunEstimate, threshold: number, balance: number | null): string[] {
  const reasons: string[] = [];
  if (est.total > threshold) reasons.push(`Tahmini toplam (${fmt(est.total)} kredi) onay eşiğini (${fmt(threshold)}) aşıyor`);
  if (est.unknown > 0) reasons.push(`${est.unknown} node'un fiyatı bilinmiyor`);
  if (balance !== null && est.total > balance) reasons.push(`Bakiye (${fmt(balance)}) tahmini toplamdan az; çalıştırma yarıda kalabilir`);
  return reasons;
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

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
