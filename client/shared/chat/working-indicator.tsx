import { useEffect, useState } from "react";
import { addUsage, onUsage, type TokenUsage } from "@/ai/usage";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { AnvilMark } from "@/shared/chat/anvil-mark";
import { usePreferences } from "@/shared/preferences";

/*
 * The line that says the AI is at work, after Claude Code's: the anvil with
 * its hammer striking, a verb that changes every few seconds, how long it
 * has been going and, if the user wants it (Settings → Canvas), the tokens
 * the provider has reported so far. Never an estimate: no report, no number.
 */

export type WorkingKind = "diagram" | "cad" | "ppt" | "canvas";

const VERBS: Record<WorkingKind, { zh: string[]; en: string[] }> = {
  diagram: {
    zh: ["思考中", "理清结构", "排布节点", "连线中", "对齐中", "收拾版面"],
    en: ["Thinking", "Untangling", "Placing nodes", "Wiring up", "Aligning", "Tidying"],
  },
  cad: {
    zh: ["斟酌中", "量尺寸", "排房间", "画墙体", "摆家具", "复核中"],
    en: ["Mulling", "Measuring", "Laying out rooms", "Raising walls", "Furnishing", "Checking"],
  },
  ppt: {
    zh: ["构思中", "列提纲", "排版中", "配色中", "打磨文字", "润色中"],
    en: ["Brainstorming", "Outlining", "Laying out", "Picking colours", "Polishing copy", "Refining"],
  },
  canvas: {
    zh: ["落笔中", "构图中", "调色中", "勾勒中", "上色中", "收尾中"],
    en: ["Sketching", "Composing", "Mixing colours", "Outlining", "Painting", "Finishing"],
  },
};

function formatTokens(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/**
 * The tokens one turn used, as the model calls report them (a turn can make
 * several: a plan, a draft, repairs). Starts over each time `active` turns on.
 */
export function useTurnUsage(active: boolean): TokenUsage | null {
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  useEffect(() => onUsage((report) => setUsage((prev) => addUsage(prev, report))), []);
  useEffect(() => {
    if (active) setUsage(null);
  }, [active]);
  return usage;
}

function usageParts(usage: TokenUsage | null | undefined, zh: boolean, short: boolean): string[] {
  if (!usage) return [];
  const parts: string[] = [];
  if (usage.input !== undefined) parts.push(short ? `↑ ${formatTokens(usage.input)}` : `${zh ? "输入" : "Input"} ${usage.input.toLocaleString()}`);
  if (usage.output !== undefined) parts.push(short ? `↓ ${formatTokens(usage.output)}` : `${zh ? "输出" : "Output"} ${usage.output.toLocaleString()}`);
  return parts;
}

/** Under a finished reply: the tokens the provider reported for it. Nothing when it reported none. */
export function TokenUsageLine({ usage, className }: { usage: TokenUsage | null | undefined; className?: string }) {
  const zh = useUiLanguage() === "zh";
  const prefs = usePreferences();
  const parts = usageParts(usage, zh, false);
  if (!prefs.showTokens || parts.length === 0) return null;
  return <p className={cn("mt-1.5 text-[12px] tabular-nums text-muted-foreground/75", className)}>{parts.join(" · ")} tokens</p>;
}

export function WorkingIndicator({
  kind,
  usage,
  label,
  className,
}: {
  kind: WorkingKind;
  /** Tokens the provider has reported so far this turn (from calls already finished). */
  usage?: TokenUsage | null;
  /** A fixed label instead of the rotating verbs (e.g. "Reading files"). */
  label?: string;
  className?: string;
}) {
  const zh = useUiLanguage() === "zh";
  const prefs = usePreferences();
  const [start] = useState(() => Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const verbs = VERBS[kind][zh ? "zh" : "en"];
  const seconds = Math.floor((Date.now() - start) / 1000);
  const verb = label ?? verbs[Math.floor(seconds / 3) % verbs.length];
  const tokens = prefs.showTokens ? usageParts(usage, zh, true) : [];

  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2 py-1 text-[13px] text-muted-foreground", className)}>
      <AnvilMark className="size-[18px] text-brand" />
      <span key={verb} className="text-foreground/80 animate-in fade-in duration-base">
        {verb}…
      </span>
      <span className="tabular-nums text-muted-foreground/80">
        ({[`${seconds}s`, ...tokens].join(" · ")}{tokens.length ? " tokens" : ""})
      </span>
    </div>
  );
}
