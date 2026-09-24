import {
  buildRequest,
  getModel,
  type Issue,
  MODELS,
  type PortValues,
  validate,
  withDefaults,
} from '@brainlab-kanvas/catalog';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import { create } from 'zustand';
import { api, ApiError } from './api';
import { checkConnection } from './lib/connections';
import { directModelDeps, findCachedJob, planRun } from './lib/pipeline';
import { outputOf } from './lib/ports';
import {
  type AppEdge,
  type AppNode,
  type DataByKind,
  type Job,
  type ModelData,
  type NodeKind,
  RUNNING_STATES,
} from './lib/types';

export const PROJECT_ID = 'default';

let seq = 0;
const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export function defaultData<K extends NodeKind>(kind: K): DataByKind[K] {
  const d: DataByKind = {
    prompt: { text: '' },
    upload: {},
    model: { modelId: MODELS[0].id, params: withDefaults(MODELS[0], {}) },
    preview: {},
    note: { text: '' },
  };
  return d[kind];
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface RunStatus {
  state: 'pending' | 'blocked' | 'cached';
  message?: string;
}

interface MissingInput {
  label: string;
  /** Kaynak bir model node'uysa zincirde önce üretilebilir */
  fromModel: boolean;
}

/** pendingUpstream: hata değil, zincir çalışınca giderilecek bir eksik */
export type NodeIssue = Issue & { pendingUpstream?: boolean };

type StepResult = 'ok' | 'failed' | 'blocked';
/** Şu an zincirde çalışan adımlar (node id → sonuç) */
const inflight = new Map<string, Promise<StepResult>>();

/** Görev bitene (success/fail/timeout) kadar bekler. */
function waitForJob(jobId: string): Promise<Job['state']> {
  return new Promise((resolve) => {
    const check = () => {
      const j = useCanvas.getState().jobs[jobId];
      if (j && !RUNNING_STATES.includes(j.state)) {
        unsub();
        resolve(j.state);
        return true;
      }
      return false;
    };
    const unsub = useCanvas.subscribe(check);
    check();
  });
}

/** Node'un geçerli bir çıktısı olunca, onun yüzünden "engellendi" kalmış aşağı akış durumları geçersizdir. */
function clearBlockedDownstream(nodeId: string) {
  const s = useCanvas.getState();
  for (const e of s.edges) {
    if (e.source === nodeId && s.runStatus[e.target]?.state === 'blocked') s.setRunStatus(e.target, null);
  }
}

function nodeTitle(id: string): string {
  const n = useCanvas.getState().nodes.find((x) => x.id === id);
  const def = n && getModel((n.data as unknown as ModelData).modelId);
  return def?.name ?? id;
}

interface CanvasState {
  nodes: AppNode[];
  edges: AppEdge[];
  viewport?: Viewport;
  loaded: boolean;
  loadError: string | null;
  saveState: SaveState;
  jobs: Record<string, Job>;
  /** Bir görev bittiğinde artar; üst bar bakiyeyi yeniler */
  creditsVersion: number;
  toast: string | null;

  onNodesChange: (c: NodeChange<AppNode>[]) => void;
  onEdgesChange: (c: EdgeChange<AppEdge>[]) => void;
  onConnect: (c: Connection) => void;
  addNode: <K extends NodeKind>(kind: K, position: XYPosition, data?: Partial<DataByKind[K]>) => string;
  updateData: (id: string, patch: Record<string, unknown>) => void;
  changeModel: (id: string, modelId: string) => void;
  setViewport: (v: Viewport) => void;
  showToast: (msg: string) => void;

  setJobs: (jobs: Job[]) => void;
  upsertJob: (job: Job) => void;
  jobsFor: (nodeId: string) => Job[];

  gatherInputs: (nodeId: string) => { inputs: PortValues; missing: MissingInput[] };
  issuesFor: (nodeId: string) => NodeIssue[];
  /** Geçici çalıştırma durumu (kaydedilmez): zincirde bekliyor / engellendi / önbellekten */
  runStatus: Record<string, RunStatus>;
  setRunStatus: (nodeId: string, status: RunStatus | null) => void;
  startNode: (nodeId: string, force: boolean) => Promise<'ok' | 'failed'>;
  runPipeline: (targets: string[], forceTargets: boolean) => Promise<void>;
  runNode: (nodeId: string) => Promise<void>;
  runAll: () => Promise<void>;

  load: () => Promise<void>;
}

export const useCanvas = create<CanvasState>((set, get) => ({
  nodes: [],
  edges: [],
  loaded: false,
  loadError: null,
  saveState: 'idle',
  jobs: {},
  runStatus: {},
  creditsVersion: 0,
  toast: null,

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (c) => {
    const { nodes, edges } = get();
    const check = checkConnection(nodes, edges, c);
    if (!check.ok) {
      get().showToast(check.reason);
      return;
    }
    const kept = check.replaceEdgeId ? edges.filter((e) => e.id !== check.replaceEdgeId) : edges;
    const edge: AppEdge = {
      ...c,
      id: `e-${c.source}-${c.sourceHandle}-${c.target}-${c.targetHandle}`,
      data: { type: check.type },
      className: `edge-${check.type}`,
    } as AppEdge;
    set({ edges: addEdge(edge, kept) });
  },

  addNode: (kind, position, data) => {
    const id = newId(kind);
    const node: AppNode = {
      id,
      type: kind,
      position,
      data: { ...defaultData(kind), ...(data ?? {}) } as Record<string, unknown>,
      selected: true,
    };
    set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
    return id;
  },

  updateData: (id, patch) =>
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }),

  changeModel: (id, modelId) => {
    const next = getModel(modelId);
    const node = get().nodes.find((n) => n.id === id);
    if (!next || !node) return;
    const prev = node.data as unknown as ModelData;
    get().updateData(id, {
      modelId,
      params: withDefaults(next, prev.params),
      selectedJobId: undefined,
      runError: undefined,
    });
    // Yeni modelde karşılığı olmayan ya da tipi uymayan kablolar kaldırılır.
    const { nodes, edges } = get();
    const touching = edges.filter((e) => e.source === id || e.target === id);
    const others = edges.filter((e) => e.source !== id && e.target !== id);
    const kept: AppEdge[] = [...others];
    for (const e of touching) {
      const check = checkConnection(nodes, kept, e as Connection);
      if (check.ok) kept.push({ ...e, data: { type: check.type }, className: `edge-${check.type}` });
    }
    const removed = edges.length - kept.length;
    set({ edges: kept });
    if (removed) get().showToast(`${next.name} ile uyumsuz ${removed} bağlantı kaldırıldı`);
  },

  setViewport: (viewport) => set({ viewport }),

  showToast: (msg) => {
    set({ toast: msg });
    setTimeout(() => get().toast === msg && set({ toast: null }), 3500);
  },

  setJobs: (list) => set({ jobs: Object.fromEntries(list.map((j) => [j.id, j])) }),

  upsertJob: (job) => {
    const prev = get().jobs[job.id];
    const finished = RUNNING_STATES.includes(prev?.state ?? 'submitting') && !RUNNING_STATES.includes(job.state);
    set({
      jobs: { ...get().jobs, [job.id]: job },
      creditsVersion: finished ? get().creditsVersion + 1 : get().creditsVersion,
    });
    if (finished && job.state === 'success') clearBlockedDownstream(job.nodeId);
  },

  jobsFor: (nodeId) =>
    Object.values(get().jobs)
      .filter((j) => j.nodeId === nodeId)
      .sort((a, b) => b.createdAt - a.createdAt),

  gatherInputs: (nodeId) => {
    const { nodes, edges, jobsFor } = get();
    const node = nodes.find((n) => n.id === nodeId);
    const def = node && getModel((node.data as unknown as ModelData).modelId);
    const inputs: PortValues = {};
    const missing: MissingInput[] = [];
    if (!def) return { inputs, missing };
    for (const port of def.inputs) {
      const values: string[] = [];
      for (const e of edges.filter((e) => e.target === nodeId && e.targetHandle === port.id)) {
        const src = nodes.find((n) => n.id === e.source);
        const out = src && outputOf(src, jobsFor(src.id));
        if (!out) {
          missing.push({ label: port.label, fromModel: src?.type === 'model' });
          continue;
        }
        const v = port.type === 'text' ? out.text : out.ref;
        if (v) values.push(v);
      }
      if (values.length) inputs[port.id] = values;
    }
    return { inputs, missing };
  },

  issuesFor: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'model') return [];
    const d = node.data as unknown as ModelData;
    const def = getModel(d.modelId);
    if (!def) return [{ message: `Bilinmeyen model: ${d.modelId}` }];
    const { inputs, missing } = get().gatherInputs(nodeId);
    const missingLabels = new Set(missing.map((m) => m.label));
    // Eksik girdi yüzünden çıkan "bağlı değil" hataları, asıl nedeni anlatan mesajla değiştirilir.
    const issues: NodeIssue[] = validate(def, d.params, inputs).filter(
      (i) => !(i.port && missingLabels.has(def.inputs.find((p) => p.id === i.port)?.label ?? '')),
    );
    const seen = new Set<string>();
    for (const m of missing) {
      if (seen.has(m.label)) continue;
      seen.add(m.label);
      issues.unshift(
        m.fromModel
          ? { message: `"${m.label}" girişi zincirde önce üretilecek`, pendingUpstream: true }
          : { message: `"${m.label}" girişine bağlı node'un henüz çıktısı yok` },
      );
    }
    return issues;
  },

  setRunStatus: (nodeId, status) => {
    const next = { ...get().runStatus };
    if (status) next[nodeId] = status;
    else delete next[nodeId];
    set({ runStatus: next });
  },

  /** Tek bir model node'u için görev başlatır. Önbellekte eşleşen çıktı varsa (force değilse) onu kullanır. */
  startNode: async (nodeId, force) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'model') return 'failed';
    const d = node.data as unknown as ModelData;
    const def = getModel(d.modelId);
    const issues = get().issuesFor(nodeId);
    if (!def || issues.length) {
      get().updateData(nodeId, { runError: issues[0]?.message ?? 'Bilinmeyen model' });
      return 'failed';
    }
    const { inputs } = get().gatherInputs(nodeId);
    if (!force) {
      const built = buildRequest(def, d.params, inputs);
      const cached = findCachedJob(get().jobsFor(nodeId), built.kieModel, built.input);
      if (cached) {
        if (d.selectedJobId && d.selectedJobId !== cached.id) get().updateData(nodeId, { selectedJobId: cached.id });
        get().setRunStatus(nodeId, { state: 'cached' });
        clearBlockedDownstream(nodeId);
        return 'ok';
      }
    }
    get().updateData(nodeId, { runError: undefined });
    get().setRunStatus(nodeId, null);
    try {
      const job = await api<Job>('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: PROJECT_ID, nodeId, modelId: d.modelId, params: d.params, inputs }),
      });
      get().upsertJob(job);
      get().updateData(nodeId, { selectedJobId: undefined });
      return (await waitForJob(job.id)) === 'success' ? 'ok' : 'failed';
    } catch (err) {
      get().updateData(nodeId, { runError: (err as Error).message });
      return 'failed';
    }
  },

  /**
   * Hedefleri ve güncel olmayan upstream model node'larını bağımlılık sırasıyla çalıştırır.
   * Bağımsız dallar paralel ilerler; başarısız bir node'un aşağı akışı "engellendi" olur.
   */
  runPipeline: async (targets, forceTargets) => {
    const { nodes, edges } = get();
    let order: string[];
    try {
      order = planRun(targets, nodes, edges);
    } catch (err) {
      get().showToast((err as Error).message);
      return;
    }
    const forced = new Set(forceTargets ? targets : []);
    const results = new Map<string, Promise<StepResult>>();

    for (const id of order) {
      // Başka bir zincirde zaten çalışan adım ikinci kez başlatılmaz; sonucu paylaşılır.
      const existing = inflight.get(id);
      if (existing) {
        results.set(id, existing);
        continue;
      }
      get().setRunStatus(id, { state: 'pending' });
      const deps = directModelDeps(id, nodes, edges);
      const step = (async (): Promise<StepResult> => {
        try {
          const depResults = await Promise.all(deps.map((dep) => results.get(dep) ?? Promise.resolve('ok' as const)));
          const badDep = deps.find((_, i) => depResults[i] !== 'ok');
          if (badDep) {
            get().setRunStatus(id, { state: 'blocked', message: `Engellendi: "${nodeTitle(badDep)}" başarısız oldu` });
            return 'blocked';
          }
          // Bu node için hâlihazırda çalışan bir görev varsa onu bekle.
          const running = get().jobsFor(id).find((j) => RUNNING_STATES.includes(j.state));
          if (running) {
            get().setRunStatus(id, null);
            return (await waitForJob(running.id)) === 'success' ? 'ok' : 'failed';
          }
          const r = await get().startNode(id, forced.has(id));
          if (r === 'failed') get().setRunStatus(id, null);
          return r;
        } catch (err) {
          get().setRunStatus(id, null);
          get().updateData(id, { runError: (err as Error).message });
          return 'failed';
        }
      })();
      inflight.set(id, step);
      step.finally(() => inflight.delete(id));
      results.set(id, step);
    }
    const all = await Promise.all(results.values());
    const cachedCount = order.filter((id) => get().runStatus[id]?.state === 'cached').length;
    if (cachedCount === order.length) get().showToast('Her şey güncel, yeniden üretilecek bir şey yok');
    else if (all.some((r) => r !== 'ok')) get().showToast('Zincir hatayla tamamlandı');
  },

  runNode: (nodeId) => get().runPipeline([nodeId], true),

  runAll: () => {
    const ids = get()
      .nodes.filter((n) => n.type === 'model')
      .map((n) => n.id);
    if (!ids.length) {
      get().showToast('Çalıştırılacak model node\'u yok');
      return Promise.resolve();
    }
    return get().runPipeline(ids, false);
  },

  load: async () => {
    if (get().loaded) return;
    set({ loadError: null });
    // Başlangıç grafiği SADECE proje gerçekten yoksa (404) açılır. Diğer hatalarda kayıtlı
    // projenin üzerine yazmamak için kanvas açılmaz ve otomatik kaydetme devre dışı kalır.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const p = await api<{ nodes: AppNode[]; edges: AppEdge[]; viewport?: Viewport }>(`/projects/${PROJECT_ID}`, {
          timeoutMs: 8000,
        });
        if (get().loaded) return;
        set({ nodes: p.nodes ?? [], edges: p.edges ?? [], viewport: p.viewport, loaded: true, saveState: 'saved' });
        return;
      } catch (err) {
        if (get().loaded) return;
        if (err instanceof ApiError && err.status === 404) {
          set({ ...starterGraph(), loaded: true });
          return;
        }
        if (attempt === 3) {
          set({ loadError: (err as Error).message });
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  },
}));

/** İlk açılışta örnek zincir: Prompt → Nano Banana 2 → Önizleme */
function starterGraph(): Pick<CanvasState, 'nodes' | 'edges'> {
  const nodes: AppNode[] = [
    { id: 'prompt-start', type: 'prompt', position: { x: 0, y: 80 }, data: { text: '' } },
    {
      id: 'model-start',
      type: 'model',
      position: { x: 380, y: 0 },
      data: defaultData('model') as unknown as Record<string, unknown>,
    },
    { id: 'preview-start', type: 'preview', position: { x: 780, y: 40 }, data: {} },
  ];
  const edges: AppEdge[] = [
    {
      id: 'e-start-1',
      source: 'prompt-start',
      sourceHandle: 'text',
      target: 'model-start',
      targetHandle: 'prompt',
      data: { type: 'text' },
      className: 'edge-text',
    },
    {
      id: 'e-start-2',
      source: 'model-start',
      sourceHandle: 'out',
      target: 'preview-start',
      targetHandle: 'in',
      data: { type: 'image' },
      className: 'edge-image',
    },
  ];
  return { nodes, edges };
}

// Geliştirme modunda tarayıcı konsolundan / otomatik testlerden erişim için.
if (import.meta.env.DEV) (window as unknown as { __canvas: typeof useCanvas }).__canvas = useCanvas;
// Store yeniden değerlendirilirse boş bir state oluşur; bu dosya değişince sayfa tamamen yenilensin.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

// --- Otomatik kaydetme ------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persistable(nodes: AppNode[]) {
  return nodes.map(({ id, type, position, data, width, height }) => {
    const clean: Record<string, unknown> = { ...data };
    delete clean.uploading;
    delete clean.runError;
    return { id, type, position, data: clean, width, height };
  });
}

useCanvas.subscribe((state, prev) => {
  if (!state.loaded) return;
  if (state.nodes === prev.nodes && state.edges === prev.edges && state.viewport === prev.viewport) return;
  // Yalnızca seçim/sürükleme ara durumları değiştiyse de kaydeder; 800 ms toplanır.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const { nodes, edges, viewport } = useCanvas.getState();
    useCanvas.setState({ saveState: 'saving' });
    try {
      await api(`/projects/${PROJECT_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          nodes: persistable(nodes),
          edges: edges.map(({ id, source, sourceHandle, target, targetHandle, data, className }) => ({
            id,
            source,
            sourceHandle,
            target,
            targetHandle,
            data,
            className,
          })),
          viewport,
        }),
      });
      useCanvas.setState({ saveState: 'saved' });
    } catch {
      useCanvas.setState({ saveState: 'error' });
    }
  }, 800);
});
