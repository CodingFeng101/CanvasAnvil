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
  /** True once the work has content and is listed (saving is automatic). */
  saved: boolean;
  /** The work's name once it is listed, else "". */
  name: string;
  /** Rename the listed work (the chat header's title). */
  rename(name: string): void;
  /** The latest preview image of the work, when the canvas has made one. */
  thumb?: string;
  /**
   * A generation is running: the shell will not switch works until it ends.
   * `source` tells apart several parts of a canvas reporting at once.
   */
  setBusy(source: string, busy: boolean): void;
  /** A name from the content (deck title, first request) and/or a preview image. */
  report(info: { nameHint?: string; thumb?: string; touched?: boolean; lastPrompt?: string }): void;
  /**
   * The canvas's clear / start-over button. The work stays in the list as it
   * is (an empty draft is dropped), and the canvas remounts on a fresh draft.
   */
  startOver(): void;
  /**
   * For a canvas that holds edits it has not written yet (the diagram editor
   * only hands its drawing over on export): run before the work is
   * left, so what is kept is what is on screen. Returns an unregister.
   */
  registerFlush(flush: () => Promise<void>): () => void;
  /** Open another work of this canvas. */
  openWork?(id: string): void;
  /** Open "My works" on this canvas. */
  showAllWorks?(): void;
}

/** Asks the sidebar's "My works" to open (the new-work page's "View all"). */
export const OPEN_WORKS_EVENT = "canvasanvil:open-works";

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

/** Keeps the work's latest request in the list, for the sidebar's hover preview. */
export function useReportLastPrompt(text: string | undefined) {
  const work = useWork();
  const ref = useRef(work);
  ref.current = work;
  const clean = (text || "").replace(/\[\[[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim();
  useEffect(() => {
    if (clean) ref.current?.report({ lastPrompt: clean });
  }, [clean]);
}
