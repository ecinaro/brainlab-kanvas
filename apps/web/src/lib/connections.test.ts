import { describe, expect, it } from 'vitest';
import { checkConnection } from './connections';
import type { AppEdge, AppNode } from './types';

const nodes: AppNode[] = [
  { id: 'p', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'x' } },
  { id: 'u1', type: 'upload', position: { x: 0, y: 0 }, data: {} },
  { id: 'u2', type: 'upload', position: { x: 0, y: 0 }, data: {} },
  { id: 'm', type: 'model', position: { x: 0, y: 0 }, data: { modelId: 'nano-banana-pro', params: {} } },
  { id: 'pv', type: 'preview', position: { x: 0, y: 0 }, data: {} },
];
const c = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  source,
  sourceHandle,
  target,
  targetHandle,
});
const edge = (id: string, s: string, sh: string, t: string, th: string): AppEdge => ({
  id,
  source: s,
  sourceHandle: sh,
  target: t,
  targetHandle: th,
});

describe('checkConnection', () => {
  it('metin → prompt portu geçerli', () => {
    expect(checkConnection(nodes, [], c('p', 'text', 'm', 'prompt'))).toEqual({ ok: true, type: 'text' });
  });

  it('metin görsel portuna bağlanamaz', () => {
    expect(checkConnection(nodes, [], c('p', 'text', 'm', 'images')).ok).toBe(false);
    expect(checkConnection(nodes, [], c('p', 'text', 'pv', 'in')).ok).toBe(false);
  });

  it('görsel görsel portuna ve önizlemeye bağlanır', () => {
    expect(checkConnection(nodes, [], c('u1', 'image', 'm', 'images')).ok).toBe(true);
    expect(checkConnection(nodes, [], c('m', 'out', 'pv', 'in')).ok).toBe(true);
  });

  it('tekil porta yeni kablo eskisinin yerine geçer', () => {
    const edges = [edge('old', 'u1', 'image', 'pv', 'in')];
    expect(checkConnection(nodes, edges, c('u2', 'image', 'pv', 'in'))).toEqual({ ok: true, type: 'image', replaceEdgeId: 'old' });
  });

  it('çoklu portta sınır aşılamaz (Nano Banana Pro: 8)', () => {
    const edges = Array.from({ length: 8 }, (_, i) => edge(`e${i}`, `x${i}`, 'image', 'm', 'images'));
    const many = [...nodes, ...Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, type: 'upload' as const, position: { x: 0, y: 0 }, data: {} }))];
    expect(checkConnection(many, edges, c('x8', 'image', 'm', 'images')).ok).toBe(false);
  });

  it('aynı bağlantı iki kez eklenmez, node kendine bağlanmaz', () => {
    const edges = [edge('e', 'u1', 'image', 'm', 'images')];
    expect(checkConnection(nodes, edges, c('u1', 'image', 'm', 'images')).ok).toBe(false);
    expect(checkConnection(nodes, [], c('m', 'out', 'm', 'images')).ok).toBe(false);
  });
});
