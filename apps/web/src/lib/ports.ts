import { getModel, type PortType } from '@brainlab-kanvas/catalog';
import type { AppNode, Job, ModelData, PromptData, UploadData } from './types';

export interface InPort {
  id: string;
  label: string;
  types: PortType[];
  multi: boolean;
  max?: number;
  required?: boolean;
}
export interface OutPort {
  id: string;
  type: PortType;
}

export const PORT_LABEL: Record<PortType, string> = { text: 'Metin', image: 'Görsel', video: 'Video', audio: 'Ses' };

export const PORT_COLOR: Record<PortType, string> = {
  text: 'var(--color-port-text)',
  image: 'var(--color-port-image)',
  video: 'var(--color-port-video)',
  audio: 'var(--color-port-audio)',
};

export function inputsOf(node: AppNode): InPort[] {
  switch (node.type) {
    case 'model': {
      const def = getModel((node.data as unknown as ModelData).modelId);
      return (def?.inputs ?? []).map((p) => ({
        id: p.id,
        label: p.label,
        types: [p.type],
        multi: p.shape === 'array',
        max: p.shape === 'array' ? p.max : 1,
        required: p.required,
      }));
    }
    case 'preview':
      return [{ id: 'in', label: 'Girdi', types: ['image', 'video'], multi: false, max: 1 }];
    default:
      return [];
  }
}

export function outputsOf(node: AppNode): OutPort[] {
  switch (node.type) {
    case 'prompt':
      return [{ id: 'text', type: 'text' }];
    case 'upload':
      return [{ id: 'image', type: 'image' }];
    case 'model': {
      const def = getModel((node.data as unknown as ModelData).modelId);
      return def ? [{ id: 'out', type: def.output }] : [];
    }
    default:
      return [];
  }
}

export interface NodeOutput {
  type: PortType;
  /** Metin portları için değer */
  text?: string;
  /** Model girdisi için dosya referansı (local:...) */
  ref?: string;
  /** Tarayıcıda göstermek için URL */
  url?: string;
}

/** Bir node'un aşağı akışa verdiği çıktı. Henüz çıktı yoksa null. */
export function outputOf(node: AppNode, jobsForNode: Job[]): NodeOutput | null {
  switch (node.type) {
    case 'prompt': {
      const text = (node.data as unknown as PromptData).text ?? '';
      return text.trim() ? { type: 'text', text } : null;
    }
    case 'upload': {
      const d = node.data as unknown as UploadData;
      return d.ref ? { type: 'image', ref: d.ref, url: d.url } : null;
    }
    case 'model': {
      const job = selectedJob(node, jobsForNode);
      const file = job?.files[0];
      if (!job || !file) return null;
      return { type: job.outputType ?? 'image', ref: `local:${file}`, url: job.mediaUrls[0] };
    }
    default:
      return null;
  }
}

/** Seçili görev; seçim yoksa en son başarılı görev. */
export function selectedJob(node: AppNode, jobsForNode: Job[]): Job | undefined {
  const d = node.data as unknown as ModelData;
  const success = jobsForNode.filter((j) => j.state === 'success' && j.files.length);
  return success.find((j) => j.id === d.selectedJobId) ?? success[0];
}
