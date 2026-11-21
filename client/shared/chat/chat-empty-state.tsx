import { useState } from "react";
import { type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { pressable, riseIn, staggerContainer } from "@/shared/motion";

/** A greeting for the hour, the way claude.ai opens a new chat. */
export function greetingFor(hour: number, lang: UiLanguage): string {
  const zh = lang === "zh";
  if (hour >= 5 && hour < 8) return zh ? "清晨好" : "Good morning";
  if (hour >= 8 && hour < 11) return zh ? "上午好" : "Good morning";
  if (hour >= 11 && hour < 13) return zh ? "中午好" : "Good afternoon";
  if (hour >= 13 && hour < 17) return zh ? "午后好" : "Good afternoon";
  if (hour >= 17 && hour < 19) return zh ? "傍晚好" : "Good evening";
  if (hour >= 19 && hour < 23) return zh ? "晚上好" : "Good evening";
  return zh ? "夜深了" : "Burning the midnight oil";
}

interface ChatEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
}

/**
 * The top half of a new work, as claude.ai opens a new chat: the hour's
 * greeting and what this canvas is for, sitting just above the input, which
 * the panel centres while nothing has been said. The examples and recent
 * works sit under the input (ChatLandingExtras).
 */
export function ChatEmptyState({ icon: Icon, title, description, className }: ChatEmptyStateProps) {
  const lang = useUiLanguage();
  // The hour is read once per mount, so the greeting does not change under the reader.
  const [hour] = useState(() => new Date().getHours());
  const greeting = greetingFor(hour, lang);
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      variants={staggerContainer(0.06, 0.05)}
      className={cn("chat-measure flex h-full w-full flex-col items-center justify-end overflow-y-auto px-6 pb-7 pt-8 text-center [--chat-measure:720px]", className)}
    >
      <motion.h2 variants={riseIn} className="flex items-center justify-center gap-3 font-display text-[30px] font-normal leading-tight tracking-[-0.01em] text-foreground">
        <Icon className="size-[26px] shrink-0 text-brand" strokeWidth={1.6} aria-hidden />
        <span>{greeting}</span>
      </motion.h2>
      <motion.p variants={riseIn} className="mt-3 max-w-[520px] text-[14.5px] leading-[1.7] text-muted-foreground [text-wrap:balance]">
        <span className="text-foreground/80">{title}</span>
        {description ? <span> {description}</span> : null}
      </motion.p>
    </motion.div>
  );
}

/**
 * Under the input on a new work: three requests to start from, each with the
 * picture that request really made. Picking one sends it.
 */
export function ChatLandingExtras({
  examples,
  images,
  onPickExample,
  className,
}: {
  /** Kept for the panels' call sites; the cards carry their own pictures. */
  icon?: LucideIcon;
  examples: string[];
  /** The picture each example made, in the same order. */
  images?: string[];
  onPickExample: (text: string) => void;
  className?: string;
}) {
  const shown = examples.slice(0, 3);
  return (
    <motion.div initial="hidden" animate="shown" variants={staggerContainer(0.05, 0.12)} className={cn("chat-measure min-h-0 flex-1 overflow-hidden px-4 pb-6 [--chat-measure:720px]", className)}>
      <div className={cn("grid gap-3 pt-1", shown.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
        {shown.map((example, index) => (
          <motion.button
            key={example}
            type="button"
            variants={riseIn}
            {...pressable}
            title={example}
            onClick={() => onPickExample(example)}
            className="group overflow-hidden rounded-xl border border-border/80 bg-card/60 text-left transition-[background-color,border-color,box-shadow,transform] duration-fast ease-out-soft hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-card hover:shadow-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
          >
            {images?.[index] && (
              <span className="block aspect-[16/10] overflow-hidden border-b border-border/60 bg-white p-1">
                <img src={images[index]} alt="" loading="lazy" className="h-full w-full object-contain transition-transform duration-slow ease-out-soft group-hover:scale-[1.03]" />
              </span>
            )}
            {/* Padding on the outer span: inside the clamped one it would show a sliver of the third line. */}
            <span className="block px-3 py-2">
              <span className="line-clamp-2 text-[12.5px] leading-snug text-foreground/80 group-hover:text-foreground">{example}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
