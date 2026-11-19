import { Check, Save } from "lucide-react";
import { ButtonWithTooltip } from "@/shared/chat/button-with-tooltip";
import { createTranslator } from "@/shared/i18n/translator";
import { cn } from "@/shared/lib/utils";
import { useWork } from "./work-context";

const { useT } = createTranslator({
  "save.tip": { zh: "保存到「我的作品」", en: "Save to My works" },
  "save.dirtyTip": { zh: "有修改还没保存，点击保存", en: "Unsaved changes. Click to save" },
  "save.savedTip": { zh: "已保存。点击可改名", en: "Saved. Click to rename" },
});

/**
 * The Save button in a canvas's chat input bar, an icon like its neighbours.
 * Renders nothing outside the app shell (the skills reuse the chat input
 * without works).
 */
export function SaveWorkButton() {
  const t = useT();
  const work = useWork();
  if (!work) return null;
  const clean = work.saved && !work.dirty;
  const tip = clean ? t("save.savedTip") : work.saved ? t("save.dirtyTip") : t("save.tip");
  return (
    <ButtonWithTooltip
      type="button"
      variant="ghost"
      size="sm"
      data-works-ui=""
      onClick={() => work.save()}
      tooltipContent={tip}
      aria-label={tip}
      className={cn(
        "relative h-8 w-8 p-0 text-muted-foreground transition-[color,background-color,transform] duration-fast ease-out-soft hover:text-foreground active:scale-90",
      )}
    >
      {clean ? <Check className="h-4 w-4 text-primary" /> : <Save className="h-4 w-4" />}
      {work.dirty && <span aria-hidden className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
    </ButtonWithTooltip>
  );
}
