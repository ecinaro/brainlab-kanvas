/** Yardımcı görsel araçları. Parametreler docs.kie.ai sayfalarından okundu (2026-09-24). */
import type { ModelDef } from '../types';

export const topazImageUpscale: ModelDef = {
  id: 'topaz-image-upscale',
  name: 'Topaz Upscale',
  vendor: 'Topaz',
  kind: 'tool',
  output: 'image',
  description: 'Görseli büyütür ve netleştirir.',
  variants: [{ kieModel: 'topaz/image-upscale' }],
  inputs: [{ id: 'image', label: 'Görsel', type: 'image', param: 'image_url', shape: 'string', required: true }],
  params: [{ key: 'upscale_factor', label: 'Büyütme', type: 'enum', options: ['1', '2', '4'], default: '2' }],
  cost: (p) => ({
    credits: p.upscale_factor === '4' ? 20 : 10,
    note: 'Fiyat çıktı boyutuna göre (2K: 10, 4K: 20); girdi boyutu bilinmediği için tahmini',
  }),
  docUrls: ['https://docs.kie.ai/market/topaz/image-upscale.md'],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const recraftRemoveBg: ModelDef = {
  id: 'recraft-remove-bg',
  name: 'Arka Plan Sil',
  vendor: 'Recraft',
  kind: 'tool',
  output: 'image',
  description: 'Görselin arka planını kaldırır (en fazla 5 MB).',
  variants: [{ kieModel: 'recraft/remove-background' }],
  inputs: [{ id: 'image', label: 'Görsel', type: 'image', param: 'image', shape: 'string', required: true }],
  params: [],
  cost: () => ({ credits: 1 }),
  docUrls: ['https://docs.kie.ai/market/recraft/remove-background.md'],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const toolModels = [topazImageUpscale, recraftRemoveBg];
