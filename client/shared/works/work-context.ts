import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";

/**
 * What a canvas knows about the work it has open.
 *
 * The app shell provides it (client/app/works). A canvas rendered without the
 * shell — the skills reuse some canvas components — gets null and keeps using
 * its own store directly, exactly as before works existed.
 */
export interface WorkContextValue {
  workId: string;
  /** The canvas's store, scoped to this work. */
  workStore: WorkspaceStore;
  /** True once the user has saved this work (it is listed in My works). */
  saved: boolean;
  /** A saved work with changes not yet saved (My works still has the older version). */
  dirty: boolean;
  /**
   * A generation is running: the shell will not switch works until it ends.
   * `source` tells apart several parts of a canvas reporting at once.
   */
  setBusy(source: string, busy: boolean): void;
  /** A name from the content (deck title, first request) and/or a preview image. */
  report(info: { nameHint?: string; thumb?: string; touched?: boolean }): void;
  /**
   * The canvas's clear / start-over button. An unsaved draft is discarded
   * (after the canvas's own confirmation); a saved work stays in My works as
   * last saved (unsaved changes are dropped).
   * Either way the canvas then remounts on a fresh draft.
   */
  startOver(): void;
  /** The Save button: names and lists a draft, saves a saved work's changes, or renames it. */
  save(): void;
  /**
   * For a canvas that holds edits it has not written yet (the diagram editor
   * only hands its drawing over on export): run before the work is saved or
   * left, so what is saved is what is on screen. Returns an unregister.
   */
  registerFlush(flush: () => Promise<void>): () => void;
}

export const WorkContext = createContext<WorkContextValue | null>(null);

export function useWork(): WorkContextValue | null {
  return useContext(WorkContext);
}

/** The work's store, or the canvas's own store when there is no shell. */
export function useWorkStore(fallback: WorkspaceStore): WorkspaceStore {
  return useWork()?.workStore ?? fallback;
}

/** Reports "busy" while `busy` is true and clears it on unmount. */
export function useReportBusy(busy: boolean) {
  const work = useWork();
  const source = useId();
  const ref = useRef(work);
  ref.current = work;
  useEffect(() => {
    ref.current?.setBusy(source, busy);
  }, [busy, source]);
  useEffect(() => () => ref.current?.setBusy(source, false), [source]);
}
