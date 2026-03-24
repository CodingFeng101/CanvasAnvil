const PPT_DB_NAME = "CanvasAnvilPptWorkspaceDB";
const PPT_STORE_NAME = "workspace";
const PPT_STATE_KEY = "primary";
const PPT_DB_VERSION = 1;

function openPptWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PPT_DB_NAME, PPT_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PPT_STORE_NAME)) {
        db.createObjectStore(PPT_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersistedPptWorkspaceState<T = unknown>(): Promise<T | null> {
  const db = await openPptWorkspaceDb();
  if (!db) return null;

  return await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(PPT_STORE_NAME, "readonly");
    const store = tx.objectStore(PPT_STORE_NAME);
    const request = store.get(PPT_STATE_KEY);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePersistedPptWorkspaceState<T>(state: T): Promise<void> {
  const db = await openPptWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PPT_STORE_NAME, "readwrite");
    const store = tx.objectStore(PPT_STORE_NAME);
    store.put(state, PPT_STATE_KEY);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPersistedPptWorkspaceState(): Promise<void> {
  const db = await openPptWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PPT_STORE_NAME, "readwrite");
    const store = tx.objectStore(PPT_STORE_NAME);
    store.delete(PPT_STATE_KEY);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
