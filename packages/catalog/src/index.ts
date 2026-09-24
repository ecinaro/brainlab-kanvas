/** Web ve sunucunun ortak kullandığı model kataloğu. Yeni model = yeni kayıt. */
import { imageModels } from './models/image';
import { toolModels } from './models/tools';
import { videoModels } from './models/video';
import type { ModelDef } from './types';

export * from './types';
export * from './build';

export const MODELS: ModelDef[] = [...imageModels, ...videoModels, ...toolModels];

const byId = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelDef | undefined {
  return byId.get(id);
}
