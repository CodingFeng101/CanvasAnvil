import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import type { EditableExport, EditableExportSlide } from "@/workspaces/ppt/canvas/hooks/use-editable-export";

/** Fewer than three rounds leaves too little room to fix what the first check finds. */
const MIN_QA_ROUNDS = 3;
const MAX_QA_ROUNDS = 10;
const DEFAULT_QA_ROUNDS = MIN_QA_ROUNDS;

/** The settings asked before an editable export: which pages, how many check-and-fix rounds. */
export function EditableExportDialog(props: {
  editable: EditableExport;
  slides: EditableExportSlide[];
  tr: (zh: string, en: string) => string;
}) {
  const { editable, slides, tr } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rounds, setRounds] = useState(String(DEFAULT_QA_ROUNDS));

  // Every page is chosen each time the dialog opens.
  useEffect(() => {
    if (editable.dialogOpen) setSelected(new Set(slides.map((slide) => slide.id)));
  }, [editable.dialogOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const roundsValue = Number(rounds);
  const roundsValid = Number.isInteger(roundsValue) && roundsValue >= MIN_QA_ROUNDS && roundsValue <= MAX_QA_ROUNDS;
  const chosen = slides.filter((slide) => selected.has(slide.id));
  const allChosen = chosen.length === slides.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open={editable.dialogOpen} onOpenChange={editable.setDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("导出可编辑 PPTX", "Export editable PPTX")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-foreground">{tr("导出页面", "Pages")}</span>
              <button
                type="button"
                className="text-xs text-primary-strong hover:underline"
                onClick={() => setSelected(allChosen ? new Set() : new Set(slides.map((slide) => slide.id)))}
              >
                {allChosen ? tr("全不选", "Select none") : tr("全选", "Select all")}
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {slides.map((slide, index) => (
                <label key={slide.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent">
                  <input type="checkbox" checked={selected.has(slide.id)} onChange={() => toggle(slide.id)} />
                  <span className="tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="truncate text-foreground">{slide.title || tr("未命名页", "Untitled")}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="font-medium text-foreground">{tr("每页最多返工次数", "Fix rounds per page")}</span>
            <input
              type="number"
              min={MIN_QA_ROUNDS}
              max={MAX_QA_ROUNDS}
              value={rounds}
              onChange={(event) => setRounds(event.target.value)}
              onBlur={() => {
                // Out-of-range input snaps to the nearest allowed count rather than blocking the export.
                const n = Math.round(Number(rounds));
                setRounds(String(Number.isFinite(n) ? Math.min(MAX_QA_ROUNDS, Math.max(MIN_QA_ROUNDS, n)) : DEFAULT_QA_ROUNDS));
              }}
              className="mt-1.5 block h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {tr(
                `每页检查不过关就返工，${MIN_QA_ROUNDS}–${MAX_QA_ROUNDS} 次；次数越多越慢。`,
                `A page that fails its check is reworked; ${MIN_QA_ROUNDS}–${MAX_QA_ROUNDS} rounds, more is slower.`,
              )}
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            {tr("导出在服务端运行，通常需要 10 分钟左右，期间可以继续浏览。", "Runs on the server and usually takes about 10 minutes; you can keep working.")}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => editable.setDialogOpen(false)}>
            {tr("取消", "Cancel")}
          </Button>
          <Button disabled={chosen.length === 0 || !roundsValid} onClick={() => void editable.start(chosen, roundsValue)}>
            {tr(`开始导出（${chosen.length} 页）`, `Export ${chosen.length} page(s)`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
