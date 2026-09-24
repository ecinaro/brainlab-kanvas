import { describe, expect, it } from 'vitest';
import { modelForKie, rebuildFromGeneration } from './rebuild';

describe('üretimden node kurma', () => {
  it('Kie model adından katalog modeli bulunur (varyantlar dahil)', () => {
    expect(modelForKie('gpt-image-2-image-to-image')?.id).toBe('gpt-image-2');
    expect(modelForKie('kling-3.0/video')?.id).toBe('kling-3.0');
    expect(modelForKie('bilinmeyen')).toBeUndefined();
  });

  it('GPT Image 2 i2i: prompt, görsel ve parametreler geri kurulur, çıktı sabitlenir', () => {
    const r = rebuildFromGeneration({
      id: 'j',
      kieModel: 'gpt-image-2-image-to-image',
      input: { prompt: 'vintage', input_urls: ['local:uploads/a.jpg'], aspect_ratio: 'auto', resolution: '1K', background: 'auto' },
      outputType: 'image',
      files: ['media/p/n/j_0.png'],
      mediaUrls: ['/media/p/n/j_0.png'],
    })!;
    const types = r.clip.nodes.map((n) => n.type);
    expect(types).toEqual(['model', 'prompt', 'upload']);
    const model = r.clip.nodes[0].data as Record<string, any>;
    expect(model.modelId).toBe('gpt-image-2');
    expect(model.params).toEqual({ aspect_ratio: 'auto', resolution: '1K', background: 'auto' });
    expect(model.pinned).toMatchObject({ ref: 'local:media/p/n/j_0.png', kieModel: 'gpt-image-2-image-to-image' });
    expect(r.clip.nodes[2].data).toMatchObject({ ref: 'local:uploads/a.jpg', url: '/uploads/a.jpg' });
    expect(r.clip.edges.map((e) => `${e.source}->${e.targetHandle}`)).toEqual(['prompt-1->prompt', 'images-2->images']);
  });

  it('Kling: image_urls sırayla başlangıç ve bitiş karesine dağıtılır', () => {
    const r = rebuildFromGeneration({
      id: 'j',
      kieModel: 'kling-3.0/video',
      input: { prompt: 'x', image_urls: ['local:media/a.png', 'local:media/b.png'], mode: 'std', duration: '3', sound: false, multi_shots: false, multi_prompt: [] },
      outputType: 'video',
      files: ['media/v.mp4'],
      mediaUrls: ['/media/v.mp4'],
    })!;
    const handles = r.clip.edges.map((e) => `${(r.clip.nodes.find((n) => n.id === e.source)!.data as any).ref ?? 'prompt'}->${e.targetHandle}`);
    expect(handles).toEqual(['prompt->prompt', 'local:media/a.png->first_frame', 'local:media/b.png->last_frame']);
    // Sabit alanlar parametre olarak kopyalanmaz
    expect((r.clip.nodes[0].data as any).params).toEqual({ mode: 'std', duration: '3', sound: false });
  });

  it('katalogda olmayan model için null döner', () => {
    expect(rebuildFromGeneration({ id: 'j', kieModel: 'yok', input: {}, outputType: 'image', files: [], mediaUrls: [] })).toBeNull();
  });
});
