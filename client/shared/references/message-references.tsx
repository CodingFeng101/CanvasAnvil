import { FileCode, Layers, Paintbrush, Presentation, type LucideIcon } from "lucide-react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { usePeek } from "@/shared/ui/peek";
import type { SentReference } from "./message-marker";
import type { ReferenceWorkspace } from "./types";

/**
 * The works a sent message referenced, shown above its bubble next to the other attachments: one
 * card per work with its canvas's icon (the same as in the sidebar) and kind, never as the
 * Markdown file the text travelled in. Hovering shows what was taken.
 */

const ICON: Record<ReferenceWorkspace, LucideIcon> = { diagram: Layers, cad: FileCode, ppt: Presentation, canvas: Paintbrush };

export function MessageReferences({ references, className }: { references: SentReference[]; className?: string }) {
  if (!references.length) return null;
  return (
    <div className={cn("flex w-full flex-wrap justify-end gap-2", className)}>
      {references.map((reference, index) => (
        <SentReferenceCard key={index} reference={reference} />
      ))}
    </div>
  );
}

function SentReferenceCard({ reference }: { reference: SentReference }) {
  const lang = useUiLanguage();
  const canvas = ({ canvas: ["自由绘制", "Free drawing"], ppt: ["PPT", "PPT"], diagram: ["图表", "Diagram"], cad: ["室内设计", "Interior"] } as const)[reference.workspace][lang === "zh" ? 0 : 1];
  const kind = lang === "zh" ? `${canvas}画布` : `${canvas} canvas`;
  const taken = reference.labels.join(lang === "zh" ? "、" : ", ");
  const peek = usePeek({ title: reference.workName, text: reference.text.slice(0, 600) || taken, meta: [kind, taken].filter(Boolean).join(" · ") });
  const Icon = ICON[reference.workspace];
  return (
    <span {...peek} className="flex max-w-[16rem] items-center gap-2.5 rounded-xl border border-border/80 bg-card py-2 pl-2.5 pr-3.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.05] text-foreground/70">
        <Icon className="size-4" strokeWidth={1.8} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">{reference.workName || kind}</span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{kind}</span>
      </span>
    </span>
  );
}
