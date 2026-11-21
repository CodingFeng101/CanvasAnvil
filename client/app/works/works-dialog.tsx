import { useEffect, useMemo, useState, type ReactNode } from "react";
import { OPEN_WORKS_EVENT } from "@/shared/works/work-context";
import { Check, Copy, FolderOpen, ImageOff, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { t as tShell, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { listedWorks, type WorkMeta } from "@/shared/works/works-index";
import type { WorksState } from "@/shared/works/works-store";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { BlankPage } from "@/shared/ui/ornaments";
import { useWorksT } from "./strings";
import { useWorksControl } from "./works-provider";
import { PptTemplateLibrary } from "@/workspaces/ppt/canvas/views/StylePicker";

/** A canvas, every canvas, or the PPT template library (not works, but kept here too). */
type Filter = WorkspaceId | "all" | "templates";

interface Row {
  workspace: WorkspaceId;
  work: WorkMeta;
  isOpen: boolean;
}

/** An icon action over a work card's picture. */
const cardAction =
  "flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

const headerButton =
  "flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-[background-color,color] duration-fast ease-out-soft hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50 disabled:pointer-events-none";

function formatTime(time: number, lang: UiLanguage) {
  try {
    return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return new Date(time).toLocaleString();
  }
}

/**
 * My works: the list of every canvas's saved works, behind a trigger. The
 * sidebar draws its own trigger row through `renderTrigger`.
 */
export function WorksButton({ renderTrigger }: { renderTrigger?: (open: () => void) => ReactNode } = {}) {
  const t = useWorksT();
  const lang = useUiLanguage();
  const control = useWorksControl();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState<Record<WorkspaceId, WorksState> | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  // Deleting asks in a small window; the card itself stays as it is.
  const [confirmDelete, setConfirmDelete] = useState<{ workspace: WorkspaceId; id: string; name: string } | null>(null);
  const storageMissing = typeof indexedDB === "undefined";

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_WORKS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WORKS_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) setFilter(control.active?.workspace ?? "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void control
      .loadAll()
      .then((state) => !cancelled && setAll(state))
      .catch((error) => console.error("Failed to list works", error));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, control.revision]);

  const rows = useMemo<Row[]>(() => {
    if (!all) return [];
    const out: Row[] = [];
    for (const { id } of WORKSPACES) {
      if (filter !== "all" && filter !== id) continue;
      const state = all[id];
      if (!state) continue;
      for (const work of listedWorks(state.index)) out.push({ workspace: id, work, isOpen: state.currentId === work.id });
    }
    return out.sort((a, b) => b.work.updatedAt - a.work.updatedAt);
  }, [all, filter]);

  const label = (workspace: WorkspaceId) => tShell(lang, WORKSPACES.find((w) => w.id === workspace)!.labelKey);

  const openRow = async (workspace: WorkspaceId, id: string | null) => {
    if (await control.openWork(workspace, id)) setOpen(false);
  };

  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <button type="button" className={headerButton} onClick={() => setOpen(true)}>
          <FolderOpen className="h-4 w-4" />
          <span className="hidden sm:inline">{t("works.open")}</span>
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A fixed size, like a settings window: the list scrolls inside instead of the window growing. */}
        <DialogContent className="flex h-[min(760px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(68rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>{t("works.title")}</DialogTitle>
            <DialogDescription>{storageMissing ? t("works.unavailable") : t("works.desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Docs-style pills: grey text, the chosen one on an ink wash. */}
            <div className="flex flex-wrap gap-1" role="tablist">
              {(["all", ...WORKSPACES.map((w) => w.id)] as Filter[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={cn(
                    "h-7 rounded-full px-3 text-[13.5px] transition-colors duration-fast ease-out-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                    filter === id ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  {id === "all" ? t("works.all") : label(id as WorkspaceId)}
                </button>
              ))}
              <span aria-hidden className="mx-1.5 my-1 w-px bg-border" />
              <button
                type="button"
                role="tab"
                aria-selected={filter === "templates"}
                onClick={() => setFilter("templates")}
                className={cn(
                  "h-7 rounded-full px-3 text-[13.5px] transition-colors duration-fast ease-out-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                  filter === "templates" ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                {lang === "zh" ? "PPT 模板库" : "PPT templates"}
              </button>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 -mx-2 px-2">
            {filter === "templates" ? (
              <div className="pb-2 pt-1">
                <PptTemplateLibrary />
              </div>
            ) : !all ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t("works.loading")}</p>
            ) : rows.length === 0 ? (
              <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
                <BlankPage className="h-14 w-[66px] text-brand opacity-70" />
                <p className="aside-voice mt-5 text-[18px] leading-snug text-foreground/85">{t("works.emptyTitle")}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t("works.empty")}</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 pb-2 sm:grid-cols-4 lg:grid-cols-6">
                {rows.map(({ workspace, work, isOpen }) => {
                  const key = `${workspace}:${work.id}`;
                  return (
                    <li key={key} className="group relative overflow-hidden rounded-lg border border-border/80 bg-card transition-[border-color,box-shadow] duration-fast ease-out-soft hover:border-foreground/20 hover:shadow-[0_4px_20px_hsl(var(--shadow-hue)/0.06)]">
                      <button type="button" className="block w-full text-left" onClick={() => void openRow(workspace, work.id)}>
                        <div className="flex aspect-[16/10] items-center justify-center border-b border-border/60 bg-sunken">
                          {work.thumb ? (
                            <img src={work.thumb} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <ImageOff className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
                          )}
                        </div>
                      </button>
                      {/* Small cards: the actions are icons over the picture, shown on hover. */}
                      {renaming?.key !== key && (
                        <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-md bg-background/90 p-0.5 opacity-0 shadow-sm ring-1 ring-border backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button type="button" aria-label={t("works.rename")} className={cardAction} onClick={() => setRenaming({ key, name: work.name })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label={t("works.duplicate")} className={cardAction} onClick={() => void control.duplicateWork(workspace, work.id)}>
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label={t("works.delete")} className={cn(cardAction, "text-destructive hover:text-destructive")} onClick={() => setConfirmDelete({ workspace, id: work.id, name: work.name })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="space-y-0.5 px-2.5 pb-2 pt-2">
                        {renaming?.key === key ? (
                          <form
                            className="flex gap-1.5"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const name = renaming.name.trim();
                              if (name) void control.renameWork(workspace, work.id, name);
                              setRenaming(null);
                            }}
                          >
                            <Input autoFocus value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ key, name: e.target.value })} className="h-7 px-2 text-[13px]" />
                            <Button type="submit" size="sm" className="h-7 px-2">
                              <Check className="h-4 w-4" />
                            </Button>
                          </form>
                        ) : (
                          <p className="truncate text-[13px] font-medium" title={work.name}>
                            {work.name}
                          </p>
                        )}
                        <div className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                          {isOpen && <span className="shrink-0 rounded-full bg-foreground/[0.08] px-1.5 text-foreground">{t("works.current")}</span>}
                          <span className="shrink-0">{label(workspace)}</span>
                          <span aria-hidden>·</span>
                          <span className="truncate" title={t("works.updated", { time: formatTime(work.updatedAt, lang) })}>{formatTime(work.updatedAt, lang)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle>{t("works.delete")}</DialogTitle>
                <DialogDescription>{confirmDelete ? t("works.deleteConfirm", { name: confirmDelete.name }) : ""}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                  {t("save.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirmDelete) void control.removeWork(confirmDelete.workspace, confirmDelete.id);
                    setConfirmDelete(null);
                  }}
                >
                  {t("works.delete")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
