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
import { cloneWithNewIds, type ClipPayload, packNodes } from './lib/clipboard';
import { checkConnection } from './lib/connections';
import { History, snapshot } from './lib/history';
import {
  confirmReasons,
  directModelDeps,
  estimatePlan,
  findCachedJob,
  planRun,
  type RunEstimate,
} from './lib/pipeline';
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

let seq = 0;
export const newId = (kind: string) => `${kind}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

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

/** node: bir node'un N çıktısı arasından seçim; fanout: birden fazla model node'unun çıktıları yan yana */
export type CompareRequest = { mode: 'node'; nodeId: string } | { mode: 'fanout'; nodeIds: string[] };

export interface ConfirmRequest {
  estimate: RunEstimate;
  reasons: string[];
  resolve: (ok: boolean) => void;
}

/** Kuyruğu durdurması gereken Kie hata kodları */
const HALT_MESSAGES: Record<string, string> = {
  '401': 'API key geçersiz. Proje klasöründeki .env dosyasında yer alan Kie key değerini kontrol edin.',
  '402': 'Kie kredisi yetersiz. Bakiye yükledikten sonra tekrar deneyin.',
  '433': 'Alt key kullanım sınırı aşıldı.',
};

interface ProjectDoc {
  id: string;
  name?: string;
  nodes?: AppNode[];
  edges?: AppEdge[];
  viewport?: Viewport;
}

type StepResult = 'ok' | 'failed' | 'blocked';
/** Şu an zincirde çalışan adımlar (node id → sonuç) */
const inflight = new Map<string, Promise<StepResult>>();
const history = new History();
/** Uygulama içi pano (sistem panosuna yazılamazsa da çalışır) */
let memoryClip: ClipPayload | null = null;
let pasteCount = 0;
let dragging = false;

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

/** Geri alınabilir değişiklikten önce çağrılır. */
function checkpoint(key?: string) {
  const { nodes, edges, loaded } = useCanvas.getState();
  if (!loaded) return;
  history.checkpoint(snapshot(nodes, edges), key);
  useCanvas.setState((s) => ({ historyVersion: s.historyVersion + 1 }));
}

/** Kullanıcının değiştirdiği (geri alınabilir) veri alanları; çalıştırma durumu gibi sistem alanları hariç. */
const USER_DATA_KEYS = new Set(['text', 'params', 'modelId', 'selectedJobId', 'ref', 'count']);

interface CanvasState {
  projectId: string | null;
  projectName: string;
  nodes: AppNode[];
  edges: AppEdge[];
  viewport?: Viewport;
  loaded: boolean;
  loadError: string | null;
  saveState: SaveState;
  jobs: Record<string, Job>;
  /** Bir görev bittiğinde artar; üst bar bakiyeyi yeniler */
  creditsVersion: number;
  /** Geri al/yinele düğmelerinin güncellenmesi için */
  historyVersion: number;
  toast: string | null;

  onNodesChange: (c: NodeChange<AppNode>[]) => void;
  onEdgesChange: (c: EdgeChange<AppEdge>[]) => void;
  onConnect: (c: Connection) => void;
  addNode: <K extends NodeKind>(kind: K, position: XYPosition, data?: Partial<DataByKind[K]>) => string;
  updateData: (id: string, patch: Record<string, unknown>) => void;
  changeModel: (id: string, modelId: string) => void;
  setViewport: (v: Viewport) => void;
  showToast: (msg: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  copySelection: () => ClipPayload | null;
  paste: (clip?: ClipPayload | null) => void;
  duplicateSelection: () => void;
  insertClip: (clip: ClipPayload, at: XYPosition) => void;
  addSibling: (nodeId: string) => string | null;
  compare: CompareRequest | null;
  openCompare: (req: CompareRequest) => void;
  closeCompare: () => void;
  pickOutput: (nodeId: string, jobId: string) => void;
  promoteWinner: (winnerId: string, nodeIds: string[]) => number;
  exportProject: () => { name: string; data: string };

  setJobs: (jobs: Job[]) => void;
  upsertJob: (job: Job) => void;
  jobsFor: (nodeId: string) => Job[];
  refreshJobs: () => Promise<void>;

  gatherInputs: (nodeId: string) => { inputs: PortValues; missing: MissingInput[] };
  issuesFor: (nodeId: string) => NodeIssue[];
  /** Geçici çalıştırma durumu (kaydedilmez): zincirde bekliyor / engellendi / önbellekten */
  runStatus: Record<string, RunStatus>;
  setRunStatus: (nodeId: string, status: RunStatus | null) => void;
  startNode: (nodeId: string, force: boolean) => Promise<'ok' | 'failed'>;
  runPipeline: (targets: string[], forceTargets: boolean) => Promise<void>;
  runNode: (nodeId: string) => Promise<void>;
  runAll: () => Promise<void>;
  isFresh: (nodeId: string) => boolean;
  estimate: (targets: string[], forceTargets: boolean) => RunEstimate | null;
  /** Tahmin → gerekirse onay → çalıştırma. runNode/runAll bunu kullanır. */
  requestRun: (targets: string[], forceTargets: boolean) => Promise<void>;
  confirm: ConfirmRequest | null;
  resolveConfirm: (ok: boolean) => void;
  /** 401/402 gibi tüm kuyruğu durduran hata */
  halt: { code: string; message: string } | null;
  clearHalt: () => void;

  credits: number | null;
  creditsError: string | null;
  refreshCredits: () => Promise<void>;
  settings: { costConfirmThreshold: number };
  loadSettings: () => Promise<void>;
  saveSettings: (s: Partial<{ costConfirmThreshold: number }>) => Promise<void>;

  load: (projectId: string) => Promise<void>;
  rename: (name: string) => Promise<void>;
}

export const useCanvas = create<CanvasState>((set, get) => ({
  projectId: null,
  projectName: '',
  nodes: [],
  edges: [],
  loaded: false,
  loadError: null,
  saveState: 'idle',
  jobs: {},
  runStatus: {},
  creditsVersion: 0,
  historyVersion: 0,
  toast: null,
  confirm: null,
  compare: null,
  halt: null,
  credits: null,
  creditsError: null,
  settings: { costConfirmThreshold: 20 },

  onNodesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) checkpoint();
    // Sürükleme başlarken tek bir geçmiş adımı; bitene kadar ara konumlar kaydedilmez.
    const drag = changes.find((c) => c.type === 'position');
    if (drag && drag.type === 'position') {
      if (drag.dragging && !dragging) {
        dragging = true;
        checkpoint();
      } else if (!drag.dragging) {
        dragging = false;
      }
    }
    set({ nodes: applyNodeChanges(changes, get().nodes) });
  },

  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) checkpoint();
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },

  onConnect: (c) => {
    const { nodes, edges } = get();
    const check = checkConnection(nodes, edges, c);
    if (!check.ok) {
      get().showToast(check.reason);
      return;
    }
    checkpoint();
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
    checkpoint();
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

  updateData: (id, patch) => {
    const userKeys = Object.keys(patch).filter((k) => USER_DATA_KEYS.has(k));
    if (userKeys.length) checkpoint(`data:${id}:${userKeys.sort().join(',')}`);
    set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
  },

  changeModel: (id, modelId) => {
    const next = getModel(modelId);
    const node = get().nodes.find((n) => n.id === id);
    if (!next || !node) return;
    checkpoint();
    const prev = node.data as unknown as ModelData;
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                modelId,
                params: withDefaults(next, prev.params),
                selectedJobId: undefined,
                runError: undefined,
                pinned: undefined,
              },
            }
          : n,
      ),
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

  // --- Geri al / yinele ------------------------------------------------------

  undo: () => {
    const prev = history.undo(snapshot(get().nodes, get().edges));
    if (!prev) return;
    set({ nodes: prev.nodes, edges: prev.edges, historyVersion: get().historyVersion + 1 });
  },

  redo: () => {
    const next = history.redo(snapshot(get().nodes, get().edges));
    if (!next) return;
    set({ nodes: next.nodes, edges: next.edges, historyVersion: get().historyVersion + 1 });
  },

  canUndo: () => history.past.length > 0,
  canRedo: () => history.future.length > 0,

  // --- Kopyala / yapıştır ----------------------------------------------------

  copySelection: () => {
    const selected = get().nodes.filter((n) => n.selected);
    if (!selected.length) return null;
    const clip = packNodes(selected, get().edges, get().jobsFor);
    memoryClip = clip;
    pasteCount = 0;
    navigator.clipboard?.writeText(JSON.stringify(clip)).catch(() => {});
    get().showToast(`${selected.length} node kopyalandı`);
    return clip;
  },

  paste: (clip) => {
    const source = clip ?? memoryClip;
    if (!source?.nodes.length) return;
    checkpoint();
    pasteCount++;
    const { nodes, edges } = cloneWithNewIds(source, { x: 40 * pasteCount, y: 40 * pasteCount }, newId);
    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...nodes],
      edges: [...get().edges, ...edges],
    });
  },

  insertClip: (clip, at) => {
    if (!clip.nodes.length) return;
    checkpoint();
    const { nodes, edges } = cloneWithNewIds(clip, at, newId);
    set({
      nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...nodes],
      edges: [...get().edges, ...edges],
    });
  },

  /** Aynı girdilerle, aynı türden bir sonraki modeli kullanan kardeş node ekler (fan-out). */
  addSibling: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'model') return null;
    const d = node.data as unknown as ModelData;
    const def = getModel(d.modelId);
    if (!def) return null;
    const sameKind = MODELS.filter((m) => m.kind === def.kind);
    const used = new Set(
      get()
        .nodes.filter((n) => n.type === 'model')
        .map((n) => (n.data as unknown as ModelData).modelId),
    );
    const next =
      sameKind.find((m) => !used.has(m.id) && m.id !== def.id) ??
      sameKind[(sameKind.indexOf(def) + 1) % sameKind.length];
    checkpoint();
    const id = newId('model');
    const height = node.measured?.height ?? node.height ?? 520;
    const sibling: AppNode = {
      id,
      type: 'model',
      position: { x: node.position.x, y: node.position.y + height + 40 },
      data: { modelId: next.id, params: withDefaults(next, d.params), count: d.count },
      selected: true,
    };
    // Gelen kablolar kopyalanır; yeni modelde karşılığı olmayanlar atlanır.
    const incoming = get().edges.filter((e) => e.target === nodeId);
    const nodes = [...get().nodes.map((n) => ({ ...n, selected: false })), sibling];
    const newEdges: AppEdge[] = [];
    for (const e of incoming) {
      const c = { source: e.source, sourceHandle: e.sourceHandle ?? null, target: id, targetHandle: e.targetHandle ?? null };
      const check = checkConnection(nodes, [...get().edges, ...newEdges], c);
      if (check.ok) {
        newEdges.push({ ...c, id: `e-${c.source}-${c.sourceHandle}-${id}-${c.targetHandle}`, data: { type: check.type }, className: `edge-${check.type}` } as AppEdge);
      }
    }
    set({ nodes, edges: [...get().edges, ...newEdges] });
    return id;
  },

  openCompare: (req) => set({ compare: req }),
  closeCompare: () => set({ compare: null }),

  /** Karşılaştırmada seçilen kazanan: node'un aşağı akışa verdiği çıktı olur. */
  pickOutput: (nodeId, jobId) => {
    get().updateData(nodeId, { selectedJobId: jobId });
  },

  /**
   * Fan-out karşılaştırmasında kazanan node: diğer karşılaştırılan node'ların çıkış kabloları
   * (tip uyuyorsa) kazanana taşınır; böylece zincir kazananla devam eder.
   */
  promoteWinner: (winnerId, nodeIds) => {
    const { nodes, edges } = get();
    const losers = new Set(nodeIds.filter((id) => id !== winnerId));
    const moving = edges.filter((e) => losers.has(e.source));
    if (!moving.length) return 0;
    checkpoint();
    let kept = edges.filter((e) => !losers.has(e.source));
    let moved = 0;
    for (const e of moving) {
      const c = { source: winnerId, sourceHandle: 'out', target: e.target, targetHandle: e.targetHandle ?? null };
      const check = checkConnection(nodes, kept, c);
      if (!check.ok) {
        kept.push(e); // taşınamayan kablo yerinde kalır
        continue;
      }
      if (check.replaceEdgeId) kept = kept.filter((x) => x.id !== check.replaceEdgeId);
      kept.push({ ...c, id: `e-${winnerId}-out-${e.target}-${e.targetHandle}`, data: { type: check.type }, className: `edge-${check.type}` } as AppEdge);
      moved++;
    }
    set({ edges: kept });
    return moved;
  },

  duplicateSelection: () => {
    const selected = get().nodes.filter((n) => n.selected);
    if (!selected.length) return;
    const clip = packNodes(selected, get().edges, get().jobsFor);
    pasteCount = 0;
    get().paste(clip);
  },

  /** Projeyi tek JSON olarak dışa aktarır. Model çıktıları dosya yolu olarak (pinned) eklenir. */
  exportProject: () => {
    const all = packNodes(get().nodes, get().edges, get().jobsFor);
    const doc = {
      app: 'brainlab-kanvas/project',
      schemaVersion: 1,
      name: get().projectName,
      exportedAt: new Date().toISOString(),
      nodes: all.nodes,
      edges: all.edges,
      viewport: get().viewport,
    };
    return { name: get().projectName || 'proje', data: JSON.stringify(doc, null, 2) };
  },

  // --- Görevler ---------------------------------------------------------------

  setJobs: (list) => set({ jobs: Object.fromEntries(list.map((j) => [j.id, j])) }),

  upsertJob: (job) => {
    if (job.projectId !== get().projectId) return;
    const prev = get().jobs[job.id];
    // Sıra dışı gelen eski güncellemeler yok sayılır: /api/run yanıtı, canlı akıştan gelen daha yeni
    // "fail" durumundan sonra gelebilir (402/422 gibi anında dönen hatalarda). Aynı zaman damgasında
    // biten görev geri açılmaz; "izlemeye devam et" ise daha yeni damgayla geldiği için kabul edilir.
    if (prev) {
      const older = (job.updatedAt ?? 0) < (prev.updatedAt ?? 0);
      const sameTime = (job.updatedAt ?? 0) === (prev.updatedAt ?? 0);
      const reopens = !RUNNING_STATES.includes(prev.state) && RUNNING_STATES.includes(job.state);
      if (older || (sameTime && reopens)) return;
    }
    const finished = RUNNING_STATES.includes(prev?.state ?? 'submitting') && !RUNNING_STATES.includes(job.state);
    set({
      jobs: { ...get().jobs, [job.id]: job },
      creditsVersion: finished ? get().creditsVersion + 1 : get().creditsVersion,
    });
    if (finished && job.state === 'success') clearBlockedDownstream(job.nodeId);
    if (finished && job.errorCode && HALT_MESSAGES[job.errorCode]) {
      set({ halt: { code: job.errorCode, message: HALT_MESSAGES[job.errorCode] } });
    }
  },

  jobsFor: (nodeId) =>
    Object.values(get().jobs)
      .filter((j) => j.nodeId === nodeId)
      .sort((a, b) => b.createdAt - a.createdAt),

  refreshJobs: async () => {
    const pid = get().projectId;
    if (!pid) return;
    const list = await api<Job[]>(`/jobs?projectId=${encodeURIComponent(pid)}`);
    if (get().projectId === pid) get().setJobs(list);
  },

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
    const projectId = get().projectId;
    if (!node || node.type !== 'model' || !projectId) return 'failed';
    const d = node.data as unknown as ModelData;
    const def = getModel(d.modelId);
    const issues = get().issuesFor(nodeId);
    if (!def || issues.length) {
      get().updateData(nodeId, { runError: issues[0]?.message ?? 'Bilinmeyen model' });
      return 'failed';
    }
    const { inputs } = get().gatherInputs(nodeId);
    if (!force && get().isFresh(nodeId)) {
      const built = buildRequest(def, d.params, inputs);
      const cached = findCachedJob(get().jobsFor(nodeId), built.kieModel, built.input);
      if (cached && d.selectedJobId && d.selectedJobId !== cached.id) get().updateData(nodeId, { selectedJobId: cached.id });
      get().setRunStatus(nodeId, { state: 'cached' });
      clearBlockedDownstream(nodeId);
      return 'ok';
    }
    get().updateData(nodeId, { runError: undefined });
    get().setRunStatus(nodeId, null);
    // Adet (N) üretim: aynı girdiyle N ayrı görev; en az biri başarılıysa adım başarılı sayılır.
    const count = Math.min(Math.max(Number(d.count) || 1, 1), 4);
    const started: Job[] = [];
    let lastError: string | null = null;
    for (let i = 0; i < count; i++) {
      try {
        const job = await api<Job>('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, nodeId, modelId: d.modelId, params: d.params, inputs }),
        });
        get().upsertJob(job);
        started.push(job);
      } catch (err) {
        lastError = (err as Error).message;
        break;
      }
    }
    if (!started.length) {
      get().updateData(nodeId, { runError: lastError ?? 'Görev başlatılamadı' });
      return 'failed';
    }
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, selectedJobId: undefined, pinned: undefined } } : n,
      ),
    });
    const results = await Promise.all(started.map((j) => waitForJob(j.id)));
    return results.includes('success') ? 'ok' : 'failed';
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
          // Key geçersiz / kredi bitti: kalan adımlar hiç gönderilmez.
          const halt = get().halt;
          if (halt && !(get().isFresh(id) && !forced.has(id))) {
            get().setRunStatus(id, { state: 'blocked', message: `Durduruldu: ${halt.message}` });
            return 'blocked';
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

  runNode: (nodeId) => get().requestRun([nodeId], true),

  runAll: () => {
    const ids = get()
      .nodes.filter((n) => n.type === 'model')
      .map((n) => n.id);
    if (!ids.length) {
      get().showToast('Çalıştırılacak model node\'u yok');
      return Promise.resolve();
    }
    return get().requestRun(ids, false);
  },

  /** Girdisi ve modeli aynı olan başarılı bir çıktı (kendi görevi ya da kopyadan gelen) var mı? */
  isFresh: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== 'model') return false;
    const d = node.data as unknown as ModelData;
    const def = getModel(d.modelId);
    if (!def) return false;
    const { inputs, missing } = get().gatherInputs(nodeId);
    if (missing.length) return false;
    let built;
    try {
      built = buildRequest(def, d.params, inputs);
    } catch {
      return false;
    }
    if (findCachedJob(get().jobsFor(nodeId), built.kieModel, built.input)) return true;
    const p = d.pinned;
    return (
      !!p?.ref &&
      !!findCachedJob(
        [{ id: 'pinned', state: 'success', files: ['x'], kieModel: p.kieModel, input: p.input } as Job],
        built.kieModel,
        built.input,
      )
    );
  },

  estimate: (targets, forceTargets) => {
    const { nodes, edges } = get();
    let order: string[];
    try {
      order = planRun(targets, nodes, edges);
    } catch {
      return null;
    }
    return estimatePlan(
      order,
      (id) => directModelDeps(id, nodes, edges),
      // Çalışmakta olan görevi olan node yeniden gönderilmez (zincir onu bekler), maliyete eklenmez.
      (id) => get().isFresh(id) || get().jobsFor(id).some((j) => RUNNING_STATES.includes(j.state)),
      (id) => {
        const d = nodes.find((n) => n.id === id)?.data as unknown as ModelData | undefined;
        const def = d && getModel(d.modelId);
        if (!def || !d) return null;
        const unit = def.cost(withDefaults(def, d.params), get().gatherInputs(id).inputs)?.credits;
        return unit == null ? null : unit * Math.min(Math.max(Number(d.count) || 1, 1), 4);
      },
      new Set(forceTargets ? targets : []),
    );
  },

  requestRun: async (targets, forceTargets) => {
    const est = get().estimate(targets, forceTargets);
    if (!est) {
      get().showToast('Grafta döngü var');
      return;
    }
    if (!est.items.length) {
      // Her şey önbellekte: yine de durumları göstermek için zincir üzerinden geçilir (istek gitmez).
      await get().runPipeline(targets, forceTargets);
      return;
    }
    // Yeni bir çalıştırma, önceki durdurmayı kaldırır (kullanıcı bakiye yüklemiş olabilir).
    if (get().halt) set({ halt: null });
    await get().refreshCredits();
    const reasons = confirmReasons(est, get().settings.costConfirmThreshold, get().credits);
    if (reasons.length) {
      const ok = await new Promise<boolean>((resolve) => set({ confirm: { estimate: est, reasons, resolve } }));
      set({ confirm: null });
      if (!ok) return;
    }
    const startedAt = Date.now();
    await get().runPipeline(targets, forceTargets);
    const spent = Object.values(get().jobs)
      .filter((j) => j.createdAt >= startedAt - 1000 && j.credits != null)
      .reduce((s, j) => s + (j.credits ?? 0), 0);
    if (spent > 0) get().showToast(`Zincir bitti · ${spent.toLocaleString('tr-TR')} kredi harcandı`);
  },

  resolveConfirm: (ok) => get().confirm?.resolve(ok),

  clearHalt: () => set({ halt: null }),

  refreshCredits: async () => {
    try {
      const { credits } = await api<{ credits: number }>('/credits');
      set({ credits, creditsError: null });
    } catch (err) {
      set({ creditsError: (err as Error).message });
      if (err instanceof ApiError && err.status === 401) {
        set({ halt: { code: '401', message: HALT_MESSAGES['401'] } });
      }
    }
  },

  loadSettings: async () => {
    try {
      set({ settings: await api<{ costConfirmThreshold: number }>('/settings') });
    } catch {
      /* varsayılanlar kalır */
    }
  },

  saveSettings: async (patch) => {
    try {
      set({
        settings: await api<{ costConfirmThreshold: number }>('/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }),
      });
      get().showToast('Ayar kaydedildi');
    } catch (err) {
      get().showToast(`Ayar kaydedilemedi: ${(err as Error).message}`);
    }
  },

  // --- Proje ------------------------------------------------------------------

  load: async (projectId) => {
    if (get().projectId === projectId && get().loaded) return;
    await flushSave();
    history.clear();
    pasteCount = 0;
    set({
      projectId,
      projectName: '',
      nodes: [],
      edges: [],
      viewport: undefined,
      jobs: {},
      runStatus: {},
      loaded: false,
      loadError: null,
      saveState: 'idle',
      historyVersion: get().historyVersion + 1,
    });
    // Proje yüklenemezse kanvas açılmaz ve otomatik kaydetme çalışmaz (kayıtlı dosyanın üzerine yazılmaz).
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const p = await api<ProjectDoc>(`/projects/${encodeURIComponent(projectId)}`, { timeoutMs: 8000 });
        if (get().projectId !== projectId) return;
        set({
          projectName: p.name ?? 'Adsız proje',
          nodes: p.nodes ?? [],
          edges: p.edges ?? [],
          viewport: p.viewport,
          loaded: true,
          saveState: 'saved',
        });
        get().refreshJobs().catch(() => {});
        return;
      } catch (err) {
        if (get().projectId !== projectId) return;
        if (err instanceof ApiError && err.status === 404) {
          set({ loadError: 'Proje bulunamadı' });
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

  rename: async (name) => {
    const pid = get().projectId;
    const clean = name.trim().slice(0, 120);
    if (!pid || !clean || clean === get().projectName) return;
    set({ projectName: clean });
    try {
      await api(`/projects/${encodeURIComponent(pid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
    } catch (err) {
      get().showToast(`Ad kaydedilemedi: ${(err as Error).message}`);
    }
  },
}));

/** Yeni projeler için örnek zincir: Prompt → Nano Banana 2 → Önizleme */
export function starterGraph(): { nodes: AppNode[]; edges: AppEdge[] } {
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
let savePending = false;

function persistable(nodes: AppNode[]) {
  return nodes.map(({ id, type, position, data, width, height }) => {
    const clean: Record<string, unknown> = { ...data };
    delete clean.uploading;
    delete clean.runError;
    return { id, type, position, data: clean, width, height };
  });
}

async function saveNow() {
  clearTimeout(saveTimer);
  savePending = false;
  const { nodes, edges, viewport, loaded, projectId } = useCanvas.getState();
  if (!loaded || !projectId) return;
  useCanvas.setState({ saveState: 'saving' });
  try {
    await api(`/projects/${encodeURIComponent(projectId)}`, {
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
    if (useCanvas.getState().projectId === projectId) useCanvas.setState({ saveState: 'saved' });
  } catch {
    if (useCanvas.getState().projectId === projectId) useCanvas.setState({ saveState: 'error' });
  }
}

/** Proje değiştirilmeden önce bekleyen kaydı hemen yazar. */
async function flushSave() {
  if (savePending) await saveNow();
}

useCanvas.subscribe((state, prev) => {
  if (!state.loaded || state.projectId !== prev.projectId || !prev.loaded) return;
  if (state.nodes === prev.nodes && state.edges === prev.edges && state.viewport === prev.viewport) return;
  clearTimeout(saveTimer);
  savePending = true;
  saveTimer = setTimeout(saveNow, 800);
});

window.addEventListener('beforeunload', () => {
  if (savePending) void saveNow();
});
