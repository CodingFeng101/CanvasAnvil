import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { t as tShell, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { WorkContext, type WorkContextValue } from "@/shared/works/work-context";
import { defaultWorkName, type WorkMeta } from "@/shared/works/works-index";
import type { WorksState } from "@/shared/works/works-store";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { worksStoreFor } from "./works-registry";
import { tWorks } from "./strings";
import { LeaveDialog, NameDialog } from "./work-dialogs";

/**
 * The app-level side of My works.
 *
 * Opening another work of the canvas on screen is "unmount, swap, remount":
 * the canvas is taken off screen (its unmount flushes the last save into the
 * work being left), the works store swaps the localStorage values and the
 * current id, and the canvas is rendered again keyed on the new id, reading
 * everything from the new work's keys. The canvases' own load-on-mount and
 * save-on-change code stays as it was.
 */

type Phase = "loading" | "ready" | "leaving";

interface ActiveWorks extends WorksState {
  workspace: WorkspaceId;
  phase: Phase;
}

interface Pending {
  toId: string | null;
  discard: boolean;
}

type LeaveChoice = "save" | "discard" | "cancel";

interface WorksControl {
  active: ActiveWorks | null;
  current: WorkMeta | null;
  /** Save the open work (asks for a name), or rename it when already saved. */
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

  // Dialogs the flows wait on.
  const [nameRequest, setNameRequest] = useState<{ title: string; initial: string; resolve: (name: string | null) => void } | null>(null);
  const [leaveRequest, setLeaveRequest] = useState<{ canvas: string; resolve: (choice: LeaveChoice) => void } | null>(null);
  const askName = (title: string, initial: string) =>
    new Promise<string | null>((resolve) => setNameRequest({ title, initial, resolve }));
  const askLeave = (workspace: WorkspaceId) =>
    new Promise<LeaveChoice>((resolve) => setLeaveRequest({ canvas: canvasLabel(workspace, langRef.current), resolve }));

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
      .switchWork(currentId, pending.toId, { discardFrom: pending.discard })
      .then((state) => setActive({ ...state, workspace, phase: "ready" }))
      .catch((error) => {
        console.error("Failed to switch works", error);
        toast.error(String(error));
        setActive((prev) => (prev ? { ...prev, phase: "ready" } : prev));
      })
      .finally(bump);
  }, [active]);

  const current = active?.index.find((w) => w.id === active.currentId) ?? null;

  /** What to do with the open work before leaving it: keep (saved), save, discard or stay. */
  const decideLeave = async (workspace: WorkspaceId, work: WorkMeta | undefined, index: WorkMeta[]) => {
    if (!work || work.saved) return { go: true, discard: false };
    if (!work.touched) return { go: true, discard: true };
    const choice = await askLeave(workspace);
    if (choice === "cancel") return { go: false, discard: false };
    if (choice === "discard") return { go: true, discard: true };
    const name = await askName(tWorks(langRef.current, "save.title"), work.nameHint || defaultWorkName(index, langRef.current));
    if (name === null) return { go: false, discard: false };
    await worksStoreFor(workspace).saveAs(work.id, name);
    return { go: true, discard: false };
  };

  const leaveActive = (toId: string | null, discard: boolean) => {
    pendingRef.current = { toId, discard };
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
      const open = now.index.find((w) => w.id === now.currentId);
      const { go, discard } = await decideLeave(workspace, open, now.index);
      if (!go) return false;
      leaveActive(id, discard);
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
      const { go, discard } = await decideLeave(workspace, open, state.index);
      if (!go) return false;
      await store.switchWork(state.currentId, id, { discardFrom: discard });
    }
    bump();
    onActivateWorkspace(workspace);
    return true;
  };

  const saveCurrent = async () => {
    const now = activeRef.current;
    if (!now || now.phase !== "ready") return;
    const work = now.index.find((w) => w.id === now.currentId);
    if (!work) return;
    const name = await askName(
      tWorks(langRef.current, work.saved ? "save.renameTitle" : "save.title"),
      work.saved ? work.name : work.nameHint || defaultWorkName(now.index, langRef.current),
    );
    if (name === null) return;
    const index = await worksStoreFor(now.workspace).saveAs(work.id, name);
    setActive((prev) => (prev && prev.workspace === now.workspace ? { ...prev, index } : prev));
    if (!work.saved) toast.success(tWorks(langRef.current, "save.done"));
    bump();
  };

  const refreshActive = (workspace: WorkspaceId, index: WorkMeta[]) => {
    setActive((prev) => (prev && prev.workspace === workspace ? { ...prev, index } : prev));
    bump();
  };

  const removeWorkFn = async (workspace: WorkspaceId, id: string) => {
    const now = activeRef.current;
    if (now && now.workspace === workspace && now.currentId === id) {
      if (isBusy()) {
        toast.info(tWorks(langRef.current, "busy.switch"));
        return;
      }
      leaveActive(null, true);
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
  // unmounts, and that must not land on the work opened next.
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
    void worksStoreFor(target.workspace)
      .touch(target.id, patch)
      .then((index) => setActive((prev) => (prev && prev.workspace === target.workspace ? { ...prev, index } : prev)))
      .catch((error) => console.error("Failed to update work", error));
  }, []);

  const workValue = useMemo<WorkContextValue | null>(() => {
    if (!active || active.phase !== "ready") return null;
    const store = worksStoreFor(active.workspace);
    return {
      workId: active.currentId,
      workStore: store.storeFor(active.currentId),
      saved: !!active.index.find((w) => w.id === active.currentId)?.saved,
      setBusy(source, busy) {
        if (busy) busySources.current.add(source);
        else busySources.current.delete(source);
      },
      report(info) {
        const target = { workspace: active.workspace, id: active.currentId };
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
        leaveActive(null, !open?.saved);
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
      <WorkHostContext.Provider value={workValue}>{children}</WorkHostContext.Provider>
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
