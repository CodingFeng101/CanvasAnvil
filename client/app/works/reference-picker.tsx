import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ImageOff, Loader2 } from "lucide-react";
import { errorText, notify } from "@/shared/ui/notify";
import { acceptsReferenceItem, referenceSourcesFor } from "@/shared/references/sources";
import { cn } from "@/shared/lib/utils";
import { t as tShell, useUiLanguage } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { ScrollArea } from "@/shared/ui/scroll-area";
import { listedWorks, type WorkMeta } from "@/shared/works/works-index";
import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import { registerCanvasOpener, registerReferencePicker, registerWorkValueWriter, type ReferencePickerRequest } from "@/shared/references/bus";
import type { ReferenceExtract, ReferenceItem, WorkReference } from "@/shared/references/types";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { useWorksT } from "./strings";
import { useWorksControl } from "./works-provider";
import { worksStoreFor } from "./works-registry";

/**
 * "Reference a work": pick a work of another canvas, tick what of it to take,
 * and hand the copy back to the canvas that asked (shared/references/bus.ts).
 * Each canvas says what its works offer (workspaces/<canvas>/references.ts).
 */

type Lang = "zh" | "en";
type Extractor = (store: WorkspaceStore, lang: Lang, work: WorkMeta, open: (workspace: WorkspaceId, id: string) => void) => Promise<ReferenceExtract>;

const EXTRACTORS: Record<WorkspaceId, Extractor> = {
  // Loaded on demand, so the picker adds nothing to the first load.
  canvas: async (store, lang) => (await import("@/workspaces/canvas/references")).extractCanvasReference(store, lang),
  ppt: async (store, lang) => (await import("@/workspaces/ppt/references")).extractPptReference(store, lang),
  diagram: async (store, lang, work) => (await import("@/workspaces/diagram/references")).extractDiagramReference(store, lang, work.thumb),
  cad: async (store, lang, work, open) => (await import("@/workspaces/cad/references")).extractCadReference(store, lang, () => open("cad", work.id)),
};

interface Row {
  workspace: WorkspaceId;
  work: WorkMeta;
}

type Filter = WorkspaceId | "all";

export function ReferencePickerHost() {
  const control = useWorksControl();
  const lang = useUiLanguage() as Lang;
  const t = useWorksT();
  const [request, setRequest] = useState<ReferencePickerRequest | null>(null);
  const resolverRef = useRef<((value: WorkReference | null) => void) | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [chosen, setChosen] = useState<Row | null>(null);
  const [extract, setExtract] = useState<ReferenceExtract | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const finish = useCallback((value: WorkReference | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    // The choice stays on screen while the dialog fades out; opening resets it.
    setRequest(null);
    setBusy(false);
  }, []);

  useEffect(
    () =>
      registerReferencePicker(
        (next) =>
          new Promise((resolve) => {
            resolverRef.current?.(null);
            resolverRef.current = resolve;
            setRows(null);
            setChosen(null);
            setExtract(null);
            setFilter("all");
            setRequest(next);
          }),
      ),
    [],
  );

  useEffect(
    () =>
      registerCanvasOpener((workspace, workId) =>
        workId === undefined ? control.openCanvas(workspace) : control.openWork(workspace, workId),
      ),
    [control],
  );

  useEffect(
    () =>
      registerWorkValueWriter(async (workspace, workId, key, update) => {
        const works = worksStoreFor(workspace);
        const { index } = await works.ensure(lang);
        if (!index.some((work) => work.id === workId)) return false;
        const store = works.storeFor(workId);
        const previous = await store.read(key).catch(() => null);
        await store.save(key, update((previous ?? null) as never));
        return true;
      }),
    [lang],
  );

  useEffect(() => {
    if (!request) return;
    let cancelled = false;
    void control.loadAll().then((all) => {
      if (cancelled) return;
      const list: Row[] = [];
      const sources = referenceSourcesFor(request.from.workspace);
      for (const { id } of WORKSPACES) {
        // Only canvases this one has a use for (never itself: within one canvas a work is copied).
        if (!sources.includes(id)) continue;
        const state = all[id];
        if (!state) continue;
        for (const work of listedWorks(state.index)) {
          list.push({ workspace: id, work });
        }
      }
      list.sort((a, b) => b.work.updatedAt - a.work.updatedAt);
      setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, [request, control]);

  const openWork = useCallback(
    (workspace: WorkspaceId, id: string) => {
      finish(null);
      void control.openWork(workspace, id);
    },
    [control, finish],
  );

  const choose = (row: Row) => {
    if (!request) return;
    setChosen(row);
    setExtract(null);
    void EXTRACTORS[row.workspace](worksStoreFor(row.workspace).storeFor(row.work.id), lang, row.work, openWork)
      .then((result) => {
        if ("items" in result) {
          const items = result.items.filter(
            (item) => request.accept.includes(item.kind) && acceptsReferenceItem(request.from.workspace, row.workspace, item),
          );
          setExtract({ ...result, items });
          setTicked(new Set(items.filter((item) => item.defaultOn).map((item) => item.id)));
        } else setExtract(result);
      })
      .catch((error) => {
        console.error("[references] could not read the work", error);
        setExtract({ blocked: { title: lang === "zh" ? "没能读取这个作品" : "Could not read this work", detail: errorText(error) } });
      });
  };

  const confirm = async () => {
    if (!chosen || !extract) return;
    if ("blocked" in extract) {
      // Not taken: what is wrong, what to do, and the button that does it.
      const { title, detail, action } = extract.blocked;
      notify.warning(title, { description: detail, action: action ? { label: action.label, onClick: action.run } : undefined });
      return;
    }
    setBusy(true);
    const items: ReferenceItem[] = [];
    for (const item of extract.items) {
      if (!ticked.has(item.id)) continue;
      if (item.dataUrl || item.kind === "text" || !item.resolve) {
        items.push({ ...item, resolve: undefined });
        continue;
      }
      try {
        items.push({ ...item, dataUrl: await item.resolve(), resolve: undefined });
      } catch (error) {
        console.error("[references] could not produce", item.label, error);
        notify.warning(lang === "zh" ? `「${item.label}」没能生成` : `Could not produce "${item.label}"`, { description: lang === "zh" ? "这一项已跳过，其余的照常带过去。" : "It was skipped; the rest are brought over." });
      }
    }
    finish(items.length ? { workspace: chosen.workspace, workId: chosen.work.id, workName: chosen.work.name, items, revision: extract.revision } : null);
  };

  const shown = useMemo(() => (rows ?? []).filter((row) => filter === "all" || row.workspace === filter), [rows, filter]);
  const items = extract && "items" in extract ? extract.items : [];
  const canvasName = (id: WorkspaceId) => tShell(lang, WORKSPACES.find((w) => w.id === id)!.labelKey);

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && !busy && finish(null)}>
      <DialogContent aria-describedby={undefined} className="flex h-[min(680px,calc(100vh-3rem))] flex-col overflow-hidden sm:max-w-[min(60rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>{t("ref.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...WORKSPACES.map((w) => w.id).filter((id) => !!request && referenceSourcesFor(request.from.workspace).includes(id))] as Filter[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[13px] transition-colors",
                filter === id ? "bg-foreground/[0.08] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
              )}
            >
              {id === "all" ? t("works.all") : canvasName(id)}
            </button>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
          <ScrollArea className="min-h-0">
            {!rows ? (
              <p className="p-4 text-sm text-muted-foreground">{t("works.loading")}</p>
            ) : shown.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{t("ref.none")}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2.5 pb-2 sm:grid-cols-3">
                {shown.map((row) => {
                  const active = chosen?.workspace === row.workspace && chosen.work.id === row.work.id;
                  return (
                    <li key={`${row.workspace}:${row.work.id}`}>
                      <button
                        type="button"
                        onClick={() => choose(row)}
                        className={cn(
                          "flex w-full flex-col overflow-hidden rounded-xl border text-left transition-colors",
                          active ? "border-foreground/50 ring-2 ring-foreground/15" : "border-border hover:border-foreground/25",
                        )}
                      >
                        <span className="flex aspect-[4/3] w-full items-center justify-center bg-muted/40">
                          {row.work.thumb ? <img src={row.work.thumb} alt="" className="h-full w-full object-contain" /> : <ImageOff className="size-5 text-muted-foreground/60" />}
                        </span>
                        <span className="truncate px-2.5 pt-2 text-[13px] text-foreground">{row.work.name}</span>
                        <span className="truncate px-2.5 pb-2 text-[11px] text-muted-foreground">{canvasName(row.workspace)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <div className="flex min-h-0 flex-col border-t border-border pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            {!chosen ? (
              <p className="text-sm text-muted-foreground">{t("ref.pick")}</p>
            ) : !extract ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("works.loading")}
              </p>
            ) : "blocked" in extract ? (
              <p className="truncate text-sm font-medium text-foreground">{chosen.work.name}</p>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-foreground">{chosen.work.name}</p>
                  {items.length > 0 && (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
                      onClick={() => setTicked(ticked.size === items.length ? new Set() : new Set(items.map((item) => item.id)))}
                    >
                      {ticked.size === items.length ? t("ref.none.tick") : t("ref.all")}
                    </button>
                  )}
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("ref.empty")}</p>
                  ) : (
                    <ul className="space-y-1 pr-2">
                      {items.map((item, index) => {
                        const on = ticked.has(item.id);
                        // A row sits under its group's first row only when it belongs to that one (a slide's
                        // earlier versions and materials), and then says only what it adds ("历史版本 1").
                        // Items merely of one kind (a design's texts, its files) stay a flat list.
                        const head = item.group && items[index - 1]?.group === item.group ? items.find((other) => other.group === item.group)?.label : undefined;
                        const nested = !!head && item.label.startsWith(`${head} · `);
                        const label = nested && head ? item.label.slice(head.length + 3) : item.label;
                        const preview = item.kind === "image" ? item.dataUrl || item.thumb : undefined;
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => {
                                const next = new Set(ticked);
                                if (on) next.delete(item.id);
                                else next.add(item.id);
                                setTicked(next);
                              }}
                              className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-foreground/[0.04]", nested && "pl-6")}
                            >
                              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-foreground bg-foreground text-background" : "border-foreground/30")}>
                                {on && <Check className="size-3" />}
                              </span>
                              {preview ? <img src={preview} alt="" className="size-8 shrink-0 rounded border border-border object-cover" /> : null}
                              <span className="line-clamp-2 min-w-0 flex-1 break-words" title={item.label}>{label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => finish(null)} disabled={busy}>
            {t("save.cancel")}
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || !extract || ("items" in extract && ticked.size === 0)}>
            {busy && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {t("ref.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
