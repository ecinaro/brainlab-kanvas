import { describe, expect, it } from 'vitest';
import { checkConnection } from './connections';
import { directModelDeps, findCachedJob, planRun, stableStringify } from './pipeline';
import type { AppEdge, AppNode, Job } from './types';

const model = (id: string, modelId = 'nano-banana-2'): AppNode => ({
  id,
  type: 'model',
  position: { x: 0, y: 0 },
  data: { modelId, params: {} },
});
const e = (s: string, sh: string, t: string, th: string): AppEdge => ({
  id: `${s}-${t}-${th}`,
  source: s,
  sourceHandle: sh,
  target: t,
  targetHandle: th,
});

// Prompt → A (görsel) → V (video) ; A → U (upscale) ; B bağımsız
const nodes: AppNode[] = [
  { id: 'p', type: 'prompt', position: { x: 0, y: 0 }, data: { text: 'x' } },
  model('A'),
  model('V', 'kling-3.0'),
  model('U', 'topaz-image-upscale'),
  model('B'),
];
const edges: AppEdge[] = [
  e('p', 'text', 'A', 'prompt'),
  e('p', 'text', 'V', 'prompt'),
  e('A', 'out', 'V', 'first_frame'),
  e('A', 'out', 'U', 'image'),
  e('p', 'text', 'B', 'prompt'),
];

describe('planRun', () => {
  it('hedef için upstream model node\'ları önce gelir, prompt gibi node\'lar plana girmez', () => {
    expect(planRun(['V'], nodes, edges)).toEqual(['A', 'V']);
    expect(directModelDeps('V', nodes, edges)).toEqual(['A']);
  });

  it('tüm modeller: her node bağımlılıklarından sonra, ortak upstream bir kez', () => {
    const order = planRun(['V', 'U', 'B', 'A'], nodes, edges);
    expect(order).toHaveLength(4);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('V'));
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('U'));
  });

  it('döngü algılanır', () => {
    const cyc = [e('A', 'out', 'B', 'images'), e('B', 'out', 'A', 'images')];
    expect(() => planRun(['A'], nodes, cyc)).toThrow(/döngü/);
  });

  it('döngü oluşturacak bağlantı kanvasta reddedilir', () => {
    const chain = [e('A', 'out', 'B', 'images')];
    expect(checkConnection(nodes, chain, { source: 'B', sourceHandle: 'out', target: 'A', targetHandle: 'images' })).toEqual({
      ok: false,
      reason: 'Bu bağlantı döngü oluşturur',
    });
  });
});

describe('önbellek', () => {
  const job = (id: string, input: Record<string, unknown>, state: Job['state'] = 'success'): Job =>
    ({ id, kieModel: 'nano-banana-2', input, state, files: ['media/x.png'] }) as unknown as Job;

  it('anahtar sırası farklı olsa da aynı girdi eşleşir', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(stableStringify({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(findCachedJob([job('j1', { prompt: 'x', resolution: '1K' })], 'nano-banana-2', { resolution: '1K', prompt: 'x' })?.id).toBe('j1');
  });

  it('girdi, model ya da durum farklıysa eşleşmez', () => {
    const jobs = [job('j1', { prompt: 'x' }), job('j2', { prompt: 'y' }, 'fail')];
    expect(findCachedJob(jobs, 'nano-banana-2', { prompt: 'y' })).toBeUndefined();
    expect(findCachedJob(jobs, 'gpt-image-2-text-to-image', { prompt: 'x' })).toBeUndefined();
  });
});
