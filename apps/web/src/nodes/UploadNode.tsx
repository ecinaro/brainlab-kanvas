import type { NodeProps } from '@xyflow/react';
import { useRef, useState } from 'react';
import { firstImageFile, uploadIntoNode } from '../lib/upload';
import type { AppNode, UploadData } from '../lib/types';
import { NodeShell, OutputHandle } from './shared';

export function UploadNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as unknown as UploadData;
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <NodeShell
      title={d.name ? `Görsel · ${d.name}` : 'Görsel Yükle'}
      accent="var(--color-port-image)"
      selected={selected}
      width={260}
    >
      <OutputHandle port={{ id: 'image', type: 'image' }} />
      <div className="p-2">
        <div
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOver(false);
            const f = firstImageFile(e.dataTransfer.files);
            if (f) uploadIntoNode(id, f);
          }}
          className={`nodrag flex min-h-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed text-center text-[11px] text-muted transition ${
            over ? 'border-accent bg-accent/5' : 'border-line hover:border-muted'
          }`}
        >
          {d.url ? (
            <img src={d.url} alt="" draggable={false} className="max-h-72 w-full object-contain" />
          ) : (
            <span className="px-4 py-6">
              {d.uploading ? 'Yükleniyor…' : 'Tıkla, sürükle-bırak ya da Ctrl+V ile yapıştır'}
              <br />
              <span className="text-muted/60">png · jpg · webp · en fazla 30 MB</span>
            </span>
          )}
        </div>
        {d.error && <div className="mt-1.5 text-[11px] text-danger">{d.error}</div>}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadIntoNode(id, f);
            e.target.value = '';
          }}
        />
      </div>
    </NodeShell>
  );
}
