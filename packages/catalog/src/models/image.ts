/**
 * Görsel modelleri. Parametre adları ve değerleri docs.kie.ai sayfalarından okundu (2026-09-24).
 * Fiyatlar kie.ai/pricing tablosundan (docs/pricing-notes.md) ve tahminidir.
 */
import type { ModelDef } from '../types';

const ASPECTS_NB2 = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', '1:4', '4:1', '1:8', '8:1'] as const;
const ASPECTS_NBPRO = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'] as const;
const ASPECTS_GPT2 = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '3:1', '1:3', '21:9', '9:21'] as const;
const ASPECTS_SEEDREAM = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'] as const;

export const nanoBanana2: ModelDef = {
  id: 'nano-banana-2',
  name: 'Nano Banana 2',
  vendor: 'Google',
  kind: 'image',
  output: 'image',
  description: 'Hızlı ve çok yönlü. 14 referans görsele kadar destekler.',
  variants: [{ kieModel: 'nano-banana-2' }],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 20000 },
    { id: 'images', label: 'Referans görseller', type: 'image', param: 'image_input', shape: 'array', max: 14 },
  ],
  params: [
    { key: 'aspect_ratio', label: 'En-boy', type: 'enum', options: ASPECTS_NB2, default: 'auto' },
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['1K', '2K', '4K'], default: '1K' },
    { key: 'output_format', label: 'Format', type: 'enum', options: ['jpg', 'png'], default: 'jpg', advanced: true },
  ],
  cost: (p) => ({ credits: { '1K': 8, '2K': 12, '4K': 18 }[String(p.resolution)] ?? 8 }),
  docUrls: ['https://docs.kie.ai/market/google/nanobanana2.md'],
  verifiedAt: '2026-09-24',
  status: 'verified',
};

export const nanoBananaPro: ModelDef = {
  id: 'nano-banana-pro',
  name: 'Nano Banana Pro',
  vendor: 'Google',
  kind: 'image',
  output: 'image',
  description: 'Yüksek kalite. 8 referans görsele kadar.',
  variants: [{ kieModel: 'nano-banana-pro' }],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 10000 },
    { id: 'images', label: 'Referans görseller', type: 'image', param: 'image_input', shape: 'array', max: 8 },
  ],
  params: [
    { key: 'aspect_ratio', label: 'En-boy', type: 'enum', options: ASPECTS_NBPRO, default: '1:1' },
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['1K', '2K', '4K'], default: '1K' },
    { key: 'output_format', label: 'Format', type: 'enum', options: ['png', 'jpg'], default: 'png', advanced: true },
  ],
  cost: (p) => ({ credits: p.resolution === '4K' ? 24 : 18 }),
  docUrls: ['https://docs.kie.ai/market/google/pro-image-to-image.md'],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const gptImage2: ModelDef = {
  id: 'gpt-image-2',
  name: 'GPT Image 2',
  vendor: 'OpenAI',
  kind: 'image',
  output: 'image',
  description: 'Metin ve tipografide güçlü. Görsel bağlanırsa otomatik olarak image-to-image çalışır.',
  variants: [
    { kieModel: 'gpt-image-2-image-to-image', whenConnected: ['images'] },
    { kieModel: 'gpt-image-2-text-to-image', excludePorts: ['images'] },
  ],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 20000 },
    { id: 'images', label: 'Girdi görselleri', type: 'image', param: 'input_urls', shape: 'array', max: 16 },
  ],
  params: [
    { key: 'aspect_ratio', label: 'En-boy', type: 'enum', options: ASPECTS_GPT2, default: 'auto' },
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['1K', '2K', '4K'], default: '1K' },
    {
      key: 'background',
      label: 'Arka plan',
      type: 'enum',
      options: ['auto', 'opaque', 'transparent'],
      default: 'auto',
      advanced: true,
      help: 'Sadece 1K çözünürlükte desteklenir.',
    },
  ],
  rules: [
    ({ params }) =>
      params.aspect_ratio === 'auto' && params.resolution !== '1K'
        ? { message: 'En-boy "auto" iken sadece 1K desteklenir', param: 'resolution' }
        : null,
    ({ params }) =>
      params.aspect_ratio === '1:1' && params.resolution === '4K'
        ? { message: '1:1 en-boyda 4K desteklenmez', param: 'resolution' }
        : null,
    ({ params }) =>
      params.resolution === '2K' && ['5:4', '4:5', '3:1', '1:3', '9:21'].includes(String(params.aspect_ratio))
        ? { message: `2K çözünürlükte ${params.aspect_ratio} desteklenmez`, param: 'aspect_ratio' }
        : null,
    ({ params }) =>
      params.resolution === '4K' && ['3:1', '1:3', '9:21'].includes(String(params.aspect_ratio))
        ? { message: `4K çözünürlükte ${params.aspect_ratio} desteklenmez`, param: 'aspect_ratio' }
        : null,
    ({ params }) =>
      params.background && params.background !== 'auto' && params.resolution !== '1K'
        ? { message: 'Arka plan ayarı sadece 1K çözünürlükte kullanılabilir', param: 'background' }
        : null,
  ],
  cost: (p) => ({ credits: { '1K': 6, '2K': 10, '4K': 16 }[String(p.resolution)] ?? 6 }),
  docUrls: [
    'https://docs.kie.ai/market/gpt/gpt-image-2-text-to-image.md',
    'https://docs.kie.ai/market/gpt/gpt-image-2-image-to-image.md',
  ],
  verifiedAt: '2026-09-24',
  // image-to-image gerçek key ile doğrulandı (6 kredi); text-to-image varyantı henüz denenmedi.
  status: 'verified',
};

export const seedream5Pro: ModelDef = {
  id: 'seedream-5-pro',
  name: 'Seedream 5 Pro',
  vendor: 'ByteDance',
  kind: 'image',
  output: 'image',
  description: 'Fotogerçekçi, farklı bir estetik. Görsel bağlanırsa image-to-image çalışır.',
  variants: [
    { kieModel: 'seedream/5-pro-image-to-image', whenConnected: ['images'] },
    { kieModel: 'seedream/5-pro-text-to-image', excludePorts: ['images'] },
  ],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 5000 },
    { id: 'images', label: 'Girdi görselleri', type: 'image', param: 'image_urls', shape: 'array', max: 10 },
  ],
  params: [
    { key: 'aspect_ratio', label: 'En-boy', type: 'enum', options: ASPECTS_SEEDREAM, default: '1:1' },
    { key: 'quality', label: 'Kalite', type: 'enum', options: ['basic', 'high'], default: 'basic' },
    { key: 'output_format', label: 'Format', type: 'enum', options: ['png', 'jpeg'], default: 'png', advanced: true },
  ],
  cost: (p, inputs) => {
    const base = p.quality === 'high' ? 14 : 7;
    const extra = Math.max(0, (inputs.images?.length ?? 0) - 1) * 0.5;
    return { credits: base + extra, note: 'Kalite eşlemesi tahmini: basic=1K, high=2K' };
  },
  docUrls: [
    'https://docs.kie.ai/market/seedream/5-pro-text-to-image.md',
    'https://docs.kie.ai/market/seedream/5-pro-image-to-image.md',
  ],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const imageModels = [nanoBanana2, nanoBananaPro, gptImage2, seedream5Pro];
