import type { ParamDef } from '@brainlab-kanvas/catalog';

export function ParamField({
  def,
  value,
  onChange,
  invalid,
  compact,
}: {
  def: ParamDef;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
  invalid?: boolean;
  compact?: boolean;
}) {
  const border = invalid ? 'border-danger' : 'border-line focus:border-muted';
  const field = `nodrag w-full rounded-md border bg-bg px-2 py-1 text-[11px] text-fg outline-none ${border}`;

  let control;
  if (def.type === 'enum') {
    control = (
      <select
        value={String(value ?? '')}
        onChange={(e) => {
          const opt = def.options?.find((o) => String(o) === e.target.value);
          onChange(opt ?? e.target.value);
        }}
        className={field}
      >
        {def.options?.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    );
  } else if (def.type === 'boolean') {
    control = (
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`nodrag rounded-md border px-2 py-1 text-[11px] ${value ? 'border-accent text-accent' : 'border-line text-muted'}`}
      >
        {value ? 'Açık' : 'Kapalı'}
      </button>
    );
  } else {
    control = (
      <input
        type={def.type === 'integer' ? 'number' : 'text'}
        value={String(value ?? '')}
        onChange={(e) => onChange(def.type === 'integer' ? Number(e.target.value) : e.target.value)}
        className={field}
      />
    );
  }

  return (
    <label className={compact ? 'block min-w-0 flex-1' : 'block'}>
      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-muted">{def.label}</span>
      {control}
      {!compact && def.help && <span className="mt-0.5 block text-[10px] text-muted/80">{def.help}</span>}
    </label>
  );
}
