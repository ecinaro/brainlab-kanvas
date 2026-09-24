import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from './lib/types';

// Store, tarayıcı nesnelerine dokunuyor; test ortamında hafif taklitler yeterli.
vi.stubGlobal('window', { addEventListener: () => {} });

const { useCanvas } = await import('./store');

const job = (p: Partial<Job>): Job =>
  ({
    id: 'j1',
    projectId: 'p1',
    nodeId: 'n1',
    kieModel: 'nano-banana-2',
    input: {},
    outputType: 'image',
    state: 'submitting',
    taskId: null,
    progress: null,
    files: [],
    mediaUrls: [],
    credits: null,
    errorCode: null,
    errorMsg: null,
    createdAt: 1000,
    finishedAt: null,
    updatedAt: 1000,
    ...p,
  }) as Job;

describe('upsertJob sıra dışı güncellemeler', () => {
  beforeEach(() => useCanvas.setState({ projectId: 'p1', jobs: {}, halt: null, edges: [] }));

  it('/api/run yanıtı canlı akıştaki "fail"den sonra gelirse fail korunur ve 402 durdurma bandı açılır', () => {
    const s = useCanvas.getState();
    s.upsertJob(job({ state: 'submitting', updatedAt: 1000 }));
    s.upsertJob(job({ state: 'fail', errorCode: '402', updatedAt: 1005 }));
    s.upsertJob(job({ state: 'submitting', updatedAt: 1000 })); // gecikmiş HTTP yanıtı
    expect(useCanvas.getState().jobs.j1.state).toBe('fail');
    expect(useCanvas.getState().halt?.code).toBe('402');
  });

  it('aynı zaman damgasında biten görev geri açılmaz', () => {
    const s = useCanvas.getState();
    s.upsertJob(job({ state: 'fail', updatedAt: 2000 }));
    s.upsertJob(job({ state: 'waiting', updatedAt: 2000 }));
    expect(useCanvas.getState().jobs.j1.state).toBe('fail');
  });

  it('"izlemeye devam et" daha yeni damgayla zaman aşımını yeniden açabilir', () => {
    const s = useCanvas.getState();
    s.upsertJob(job({ state: 'timeout', updatedAt: 3000 }));
    s.upsertJob(job({ state: 'waiting', updatedAt: 3100 }));
    expect(useCanvas.getState().jobs.j1.state).toBe('waiting');
  });

  it('başka projenin görevi yok sayılır', () => {
    useCanvas.getState().upsertJob(job({ projectId: 'baska' }));
    expect(useCanvas.getState().jobs).toEqual({});
  });
});
