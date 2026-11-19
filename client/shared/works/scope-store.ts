import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";

/**
 * A view of a workspace store in which every key carries a prefix.
 *
 * Each work keeps the same keys the canvas always used ("primary", "scene",
 * "cad-design-record"...) under its own `work:<id>:` prefix, so the canvas code
 * reads and writes exactly as before and only the store it is handed changes.
 *
 * `idle()` resolves once the writes started so far have settled: a canvas that
 * is being left flushes its last save on unmount, and the work must not be
 * copied or deleted under it before that lands.
 */
export interface ScopedStore extends WorkspaceStore {
  readonly prefix: string;
  idle(): Promise<void>;
}

export function scopeStore(
  store: WorkspaceStore,
  prefix: string,
  onSaveError?: (error: unknown) => void,
  onWrite?: (key: string, value: unknown) => void,
): ScopedStore {
  const pending = new Set<Promise<unknown>>();
  const track = <T>(promise: Promise<T>): Promise<T> => {
    pending.add(promise);
    const done = () => pending.delete(promise);
    promise.then(done, done);
    return promise;
  };

  return {
    prefix,
    read: (key) => store.read(prefix + key),
    save: (key, value) => {
      onWrite?.(key, value);
      return track(
        store.save(prefix + key, value).catch((error) => {
          onSaveError?.(error);
          throw error;
        }),
      );
    },
    clear: (key) => {
      onWrite?.(key, undefined);
      return track(store.clear(prefix + key));
    },
    listKeys: store.listKeys
      ? async (sub) => (await store.listKeys!(prefix + sub)).map((key) => key.slice(prefix.length))
      : undefined,
    async idle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
  };
}

export const workPrefix = (id: string) => `work:${id}:`;
/** Where the version the user last saved is kept, key for key. */
export const savedPrefix = (id: string) => `saved:${id}:`;
