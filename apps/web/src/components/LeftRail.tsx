import { getModel, withDefaults } from '@brainlab-kanvas/catalog';
import { useReactFlow } from '@xyflow/react';
import type { NodeKind } from '../lib/types';
import { useCanvas } from '../store';

interface Item {
  kind: NodeKind;
  label: string;
  hint: string;
  color: string;
  glyph: string;
  /** Model node'ları için başlangıç modeli */
  modelId?: string;
}

const ITEMS: Item[] = [
  { kind: 'prompt', label: 'Prompt', hint: 'Metin girişi', color: 'var(--color-port-text)', glyph: 'T' },
  { kind: 'upload', label: 'Görsel', hint: 'Görsel yükle', color: 'var(--color-port-image)', glyph: '↑' },
  { kind: 'model', label: 'Model', hint: 'Görsel modeli', color: 'var(--color-accent)', glyph: '◆', modelId: 'nano-banana-2' },
  { kind: 'model', label: 'Video', hint: 'Video modeli', color: 'var(--color-port-video)', glyph: '▶', modelId: 'kling-3.0' },
  { kind: 'preview', label: 'Önizleme', hint: 'Çıktıyı büyük göster', color: 'var(--color-fg)', glyph: '▢' },
  { kind: 'note', label: 'Not', hint: 'Yapışkan not', color: '#e6d27a', glyph: '✎' },
];

export function LeftRail() {
  const flow = useReactFlow();
  const addNode = useCanvas((s) => s.addNode);

  return (
    <nav className="absolute left-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 rounded-xl border border-line bg-surface/95 p-1.5 shadow-xl backdrop-blur">
      {ITEMS.map((it) => (
        <button
          key={it.label}
          title={it.hint}
          onClick={() => {
            const rect = document.querySelector('.react-flow')?.getBoundingClientRect();
            const center = flow.screenToFlowPosition({
              x: (rect?.left ?? 0) + (rect?.width ?? window.innerWidth) / 2 - 150,
              y: (rect?.top ?? 0) + (rect?.height ?? window.innerHeight) / 2 - 100,
            });
            const def = it.modelId ? getModel(it.modelId) : undefined;
            addNode(
              it.kind,
              { x: center.x + Math.random() * 40, y: center.y + Math.random() * 40 },
              def ? { modelId: def.id, params: withDefaults(def, {}) } : undefined,
            );
          }}
          className="group flex w-16 flex-col items-center gap-1 rounded-lg px-1 py-2 text-muted transition hover:bg-raised hover:text-fg"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-sm" style={{ color: it.color }}>
            {it.glyph}
          </span>
          <span className="text-[10px]">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
