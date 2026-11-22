import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { errorText, notify } from "@/shared/ui/notify";
import { t as tShell, useUiLanguage } from "@/shared/i18n";
import { announceTaskDone } from "@/shared/task-done";
import { recordDuration, recordUse } from "@/shared/usage-stats";
import { OPEN_WORKS_EVENT, WorkContext, type WorkContextValue } from "@/shared/works/work-context";
import { defaultWorkName, isDefaultWorkName, listedWorks, type WorkMeta } from "@/shared/works/works-index";
import { type WorksState } from "@/shared/works/works-store";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { worksStoreFor } from "./works-registry";
import { tWorks } from "./strings";

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
 * The canvas always writes a live copy, so a reload loses nothing, and there
 * is no Save: like a chat on claude.ai, a work is listed (and named) on its
 * own once it has content, and what is on screen is what is kept. Only an
 * empty draft is dropped when it is left.
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

interface WorksControl {
  active: ActiveWorks | null;
  current: WorkMeta | null;
  /** Open a work (or a new draft when id is null) in any canvas. */
  openWork(workspace: WorkspaceId, id: string | null): Promise<boolean>;
  /** Go to a canvas on its latest work (the sidebar's canvas rows). */
  openCanvas(workspace: WorkspaceId): Promise<boolean>;
  removeWork(workspace: WorkspaceId, id: string): Promise<void>;
  renameWork(workspace: WorkspaceId, id: string, name: string): Promise<void>;
  pinWork(workspace: WorkspaceId, id: string, pinned: boolean): Promise<void>;
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
  const busySince = useRef<{ canvas: string; at: number } | null>(null);
  const isBusy = () => busySources.current.size > 0;
  const pendingRef = useRef<Pending | null>(null);
  /** Latest preview per work, handed to a draft listed as it is left. */
  const thumbs = useRef(new Map<string, string>());

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
    busySince.current = null;
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
        notify.error(langRef.current === "zh" ? "没能切换作品" : "Could not switch works", { description: errorText(error) });
        setActive((prev) => (prev ? { ...prev, phase: "ready" } : prev));
      })
      .finally(bump);
  }, [active]);

  const current = active?.index.find((w) => w.id === active.currentId) ?? null;

  // ---- Writing what is on screen ---------------------------------------------

  /** Canvases' "write what is on screen" hooks; each gets at most 3s. */
  const flushers = useRef(new Set<() => Promise<void>>());
  const flushCanvas = async () => {
    await Promise.all(
      [...flushers.current].map((flush) =>
        Promise.race([flush().catch((error) => console.error("Canvas flush failed", error)), new Promise((resolve) => setTimeout(resolve, 3000))]),
      ),
    );
  };

  // Reports from the canvas (name hint, preview, "has content") are batched.
  // Each batch remembers the work it came from: a canvas still reports while it
  // unmounts, and that must not land on the work opened next. Saving is
  // automatic: once the draft has content and its first message has been
  // sent, it is listed, named from that message (or "未命名作品 N"); later reports keep its preview and
  // time up to date, and a better name replaces a default one.
  const reportRef = useRef<{ target: { workspace: WorkspaceId; id: string } | null; patch: Partial<WorkMeta>; timer: number | null }>({
    target: null,
    patch: {},
    timer: null,
  });
  const flushReport = useCallback(async () => {
    const pending = reportRef.current;
    if (pending.timer !== null) window.clearTimeout(pending.timer);
    pending.timer = null;
    const { patch, target } = pending;
    pending.patch = {};
    pending.target = null;
    if (!target || !Object.keys(patch).length) return;
    const store = worksStoreFor(target.workspace);
    try {
      const before = (await store.readIndex()).find((w) => w.id === target.id);
      if (!before) return;
      let index = await store.touch(target.id, patch);
      const now = activeRef.current;
      const isOpen = !!now && now.phase === "ready" && now.workspace === target.workspace && now.currentId === target.id;
      const hint = (patch.nameHint ?? before.nameHint)?.trim();
      // A new work joins the list (and gets its name in the header) once its first message is sent,
      // not while it is blank or something is only being typed.
      const sent = !!(patch.lastPrompt ?? before.lastPrompt);
      if (!before.saved && (before.touched || patch.touched) && sent && isOpen) {
        // A work being left is listed by its leave instead (commitFrom).
        index = await store.saveAs(target.id, hint || defaultWorkName(index, langRef.current), true);
      } else if (before.saved && patch.nameHint?.trim() && isDefaultWorkName(before.name)) {
        index = await store.rename(target.id, patch.nameHint.trim());
      }
      setActive((prev) => (prev && prev.workspace === target.workspace ? { ...prev, index } : prev));
      bump();
    } catch (error) {
      console.error("Failed to update work", error);
    }
  }, []);

  // ---- Leaving, opening ------------------------------------------------------

  /** What to do with the open work before leaving it: keep what has content, drop an empty draft. */
  const leaveOptions = (work: WorkMeta | undefined, index: WorkMeta[]): SwitchOptions => {
    if (!work || work.saved) return {};
    if (!work.touched) return { discardFrom: true };
    return { commitFrom: { name: work.nameHint?.trim() || defaultWorkName(index, langRef.current), thumb: thumbs.current.get(work.id) } };
  };

  const leaveActive = (toId: string | null, options: SwitchOptions) => {
    pendingRef.current = { toId, options };
    busySources.current.clear();
    busySince.current = null;
    // The ref at once too: a report flushed meanwhile must see the work is being left.
    if (activeRef.current) activeRef.current = { ...activeRef.current, phase: "leaving" };
    setActive((prev) => (prev ? { ...prev, phase: "leaving" } : prev));
  };

  const openWork = async (workspace: WorkspaceId, id: string | null): Promise<boolean> => {
    const now = activeRef.current;
    if (now && now.workspace === workspace && now.phase === "ready") {
      if (id !== null && id === now.currentId) return true;
      if (isBusy()) {
        notify.info(tWorks(langRef.current, "busy.switch.title"), { description: tWorks(langRef.current, "busy.switch") });
        return false;
      }
      await flushCanvas();
      await flushReport();
      const fresh = activeRef.current ?? now;
      if (fresh.phase !== "ready") return false;
      leaveActive(id, leaveOptions(fresh.index.find((w) => w.id === fresh.currentId), fresh.index));
      return true;
    }
    if (now && now.workspace !== workspace && isBusy()) {
      notify.info(tWorks(langRef.current, "busy.switch.title"), { description: tWorks(langRef.current, "busy.switch") });
      return false;
    }
    // Another canvas: its works switch while it is off screen, then it is shown.
    const store = worksStoreFor(workspace);
    const state = await store.ensure(langRef.current);
    if (id === null || id !== state.currentId) {
      await store.switchWork(state.currentId, id, leaveOptions(state.index.find((w) => w.id === state.currentId), state.index));
    }
    bump();
    onActivateWorkspace(workspace);
    return true;
  };

  /**
   * A canvas picked in the sidebar opens on what was last worked on there:
   * the work it had open, unless that is a blank draft (a "new" never used,
   * a deck started over), then its most recent listed work.
   */
  const openCanvas = async (workspace: WorkspaceId): Promise<boolean> => {
    const now = activeRef.current;
    if (now && now.workspace === workspace) return true;
    try {
      const state = await worksStoreFor(workspace).ensure(langRef.current);
      const open = state.index.find((w) => w.id === state.currentId);
      const latest = listedWorks(state.index)[0];
      if (!open?.saved && !open?.touched && latest) return await openWork(workspace, latest.id);
    } catch (error) {
      console.error("Failed to read works", error);
    }
    onActivateWorkspace(workspace);
    return true;
  };

  const refreshActive = (workspace: WorkspaceId, index: WorkMeta[]) => {
    setIndex(workspace, index);
    bump();
  };

  const removeWorkFn = async (workspace: WorkspaceId, id: string) => {
    const now = activeRef.current;
    if (now && now.workspace === workspace && now.currentId === id) {
      if (isBusy()) {
        notify.info(tWorks(langRef.current, "busy.switch.title"), { description: tWorks(langRef.current, "busy.switch") });
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

  const pinWork = async (workspace: WorkspaceId, id: string, pinned: boolean) => {
    refreshActive(workspace, await worksStoreFor(workspace).setPinned(id, pinned));
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

  const workValue = useMemo<WorkContextValue | null>(() => {
    if (!active || active.phase !== "ready") return null;
    const store = worksStoreFor(active.workspace);
    const meta = active.index.find((w) => w.id === active.currentId);
    return {
      workId: active.currentId,
      workStore: store.storeFor(active.currentId),
      saved: !!meta?.saved,
      name: meta?.saved ? meta.name : "",
      thumb: thumbs.current.get(active.currentId) ?? meta?.thumb,
      openWork(id) {
        void openWork(active.workspace, id);
      },
      showAllWorks() {
        window.dispatchEvent(new CustomEvent(OPEN_WORKS_EVENT));
      },
      rename(name) {
        if (meta?.saved && name.trim()) void renameWork(active.workspace, active.currentId, name.trim());
      },
      setBusy(source, busy) {
        const wasBusy = busySources.current.size > 0;
        if (busy) busySources.current.add(source);
        else busySources.current.delete(source);
        // A generation just started on this canvas: Settings → Usage counts it.
        if (!wasBusy && busySources.current.size > 0) {
          recordUse(active.workspace);
          busySince.current = { canvas: active.workspace, at: Date.now() };
        }
        // And finished: how long it took.
        if (wasBusy && busySources.current.size === 0 && busySince.current) {
          recordDuration(busySince.current.canvas, Date.now() - busySince.current.at);
          busySince.current = null;
        }
        // The last generation on this canvas just ended: tell the user, if they asked to be told.
        if (wasBusy && busySources.current.size === 0) {
          const name = meta?.saved ? meta.name : "";
          const zh = langRef.current === "zh";
          const canvas = tShell(langRef.current, WORKSPACES.find((w) => w.id === active.workspace)!.labelKey);
          announceTaskDone(zh ? `${canvas} · 画好了` : `${canvas} · Done`, name || (zh ? "回来看看吧。" : "Come and have a look."));
        }
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
        if (info.lastPrompt !== undefined && info.lastPrompt.slice(0, 200) !== meta?.lastPrompt) pending.patch.lastPrompt = info.lastPrompt.slice(0, 200);
        if (info.touched) pending.patch.touched = true;
        if (pending.timer === null) pending.timer = window.setTimeout(() => void flushReport(), 1500);
      },
      startOver() {
        const now = activeRef.current;
        if (!now || now.phase !== "ready") return;
        // What is there stays in the list (an empty draft is dropped); the canvas opens a blank one.
        void flushReport().then(() => {
          const fresh = activeRef.current;
          if (!fresh || fresh.phase !== "ready" || fresh.currentId !== now.currentId) return;
          leaveActive(null, leaveOptions(fresh.index.find((w) => w.id === fresh.currentId), fresh.index));
        });
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
  useEffect(() => () => void flushReport(), [active?.currentId, active?.workspace, flushReport]);

  const control: WorksControl = {
    active,
    current,
    openWork,
    openCanvas,
    removeWork: removeWorkFn,
    renameWork,
    pinWork,
    duplicateWork,
    loadAll,
    revision,
  };

  return (
    <WorksControlContext.Provider value={control}>
      {/* Right after a canvas switch `active` still holds the previous canvas's
          works until the effect above runs; the new canvas must not mount on them. */}
      <WorkHostContext.Provider value={active?.workspace === activeWorkspace ? workValue : null}>{children}</WorkHostContext.Provider>
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
