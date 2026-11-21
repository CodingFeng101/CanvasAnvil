import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import { savedPrefix, scopeStore, workPrefix, type ScopedStore } from "./scope-store";
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
 *   saved:<id>:<key>      the version the user last saved, key for key
 *
 * The canvas always reads and writes the live copy (`work:`), so nothing is
 * lost on a reload, and the live copy is the work. The saved copy is taken
 * when a draft is first listed (and was what Save wrote, before saving became
 * automatic); nothing reads it back any more except an explicit revert.
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
  /**
   * What of a stored value counts as a change (e.g. the board's elements but
   * not its scroll position). Defaults to the whole value.
   */
  normalize?: (key: string, value: unknown) => unknown;
}

/** Pseudo key under which the open work's localStorage values are compared. */
export const LOCAL_KEY = "local-storage";

const INDEX_KEY = "works:index";
const CURRENT_KEY = "works:current";
const LOCAL_SNAPSHOT_KEY = LOCAL_KEY;

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
  const writeListeners = new Set<(id: string, key: string, value: unknown) => void>();
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
      found = scopeStore(store, workPrefix(id), config.onSaveError, (key, value) => {
        for (const listener of writeListeners) listener(id, key, value);
      });
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
    for (const key of await keysAt(savedPrefix(id))) await store.clear(savedPrefix(id) + key);
    scoped.delete(id);
  }

  /** Keys under a prefix, without the prefix. */
  async function keysAt(prefix: string): Promise<string[]> {
    if (store.listKeys) return (await store.listKeys(prefix)).map((key) => key.slice(prefix.length));
    // A store that cannot enumerate: the known keys that hold something.
    const present: string[] = [];
    for (const key of [...config.legacyKeys, LOCAL_SNAPSHOT_KEY]) {
      const value = await store.read(prefix + key);
      if (value !== null && value !== undefined) present.push(key);
    }
    return present;
  }

  /** Makes `to` an exact copy of `from` (keys missing in `from` are removed). */
  async function copyAll(from: string, to: string) {
    const source = await keysAt(from);
    for (const key of await keysAt(to)) if (!source.includes(key)) await store.clear(to + key);
    for (const key of source) {
      const value = await store.read(from + key);
      if (value === null || value === undefined) await store.clear(to + key);
      else await store.save(to + key, value);
    }
  }

  async function hasSaved(id: string) {
    return (await keysAt(savedPrefix(id))).length > 0;
  }

  /** Live copy -> saved copy. The open work's localStorage values go along. */
  async function commitData(id: string, isOpen: boolean) {
    await storeFor(id).idle();
    // Written past the scoped store so it does not read as an edit.
    if (isOpen) await store.save(workPrefix(id) + LOCAL_SNAPSHOT_KEY, snapshotLocal());
    await copyAll(workPrefix(id), savedPrefix(id));
  }

  function fingerprint(key: string, value: unknown): string {
    if (value === null || value === undefined) return "";
    const shown = config.normalize ? config.normalize(key, value) : value;
    try {
      return JSON.stringify(shown) ?? "";
    } catch {
      return String(Math.random());
    }
  }

  function localFingerprint(values: Record<string, string | null> | null | undefined) {
    const out: Record<string, string | null> = {};
    for (const key of config.localKeys) out[key] = values?.[key] ?? null;
    return JSON.stringify(out);
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
    if (work.saved) await commitData(work.id, true);
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
        // Works saved before saved copies existed: their live copy is what was saved.
        for (const work of index) {
          if (work.saved && !(await hasSaved(work.id))) await commitData(work.id, work.id === currentId);
        }
        await writeIndex(index);
        return { index, currentId };
      });
    },

    readIndex,

    /**
     * Moves from the open work to another. Call it once the canvas showing
     * `fromId` has unmounted, so its last writes are in.
     * What happens to the work being left:
     *   discardFrom  drop it (an unsaved draft the user let go)
     *   revertFrom   drop its unsaved changes (back to the saved copy)
     *   commitFrom   save it first (`name` lists a draft under that name)
     * `toId` null opens a fresh draft.
     */
    switchWork(
      fromId: string,
      toId: string | null,
      options: { discardFrom?: boolean; revertFrom?: boolean; commitFrom?: { name?: string; thumb?: string } } = {},
    ): Promise<WorksState> {
      return serial(async () => {
        let index = await readIndex();
        await storeFor(fromId).idle();
        if (options.discardFrom) {
          await deleteWorkData(fromId);
          index = removeWork(index, fromId);
        } else if (options.revertFrom && (await hasSaved(fromId))) {
          await copyAll(savedPrefix(fromId), workPrefix(fromId));
          index = patchWork(index, fromId, { dirty: undefined });
        } else {
          await store.save(workPrefix(fromId) + LOCAL_SNAPSHOT_KEY, snapshotLocal());
          if (options.commitFrom) {
            await copyAll(workPrefix(fromId), savedPrefix(fromId));
            const { name, thumb } = options.commitFrom;
            index = patchWork(index, fromId, {
              saved: true,
              dirty: undefined,
              updatedAt: Date.now(),
              ...(name ? { name } : {}),
              ...(thumb ? { thumb } : {}),
            });
          }
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

    /**
     * Save: the live copy becomes the saved copy. `name` names a draft (and
     * lists it) or renames; omitted, the work keeps its name.
     */
    saveAs(id: string, name?: string, isOpen = true, extra: { thumb?: string } = {}): Promise<WorkMeta[]> {
      return serial(async () => {
        await commitData(id, isOpen);
        const index = patchWork(await readIndex(), id, {
          saved: true,
          dirty: undefined,
          updatedAt: Date.now(),
          ...(name ? { name } : {}),
          ...(extra.thumb ? { thumb: extra.thumb } : {}),
        });
        await writeIndex(index);
        return index;
      });
    },

    /** Marks a saved work as having (or no longer having) unsaved changes. */
    setDirty(id: string, dirty: boolean): Promise<WorkMeta[]> {
      return serial(async () => {
        const before = await readIndex();
        const work = before.find((w) => w.id === id);
        if (!work || !work.saved || !!work.dirty === dirty) return before;
        const index = patchWork(before, id, { dirty: dirty || undefined });
        await writeIndex(index);
        return index;
      });
    },

    /** Called for every write a canvas makes to a work. */
    onWrite(listener: (id: string, key: string, value: unknown) => void): () => void {
      writeListeners.add(listener);
      return () => {
        writeListeners.delete(listener);
      };
    },

    fingerprint,

    /** The saved copy, as fingerprints per key (localStorage under LOCAL_KEY). */
    async savedFingerprints(id: string): Promise<Map<string, string>> {
      const out = new Map<string, string>();
      for (const key of await keysAt(savedPrefix(id))) {
        const value = await store.read(savedPrefix(id) + key);
        out.set(key, key === LOCAL_SNAPSHOT_KEY ? localFingerprint(value as Record<string, string | null>) : fingerprint(key, value));
      }
      if (!out.has(LOCAL_SNAPSHOT_KEY)) out.set(LOCAL_SNAPSHOT_KEY, localFingerprint(null));
      return out;
    },

    /** The live copy, likewise. `isOpen`: localStorage holds its local values. */
    async liveFingerprints(id: string, isOpen: boolean): Promise<Map<string, string>> {
      await storeFor(id).idle();
      const out = new Map<string, string>();
      for (const key of await keysAt(workPrefix(id))) {
        if (key === LOCAL_SNAPSHOT_KEY) continue;
        out.set(key, fingerprint(key, await store.read(workPrefix(id) + key)));
      }
      out.set(
        LOCAL_SNAPSHOT_KEY,
        isOpen
          ? localFingerprint(snapshotLocal())
          : localFingerprint(await store.read<Record<string, string | null>>(workPrefix(id) + LOCAL_SNAPSHOT_KEY)),
      );
      return out;
    },

    /** The open work's current localStorage values as a fingerprint. */
    openLocalFingerprint: () => localFingerprint(snapshotLocal()),

    rename(id: string, name: string): Promise<WorkMeta[]> {
      return serial(async () => {
        const index = patchWork(await readIndex(), id, { name });
        await writeIndex(index);
        return index;
      });
    },

    /** Pins or unpins a work; does not count as activity. */
    setPinned(id: string, pinned: boolean): Promise<WorkMeta[]> {
      return serial(async () => {
        const index = patchWork(await readIndex(), id, { pinned: pinned || undefined });
        await writeIndex(index);
        return index;
      });
    },

    /** Records activity, a preview or a name hint; unknown ids are ignored. */
    touch(id: string, patch: Pick<Partial<WorkMeta>, "thumb" | "nameHint" | "touched" | "lastPrompt"> = {}): Promise<WorkMeta[]> {
      return serial(async () => {
        const before = await readIndex();
        if (!before.some((w) => w.id === id)) return before;
        // Recording the latest request alone (done on every open) is not an edit: the work keeps its place.
        const edit = Object.keys(patch).some((key) => key !== "lastPrompt");
        const index = patchWork(before, id, edit ? { ...patch, updatedAt: Date.now() } : patch);
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
        // The copy is of the live work: with saving automatic, that is the work.
        await copyAll(workPrefix(id), workPrefix(copy.id));
        // The open work's localStorage values are live, not in its snapshot.
        if (isOpen) await store.save(workPrefix(copy.id) + LOCAL_SNAPSHOT_KEY, snapshotLocal());
        await copyAll(workPrefix(copy.id), savedPrefix(copy.id));
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

    /** The open work's localStorage values, which the database alone does not hold (Settings → Data → Export). */
    localSnapshot: snapshotLocal,

    /**
     * Settings → Data → Import: replace everything this canvas keeps with a
     * backup, then put the open work's localStorage values back (from the
     * backup, else from that work's last snapshot). Reload the page afterwards.
     */
    replaceAll(entries: Record<string, unknown>, localValues?: Record<string, string | null>): Promise<void> {
      return serial(async () => {
        for (const key of (await store.listKeys?.("")) ?? []) await store.clear(key);
        for (const [key, value] of Object.entries(entries)) await store.save(key, value);
        scoped.clear();
        const currentId = (await store.read<string>(CURRENT_KEY)) ?? "";
        restoreLocal(localValues ?? (currentId ? await storeFor(currentId).read<Record<string, string | null>>(LOCAL_SNAPSHOT_KEY) : null));
      });
    },
  };
}
