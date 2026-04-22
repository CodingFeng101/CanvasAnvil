const CANVAS_DB_NAME = "CanvasAnvilCanvasWorkspaceDB";
const CANVAS_STORE_NAME = "workspace";
const CANVAS_DB_VERSION = 1;

function openCanvasWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CANVAS_DB_NAME, CANVAS_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CANVAS_STORE_NAME)) {
        db.createObjectStore(CANVAS_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersistedCanvasWorkspaceItem<T = unknown>(key: string): Promise<T | null> {
  const db = await openCanvasWorkspaceDb();
  if (!db) return null;

  return await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(CANVAS_STORE_NAME, "readonly");
    const store = tx.objectStore(CANVAS_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePersistedCanvasWorkspaceItem<T>(key: string, value: T): Promise<void> {
  const db = await openCanvasWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CANVAS_STORE_NAME, "readwrite");
    const store = tx.objectStore(CANVAS_STORE_NAME);
    store.put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPersistedCanvasWorkspaceItem(key: string): Promise<void> {
  const db = await openCanvasWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CANVAS_STORE_NAME, "readwrite");
    const store = tx.objectStore(CANVAS_STORE_NAME);
    store.delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
