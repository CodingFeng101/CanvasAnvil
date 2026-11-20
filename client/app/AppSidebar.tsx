import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  SquarePen,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { BrandIcon } from "@/app/BrandIcon";
import { SettingsDialog } from "@/app/SettingsDialog";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { useWorksControl } from "@/app/works/works-provider";
import { WorksButton } from "@/app/works/works-dialog";
import { SearchWorksDialog, timeAgo } from "@/app/works/search-dialog";
import { cn } from "@/shared/lib/utils";
import { t, useUiLanguage } from "@/shared/i18n";
import { TWEEN } from "@/shared/motion";
import { listedWorks, type WorkMeta } from "@/shared/works/works-index";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

/*
 * The app's left sidebar, after claude.ai: brand and a collapse toggle, a
 * clay "new" row, the four canvases, pinned and recent works (each with a
 * pin / rename / delete menu), and the quiet controls at the foot. Selection is an ink wash, never colour. Collapsed it becomes an
 * icon rail; on a phone it is a drawer behind a slim top bar.
 *
 */

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const COLLAPSED_KEY = "CanvasAnvil-sidebar-collapsed-v1";
const RECENT_LIMIT = 12;

const iconButton =
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-[background-color,color] duration-fast ease-out-soft hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

const rowBase =
  "flex h-8 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left text-[14px] transition-[background-color,color] duration-fast ease-out-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30";

function useIsPhone() {
  const query = "(max-width: 767px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** A tooltip only while the rail is collapsed; expanded rows already say what they are. */
function RailTip({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

interface Recent {
  workspace: WorkspaceId;
  work: WorkMeta;
  isOpen: boolean;
}

/** Pinned works (all of them) and the latest of the rest, newest first. */
function useRecents(): { pinned: Recent[]; recent: Recent[] } | null {
  const control = useWorksControl();
  const [recents, setRecents] = useState<{ pinned: Recent[]; recent: Recent[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void control
      .loadAll()
      .then((all) => {
        if (cancelled) return;
        const rows: Recent[] = [];
        for (const { id } of WORKSPACES) {
          const state = all[id];
          if (!state) continue;
          for (const work of listedWorks(state.index)) rows.push({ workspace: id, work, isOpen: id === control.active?.workspace && state.currentId === work.id });
        }
        rows.sort((a, b) => b.work.updatedAt - a.work.updatedAt);
        setRecents({
          pinned: rows.filter((r) => r.work.pinned),
          recent: rows.filter((r) => !r.work.pinned).slice(0, RECENT_LIMIT),
        });
      })
      .catch((error) => console.error("Failed to list recent works", error));
    return () => {
      cancelled = true;
    };
    // `control` is rebuilt on every provider render; the revision is what says the lists changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.revision, control.active?.workspace, control.active?.currentId]);
  return recents;
}

const MENU_WIDTH = 176;
interface MenuAt {
  x: number;
  y: number;
  limit: number;
}

const menuItem =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] text-foreground/85 transition-colors duration-fast hover:bg-foreground/[0.06] hover:text-foreground focus-visible:bg-foreground/[0.06] focus-visible:outline-none";

/**
 * The little menu of a recent row, as on claude.ai: pin, rename, delete.
 * Opened from the row's "…" (anchored under it) or by right-click (at the
 * pointer); closes on a choice, Escape, a click elsewhere or a scroll.
 */
function RowMenu({
  at,
  pinned,
  onClose,
  onPin,
  onRename,
  onDelete,
  trigger,
}: {
  at: MenuAt;
  pinned: boolean;
  onClose: () => void;
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
  /** The "…" that opened it: a press on it toggles (its own click closes), so it is not "elsewhere". */
  trigger: HTMLElement | null;
}) {
  const uiLang = useUiLanguage();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
    const away = (event: Event) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || trigger?.contains(target)) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("scroll", away, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("scroll", away, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, trigger]);
  const choose = (fn: () => void) => () => {
    onClose();
    fn();
  };
  // Kept inside the sidebar (never over the chat) and inside the window.
  const top = Math.min(at.y, window.innerHeight - 124);
  const left = Math.max(8, Math.min(at.x, at.limit - MENU_WIDTH));
  return createPortal(
    <motion.div
      ref={ref}
      data-works-ui
      role="menu"
      initial={{ opacity: 0, scale: 0.97, y: -2 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={TWEEN.fast}
      style={{ top, left }}
      className="fixed z-[80] w-44 origin-top-right rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-[0_1px_2px_rgba(20,20,19,0.06),0_8px_24px_-6px_rgba(20,20,19,0.14)]"
    >
      <button type="button" role="menuitem" className={menuItem} onClick={choose(onPin)}>
        {pinned ? <PinOff className="size-4 text-muted-foreground" /> : <Pin className="size-4 text-muted-foreground" />}
        {t(uiLang, pinned ? "sidebar.unpin" : "sidebar.pin")}
      </button>
      <button type="button" role="menuitem" className={menuItem} onClick={choose(onRename)}>
        <Pencil className="size-4 text-muted-foreground" />
        {t(uiLang, "sidebar.rename")}
      </button>
      <button
        type="button"
        role="menuitem"
        className={cn(menuItem, "text-destructive hover:bg-destructive/[0.08] hover:text-destructive focus-visible:bg-destructive/[0.08]")}
        onClick={choose(onDelete)}
      >
        <Trash2 className="size-4" />
        {t(uiLang, "sidebar.delete")}
      </button>
    </motion.div>,
    document.body,
  );
}

/** The small card beside a recent row: the last picture, the last request, the canvas and when. */
function RecentPeek({ item, icon: Icon, at }: { item: Recent; icon: LucideIcon; at: { top: number; left: number } }) {
  const uiLang = useUiLanguage();
  const { workspace, work } = item;
  const label = t(uiLang, WORKSPACES.find((w) => w.id === workspace)!.labelKey);
  const top = Math.max(8, Math.min(at.top - 8, window.innerHeight - 280));
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[90] w-[260px] overflow-hidden rounded-xl border border-border/80 bg-popover shadow-[0_8px_28px_-8px_hsl(var(--shadow-hue)/0.22),0_2px_6px_hsl(var(--shadow-hue)/0.08)] animate-in fade-in zoom-in-[0.98] duration-fast"
      style={{ top, left: at.left }}
    >
      <div className="flex h-[132px] items-center justify-center border-b border-border/60 bg-sunken">
        {work.thumb ? (
          <img src={work.thumb} alt="" className="size-full object-contain" draggable={false} />
        ) : (
          <Icon className="size-7 text-muted-foreground/50" />
        )}
      </div>
      <div className="px-3 py-2.5">
        <div className="truncate text-[13.5px] font-medium text-foreground">{work.name}</div>
        {work.lastPrompt && <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground">{work.lastPrompt}</p>}
        <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground/80">
          <Icon className="size-3" />
          {label} · {timeAgo(work.updatedAt, uiLang)}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RecentRow({
  item,
  icon: Icon,
  onOpen,
  onAskDelete,
}: {
  item: Recent;
  icon: LucideIcon;
  onOpen: () => void;
  onAskDelete: () => void;
}) {
  const uiLang = useUiLanguage();
  const control = useWorksControl();
  const { workspace, work, isOpen } = item;
  const [menuAt, setMenuAt] = useState<MenuAt | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** The sidebar's right edge (less a gutter): the menu never crosses it. */
  const limitOf = (el: Element) => (el.closest("aside")?.getBoundingClientRect().right ?? window.innerWidth) - 6;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(work.name);
  const closeMenu = useCallback(() => setMenuAt(null), []);
  // The hover preview: the last picture and the last request, after a short pause.
  const [peek, setPeek] = useState<{ top: number; left: number } | null>(null);
  const peekTimer = useRef(0);
  const startPeek = (el: HTMLElement) => {
    window.clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const aside = el.closest("aside")?.getBoundingClientRect();
      setPeek({ top: r.top, left: (aside?.right ?? r.right) + 8 });
    }, 450);
  };
  const stopPeek = () => {
    window.clearTimeout(peekTimer.current);
    setPeek(null);
  };
  useEffect(() => () => window.clearTimeout(peekTimer.current), []);

  const commitRename = () => {
    setEditing(false);
    const name = draft.trim();
    if (name && name !== work.name) void control.renameWork(workspace, work.id, name);
  };

  if (editing) {
    return (
      <li>
        <input
          autoFocus
          value={draft}
          aria-label={t(uiLang, "sidebar.rename")}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(work.name);
              setEditing(false);
            }
          }}
          className="h-[30px] w-full rounded-lg border border-ring/60 bg-card px-2 text-[13.5px] text-foreground outline-none ring-[3px] ring-ring/15"
        />
      </li>
    );
  }

  const open = !!menuAt;
  return (
    <li
      className="group/row relative"
      onMouseEnter={(e) => startPeek(e.currentTarget)}
      onMouseLeave={stopPeek}
      onPointerDown={stopPeek}
    >
      {peek && !open && <RecentPeek item={item} icon={Icon} at={peek} />}
      <button
        type="button"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuAt({ x: e.clientX, y: e.clientY, limit: limitOf(e.currentTarget) });
        }}
        className={cn(
          rowBase,
          "h-[30px] gap-2 pr-8 text-[13.5px]",
          isOpen || open ? "bg-foreground/[0.08] text-foreground" : "text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground",
        )}
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground/80" />
        <span className="truncate">{work.name}</span>
      </button>
      <button
        type="button"
        aria-label={t(uiLang, "sidebar.more")}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={triggerRef}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          // Right-aligned under the "…", opening leftwards into the sidebar.
          setMenuAt(open ? null : { x: r.right - MENU_WIDTH, y: r.bottom + 4, limit: limitOf(e.currentTarget) });
        }}
        className={cn(
          "absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-opacity duration-fast hover:bg-foreground/[0.08] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none",
          open ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
        )}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {menuAt && (
        <RowMenu
          at={menuAt}
          pinned={!!work.pinned}
          onClose={closeMenu}
          onPin={() => void control.pinWork(workspace, work.id, !work.pinned)}
          onRename={() => {
            setDraft(work.name);
            setEditing(true);
          }}
          onDelete={onAskDelete}
          trigger={triggerRef.current}
        />
      )}
    </li>
  );
}

function DeleteWorkDialog({ target, onClose }: { target: Recent | null; onClose: () => void }) {
  const uiLang = useUiLanguage();
  const control = useWorksControl();
  // Keeps the name on screen while the dialog fades out.
  const [shown, setShown] = useState<Recent | null>(target);
  useEffect(() => {
    if (target) setShown(target);
  }, [target]);
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-works-ui className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t(uiLang, "sidebar.deleteTitle")}</DialogTitle>
          <DialogDescription>{t(uiLang, "sidebar.deleteDesc", { name: shown?.work.name ?? "" })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t(uiLang, "common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (target) void control.removeWork(target.workspace, target.work.id);
              onClose();
            }}
          >
            {t(uiLang, "sidebar.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecentSection({
  label,
  items,
  iconOf,
  onOpen,
  onAskDelete,
}: {
  label: string;
  items: Recent[];
  iconOf: Record<string, LucideIcon>;
  onOpen: (item: Recent) => void;
  onAskDelete: (item: Recent) => void;
}) {
  return (
    <>
      <div className="px-2 pb-1 pt-5 text-[12px] text-muted-foreground">{label}</div>
      <ul className="flex flex-col gap-px">
        {items.map((item) => (
          <RecentRow
            key={`${item.workspace}:${item.work.id}`}
            item={item}
            icon={iconOf[item.workspace]}
            onOpen={() => onOpen(item)}
            onAskDelete={() => onAskDelete(item)}
          />
        ))}
      </ul>
    </>
  );
}

function SidebarBody({
  active,
  onSelect,
  onHome,
  collapsed,
  onToggle,
  onDone,
}: {
  active: WorkspaceId;
  onSelect: (id: WorkspaceId) => void;
  onHome: () => void;
  collapsed: boolean;
  /** Collapse or expand; on a phone, close the drawer. */
  onToggle: () => void;
  /** Called after a choice is made (closes the phone drawer). */
  onDone?: () => void;
}) {
  const uiLang = useUiLanguage();
  const control = useWorksControl();
  const recents = useRecents();
  const iconOf = useMemo(() => Object.fromEntries(WORKSPACES.map((w) => [w.id, w.icon])) as Record<string, LucideIcon>, []);
  const [deleting, setDeleting] = useState<Recent | null>(null);
  const [searching, setSearching] = useState(false);
  // Ctrl/Cmd+K opens the search from anywhere, as on claude.ai.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openWork = async (workspace: WorkspaceId, id: string | null) => {
    if (await control.openWork(workspace, id)) onDone?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand and toggle. Collapsed, the toggle alone stays. */}
      <div className={cn("flex h-12 shrink-0 items-center gap-1", collapsed ? "justify-center px-2" : "justify-between pl-3 pr-2")}>
        {!collapsed && (
          <button
            type="button"
            onClick={onHome}
            title={t(uiLang, "sidebar.home")}
            className="group flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            <BrandIcon className="size-[22px] shrink-0 transition-transform duration-base ease-out-soft group-hover:-rotate-6" />
            <span className="truncate font-display text-[17px] font-medium tracking-[-0.01em]">CanvasAnvil</span>
          </button>
        )}
        <RailTip show={collapsed} label={t(uiLang, "sidebar.expand")}>
          <button type="button" onClick={onToggle} className={iconButton} aria-label={t(uiLang, collapsed ? "sidebar.expand" : "sidebar.collapse")}>
            {onDone ? <X className="size-[18px]" /> : <PanelLeft className="size-[18px]" />}
          </button>
        </RailTip>
      </div>

      <nav className={cn("flex shrink-0 flex-col gap-0.5 pt-1", collapsed ? "items-center px-2" : "px-2")}>
        {/* The three actions, one icon language with the canvases below. */}
        <RailTip show={collapsed} label={t(uiLang, "sidebar.new")}>
          <button
            type="button"
            onClick={() => void openWork(active, null)}
            className={cn(rowBase, "font-medium text-foreground hover:bg-foreground/[0.05]", collapsed && "w-8 justify-center px-0")}
          >
            <SquarePen className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">{t(uiLang, "sidebar.new")}</span>}
          </button>
        </RailTip>
        <RailTip show={collapsed} label={`${t(uiLang, "sidebar.search")} (${MOD_KEY}+K)`}>
          <button
            type="button"
            onClick={() => setSearching(true)}
            className={cn(rowBase, "group/search text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground", collapsed && "w-8 justify-center px-0")}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate">{t(uiLang, "sidebar.search")}</span>
                <kbd className="font-sans text-[11px] text-muted-foreground/70 opacity-0 transition-opacity group-hover/search:opacity-100">{MOD_KEY} K</kbd>
              </>
            )}
          </button>
        </RailTip>
        <WorksButton
          renderTrigger={(open) => (
            <RailTip show={collapsed} label={t(uiLang, "sidebar.allWorks")}>
              <button
                type="button"
                onClick={open}
                className={cn(rowBase, "text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground", collapsed && "w-8 justify-center px-0")}
              >
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                {!collapsed && <span className="truncate">{t(uiLang, "sidebar.allWorks")}</span>}
              </button>
            </RailTip>
          )}
        />

        <div className={cn("px-2 pb-1 pt-4 text-[12px] text-muted-foreground", collapsed && "hidden")}>{t(uiLang, "sidebar.canvases")}</div>
        {collapsed && <div className="my-1.5 h-px w-6 bg-border" />}
        {WORKSPACES.map(({ id, labelKey, icon: Icon }) => {
          const on = id === active;
          return (
            <RailTip key={id} show={collapsed} label={t(uiLang, labelKey)}>
              <button
                type="button"
                aria-current={on ? "page" : undefined}
                onClick={() => {
                  // On the canvas's latest work, not a blank draft left there.
                  if (id === active) onSelect(id);
                  else void control.openCanvas(id);
                  onDone?.();
                }}
                className={cn(
                  rowBase,
                  on ? "bg-foreground/[0.08] text-foreground" : "text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground",
                  collapsed && "w-8 justify-center px-0",
                )}
              >
                <Icon className={cn("size-4 shrink-0", on ? "text-foreground" : "text-muted-foreground")} />
                {!collapsed && <span className="truncate">{t(uiLang, labelKey)}</span>}
              </button>
            </RailTip>
          );
        })}
      </nav>

      {/* Recents scroll on their own; the foot stays put. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-thin">
        {!collapsed && recents && (
          <>
            {recents.pinned.length > 0 && (
              <RecentSection
                label={t(uiLang, "sidebar.pinned")}
                items={recents.pinned}
                iconOf={iconOf}
                onOpen={(r) => void openWork(r.workspace, r.work.id)}
                onAskDelete={setDeleting}
              />
            )}
            {recents.recent.length > 0 ? (
              <RecentSection
                label={t(uiLang, "sidebar.recent")}
                items={recents.recent}
                iconOf={iconOf}
                onOpen={(r) => void openWork(r.workspace, r.work.id)}
                onAskDelete={setDeleting}
              />
            ) : (
              recents.pinned.length === 0 && (
                <>
                  <div className="px-2 pb-1 pt-5 text-[12px] text-muted-foreground">{t(uiLang, "sidebar.recent")}</div>
                  <p className="px-2 py-1 font-voice text-[13.5px] italic leading-relaxed text-muted-foreground/80">{t(uiLang, "sidebar.noRecent")}</p>
                </>
              )
            )}
          </>
        )}
      </div>

      <div className={cn("flex shrink-0 border-t border-border/60 p-2", collapsed && "justify-center")}>
        <SettingsDialog
          renderTrigger={(open) => (
            <RailTip show={collapsed} label={t(uiLang, "settings.title")}>
              <button
                type="button"
                onClick={open}
                className={cn(rowBase, "text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground", collapsed && "w-8 justify-center px-0")}
              >
                <Settings className="size-4 shrink-0 text-muted-foreground" />
                {!collapsed && <span className="truncate">{t(uiLang, "settings.title")}</span>}
              </button>
            </RailTip>
          )}
        />
      </div>
      <SearchWorksDialog open={searching} onOpenChange={setSearching} />
      <DeleteWorkDialog target={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

export function AppSidebar({ active, onSelect, onHome }: { active: WorkspaceId; onSelect: (id: WorkspaceId) => void; onHome: () => void }) {
  const uiLang = useUiLanguage();
  const phone = useIsPhone();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!phone) setDrawer(false);
  }, [phone]);

  if (phone) {
    const current = WORKSPACES.find((w) => w.id === active);
    return (
      <>
        <header data-works-ui className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-2">
          <button type="button" className={iconButton} onClick={() => setDrawer(true)} aria-label={t(uiLang, "sidebar.expand")}>
            <Menu className="size-[18px]" />
          </button>
          <BrandIcon className="size-5" />
          <span className="truncate font-display text-[16px] font-medium">{current ? t(uiLang, current.labelKey) : "CanvasAnvil"}</span>
        </header>
        <AnimatePresence>
          {drawer && (
            <motion.div className="fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={TWEEN.base}>
              <div className="absolute inset-0 bg-overlay/40" onClick={() => setDrawer(false)} />
              <motion.aside
                data-works-ui
                className="paper-grain absolute inset-y-0 left-0 w-[min(288px,85vw)] border-r border-border/60 bg-sunken shadow-soft-xl"
                initial={{ x: -24 }}
                animate={{ x: 0 }}
                exit={{ x: -24 }}
                transition={TWEEN.base}
              >
                <SidebarBody
                  active={active}
                  onSelect={onSelect}
                  onHome={onHome}
                  collapsed={false}
                  onToggle={() => setDrawer(false)}
                  onDone={() => setDrawer(false)}
                />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <aside
      data-works-ui
      className={cn(
        "paper-grain relative z-40 h-full shrink-0 overflow-hidden border-r border-border/60 bg-sunken transition-[width] duration-slow ease-out-soft",
        collapsed ? "w-[52px]" : "w-[252px]",
      )}
    >
      <div className={cn("h-full", collapsed ? "w-[52px]" : "w-[252px]")}>
        <SidebarBody active={active} onSelect={onSelect} onHome={onHome} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </div>
    </aside>
  );
}
