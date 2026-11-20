import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { useWorksControl } from "@/app/works/works-provider";
import { t, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { listedWorks, type WorkMeta } from "@/shared/works/works-index";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";

/*
 * Search across every canvas's works, after claude.ai's chat search: one
 * field at the top, the matches as rows below (canvas icon, name, how long
 * ago), arrows to move, Enter to open. Empty, it lists the latest works.
 * Ctrl/Cmd+K opens it from anywhere (wired in the sidebar).
 */

interface Row {
  workspace: WorkspaceId;
  work: WorkMeta;
}

const LIMIT = 50;

export function timeAgo(at: number, lang: UiLanguage): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  const zh = lang === "zh";
  if (minutes < 1) return zh ? "刚刚" : "just now";
  if (minutes < 60) return zh ? `${minutes} 分钟前` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return zh ? `${days} 天前` : `${days} d ago`;
  return new Date(at).toLocaleDateString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export function SearchWorksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const lang = useUiLanguage();
  const control = useWorksControl();
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const iconOf = useMemo(() => Object.fromEntries(WORKSPACES.map((w) => [w.id, w.icon])), []);
  const labelOf = (id: WorkspaceId) => t(lang, WORKSPACES.find((w) => w.id === id)!.labelKey);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    let cancelled = false;
    void control.loadAll().then((all) => {
      if (cancelled) return;
      const next: Row[] = [];
      for (const { id } of WORKSPACES) for (const work of listedWorks(all[id]?.index ?? [])) next.push({ workspace: id, work });
      next.sort((a, b) => b.work.updatedAt - a.work.updatedAt);
      setRows(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? rows.filter((r) => r.work.name.toLowerCase().includes(q)) : rows).slice(0, LIMIT);
  }, [rows, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onOpenChange(false);
    void control.openWork(row.workspace, row.work.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-works-ui
        className="top-[18%] max-w-[600px] translate-y-0 gap-0 overflow-hidden p-0 [&>button.absolute]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{lang === "zh" ? "搜索作品" : "Search works"}</DialogTitle>
        <div className="flex items-center gap-3 border-b border-border/70 px-4">
          <Search className="size-[18px] shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(matches[cursor]);
              }
            }}
            placeholder={lang === "zh" ? "搜索作品…" : "Search your works…"}
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <kbd className="shrink-0 rounded-md border border-border/80 px-1.5 py-0.5 font-sans text-[11px] text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2 scrollbar-thin">
          {!query.trim() && matches.length > 0 && (
            <div className="px-2.5 pb-1.5 pt-1 text-[12px] text-muted-foreground">{lang === "zh" ? "最近" : "Recent"}</div>
          )}
          {matches.length === 0 ? (
            <p className="px-3 py-10 text-center font-voice text-[14px] italic text-muted-foreground">
              {query.trim() ? (lang === "zh" ? "没有找到名字相符的作品。" : "No work by that name.") : t(lang, "sidebar.noRecent")}
            </p>
          ) : (
            <ul ref={listRef} role="listbox" className="flex flex-col gap-px">
              {matches.map((row, i) => {
                const Icon = iconOf[row.workspace];
                const on = i === cursor;
                return (
                  <li key={`${row.workspace}:${row.work.id}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-index={i}
                      onMouseMove={() => setCursor(i)}
                      onClick={() => choose(row)}
                      className={cn(
                        "flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors duration-fast",
                        on ? "bg-foreground/[0.06]" : "",
                      )}
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-sunken text-muted-foreground">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{row.work.name}</span>
                      <span className="shrink-0 text-[12px] text-muted-foreground">
                        {labelOf(row.workspace)} · {timeAgo(row.work.updatedAt, lang)}
                      </span>
                      <CornerDownLeft className={cn("size-3.5 shrink-0 text-muted-foreground transition-opacity", on ? "opacity-100" : "opacity-0")} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
