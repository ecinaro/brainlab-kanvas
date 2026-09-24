/** Geri al / yinele için graf anlık görüntüleri. Saf yardımcılar; store bunları kullanır. */
import type { AppEdge, AppNode } from './types';

export interface Snapshot {
  nodes: AppNode[];
  edges: AppEdge[];
}

const LIMIT = 100;
/** Aynı anahtarlı ardışık değişiklikler (örn. yazı yazma) bu süre içinde tek adım sayılır */
const COALESCE_MS = 1200;

export function snapshot(nodes: AppNode[], edges: AppEdge[]): Snapshot {
  return {
    nodes: nodes.map((n) => ({ ...n, selected: false, dragging: false })),
    edges: edges.map((e) => ({ ...e, selected: false })),
  };
}

export class History {
  past: Snapshot[] = [];
  future: Snapshot[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;

  constructor(private now: () => number = Date.now) {}

  /** Değişiklikten ÖNCE çağrılır. Aynı anahtarla kısa süre içinde gelen çağrılar birleştirilir. */
  checkpoint(current: Snapshot, key?: string) {
    const t = this.now();
    if (key && key === this.lastKey && t - this.lastTime < COALESCE_MS) {
      this.lastTime = t;
      return;
    }
    this.lastKey = key ?? null;
    this.lastTime = t;
    this.past.push(current);
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  undo(current: Snapshot): Snapshot | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    this.lastKey = null;
    return prev;
  }

  redo(current: Snapshot): Snapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.lastKey = null;
    return next;
  }

  clear() {
    this.past = [];
    this.future = [];
    this.lastKey = null;
  }
}
