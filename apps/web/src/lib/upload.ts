import { useCanvas } from '../store';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/** Dosyayı yerel sunucuya yükler ve Görsel Yükle node'unu günceller. */
export async function uploadIntoNode(nodeId: string, file: File) {
  const { updateData } = useCanvas.getState();
  if (!ACCEPTED.includes(file.type)) {
    updateData(nodeId, { error: `Desteklenmeyen tür: ${file.type || 'bilinmiyor'} (png, jpg, webp)` });
    return;
  }
  updateData(nodeId, { uploading: true, error: undefined });
  try {
    const form = new FormData();
    form.append('file', file, file.name || 'yapistirilan.png');
    const res = await fetch('/api/uploads', { method: 'POST', headers: { 'X-Canvas-Client': '1' }, body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    updateData(nodeId, { uploading: false, ref: body.ref, url: body.url, name: body.originalName });
  } catch (err) {
    updateData(nodeId, { uploading: false, error: (err as Error).message });
  }
}

export function firstImageFile(list: DataTransferItemList | FileList | null | undefined): File | null {
  if (!list) return null;
  for (const item of Array.from(list as ArrayLike<DataTransferItem | File>)) {
    const file = item instanceof File ? item : item.kind === 'file' ? item.getAsFile() : null;
    if (file && file.type.startsWith('image/')) return file;
  }
  return null;
}
