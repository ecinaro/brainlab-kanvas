export type PortType = 'text' | 'image' | 'video' | 'audio';

export const PORT_TYPES: readonly PortType[] = ['text', 'image', 'video', 'audio'];

/** Bir node girişi ve bu girişin Kie `input` içindeki parametresi. */
export interface InputPort {
  id: string;
  label: string;
  type: PortType;
  /** Kie input alanı adı (modele göre değişir: image_input, input_urls, image_urls, image_url…) */
  param: string;
  /** array: birden fazla bağlantı kabul eder; string: tek bağlantı */
  shape: 'string' | 'array';
  /**
   * Kie'ye gönderilen biçim; verilmezse shape ile aynı. Aynı param'a eşlenen birden fazla port
   * (örn. Kling başlangıç + bitiş karesi → image_urls) port sırasıyla tek diziye birleştirilir.
   */
  paramShape?: 'string' | 'array';
  max?: number;
  required?: boolean;
  /** Metin portları için karakter sınırı */
  maxLength?: number;
}

export interface ParamDef {
  key: string;
  label: string;
  type: 'enum' | 'boolean' | 'integer' | 'string';
  options?: readonly (string | number)[];
  default?: string | number | boolean;
  /** Node üzerinde değil, sadece Inspector'da gösterilir */
  advanced?: boolean;
  help?: string;
  /** integer için sınırlar */
  min?: number;
  max?: number;
}

export type ParamValues = Record<string, string | number | boolean | undefined>;

/** Portlara bağlı değerler: metin ya da "local:..." dosya referansları */
export type PortValues = Record<string, string[]>;

export interface RuleContext {
  params: ParamValues;
  inputs: PortValues;
  connected: (portId: string) => boolean;
}

/** Hata varsa mesaj döner; hangi parametreyle ilgili olduğu da belirtilebilir. */
export type Rule = (ctx: RuleContext) => { message: string; param?: string } | null;

export interface Variant {
  kieModel: string;
  /** Bu portlar bağlıysa bu varyant seçilir */
  whenConnected?: string[];
  /** Bu varyantta kullanılmayan (Kie'ye gönderilmeyen) portlar */
  excludePorts?: string[];
  /** Bu varyantta Kie'ye gönderilmeyen parametreler */
  excludeParams?: string[];
}

export interface CostEstimate {
  credits: number;
  note?: string;
}

export interface ModelDef {
  id: string;
  name: string;
  vendor: string;
  kind: 'image' | 'video' | 'tool';
  output: 'image' | 'video';
  description: string;
  /** İlk eşleşen varyant kullanılır; son varyant koşulsuz (varsayılan) olmalı */
  variants: Variant[];
  inputs: InputPort[];
  params: ParamDef[];
  /** Kullanıcıya gösterilmeden her istekte gönderilen sabit alanlar */
  fixed?: Record<string, unknown>;
  rules?: Rule[];
  cost: (params: ParamValues, inputs: PortValues) => CostEstimate | null;
  timeoutSec?: number;
  docUrls: string[];
  verifiedAt: string;
  /** verified: gerçek key ile en az bir başarılı üretim görüldü */
  status: 'verified' | 'experimental';
}
