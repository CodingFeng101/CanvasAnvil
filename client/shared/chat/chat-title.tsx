import { useEffect, useRef, useState } from "react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { useWork } from "@/shared/works/work-context";

/**
 * The chat header's title: the work's name, renamed in place with a click
 * (Enter or clicking away keeps it, Esc puts it back), as claude.ai renames
 * a chat from its header. A new work shows no name until its first message is sent.
 */
export function ChatTitle({ fallback }: { fallback: string }) {
  const work = useWork();
  const lang = useUiLanguage();
  const zh = lang === "zh";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  const base = "h-8 min-w-0 max-w-[min(420px,70%)] truncate rounded-lg px-2 -ml-2 text-[14px] font-medium text-foreground/85";
  if (!work) return <span className={cn(base, "flex items-center")}>{fallback}</span>;
  // Nothing until the first message lists the work, so a blank one never reads "Untitled".
  if (!work.saved) return <span className="min-w-0 flex-1" />;

  if (editing) {
    const done = (keep: boolean) => {
      setEditing(false);
      if (keep && draft.trim() && draft.trim() !== work.name) work.rename(draft);
    };
    return (
      <input
        ref={ref}
        value={draft}
        aria-label={zh ? "作品名称" : "Work name"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") done(true);
          else if (e.key === "Escape") done(false);
        }}
        className={cn(base, "w-[min(420px,70%)] border border-border bg-card outline-none focus-visible:border-foreground/25")}
      />
    );
  }
  return (
    <button
      type="button"
      title={zh ? "点击重命名" : "Click to rename"}
      onClick={() => {
        setDraft(work.name);
        setEditing(true);
      }}
      className={cn(base, "text-left transition-colors duration-fast hover:bg-foreground/[0.05] hover:text-foreground")}
    >
      {work.name}
    </button>
  );
}
