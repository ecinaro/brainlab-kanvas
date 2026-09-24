/**
 * Video modelleri. Parametreler docs.kie.ai sayfalarından okundu (2026-09-24).
 * Kling 3.0 gerçek key ile doğrulandı; diğerleri henüz denenmedi → experimental. Fiyatlar tahminidir (docs/pricing-notes.md).
 */
import type { ModelDef } from '../types';

const DURATIONS_3_15 = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'] as const;

export const kling30: ModelDef = {
  id: 'kling-3.0',
  name: 'Kling 3.0',
  vendor: 'Kling',
  kind: 'video',
  output: 'video',
  description: 'Yüksek kaliteli video. Başlangıç ve isteğe bağlı bitiş karesiyle ya da sadece metinle çalışır.',
  variants: [{ kieModel: 'kling-3.0/video' }],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true },
    // Dokümana göre image_urls[0] ilk kare, image_urls[1] son kare.
    { id: 'first_frame', label: 'Başlangıç karesi', type: 'image', param: 'image_urls', shape: 'string', paramShape: 'array' },
    { id: 'last_frame', label: 'Bitiş karesi', type: 'image', param: 'image_urls', shape: 'string', paramShape: 'array' },
  ],
  params: [
    {
      key: 'mode',
      label: 'Kalite',
      type: 'enum',
      options: ['std', 'pro', '4K'],
      default: 'std',
      help: 'std = 720p, pro = 1080p, 4K = 2160p',
    },
    { key: 'duration', label: 'Süre (sn)', type: 'enum', options: DURATIONS_3_15, default: '5' },
    {
      key: 'aspect_ratio',
      label: 'En-boy',
      type: 'enum',
      options: ['16:9', '9:16', '1:1'],
      default: '16:9',
      help: 'Kare bağlıysa model en-boyu görsele göre uyarlar.',
    },
    { key: 'sound', label: 'Ses', type: 'boolean', default: false, advanced: true, help: 'Sesli üretim daha pahalıdır.' },
  ],
  // Doküman örneği multi_shots=false iken de multi_prompt gönderiyor; boş dizi Kie tarafından kabul edildi.
  fixed: { multi_shots: false, multi_prompt: [] },
  rules: [
    ({ connected }) =>
      connected('last_frame') && !connected('first_frame')
        ? { message: 'Bitiş karesi için başlangıç karesi de bağlanmalı' }
        : null,
  ],
  cost: (p) => {
    const perSec =
      p.mode === '4K' ? 67 : p.mode === 'pro' ? (p.sound ? 27 : 18) : p.sound ? 20 : 14;
    return { credits: perSec * Number(p.duration ?? 5) };
  },
  timeoutSec: 1200,
  docUrls: ['https://docs.kie.ai/market/kling/kling-3-0.md'],
  verifiedAt: '2026-09-24',
  // std, 3 sn, sessiz, başlangıç karesiyle gerçek key üzerinde doğrulandı (42 kredi, ~6,5 dk).
  status: 'verified',
};

export const klingV3Turbo: ModelDef = {
  id: 'kling-v3-turbo',
  name: 'Kling V3 Turbo',
  vendor: 'Kling',
  kind: 'video',
  output: 'video',
  description: 'Daha hızlı Kling. Görsel bağlanırsa image-to-video, bağlanmazsa text-to-video.',
  variants: [
    { kieModel: 'kling/v3-turbo-image-to-video', whenConnected: ['image'], excludeParams: ['aspect_ratio'] },
    { kieModel: 'kling/v3-turbo-text-to-video', excludePorts: ['image'] },
  ],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 2500 },
    { id: 'image', label: 'Başlangıç görseli', type: 'image', param: 'image_urls', shape: 'string', paramShape: 'array' },
  ],
  params: [
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['720p', '1080p'], default: '720p' },
    { key: 'duration', label: 'Süre (sn)', type: 'enum', options: DURATIONS_3_15, default: '5' },
    {
      key: 'aspect_ratio',
      label: 'En-boy',
      type: 'enum',
      options: ['16:9', '9:16', '1:1'],
      default: '16:9',
      advanced: true,
      help: 'Sadece text-to-video modunda kullanılır.',
    },
  ],
  cost: (p) => ({
    credits: (p.resolution === '1080p' ? 22.5 : 18) * Number(p.duration ?? 5),
    note: 'Fiyat tablosundaki "Kling 3.0 Turbo" satırı kullanıldı',
  }),
  timeoutSec: 1200,
  docUrls: [
    'https://docs.kie.ai/market/kling/v3-turbo-image-to-video.md',
    'https://docs.kie.ai/market/kling/v3-turbo-text-to-video.md',
  ],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const seedance25: ModelDef = {
  id: 'seedance-2.5',
  name: 'Seedance 2.5',
  vendor: 'ByteDance',
  kind: 'video',
  output: 'video',
  description:
    'İlk/son kare ya da referans görsel ve videolarla çalışır. Kare modu ile referans modu birlikte kullanılamaz.',
  variants: [{ kieModel: 'bytedance/seedance-2-5' }],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 30000 },
    { id: 'first_frame', label: 'İlk kare', type: 'image', param: 'first_frame_url', shape: 'string' },
    { id: 'last_frame', label: 'Son kare', type: 'image', param: 'last_frame_url', shape: 'string' },
    { id: 'ref_images', label: 'Referans görseller', type: 'image', param: 'reference_image_urls', shape: 'array', max: 30 },
    { id: 'ref_videos', label: 'Referans videolar', type: 'video', param: 'reference_video_urls', shape: 'array', max: 10 },
  ],
  params: [
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['480p', '720p', '1080p'], default: '720p' },
    { key: 'duration', label: 'Süre (sn)', type: 'integer', default: 5, min: 4, max: 30 },
    {
      key: 'aspect_ratio',
      label: 'En-boy',
      type: 'enum',
      options: ['adaptive', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
      default: 'adaptive',
      advanced: true,
    },
    {
      key: 'generate_audio',
      label: 'Ses üret',
      type: 'boolean',
      default: false,
      advanced: true,
      help: 'Doküman varsayılanı açık; maliyeti artırdığı için burada kapalı başlar.',
    },
    { key: 'return_last_frame', label: 'Son kareyi de döndür', type: 'boolean', default: false, advanced: true },
  ],
  rules: [
    ({ connected }) =>
      (connected('first_frame') || connected('last_frame')) && (connected('ref_images') || connected('ref_videos'))
        ? { message: 'İlk/son kare ile referans girişleri aynı anda kullanılamaz' }
        : null,
    ({ connected }) =>
      connected('last_frame') && !connected('first_frame') ? { message: 'Son kare için ilk kare de bağlanmalı' } : null,
  ],
  cost: () => null,
  timeoutSec: 1500,
  docUrls: ['https://docs.kie.ai/market/bytedance/seedance-2-5.md'],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const hailuo23Pro: ModelDef = {
  id: 'hailuo-2.3-pro',
  name: 'Hailuo 2.3 Pro',
  vendor: 'MiniMax',
  kind: 'video',
  output: 'video',
  description: 'Görselden video. Hareket kalitesi için alternatif.',
  variants: [{ kieModel: 'hailuo/2-3-image-to-video-pro' }],
  inputs: [
    { id: 'prompt', label: 'Prompt', type: 'text', param: 'prompt', shape: 'string', required: true, maxLength: 5000 },
    { id: 'image', label: 'Görsel', type: 'image', param: 'image_url', shape: 'string', required: true },
  ],
  params: [
    { key: 'duration', label: 'Süre (sn)', type: 'enum', options: ['6', '10'], default: '6' },
    { key: 'resolution', label: 'Çözünürlük', type: 'enum', options: ['768P', '1080P'], default: '768P' },
  ],
  cost: (p) => {
    const table: Record<string, number> = { '6-768P': 45, '6-1080P': 80, '10-768P': 90 };
    const c = table[`${p.duration}-${p.resolution}`];
    return c ? { credits: c } : null;
  },
  timeoutSec: 1200,
  docUrls: ['https://docs.kie.ai/market/hailuo/2-3-image-to-video-pro.md'],
  verifiedAt: '2026-09-24',
  status: 'experimental',
};

export const videoModels = [kling30, klingV3Turbo, seedance25, hailuo23Pro];
