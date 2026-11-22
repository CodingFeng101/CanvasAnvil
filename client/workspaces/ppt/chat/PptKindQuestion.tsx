import { Check } from "lucide-react";
import type { AskKindState } from "@/workspaces/ppt/lib/creation-intent";

/**
 * "Restyle this PDF, or make a deck from it?": asked when files with a PDF come without a word.
 * Once answered it stays as a line saying which was picked.
 */
export function PptKindQuestion({
  state,
  canAct,
  expired,
  onPick,
  tr,
}: {
  state: AskKindState;
  /** The files are still here and nothing else is running. */
  canAct: boolean;
  /** The files are gone (the page was reloaded): they have to be sent again. */
  expired: boolean;
  onPick(kind: "beautify" | "idea"): void;
  tr: (zh: string, en: string) => string;
}) {
  if (state.picked) {
    return (
      <p className="my-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Check className="size-3.5" />
        {state.picked === "beautify" ? tr("逐页美化这份 PDF", "Restyle the PDF page by page") : tr("根据这些资料做一份新 PPT", "Make a new deck from these files")}
      </p>
    );
  }
  const option = "flex h-9 items-center rounded-lg border border-border bg-background px-3.5 text-[13px] text-foreground transition-colors hover:bg-foreground/[0.04] disabled:opacity-50";
  return (
    <div className="my-1 space-y-2.5">
      <p className="text-[15px] leading-relaxed text-foreground">{tr("收到了文件。想用它做什么？", "Got the files. What should I do with them?")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={option} disabled={!canAct} onClick={() => onPick("idea")}>
          {tr("根据资料做一份新 PPT", "Make a new deck from them")}
        </button>
        <button type="button" className={option} disabled={!canAct} onClick={() => onPick("beautify")}>
          {tr("逐页美化这份 PDF", "Restyle the PDF page by page")}
        </button>
      </div>
      <p className="text-[12px] text-muted-foreground">
        {expired
          ? tr("页面刷新过，文件没有保留，请重新上传一次。", "The page was reloaded and the files were not kept; please send them again.")
          : tr("也可以直接在下面写要求，比如“做一份给业主的装修汇报”。", "Or write what you want below, such as \"a renovation report for the owner\".")}
      </p>
    </div>
  );
}
