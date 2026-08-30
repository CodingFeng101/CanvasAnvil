/**
 * A tiny key/value store on top of IndexedDB.
 *
 * Workspaces persist things too big for localStorage — generated images,
 * slide decks, render bundles. Each workspace gets its own database so
 * clearing one never touches another; the shape is otherwise identical, which
 * is why this is a factory rather than a module per workspace.
 */

const STORE_NAME = "workspace";
const DB_VERSION = 1;

export interface WorkspaceStore {
  read<T = unknown>(key: string): Promise<T | null>;
  save<T>(key: string, value: T): Promise<void>;
  clear(key: string): Promise<void>;
}

export function createWorkspaceStore(databaseName: string): WorkspaceStore {
  /** Resolves to null where IndexedDB is unavailable, so callers degrade to no persistence. */
  function open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /** Runs one transaction and closes the connection, whatever the outcome. */
  async function transact<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, resolve: (value: T | null) => void) => void,
  ): Promise<T | null> {
    const db = await open();
    if (!db) return null;

    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      let result: T | null = null;
      run(tx.objectStore(STORE_NAME), (value) => {
        result = value;
      });
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    async read<T = unknown>(key: string) {
      return await transact<T>("readonly", (store, resolve) => {
        const request = store.get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      });
    },
    async save<T>(key: string, value: T) {
      await transact<void>("readwrite", (store) => {
        store.put(value, key);
      });
    },
    async clear(key: string) {
      await transact<void>("readwrite", (store) => {
        store.delete(key);
      });
    },
  };
}
