import type { WorkspaceStore } from '@/shared/storage/indexed-db-store';
import { call, readBlob, writeBlob } from './bridge';

export const CANVAS_SCENE_KEY = 'scene';
export const CANVAS_CHAT_IMAGES_KEY = 'chat-images';
export type Scene = { elements: unknown[]; appState: object; files: object };
export type CanvasState = { revision: number; scene: Scene | null; sceneBlobId?: string };
export type Operation = { id: string; dataUrl?: string; dataUrlBlobId?: string; note: string; lineageId?: string; sourceId?: string; annotationIds: string[] };
let revision = 0;
let scene: Scene | null = null;
let writes: Promise<unknown> = Promise.resolve();
export async function loadState() {
  const state = await call<CanvasState>('get_canvas_state');
  revision = state.revision;
  scene = state.sceneBlobId ? JSON.parse(await readBlob(state.sceneBlobId)) : state.scene;
  return state;
}
export const canvasStore: WorkspaceStore = {
  async read<T>(key: string) { return (key === 'scene' ? scene : null) as T | null; },
  async save<T>(key: string, value: T) {
    if (key !== 'scene') return;
    const snapshot = structuredClone(value) as Scene;
    const writing = writes.then(async () => {
      const json = JSON.stringify(snapshot);
      const payload = json.length > 512 * 1024 ? { sceneBlobId: await writeBlob(json) } : { scene: snapshot };
      const saved = await call<{ revision: number }>('save_canvas_state', { ...payload, baseRevision: revision });
      revision = saved.revision;
      scene = snapshot;
    });
    writes = writing.catch(() => {});
    await writing;
  },
  async clear(key: string) { await this.save(key, null); },
};
