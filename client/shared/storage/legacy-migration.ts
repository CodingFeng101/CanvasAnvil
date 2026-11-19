/**
 * One-time copy of values a workspace used to keep somewhere else (usually
 * localStorage) into its IndexedDB store.
 *
 * The rules come from the storage contract: the old value is copied, never
 * moved — users may roll back to a release that still reads it — and a value
 * the store already holds is never overwritten. A marker key records that the
 * copy ran so it is not repeated on every mount.
 */

import type { WorkspaceStore } from "./indexed-db-store";

export interface LegacyEntry {
  /** Key in the IndexedDB store. */
  key: string;
  /** Reads the old value; null when there is none. Thrown errors count as none. */
  readLegacy: () => unknown;
}

export interface LegacyMigrationResult {
  /** True when this call did the copy; false when the marker said it was done. */
  ran: boolean;
  /** Store keys that received a legacy value. */
  copied: string[];
}

export async function migrateLegacyOnce(
  store: WorkspaceStore,
  markerKey: string,
  entries: LegacyEntry[],
): Promise<LegacyMigrationResult> {
  if (await store.read(markerKey)) return { ran: false, copied: [] };

  const copied: string[] = [];
  for (const entry of entries) {
    let legacy: unknown = null;
    try {
      legacy = entry.readLegacy();
    } catch {
      legacy = null;
    }
    if (legacy === null || legacy === undefined) continue;
    const current = await store.read(entry.key);
    if (current !== null && current !== undefined) continue;
    await store.save(entry.key, legacy);
    copied.push(entry.key);
  }

  await store.save(markerKey, { at: Date.now(), copied });
  return { ran: true, copied };
}

/** Reads a localStorage item, or null where localStorage is missing or throws. */
export function readLocalStorage(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** JSON-parses a localStorage item; null when absent or unparsable. */
export function readLocalStorageJson(key: string): unknown {
  const raw = readLocalStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
