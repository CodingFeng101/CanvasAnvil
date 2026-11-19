import { Check, Save } from "lucide-react";
import { ButtonWithTooltip } from "@/shared/chat/button-with-tooltip";
import { createTranslator } from "@/shared/i18n/translator";
import { cn } from "@/shared/lib/utils";
import { useWork } from "./work-context";

const { useT } = createTranslator({
  "save.button": { zh: "保存", en: "Save" },
  "save.saved": { zh: "已保存", en: "Saved" },
  "save.tip": { zh: "保存到「我的作品」，之后的修改会自动保存", en: "Save to My works; later edits save on their own" },
  "save.savedTip": { zh: "已保存到「我的作品」，修改会自动保存。点击可改名", en: "Saved to My works; edits save on their own. Click to rename" },
});

/**
 * The Save button in a canvas's chat input bar. Renders nothing outside the
 * app shell (the skills reuse the chat input without works).
 */
export function SaveWorkButton() {
  const t = useT();
  const work = useWork();
  if (!work) return null;
  return (
    <ButtonWithTooltip
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => work.save()}
      tooltipContent={work.saved ? t("save.savedTip") : t("save.tip")}
      className={cn(
        "h-8 gap-1 px-2 text-[13px] font-medium transition-[color,background-color,transform] duration-fast ease-out-soft active:scale-95",
        work.saved ? "text-muted-foreground hover:text-foreground" : "text-foreground",
      )}
    >
      {work.saved ? <Check className="h-4 w-4 text-primary" /> : <Save className="h-4 w-4" />}
      {work.saved ? t("save.saved") : t("save.button")}
    </ButtonWithTooltip>
  );
}
