import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';
import { type InPort, type OutPort, PORT_COLOR, PORT_LABEL } from '../lib/ports';

export function NodeShell({
  title,
  accent,
  selected,
  right,
  children,
  width = 300,
  status,
}: {
  title: string;
  accent?: string;
  selected?: boolean;
  right?: ReactNode;
  children: ReactNode;
  width?: number;
  status?: 'running' | 'error' | 'ok';
}) {
  return (
    <div
      style={{ width }}
      className={`node-shell relative rounded-xl border bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.45)] ${
        selected ? 'border-fg/40' : 'border-line'
      } ${status === 'running' ? 'node-running' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent ?? 'var(--color-muted)' }} />
          <span className="truncate text-xs font-medium tracking-tight">{title}</span>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

/** Satır içi giriş portu: etiketi node içinde, tutamacı sol kenarda. */
export function InputRow({ port, count }: { port: InPort; count: number }) {
  const color = PORT_COLOR[port.types[0]];
  return (
    <div className="relative flex items-center justify-between px-3 py-1 text-[11px] text-muted">
      <Handle
        type="target"
        position={Position.Left}
        id={port.id}
        className="port-handle"
        style={{ background: color, left: -6 }}
        title={`${port.label} (${port.types.map((t) => PORT_LABEL[t]).join('/')})`}
      />
      <span>
        {port.label}
        {port.required && <span className="text-danger"> *</span>}
      </span>
      {port.multi && port.max !== undefined && (
        <span className="tabular-nums">
          {count}/{port.max}
        </span>
      )}
    </div>
  );
}

export function OutputHandle({ port }: { port: OutPort }) {
  return (
    <Handle
      type="source"
      position={Position.Right}
      id={port.id}
      className="port-handle"
      style={{ background: PORT_COLOR[port.type], right: -6, top: 20 }}
      title={`Çıkış: ${PORT_LABEL[port.type]}`}
    />
  );
}

export function MediaView({ url, type, className = '' }: { url: string; type: string; className?: string }) {
  return type === 'video' ? (
    <video src={url} controls loop muted className={`w-full rounded-lg bg-black ${className}`} />
  ) : (
    <img src={url} alt="" draggable={false} className={`w-full rounded-lg object-contain ${className}`} />
  );
}
