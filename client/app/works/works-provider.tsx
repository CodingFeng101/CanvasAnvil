import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { t as tShell, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { WorkContext, type WorkContextValue } from "@/shared/works/work-context";
import { defaultWorkName, type WorkMeta } from "@/shared/works/works-index";
import { LOCAL_KEY, type WorksState } from "@/shared/works/works-store";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { worksStoreFor } from "./works-registry";
import { tWorks } from "./strings";
import { LeaveDialog, NameDialog, type LeaveRequest } from "./work-dialogs";

/**
 * The app-level side of My works.
 *
 * Opening another work of the canvas on screen is "unmount, swap, remount":
 * the canvas is taken off screen (its unmount flushes the last save into the
 * work being left), the works store swaps the localStorage values and the
 * current id, and the canvas is rendered again keyed on the new id, reading
 * everything from the new work's keys. The canvases' own load-on-mount and
 * save-on-change code stays as it was.
 *
 * The canvas always writes a live copy, so a reload loses nothing. What My
 * works holds changes only on Save. Whether the live copy differs from the
 * saved one is worked out from the canvas's writes: a write that follows a
 * user action is compared with the saved copy; writes made while a work
 * loads (no action yet) are not edits.
 */

type Phase = "loading" | "ready" | "leaving";

interface ActiveWorks extends WorksState {
  workspace: WorkspaceId;
  phase: Phase;
}

interface SwitchOptions {
  discardFrom?: boolean;
  revertFrom?: boolean;
  commitFrom?: { name?: string; thumb?: string };
}

interface Pending {
  toId: string | null;
  options: SwitchOptions;
}

type LeaveChoice = "save" | "discard" | "cancel";

interface WorksControl {
  active: ActiveWorks | null;
  current: WorkMeta | null;
  /** Save the open work (a draft is named first), or rename it when nothing changed. */
  saveCurrent(): Promise<void>;
  /** Open a work (or a new draft when id is null) in any canvas. */
  openWork(workspace: WorkspaceId, id: string | null): Promise<boolean>;
  removeWork(workspace: WorkspaceId, id: string): Promise<void>;
  renameWork(workspace: WorkspaceId, id: string, name: string): Promise<void>;
  duplicateWork(workspace: WorkspaceId, id: string): Promise<void>;
  /** Every canvas's works (migrating any canvas not opened yet). */
  loadAll(): Promise<Record<WorkspaceId, WorksState>>;
  /** Bumped whenever an index changes, so open lists can refresh. */
  revision: number;
}

const WorksControlContext = createContext<WorksControl | null>(null);

export function useWorksControl(): WorksControl {
  const control = useContext(WorksControlContext);
  if (!control) throw new Error("useWorksControl outside WorksProvider");
  return control;
}

const canvasLabel = (workspace: WorkspaceId, lang: UiLanguage) => {
  const entry = WORKSPACES.find((w) => w.id === workspace);
  return entry ? tShell(lang, entry.labelKey) : workspace;
};

/** Pointer and key input outside the works UI (header, dialogs) counts as editing. */
function isWorksUi(target: EventTarget | null) {
  return target instanceof Element && !!target.closest("header, [role=dialog], [data-works-ui]");
}

interface ChangeTracker {
  workspace: WorkspaceId;
  id: string;
  /** When the work was opened: writes before any input after this are loading, not edits. */
  openedAt: number;
  /** Fingerprints of the saved copy (null for a draft, which has none). */
  saved: Promise<Map<string, string> | null>;
  differing: Set<string>;
  pending: Map<string, unknown>;
  timer: number | null;
  running: Promise<void>;
}

export function WorksProvider({
  activeWorkspace,
  onActivateWorkspace,
  children,
}: {
  activeWorkspace: WorkspaceId;
  onActivateWorkspace: (workspace: WorkspaceId) => void;
  children: ReactNode;
}) {
  const lang = useUiLanguage();
  const langRef = useRef(lang);
  langRef.current = lang;
  const [active, setActive] = useState<ActiveWorks | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((n) => n + 1);
  const busySources = useRef(new Set<string>());
  const isBusy = () => busySources.current.size > 0;
  const pendingRef = useRef<Pending | null>(null);
  /** Latest preview per work; a saved work's list entry takes it on Save. */
  const thumbs = useRef(new Map<string, string>());

  // Dialogs the flows wait on.
  const [nameRequest, setNameRequest] = useState<{ title: string; initial: string; resolve: (name: string | null) => void } | null>(null);
  const [leaveRequest, setLeaveRequest] = useState<(LeaveRequest & { resolve: (choice: LeaveChoice) => void }) | null>(null);
  const askName = (title: string, initial: string) =>
    new Promise<string | null>((resolve) => setNameRequest({ title, initial, resolve }));
  const askLeave = (request: LeaveRequest) => new Promise<LeaveChoice>((resolve) => setLeaveRequest({ ...request, resolve }));

  /** Also updates the ref at once: a flow that awaited the change reads it before React renders. */
  const setIndex = (workspace: WorkspaceId, index: WorkMeta[]) => {
    const now = activeRef.current;
    if (now && now.workspace === workspace) activeRef.current = { ...now, index };
    setActive((prev) => (prev && prev.workspace === workspace ? { ...prev, index } : prev));
  };

  // Load the works of the canvas on screen.
  useEffect(() => {
    let cancelled = false;
    busySources.current.clear();
    setActive((prev) => (prev?.workspace === activeWorkspace ? prev : null));
    void worksStoreFor(activeWorkspace)
      .ensure(langRef.current)
      .then((state) => {
        if (!cancelled) setActive({ ...state, workspace: activeWorkspace, phase: "ready" });
      })
      .catch((error) => {
        console.error("Failed to read works", error);
        // Without storage the canvas still works, on an in-memory draft.
        if (!cancelled) setActive({ index: [], currentId: "unsaved", workspace: activeWorkspace, phase: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace]);

  // The canvas being left has unmounted: swap works, then show the canvas again.
  useEffect(() => {
    if (active?.phase !== "leaving") return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    const { workspace, currentId } = active;
    void worksStoreFor(workspace)
      .switchWork(currentId, pending.toId, pending.options)
      .then((state) => setActive({ ...state, workspace, phase: "ready" }))
      .catch((error) => {
        console.error("Failed to switch works", error);
        toast.error(String(error));
        setActive((prev) => (prev ? { ...prev, phase: "ready" } : prev));
      })
      .finally(bump);
  }, [active]);

  const current = active?.index.find((w) => w.id === active.currentId) ?? null;

  // ---- Unsaved changes of the open work -------------------------------------

  const lastInputAt = useRef(0);
  useEffect(() => {
    const onInput = (event: Event) => {
      if (!isWorksUi(event.target)) lastInputAt.current = Date.now();
    };
    // Clicks inside an iframe (the diagram editor) never reach this document;
    // the pointer going over it, or focus moving into it, is the sign the user
    // is working there. (Writes are still compared, so a mere hover changes nothing.)
    const onBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) lastInputAt.current = Date.now();
    };
    const onOver = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement) lastInputAt.current = Date.now();
    };
    const kinds = ["pointerdown", "keydown", "paste", "drop"] as const;
    for (const kind of kinds) document.addEventListener(kind, onInput, true);
    document.addEventListener("pointerover", onOver, true);
    window.addEventListener("blur", onBlur);
    return () => {
      for (const kind of kinds) document.removeEventListener(kind, onInput, true);
      document.removeEventListener("pointerover", onOver, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const userActiveSince = (since: number) => lastInputAt.current > since;

  const trackerRef = useRef<ChangeTracker | null>(null);

  /** Canvases' "write what is on screen" hooks; each gets at most 3s. */
  const flushers = useRef(new Set<() => Promise<void>>());
  const flushCanvas = async () => {
    await Promise.all(
      [...flushers.current].map((flush) =>
        Promise.race([flush().catch((error) => console.error("Canvas flush failed", error)), new Promise((resolve) => setTimeout(resolve, 3000))]),
      ),
    );
  };

  const runCheck = useCallback(async (tracker: ChangeTracker) => {
    if (tracker.timer !== null) window.clearTimeout(tracker.timer);
    tracker.timer = null;
    const store = worksStoreFor(tracker.workspace);
    const saved = await tracker.saved;
    const pending = tracker.pending;
    tracker.pending = new Map();
    if (!saved) return; // A draft: nothing saved to differ from.
    for (const [key, value] of pending) {
      if (store.fingerprint(key, value) === (saved.get(key) ?? "")) tracker.differing.delete(key);
      else tracker.differing.add(key);
    }
    if (userActiveSince(tracker.openedAt)) {
      if (store.openLocalFingerprint() === saved.get(LOCAL_KEY)) tracker.differing.delete(LOCAL_KEY);
      else tracker.differing.add(LOCAL_KEY);
    }
    if (trackerRef.current !== tracker) return;
    const index = await store.setDirty(tracker.id, tracker.differing.size > 0);
    if (trackerRef.current === tracker) setIndex(tracker.workspace, index);
  }, []);

  /** Brings the open work's unsaved-changes flag up to date (before leaving or saving). */
  const settleChanges = useCallback(async () => {
    const tracker = trackerRef.current;
    if (!tracker) return;
    tracker.running = tracker.running.then(() => runCheck(tracker));
    await tracker.running;
  }, [runCheck]);

  // A fresh tracker for each work opened on screen.
  const trackedKey = active?.phase === "ready" ? `${active.workspace}:${active.currentId}` : null;
  useEffect(() => {
    const now = activeRef.current;
    if (!now || now.phase !== "ready") {
      trackerRef.current = null;
      return;
    }
    const store = worksStoreFor(now.workspace);
    const meta = now.index.find((w) => w.id === now.currentId);
    const tracker: ChangeTracker = {
      workspace: now.workspace,
      id: now.currentId,
      openedAt: Date.now(),
      saved: meta?.saved ? store.savedFingerprints(now.currentId).catch(() => null) : Promise.resolve(null),
      differing: new Set(),
      pending: new Map(),
      timer: null,
      running: Promise.resolve(),
    };
    // Reopened with changes left from before a reload: find out which keys differ.
    if (meta?.saved && meta.dirty) {
      tracker.running = (async () => {
        const [saved, live] = await Promise.all([tracker.saved, store.liveFingerprints(now.currentId, true)]);
        if (!saved) return;
        for (const key of new Set([...saved.keys(), ...live.keys()])) {
          if ((saved.get(key) ?? "") !== (live.get(key) ?? "")) tracker.differing.add(key);
        }
        if (tracker.differing.size === 0) setIndex(tracker.workspace, await store.setDirty(tracker.id, false));
      })().catch((error) => console.error("Failed to compare work", error));
    }
    trackerRef.current = tracker;
    const unsubscribe = store.onWrite((id, key, value) => {
      if (trackerRef.current !== tracker || id !== tracker.id) return;
      if (!userActiveSince(tracker.openedAt)) return;
      tracker.pending.set(key, value);
      if (tracker.timer !== null) window.clearTimeout(tracker.timer);
      tracker.timer = window.setTimeout(() => {
        tracker.running = tracker.running.then(() => runCheck(tracker)).catch((error) => console.error("Failed to compare work", error));
      }, 800);
    });
    return () => {
      unsubscribe();
      if (tracker.timer !== null) window.clearTimeout(tracker.timer);
      if (trackerRef.current === tracker) trackerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedKey]);

  /** After a save: the saved copy is the live one again. */
  const rebaseTracker = (workspace: WorkspaceId, id: string) => {
    const tracker = trackerRef.current;
    if (!tracker || tracker.workspace !== workspace || tracker.id !== id) return;
    tracker.saved = worksStoreFor(workspace).savedFingerprints(id).catch(() => null);
    tracker.differing.clear();
  };

  // ---- Leaving, opening, saving ----------------------------------------------

  /** What to do with the open work before leaving it, or null to stay. */
  const decideLeave = async (workspace: WorkspaceId, work: WorkMeta | undefined, index: WorkMeta[]): Promise<SwitchOptions | null> => {
    if (!work) return {};
    if (work.saved) {
      if (!work.dirty) return {};
      const choice = await askLeave({ kind: "changes", name: work.name });
      if (choice === "cancel") return null;
      if (choice === "discard") return { revertFrom: true };
      return { commitFrom: { thumb: thumbs.current.get(work.id) } };
    }
    if (!work.touched) return { discardFrom: true };
    const choice = await askLeave({ kind: "draft", canvas: canvasLabel(workspace, langRef.current) });
    if (choice === "cancel") return null;
    if (choice === "discard") return { discardFrom: true };
    const name = await askName(tWorks(langRef.current, "save.title"), work.nameHint || defaultWorkName(index, langRef.current));
    if (name === null) return null;
    return { commitFrom: { name, thumb: thumbs.current.get(work.id) } };
  };

  const leaveActive = (toId: string | null, options: SwitchOptions) => {
    pendingRef.current = { toId, options };
    busySources.current.clear();
    setActive((prev) => (prev ? { ...prev, phase: "leaving" } : prev));
  };

  const openWork = async (workspace: WorkspaceId, id: string | null): Promise<boolean> => {
    const now = activeRef.current;
    if (now && now.workspace === workspace && now.phase === "ready") {
      if (id !== null && id === now.currentId) return true;
      if (isBusy()) {
        toast.info(tWorks(langRef.current, "busy.switch"));
        return false;
      }
      await flushCanvas();
      await settleChanges();
      const fresh = activeRef.current ?? now;
      const open = fresh.index.find((w) => w.id === fresh.currentId);
      const options = await decideLeave(workspace, open, fresh.index);
      if (!options) return false;
      leaveActive(id, options);
      return true;
    }
    if (now && now.workspace !== workspace && isBusy()) {
      toast.info(tWorks(langRef.current, "busy.switch"));
      return false;
    }
    // Another canvas: its works switch while it is off screen, then it is shown.
    const store = worksStoreFor(workspace);
    const state = await store.ensure(langRef.current);
    if (id === null || id !== state.currentId) {
      const open = state.index.find((w) => w.id === state.currentId);
      const options = await decideLeave(workspace, open, state.index);
      if (!options) return false;
      await store.switchWork(state.currentId, id, options);
    }
    bump();
    onActivateWorkspace(workspace);
    return true;
  };

  const saveCurrent = async () => {
    const now = activeRef.current;
    if (!now || now.phase !== "ready") return;
    await flushCanvas();
    await settleChanges();
    const fresh = activeRef.current ?? now;
    const work = fresh.index.find((w) => w.id === fresh.currentId);
    if (!work) return;
    const store = worksStoreFor(fresh.workspace);
    const thumb = thumbs.current.get(work.id);
    if (work.saved && !work.dirty) {
      // Nothing to save: the button renames.
      const name = await askName(tWorks(langRef.current, "save.renameTitle"), work.name);
      if (name === null) return;
      setIndex(fresh.workspace, await store.rename(work.id, name));
      bump();
      return;
    }
    let name: string | undefined;
    if (!work.saved) {
      const asked = await askName(tWorks(langRef.current, "save.title"), work.nameHint || defaultWorkName(fresh.index, langRef.current));
      if (asked === null) return;
      name = asked;
    }
    const index = await store.saveAs(work.id, name, true, thumb ? { thumb } : undefined);
    rebaseTracker(fresh.workspace, work.id);
    setIndex(fresh.workspace, index);
    toast.success(tWorks(langRef.current, work.saved ? "save.updated" : "save.done"));
    bump();
  };

  const refreshActive = (workspace: WorkspaceId, index: WorkMeta[]) => {
    setIndex(workspace, index);
    bump();
  };

  const removeWorkFn = async (workspace: WorkspaceId, id: string) => {
    const now = activeRef.current;
    if (now && now.workspace === workspace && now.currentId === id) {
      if (isBusy()) {
        toast.info(tWorks(langRef.current, "busy.switch"));
        return;
      }
      leaveActive(null, { discardFrom: true });
      return;
    }
    const store = worksStoreFor(workspace);
    const state = await store.ensure(langRef.current);
    if (state.currentId === id) {
      await store.switchWork(id, null, { discardFrom: true });
      bump();
      return;
    }
    refreshActive(workspace, await store.remove(id));
  };

  const renameWork = async (workspace: WorkspaceId, id: string, name: string) => {
    refreshActive(workspace, await worksStoreFor(workspace).rename(id, name));
  };

  const duplicateWork = async (workspace: WorkspaceId, id: string) => {
    const now = activeRef.current;
    const isOpen = !!now && now.workspace === workspace && now.currentId === id;
    refreshActive(workspace, await worksStoreFor(workspace).duplicate(id, langRef.current, isOpen));
  };

  const loadAll = async () => {
    const entries = await Promise.all(
      WORKSPACES.map(async ({ id }) => [id, await worksStoreFor(id).ensure(langRef.current)] as const),
    );
    return Object.fromEntries(entries) as Record<WorkspaceId, WorksState>;
  };

  // Reports from the canvas (name hint, preview, "has content") are batched.
  // Each batch remembers the work it came from: a canvas still reports while it
  // unmounts, and that must not land on the work opened next. A saved work's
  // list entry changes only on Save, so only a draft's reports are written.
  const reportRef = useRef<{ target: { workspace: WorkspaceId; id: string } | null; patch: Partial<WorkMeta>; timer: number | null }>({
    target: null,
    patch: {},
    timer: null,
  });
  const flushReport = useCallback(() => {
    const pending = reportRef.current;
    if (pending.timer !== null) window.clearTimeout(pending.timer);
    pending.timer = null;
    const { patch, target } = pending;
    pending.patch = {};
    pending.target = null;
    if (!target || !Object.keys(patch).length) return;
    const store = worksStoreFor(target.workspace);
    void store
      .readIndex()
      .then((index) => {
        if (index.find((w) => w.id === target.id)?.saved) return null;
        return store.touch(target.id, patch);
      })
      .then((index) => {
        if (index) setActive((prev) => (prev && prev.workspace === target.workspace ? { ...prev, index } : prev));
      })
      .catch((error) => console.error("Failed to update work", error));
  }, []);

  const workValue = useMemo<WorkContextValue | null>(() => {
    if (!active || active.phase !== "ready") return null;
    const store = worksStoreFor(active.workspace);
    const meta = active.index.find((w) => w.id === active.currentId);
    return {
      workId: active.currentId,
      workStore: store.storeFor(active.currentId),
      saved: !!meta?.saved,
      dirty: !!meta?.dirty,
      setBusy(source, busy) {
        if (busy) busySources.current.add(source);
        else busySources.current.delete(source);
      },
      report(info) {
        const target = { workspace: active.workspace, id: active.currentId };
        if (info.thumb !== undefined) thumbs.current.set(target.id, info.thumb);
        if (reportRef.current.target && (reportRef.current.target.workspace !== target.workspace || reportRef.current.target.id !== target.id)) {
          flushReport();
        }
        const pending = reportRef.current;
        pending.target = target;
        if (info.nameHint !== undefined) pending.patch.nameHint = info.nameHint;
        if (info.thumb !== undefined) pending.patch.thumb = info.thumb;
        if (info.touched) pending.patch.touched = true;
        if (pending.timer === null) pending.timer = window.setTimeout(flushReport, 1500);
      },
      startOver() {
        const now = activeRef.current;
        if (!now || now.phase !== "ready") return;
        const open = now.index.find((w) => w.id === now.currentId);
        flushReport();
        // A saved work goes back to its saved copy; a draft is dropped.
        leaveActive(null, open?.saved ? { revertFrom: true } : { discardFrom: true });
      },
      save() {
        void saveCurrent();
      },
      registerFlush(flush) {
        flushers.current.add(flush);
        return () => {
          flushers.current.delete(flush);
        };
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.workspace, active?.currentId, active?.phase, active?.index, flushReport]);

  // A report still waiting when the work changes belongs to the work being left.
  useEffect(() => () => flushReport(), [active?.currentId, active?.workspace, flushReport]);

  const control: WorksControl = {
    active,
    current,
    saveCurrent,
    openWork,
    removeWork: removeWorkFn,
    renameWork,
    duplicateWork,
    loadAll,
    revision,
  };

  return (
    <WorksControlContext.Provider value={control}>
      {/* Right after a canvas switch `active` still holds the previous canvas's
          works until the effect above runs; the new canvas must not mount on them. */}
      <WorkHostContext.Provider value={active?.workspace === activeWorkspace ? workValue : null}>{children}</WorkHostContext.Provider>
      <NameDialog
        request={nameRequest}
        onClose={(name) => {
          nameRequest?.resolve(name);
          setNameRequest(null);
        }}
      />
      <LeaveDialog
        request={leaveRequest}
        onClose={(choice) => {
          leaveRequest?.resolve(choice);
          setLeaveRequest(null);
        }}
      />
    </WorksControlContext.Provider>
  );
}

const WorkHostContext = createContext<WorkContextValue | null>(null);

/**
 * Renders the canvas on screen for its open work: nothing while the works are
 * read or a switch is under way, then the canvas keyed on the work id.
 */
export function WorkHost({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const value = useContext(WorkHostContext);
  if (!value) return <>{fallback}</>;
  return (
    <WorkContext.Provider value={value} key={value.workId}>
      {children}
    </WorkContext.Provider>
  );
}
