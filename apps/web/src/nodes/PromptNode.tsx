import type { NodeProps } from '@xyflow/react';
import type { AppNode, PromptData } from '../lib/types';
import { useCanvas } from '../store';
import { NodeShell, OutputHandle } from './shared';

export function PromptNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as unknown as PromptData;
  const updateData = useCanvas((s) => s.updateData);
  return (
    <NodeShell title="Prompt" accent="var(--color-port-text)" selected={selected} width={320}>
      <OutputHandle port={{ id: 'text', type: 'text' }} />
      <div className="p-2">
        <textarea
          value={d.text}
          onChange={(e) => updateData(id, { text: e.target.value })}
          placeholder="Ne üretmek istiyorsun? (İngilizce prompt'lar genelde daha iyi sonuç verir)"
          rows={6}
          className="nodrag nowheel block w-full resize-y rounded-lg border border-line bg-bg px-2.5 py-2 text-xs leading-relaxed text-fg outline-none placeholder:text-muted/70 focus:border-muted"
        />
        <div className="mt-1 text-right text-[10px] tabular-nums text-muted">{d.text.length} karakter</div>
      </div>
    </NodeShell>
  );
}
