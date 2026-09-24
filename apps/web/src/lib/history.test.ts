import { describe, expect, it } from 'vitest';
import { cloneWithNewIds, packNodes, parseClip } from './clipboard';
import { History, snapshot } from './history';
import type { AppEdge, AppNode, Job } from './types';

const node = (id: string, x = 0, text = ''): AppNode => ({ id, type: 'prompt', position: { x, y: 0 }, data: { text } });

describe('History', () => {
  it('20 adım geri alınıp yinelendiğinde her durum birebir geri gelir', () => {
    const h = new History();
    let current = snapshot([], []);
    const states = [current];
    for (let i = 1; i <= 20; i++) {
      h.checkpoint(current);
      current = snapshot([...current.nodes, node(`n${i}`, i * 10)], current.edges);
      states.push(current);
    }
    for (let i = 19; i >= 0; i--) {
      current = h.undo(current)!;
      expect(current).toEqual(states[i]);
    }
    expect(h.undo(current)).toBeNull();
    for (let i = 1; i <= 20; i++) {
      current = h.redo(current)!;
      expect(current).toEqual(states[i]);
    }
    expect(h.redo(current)).toBeNull();
  });

  it('aynı anahtarla kısa sürede gelen değişiklikler (yazı yazma) tek adım sayılır', () => {
    let t = 0;
    const h = new History(() => t);
    const s = snapshot([node('a')], []);
    h.checkpoint(s, 'data:a:text');
    t = 300;
    h.checkpoint(s, 'data:a:text');
    t = 600;
    h.checkpoint(s, 'data:a:text');
    expect(h.past).toHaveLength(1);
    t = 3000;
    h.checkpoint(s, 'data:a:text');
    expect(h.past).toHaveLength(2);
  });

  it('yeni değişiklik yineleme geçmişini temizler; seçim bilgisi kaydedilmez', () => {
    const h = new History();
    const a = snapshot([{ ...node('a'), selected: true }], []);
    expect(a.nodes[0].selected).toBe(false);
    h.checkpoint(a);
    h.undo(a);
    expect(h.future).toHaveLength(1);
    h.checkpoint(a);
    expect(h.future).toHaveLength(0);
  });
});

describe('pano', () => {
  const model: AppNode = { id: 'm', type: 'model', position: { x: 10, y: 20 }, data: { modelId: 'nano-banana-2', params: {} } };
  const job = {
    id: 'j',
    nodeId: 'm',
    state: 'success',
    files: ['media/p/m/j_0.png'],
    mediaUrls: ['/media/p/m/j_0.png'],
    outputType: 'image',
    kieModel: 'nano-banana-2',
    input: { prompt: 'x' },
    createdAt: 1,
  } as unknown as Job;
  const edges: AppEdge[] = [
    { id: 'e1', source: 'p', sourceHandle: 'text', target: 'm', targetHandle: 'prompt' },
    { id: 'e2', source: 'm', sourceHandle: 'out', target: 'outside', targetHandle: 'in' },
  ];

  it('yalnızca seçili node\'lar arasındaki kablolar kopyalanır, model çıktısı sabitlenir', () => {
    const clip = packNodes([node('p'), model], edges, (id) => (id === 'm' ? [job] : []));
    expect(clip.edges.map((e) => e.id)).toEqual(['e1']);
    expect(clip.nodes[1].data.pinned).toEqual({
      type: 'image',
      ref: 'local:media/p/m/j_0.png',
      url: '/media/p/m/j_0.png',
      kieModel: 'nano-banana-2',
      input: { prompt: 'x' },
    });
    expect(parseClip(JSON.stringify(clip))).toEqual(clip);
    expect(parseClip('herhangi bir metin')).toBeNull();
  });

  it('yapıştırmada yeni id\'ler verilir ve kablolar yeni id\'lere bağlanır', () => {
    const clip = packNodes([node('p'), model], edges, () => [job]);
    let i = 0;
    const { nodes, edges: e } = cloneWithNewIds(clip, { x: 40, y: 40 }, (k) => `${k}-new${i++}`);
    expect(nodes.map((n) => n.id)).toEqual(['prompt-new0', 'model-new1']);
    expect(nodes[1].position).toEqual({ x: 50, y: 60 });
    expect(e).toEqual([expect.objectContaining({ source: 'prompt-new0', target: 'model-new1', targetHandle: 'prompt' })]);
  });
});
