import type { Connection } from '@xyflow/react';
import { inputsOf, outputsOf, PORT_LABEL } from './ports';
import type { AppEdge, AppNode } from './types';

export type ConnectionCheck =
  | { ok: true; type: import('@brainlab-kanvas/catalog').PortType; replaceEdgeId?: string }
  | { ok: false; reason: string };

/** from node'undan kablolar boyunca ileri gidilerek to'ya ulaşılabiliyor mu? */
function reaches(edges: AppEdge[], from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Tip eşleşmesi ve port kapasitesi kontrolü. Tekil porta yeni kablo eskisinin yerine geçer. */
export function checkConnection(nodes: AppNode[], edges: AppEdge[], c: Connection): ConnectionCheck {
  if (c.source === c.target) return { ok: false, reason: 'Node kendisine bağlanamaz' };
  const src = nodes.find((n) => n.id === c.source);
  const tgt = nodes.find((n) => n.id === c.target);
  if (!src || !tgt) return { ok: false, reason: 'Node bulunamadı' };

  const out = outputsOf(src).find((p) => p.id === c.sourceHandle);
  const inp = inputsOf(tgt).find((p) => p.id === c.targetHandle);
  if (!out || !inp) return { ok: false, reason: 'Port bulunamadı' };
  if (!inp.types.includes(out.type)) {
    const accepted = inp.types.map((t) => PORT_LABEL[t].toLowerCase()).join('/');
    return { ok: false, reason: `${PORT_LABEL[out.type]} çıkışı ${accepted} girişine bağlanamaz` };
  }

  if (reaches(edges, c.target!, c.source!)) {
    return { ok: false, reason: 'Bu bağlantı döngü oluşturur' };
  }

  const existing = edges.filter((e) => e.target === c.target && e.targetHandle === c.targetHandle);
  if (existing.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) {
    return { ok: false, reason: 'Bu bağlantı zaten var' };
  }
  if (!inp.multi) return { ok: true, type: out.type, replaceEdgeId: existing[0]?.id };
  if (inp.max !== undefined && existing.length >= inp.max) {
    return { ok: false, reason: `${inp.label} en fazla ${inp.max} bağlantı alır` };
  }
  return { ok: true, type: out.type };
}
