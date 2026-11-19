import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import { scopeStore, workPrefix, type ScopedStore } from "./scope-store";
import {
  copyName,
  defaultWorkName,
  newDraft,
  normalizeIndex,
  patchWork,
  removeWork,
  strayDrafts,
  upsertWork,
  type WorkMeta,
} from "./works-index";

/**
 * The works of one canvas, kept in that canvas's own database.
 *
 *   works:index           WorkMeta[] (saved works and the one draft)
 *   works:current         id of the work the canvas has open
 *   work:<id>:<key>       the canvas's own keys, per work
 *   work:<id>:local-storage
 *                         the work's localStorage values while it is not open
 *
 * localStorage keeps holding the open work's small state under the canvas's
 * original keys, so the code that reads them synchronously stays as it is.
 * Leaving a work copies those values into its `local-storage` entry; entering
 * one writes its values back.
 *
 * The first time a canvas runs with works, what it had saved before (its old
 * keys and localStorage) becomes the first work. The old keys are copied, not
 * moved: an older release rolled back to still finds them.
 */

export interface LocalArea {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface WorksConfig {
  /** The canvas's own database. */
  store: WorkspaceStore;
  /** Keys the canvas saved before works existed; copied into the first work. */
  legacyKeys: string[];
  /** Key prefixes likewise copied (e.g. per-message images). */
  legacyPrefixes?: string[];
  /** localStorage keys holding the open work's small state. */
  localKeys: string[];
  /** Runs once before the first-work migration (e.g. an older localStorage → store copy). */
  beforeMigrate?: () => Promise<unknown>;
  /** Called when a save to a work fails, e.g. on a full disk. */
  onSaveError?: (error: unknown) => void;
}

const INDEX_KEY = "works:index";
const CURRENT_KEY = "works:current";
const LOCAL_SNAPSHOT_KEY = "local-storage";

export const browserLocalArea: LocalArea = {
  get(key) {
    try {
      return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Failed to restore ${key}`, error);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove where localStorage is unavailable.
    }
  },
};

export interface WorksState {
  index: WorkMeta[];
  currentId: string;
}

export type WorksStore = ReturnType<typeof createWorksStore>;

export function createWorksStore(config: WorksConfig, local: LocalArea = browserLocalArea) {
  const { store } = config;
  const scoped = new Map<string, ScopedStore>();
  let chain: Promise<unknown> = Promise.resolve();

  /** Index changes run one at a time so two quick edits cannot drop each other. */
  function serial<T>(run: () => Promise<T>): Promise<T> {
    const next = chain.then(run, run);
    chain = next.catch(() => {});
    return next;
  }

  async function readIndex(): Promise<WorkMeta[]> {
    return normalizeIndex(await store.read(INDEX_KEY));
  }

  async function writeIndex(index: WorkMeta[]) {
    await store.save(INDEX_KEY, index);
  }

  function storeFor(id: string): ScopedStore {
    let found = scoped.get(id);
    if (!found) {
      found = scopeStore(store, workPrefix(id), config.onSaveError);
      scoped.set(id, found);
    }
    return found;
  }

  async function keysOf(id: string): Promise<string[]> {
    if (store.listKeys) return await store.listKeys(workPrefix(id));
    // A store that cannot enumerate: the known keys are the best we can do.
    return [...config.legacyKeys, LOCAL_SNAPSHOT_KEY].map((key) => workPrefix(id) + key);
  }

  async function deleteWorkData(id: string) {
    await storeFor(id).idle();
    for (const key of await keysOf(id)) await store.clear(key);
    scoped.delete(id);
  }

  function snapshotLocal(): Record<string, string | null> {
    const values: Record<string, string | null> = {};
    for (const key of config.localKeys) values[key] = local.get(key);
    return values;
  }

  function restoreLocal(values: Record<string, string | null> | null) {
    for (const key of config.localKeys) {
      const value = values?.[key];
      if (typeof value === "string") local.set(key, value);
      else local.remove(key);
    }
  }

  async function migrate(lang: "zh" | "en"): Promise<WorksState> {
    await config.beforeMigrate?.().catch((error) => console.error("Pre-migration step failed", error));
    const draft = newDraft();
    const target = storeFor(draft.id);
    let copied = false;
    for (const key of config.legacyKeys) {
      const value = await store.read(key);
      if (value === null || value === undefined) continue;
      await target.save(key, value);
      copied = true;
    }
    for (const prefix of config.legacyPrefixes ?? []) {
      for (const key of (await store.listKeys?.(prefix)) ?? []) {
        const value = await store.read(key);
        if (value === null || value === undefined) continue;
        await target.save(key, value);
        copied = true;
      }
    }
    const hasLocal = config.localKeys.some((key) => local.get(key) !== null);
    // What the user had before is a work they made: it is listed, not a draft.
    const work: WorkMeta =
      copied || hasLocal ? { ...draft, saved: true, name: defaultWorkName([], lang) } : draft;
    await writeIndex([work]);
    await store.save(CURRENT_KEY, work.id);
    return { index: [work], currentId: work.id };
  }

  return {
    storeFor,

    /** Reads the index, migrating on first use; guarantees a current work. */
    ensure(lang: "zh" | "en"): Promise<WorksState> {
      return serial(async () => {
        let index = await readIndex();
        if (index.length === 0) return await migrate(lang);
        let currentId = (await store.read<string>(CURRENT_KEY)) ?? "";
        if (!index.some((w) => w.id === currentId)) {
          const draft = index.find((w) => !w.saved) ?? newDraft();
          index = upsertWork(index, draft);
          currentId = draft.id;
          await store.save(CURRENT_KEY, currentId);
        }
        for (const stray of strayDrafts(index, currentId)) {
          await deleteWorkData(stray.id);
          index = removeWork(index, stray.id);
        }
        await writeIndex(index);
        return { index, currentId };
      });
    },

    readIndex,

    /**
     * Moves from the open work to another. Call it once the canvas showing
     * `fromId` has unmounted, so its last writes are in.
     * `discardFrom` drops the work being left (an unsaved draft the user let go).
     * `toId` null opens a fresh draft.
     */
    switchWork(fromId: string, toId: string | null, options: { discardFrom?: boolean } = {}): Promise<WorksState> {
      return serial(async () => {
        let index = await readIndex();
        await storeFor(fromId).idle();
        if (options.discardFrom) {
          await deleteWorkData(fromId);
          index = removeWork(index, fromId);
        } else {
          await storeFor(fromId).save(LOCAL_SNAPSHOT_KEY, snapshotLocal());
        }
        let targetId = toId;
        if (!targetId || !index.some((w) => w.id === targetId)) {
          const draft = newDraft();
          index = upsertWork(index, draft);
          targetId = draft.id;
        }
        restoreLocal(await storeFor(targetId).read<Record<string, string | null>>(LOCAL_SNAPSHOT_KEY));
        await writeIndex(index);
        await store.save(CURRENT_KEY, targetId);
        return { index, currentId: targetId };
      });
    },

    /** Saves a draft as a listed work, or renames one. */
    saveAs(id: string, name: string): Promise<WorkMeta[]> {
      return serial(async () => {
        const index = patchWork(await readIndex(), id, { saved: true, name, updatedAt: Date.now() });
        await writeIndex(index);
        return index;
      });
    },

    rename(id: string, name: string): Promise<WorkMeta[]> {
      return serial(async () => {
        const index = patchWork(await readIndex(), id, { name });
        await writeIndex(index);
        return index;
      });
    },

    /** Records activity, a preview or a name hint; unknown ids are ignored. */
    touch(id: string, patch: Pick<Partial<WorkMeta>, "thumb" | "nameHint" | "touched"> = {}): Promise<WorkMeta[]> {
      return serial(async () => {
        const before = await readIndex();
        if (!before.some((w) => w.id === id)) return before;
        const index = patchWork(before, id, { ...patch, updatedAt: Date.now() });
        await writeIndex(index);
        return index;
      });
    },

    /** Copies a work that is not open. The copy is listed and not opened. */
    duplicate(id: string, lang: "zh" | "en", isOpen = false): Promise<WorkMeta[]> {
      return serial(async () => {
        const index = await readIndex();
        const source = index.find((w) => w.id === id);
        if (!source) return index;
        await storeFor(id).idle();
        const copy: WorkMeta = {
          ...newDraft(),
          saved: true,
          name: copyName(index, source.name, lang),
          thumb: source.thumb,
          nameHint: source.nameHint,
        };
        const from = workPrefix(id);
        for (const key of await keysOf(id)) {
          const value = await store.read(key);
          if (value !== null && value !== undefined) await store.save(workPrefix(copy.id) + key.slice(from.length), value);
        }
        // The open work's localStorage values are live, not in its snapshot.
        if (isOpen) await storeFor(copy.id).save(LOCAL_SNAPSHOT_KEY, snapshotLocal());
        const next = upsertWork(index, copy);
        await writeIndex(next);
        return next;
      });
    },

    /** Deletes a work that is not open. */
    remove(id: string): Promise<WorkMeta[]> {
      return serial(async () => {
        await deleteWorkData(id);
        const index = removeWork(await readIndex(), id);
        await writeIndex(index);
        return index;
      });
    },
  };
}
