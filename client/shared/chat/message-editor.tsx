import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { isSendKey } from "@/shared/preferences";

/*
 * Editing one of your own messages, in place: the bubble becomes a small
 * composer (same card as the input box), with Cancel and Send. Sending
 * replaces everything after that message and the AI answers again.
 *
 * `overlay` draws the text under a transparent textarea, for chips that
 * stand in for tags (the PPT slide references).
 */

export function MessageEditor({
  value,
  onChange,
  onCancel,
  onSubmit,
  overlay,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (value: string) => void;
  overlay?: ReactNode;
}) {
  const lang = useUiLanguage();
  const zh = lang === "zh";
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const send = () => {
    if (value.trim()) onSubmit(value.trim());
  };
  const text = "w-full px-1 py-0.5 text-[15px] leading-6 whitespace-pre-wrap break-words";

  return (
    <div className="flex w-[min(100%,560px)] flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="w-full rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[0_1px_2px_hsl(var(--shadow-hue)/0.04),0_4px_16px_-6px_hsl(var(--shadow-hue)/0.12)] transition-[border-color] duration-fast focus-within:border-foreground/25">
        <div className="relative">
          {overlay && <div className={cn(text, "pointer-events-none absolute inset-0 overflow-hidden text-foreground")}>{overlay}</div>}
          <textarea
            ref={ref}
            value={value}
            rows={1}
            aria-label={zh ? "编辑消息" : "Edit message"}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
              } else if (isSendKey(e)) {
                e.preventDefault();
                send();
              }
            }}
            className={cn(text, "relative block resize-none bg-transparent outline-none", overlay ? "text-transparent caret-foreground" : "text-foreground")}
          />
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded-lg border border-border/80 bg-card px-3 text-[13px] text-foreground/80 transition-colors duration-fast hover:bg-foreground/[0.04] hover:text-foreground"
        >
          {zh ? "取消" : "Cancel"}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!value.trim()}
          className="h-8 rounded-lg bg-foreground px-3.5 text-[13px] font-medium text-background transition-[opacity,transform] duration-fast hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
        >
          {zh ? "发送" : "Send"}
        </button>
      </div>
    </div>
  );
}
