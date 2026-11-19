import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FolderOpen, ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { t as tShell, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { listedWorks, type WorkMeta } from "@/shared/works/works-index";
import type { WorksState } from "@/shared/works/works-store";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { useWorksT } from "./strings";
import { useWorksControl } from "./works-provider";

type Filter = WorkspaceId | "all";

interface Row {
  workspace: WorkspaceId;
  work: WorkMeta;
  isOpen: boolean;
}

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

/** The header's My works button and the list of every canvas's saved works. */
export function WorksButton() {
  const t = useWorksT();
  const lang = useUiLanguage();
  const control = useWorksControl();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState<Record<WorkspaceId, WorksState> | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const storageMissing = typeof indexedDB === "undefined";

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
  const newTarget: WorkspaceId = filter === "all" ? control.active?.workspace ?? WORKSPACES[0].id : filter;

  const openRow = async (workspace: WorkspaceId, id: string | null) => {
    if (await control.openWork(workspace, id)) setOpen(false);
  };

  return (
    <>
      <button type="button" className={headerButton} onClick={() => setOpen(true)}>
        <FolderOpen className="h-4 w-4" />
        <span className="hidden sm:inline">{t("works.open")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A fixed size, like a settings window: the list scrolls inside instead of the window growing. */}
        <DialogContent className="flex h-[min(640px,calc(100vh-4rem))] flex-col overflow-hidden sm:max-w-[min(56rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>{t("works.title")}</DialogTitle>
            <DialogDescription>{storageMissing ? t("works.unavailable") : t("works.desc")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1" role="tablist">
              {(["all", ...WORKSPACES.map((w) => w.id)] as Filter[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                    filter === id ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {id === "all" ? t("works.all") : label(id)}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => void openRow(newTarget, null)}>
              <Plus className="h-4 w-4" />
              {t("works.newIn", { canvas: label(newTarget) })}
            </Button>
          </div>

          <ScrollArea className="min-h-0 flex-1 -mx-2 px-2">
            {!all ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t("works.loading")}</p>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{t("works.empty")}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map(({ workspace, work, isOpen }) => {
                  const key = `${workspace}:${work.id}`;
                  return (
                    <li key={key} className="group relative overflow-hidden rounded-xl border border-border/70 bg-card">
                      <button type="button" className="block w-full text-left" onClick={() => void openRow(workspace, work.id)}>
                        <div className="flex aspect-[16/10] items-center justify-center bg-muted/40">
                          {work.thumb ? (
                            <img src={work.thumb} alt="" className="h-full w-full object-contain" />
                          ) : (
                            <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                          )}
                        </div>
                      </button>
                      <div className="space-y-1 p-3">
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
                            <Input autoFocus value={renaming.name} maxLength={80} onChange={(e) => setRenaming({ key, name: e.target.value })} className="h-8" />
                            <Button type="submit" size="sm">
                              <Check className="h-4 w-4" />
                            </Button>
                          </form>
                        ) : (
                          <p className="truncate text-sm font-medium" title={work.name}>
                            {work.name}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="rounded-md bg-muted px-1.5 py-0.5">{label(workspace)}</span>
                          {isOpen && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-primary-strong">{t("works.current")}</span>}
                          <span className="truncate">{t("works.updated", { time: formatTime(work.updatedAt, lang) })}</span>
                        </div>
                        {confirmDelete === key ? (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <span className="text-xs text-destructive">{t("works.deleteConfirm", { name: work.name })}</span>
                            <div className="flex shrink-0 gap-1">
                              <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
                                {t("save.cancel")}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setConfirmDelete(null);
                                  void control.removeWork(workspace, work.id);
                                }}
                              >
                                {t("works.delete")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1 pt-1">
                            <Button size="sm" variant="ghost" onClick={() => setRenaming({ key, name: work.name })}>
                              <Pencil className="h-3.5 w-3.5" />
                              {t("works.rename")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void control.duplicateWork(workspace, work.id)}>
                              <Copy className="h-3.5 w-3.5" />
                              {t("works.duplicate")}
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(key)}>
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("works.delete")}
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
