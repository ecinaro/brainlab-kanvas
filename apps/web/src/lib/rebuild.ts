/**
 * Kaydedilmiş bir üretimden (galeri / sidecar metadata) kanvas parçası kurar:
 * model node'u (parametreler + sabitlenmiş çıktı), prompt node'u ve girdi görselleri için Görsel node'ları.
 */
import { MODELS, type ModelDef } from '@brainlab-kanvas/catalog';
import { CLIP_MARKER, type ClipPayload } from './clipboard';
import type { AppEdge, AppNode } from './types';

export interface SavedGeneration {
  id: string;
  kieModel: string;
  input: Record<string, unknown>;
  outputType: 'image' | 'video' | null;
  files: string[];
  mediaUrls: string[];
}

export function modelForKie(kieModel: string): ModelDef | undefined {
  return MODELS.find((m) => m.variants.some((v) => v.kieModel === kieModel));
}

/** local:uploads/x → /uploads/x, local:media/x → /media/x (tarayıcıda gösterim için) */
export function urlForRef(ref: string): string | undefined {
  return ref.startsWith('local:') ? `/${ref.slice('local:'.length)}` : undefined;
}

export function rebuildFromGeneration(gen: SavedGeneration): { clip: ClipPayload; warnings: string[] } | null {
  const def = modelForKie(gen.kieModel);
  if (!def) return null;
  const warnings: string[] = [];
  const nodes: AppNode[] = [];
  const edges: AppEdge[] = [];
  const modelId = 'm';

  const params: Record<string, unknown> = {};
  for (const p of def.params) if (gen.input[p.key] !== undefined) params[p.key] = gen.input[p.key];

  nodes.push({
    id: modelId,
    type: 'model',
    position: { x: 380, y: 0 },
    data: {
      modelId: def.id,
      params,
      pinned: gen.files[0]
        ? {
            type: gen.outputType ?? def.output,
            ref: `local:${gen.files[0]}`,
            url: gen.mediaUrls[0],
            kieModel: gen.kieModel,
            input: gen.input,
          }
        : undefined,
    },
  });

  // Aynı parametreye eşlenen portlar (Kling başlangıç/bitiş karesi) sırayla değer tüketir.
  const consumed = new Map<string, number>();
  let y = 0;
  for (const port of def.inputs) {
    const raw = gen.input[port.param];
    if (raw === undefined) continue;
    const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)];
    const start = consumed.get(port.param) ?? 0;
    const take = port.shape === 'array' ? all.slice(start) : all.slice(start, start + 1);
    consumed.set(port.param, start + take.length);

    for (const value of take) {
      const id = `${port.id}-${nodes.length}`;
      if (port.type === 'text') {
        nodes.push({ id, type: 'prompt', position: { x: 0, y }, data: { text: value } });
        edges.push(edge(id, 'text', modelId, port.id, 'text'));
        y += 200;
      } else if (port.type === 'image') {
        const url = urlForRef(value);
        if (!url) {
          warnings.push(`${port.label}: yerel olmayan bağlantı atlandı`);
          continue;
        }
        nodes.push({ id, type: 'upload', position: { x: 0, y }, data: { ref: value, url, name: value.split('/').pop() } });
        edges.push(edge(id, 'image', modelId, port.id, 'image'));
        y += 300;
      } else {
        warnings.push(`${port.label} (${port.type}) için node türü yok; bağlantı atlandı`);
      }
    }
  }

  return { clip: { app: CLIP_MARKER, v: 1, nodes, edges }, warnings };
}

function edge(source: string, sourceHandle: string, target: string, targetHandle: string, type: 'text' | 'image'): AppEdge {
  return {
    id: `e-${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { type },
    className: `edge-${type}`,
  };
}
