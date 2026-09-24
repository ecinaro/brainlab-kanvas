import { describe, expect, it } from 'vitest';
import { buildRequest, getModel, MODELS, validate, ValidationError, withDefaults } from './index';

const img = (n: number) => Array.from({ length: n }, (_, i) => `local:uploads/${i}.png`);

describe('katalog bütünlüğü', () => {
  it('model id\'leri benzersiz', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  for (const m of MODELS) {
    it(`${m.id}: varsayılanlar geçerli, son varyant koşulsuz, doküman bağlantısı var`, () => {
      for (const p of m.params) {
        if (p.type === 'enum' && p.default !== undefined) expect(p.options).toContain(p.default);
      }
      expect(m.variants.at(-1)!.whenConnected).toBeUndefined();
      expect(m.docUrls.every((u) => u.startsWith('https://docs.kie.ai/'))).toBe(true);
      // Sadece zorunlu portlar doldurulunca varsayılanlarla geçerli olmalı.
      const required = Object.fromEntries(
        m.inputs.filter((p) => p.required).map((p) => [p.id, [p.type === 'text' ? 'bir kedi' : 'local:uploads/a.png']]),
      );
      expect(validate(m, {}, required)).toEqual([]);
      const cost = m.cost(withDefaults(m, {}), {});
      if (cost) expect(cost.credits).toBeGreaterThan(0);
    });
  }
});

describe('video ve araç modelleri', () => {
  it('Kling 3.0: başlangıç + bitiş karesi sırasıyla image_urls dizisine, sabit alanlar eklenir', () => {
    const r = buildRequest(getModel('kling-3.0')!, {}, {
      prompt: ['yürüyüş'],
      first_frame: ['local:media/a.png'],
      last_frame: ['local:media/b.png'],
    });
    expect(r).toEqual({
      kieModel: 'kling-3.0/video',
      input: {
        prompt: 'yürüyüş',
        image_urls: ['local:media/a.png', 'local:media/b.png'],
        mode: 'std',
        duration: '5',
        aspect_ratio: '16:9',
        sound: false,
        multi_shots: false,
        multi_prompt: [],
      },
    });
    expect(getModel('kling-3.0')!.cost(withDefaults(getModel('kling-3.0')!, {}), {})?.credits).toBe(70);
  });

  it('Kling 3.0: bitiş karesi tek başına kullanılamaz', () => {
    expect(validate(getModel('kling-3.0')!, {}, { prompt: ['x'], last_frame: ['local:media/b.png'] })).toHaveLength(1);
  });

  it('Kling V3 Turbo: görsel varsa i2v ve aspect_ratio gönderilmez; yoksa t2v', () => {
    const def = getModel('kling-v3-turbo')!;
    const i2v = buildRequest(def, {}, { prompt: ['x'], image: ['local:media/a.png'] });
    expect(i2v.kieModel).toBe('kling/v3-turbo-image-to-video');
    expect(i2v.input).toEqual({ prompt: 'x', image_urls: ['local:media/a.png'], resolution: '720p', duration: '5' });
    const t2v = buildRequest(def, {}, { prompt: ['x'] });
    expect(t2v.kieModel).toBe('kling/v3-turbo-text-to-video');
    expect(t2v.input.aspect_ratio).toBe('16:9');
  });

  it('Seedance 2.5: kare ve referans modları birlikte kullanılamaz; süre sınırları', () => {
    const def = getModel('seedance-2.5')!;
    expect(validate(def, {}, { prompt: ['x'], first_frame: ['a'], ref_images: ['b'] })).toHaveLength(1);
    expect(validate(def, { duration: 31 }, { prompt: ['x'] })[0].param).toBe('duration');
    const r = buildRequest(def, {}, { prompt: ['x'], first_frame: ['local:media/a.png'] });
    expect(r.input).toMatchObject({ first_frame_url: 'local:media/a.png', duration: 5, generate_audio: false });
  });

  it('Hailuo ve araçlar: tek görsel string olarak gönderilir', () => {
    expect(buildRequest(getModel('hailuo-2.3-pro')!, {}, { prompt: ['x'], image: ['local:m/a.png'] }).input.image_url).toBe('local:m/a.png');
    expect(buildRequest(getModel('topaz-image-upscale')!, {}, { image: ['local:m/a.png'] }).input).toEqual({
      image_url: 'local:m/a.png',
      upscale_factor: '2',
    });
    expect(buildRequest(getModel('recraft-remove-bg')!, {}, { image: ['local:m/a.png'] })).toEqual({
      kieModel: 'recraft/remove-background',
      input: { image: 'local:m/a.png' },
    });
  });
});

describe('istek gövdeleri (dokümandaki parametre adlarıyla)', () => {
  it('Nano Banana 2: image_input dizisi + varsayılanlar', () => {
    expect(buildRequest(getModel('nano-banana-2')!, {}, { prompt: ['kedi'], images: img(2) })).toEqual({
      kieModel: 'nano-banana-2',
      input: {
        prompt: 'kedi',
        image_input: ['local:uploads/0.png', 'local:uploads/1.png'],
        aspect_ratio: 'auto',
        resolution: '1K',
        output_format: 'jpg',
      },
    });
  });

  it('Nano Banana 2: görsel yoksa image_input gönderilmez', () => {
    const r = buildRequest(getModel('nano-banana-2')!, { resolution: '2K' }, { prompt: ['kedi'] });
    expect(r.input).not.toHaveProperty('image_input');
    expect(r.input.resolution).toBe('2K');
  });

  it('GPT Image 2: görsel yoksa text-to-image, varsa image-to-image + input_urls', () => {
    const def = getModel('gpt-image-2')!;
    const t2i = buildRequest(def, {}, { prompt: ['afiş'] });
    expect(t2i.kieModel).toBe('gpt-image-2-text-to-image');
    expect(t2i.input).not.toHaveProperty('input_urls');

    const i2i = buildRequest(def, {}, { prompt: ['afiş'], images: img(1) });
    expect(i2i.kieModel).toBe('gpt-image-2-image-to-image');
    expect(i2i.input.input_urls).toEqual(['local:uploads/0.png']);
  });

  it('Seedream 5 Pro: image_urls ve model yolu', () => {
    const def = getModel('seedream-5-pro')!;
    expect(buildRequest(def, {}, { prompt: ['x'] }).kieModel).toBe('seedream/5-pro-text-to-image');
    const r = buildRequest(def, { quality: 'high' }, { prompt: ['x'], images: img(3) });
    expect(r).toEqual({
      kieModel: 'seedream/5-pro-image-to-image',
      input: { prompt: 'x', image_urls: img(3), aspect_ratio: '1:1', quality: 'high', output_format: 'png' },
    });
    expect(def.cost({ quality: 'high' }, { images: img(3) })?.credits).toBe(15);
  });
});

describe('doğrulama', () => {
  it('prompt bağlı değilse hata', () => {
    const issues = validate(getModel('nano-banana-2')!, {}, {});
    expect(issues).toEqual([expect.objectContaining({ port: 'prompt' })]);
    expect(() => buildRequest(getModel('nano-banana-2')!, {}, {})).toThrow(ValidationError);
  });

  it('referans görsel sınırı aşılamaz', () => {
    expect(validate(getModel('nano-banana-pro')!, {}, { prompt: ['x'], images: img(9) })).toEqual([
      expect.objectContaining({ port: 'images' }),
    ]);
  });

  it('prompt uzunluk sınırı', () => {
    const long = 'a'.repeat(5001);
    expect(validate(getModel('seedream-5-pro')!, {}, { prompt: [long] })[0].port).toBe('prompt');
  });

  it('geçersiz enum değeri yakalanır', () => {
    expect(validate(getModel('nano-banana-2')!, { resolution: '8K' }, { prompt: ['x'] })[0].param).toBe('resolution');
  });

  it('GPT Image 2 kuralları: auto → sadece 1K, 1:1 → 4K yok, arka plan sadece 1K', () => {
    const def = getModel('gpt-image-2')!;
    const p = { prompt: ['x'] };
    expect(validate(def, { aspect_ratio: 'auto', resolution: '2K' }, p)[0].param).toBe('resolution');
    expect(validate(def, { aspect_ratio: '1:1', resolution: '4K' }, p)[0].param).toBe('resolution');
    expect(validate(def, { aspect_ratio: '4:5', resolution: '2K' }, p)[0].param).toBe('aspect_ratio');
    expect(validate(def, { aspect_ratio: '16:9', resolution: '2K', background: 'transparent' }, p)[0].param).toBe('background');
    expect(validate(def, { aspect_ratio: '16:9', resolution: '4K' }, p)).toEqual([]);
  });
});
