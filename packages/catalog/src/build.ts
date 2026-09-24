import type { ModelDef, ParamValues, PortValues, RuleContext, Variant } from './types';

export interface Issue {
  message: string;
  param?: string;
  port?: string;
}

export interface BuiltRequest {
  kieModel: string;
  input: Record<string, unknown>;
}

/** Katalogdaki varsayılanlarla doldurulmuş parametreler */
export function withDefaults(def: ModelDef, params: ParamValues = {}): ParamValues {
  const out: ParamValues = {};
  for (const p of def.params) out[p.key] = params[p.key] ?? p.default;
  return out;
}

export function selectVariant(def: ModelDef, inputs: PortValues): Variant {
  const connected = (id: string) => (inputs[id]?.length ?? 0) > 0;
  return def.variants.find((v) => !v.whenConnected || v.whenConnected.every(connected)) ?? def.variants.at(-1)!;
}

/** Çalıştırmadan önce yapılan tüm kontroller. Tarayıcı ve sunucu aynı fonksiyonu kullanır. */
export function validate(def: ModelDef, rawParams: ParamValues, inputs: PortValues): Issue[] {
  const issues: Issue[] = [];
  const params = withDefaults(def, rawParams);
  const variant = selectVariant(def, inputs);

  for (const port of def.inputs) {
    const values = (inputs[port.id] ?? []).filter((v) => v !== '');
    if (port.required && values.length === 0) {
      issues.push({ port: port.id, message: `${port.label} bağlı değil veya boş` });
    }
    if (variant.excludePorts?.includes(port.id)) continue;
    const max = port.shape === 'string' ? 1 : port.max;
    if (max !== undefined && values.length > max) {
      issues.push({ port: port.id, message: `${port.label} en fazla ${max} bağlantı alabilir (${values.length} var)` });
    }
    if (port.maxLength) {
      for (const v of values) {
        if (v.length > port.maxLength) {
          issues.push({ port: port.id, message: `${port.label} en fazla ${port.maxLength} karakter olabilir (${v.length})` });
        }
      }
    }
  }

  for (const p of def.params) {
    const v = params[p.key];
    if (v === undefined || variant.excludeParams?.includes(p.key)) continue;
    if (p.type === 'enum' && p.options && !p.options.includes(v as string | number)) {
      issues.push({ param: p.key, message: `${p.label}: geçersiz değer "${v}"` });
    }
    if (p.type === 'boolean' && typeof v !== 'boolean') {
      issues.push({ param: p.key, message: `${p.label}: evet/hayır olmalı` });
    }
    if (p.type === 'integer') {
      if (!Number.isInteger(v)) {
        issues.push({ param: p.key, message: `${p.label}: tam sayı olmalı` });
      } else if ((p.min !== undefined && (v as number) < p.min) || (p.max !== undefined && (v as number) > p.max)) {
        issues.push({ param: p.key, message: `${p.label}: ${p.min} ile ${p.max} arasında olmalı` });
      }
    }
  }

  const ctx: RuleContext = { params, inputs, connected: (id) => (inputs[id]?.length ?? 0) > 0 };
  for (const rule of def.rules ?? []) {
    const r = rule(ctx);
    if (r) issues.push(r);
  }
  return issues;
}

/** Katalog kaydından Kie createTask gövdesini üretir. Hata varsa fırlatır. */
export function buildRequest(def: ModelDef, rawParams: ParamValues, inputs: PortValues): BuiltRequest {
  const issues = validate(def, rawParams, inputs);
  if (issues.length) throw new ValidationError(issues);

  const params = withDefaults(def, rawParams);
  const variant = selectVariant(def, inputs);
  const input: Record<string, unknown> = {};

  for (const port of def.inputs) {
    if (variant.excludePorts?.includes(port.id)) continue;
    const values = (inputs[port.id] ?? []).filter((v) => v !== '');
    if (!values.length) continue;
    if ((port.paramShape ?? port.shape) === 'array') {
      const prev = Array.isArray(input[port.param]) ? (input[port.param] as string[]) : [];
      input[port.param] = [...prev, ...values];
    } else {
      input[port.param] = values[0];
    }
  }
  for (const p of def.params) {
    if (variant.excludeParams?.includes(p.key)) continue;
    const v = params[p.key];
    if (v !== undefined && v !== '') input[p.key] = v;
  }
  Object.assign(input, def.fixed ?? {});
  return { kieModel: variant.kieModel, input };
}

export class ValidationError extends Error {
  constructor(public readonly issues: Issue[]) {
    super(issues.map((i) => i.message).join('; '));
  }
}
