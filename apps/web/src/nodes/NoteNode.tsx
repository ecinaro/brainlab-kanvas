import type { NodeProps } from '@xyflow/react';
import type { AppNode, NoteData } from '../lib/types';
import { useCanvas } from '../store';

export function NoteNode({ id, data, selected }: NodeProps<AppNode>) {
  const d = data as unknown as NoteData;
  const updateData = useCanvas((s) => s.updateData);
  return (
    <div
      className={`w-60 rounded-xl border p-2 shadow-lg ${selected ? 'border-[#e6d27a]/60' : 'border-[#e6d27a]/20'}`}
      style={{ background: '#1f1c10' }}
    >
      <textarea
        value={d.text}
        onChange={(e) => updateData(id, { text: e.target.value })}
        placeholder="Not…"
        rows={4}
        className="nodrag nowheel block w-full resize-y bg-transparent text-xs leading-relaxed text-[#efe3a8] outline-none placeholder:text-[#efe3a8]/40"
      />
    </div>
  );
}
