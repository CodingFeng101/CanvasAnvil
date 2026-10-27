import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/shared/lib/utils";
import { pressable, riseIn, staggerContainer } from "@/shared/motion";

interface ChatEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Ready-to-send prompts. Picking one fills the input rather than sending it, so it can be adjusted first. */
  examples: string[];
  examplesLabel: string;
  onPickExample: (text: string) => void;
  className?: string;
}

/**
 * What a chat panel shows before the first message.
 *
 * All four panels used to open on a blank column: nothing said what the
 * assistant could do or how to phrase a request, and the diagram panel's old
 * welcome screen had been lost in the refactor. One shared shape keeps the
 * four reading as one product -- a line on what this canvas is for, and a few
 * concrete requests to start from.
 */
export function ChatEmptyState({
  icon: Icon,
  title,
  description,
  examples,
  examplesLabel,
  onPickExample,
  className,
}: ChatEmptyStateProps) {
  return (
    <motion.div
      initial="hidden"
      animate="shown"
      variants={staggerContainer(0.06, 0.05)}
      className={cn("flex h-full w-full flex-col justify-center overflow-y-auto px-5 py-8", className)}
    >
      <motion.div variants={riseIn} className="relative mb-5 flex size-12 items-center justify-center">
        {/* A soft halo that breathes behind the mark, so the empty panel reads
            as waiting rather than broken. */}
        <span aria-hidden className="absolute inset-0 rounded-2xl bg-primary/15 blur-md animate-breathe" />
        <span className="relative flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary-strong">
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
      </motion.div>

      <motion.h3 variants={riseIn} className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </motion.h3>
      <motion.p variants={riseIn} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </motion.p>

      <motion.div variants={riseIn} className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground/80">
        {examplesLabel}
      </motion.div>
      <div className="mt-2 flex flex-col gap-2">
        {examples.map((example) => (
          <motion.button
            key={example}
            type="button"
            variants={riseIn}
            {...pressable}
            onClick={() => onPickExample(example)}
            className={cn(
              "group flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 text-left text-sm leading-snug text-foreground/85 shadow-xs",
              "transition-[border-color,background-color,color,box-shadow] duration-fast ease-out-soft",
              "hover:border-primary/40 hover:bg-primary/[0.04] hover:text-foreground hover:shadow-soft",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
            )}
          >
            <span className="flex-1">{example}</span>
            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/60 transition-[transform,color] duration-fast ease-out-soft group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-strong" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
