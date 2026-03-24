const CAD_DB_NAME = "CanvasAnvilCadWorkspaceDB";
const CAD_STORE_NAME = "workspace";
const CAD_DB_VERSION = 1;

function openCadWorkspaceDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CAD_DB_NAME, CAD_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAD_STORE_NAME)) {
        db.createObjectStore(CAD_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPersistedCadWorkspaceItem<T = unknown>(key: string): Promise<T | null> {
  const db = await openCadWorkspaceDb();
  if (!db) return null;

  return await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(CAD_STORE_NAME, "readonly");
    const store = tx.objectStore(CAD_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePersistedCadWorkspaceItem<T>(key: string, value: T): Promise<void> {
  const db = await openCadWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAD_STORE_NAME, "readwrite");
    const store = tx.objectStore(CAD_STORE_NAME);
    store.put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearPersistedCadWorkspaceItem(key: string): Promise<void> {
  const db = await openCadWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CAD_STORE_NAME, "readwrite");
    const store = tx.objectStore(CAD_STORE_NAME);
    store.delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
