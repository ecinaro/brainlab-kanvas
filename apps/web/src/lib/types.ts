import type { ParamValues, PortType } from '@brainlab-kanvas/catalog';
import type { Edge, Node } from '@xyflow/react';

export type NodeKind = 'prompt' | 'upload' | 'model' | 'preview' | 'note';

export interface PromptData {
  text: string;
}
export interface UploadData {
  ref?: string;
  url?: string;
  name?: string;
  uploading?: boolean;
  error?: string;
}
export interface ModelData {
  modelId: string;
  params: ParamValues;
  /** Aşağı akışa verilen çıktı; boşsa en son başarılı görev */
  selectedJobId?: string;
  /** Çalıştırma öncesi (istemci/sunucu) hata mesajı */
  runError?: string;
}
export type PreviewData = Record<string, never>;
export interface NoteData {
  text: string;
}

export interface DataByKind {
  prompt: PromptData;
  upload: UploadData;
  model: ModelData;
  preview: PreviewData;
  note: NoteData;
}

export type AppNode = Node<Record<string, unknown>, NodeKind>;
export type AppEdge = Edge<{ type: PortType }>;

export type JobState =
  | 'submitting'
  | 'waiting'
  | 'queuing'
  | 'generating'
  | 'downloading'
  | 'success'
  | 'fail'
  | 'timeout';

export interface Job {
  id: string;
  projectId: string;
  nodeId: string;
  kieModel: string;
  input: Record<string, unknown>;
  outputType: 'image' | 'video' | null;
  state: JobState;
  taskId: string | null;
  progress: number | null;
  files: string[];
  mediaUrls: string[];
  credits: number | null;
  errorCode: string | null;
  errorMsg: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export const RUNNING_STATES: JobState[] = ['submitting', 'waiting', 'queuing', 'generating', 'downloading'];

export const STATE_LABEL: Record<JobState, string> = {
  submitting: 'Gönderiliyor',
  waiting: 'Sırada',
  queuing: 'Kuyrukta',
  generating: 'Üretiliyor',
  downloading: 'İndiriliyor',
  success: 'Tamamlandı',
  fail: 'Hata',
  timeout: 'Zaman aşımı',
};
