import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Check, ChevronDown, Plus, Square, type LucideIcon } from "lucide-react";
import { getAIConfig } from "@/ai/storage";
import { selectModel, useModels } from "@/ai/model-lists";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { openSettings } from "@/shared/settings-bus";

/*
 * The pieces of the chat composer, after Claude's: one line with a "+" on the
 * left and the send button on the right; everything used now and then sits
 * in the "+" menu; the canvas's own options sit outside the box, bottom
 * right, as a line of quiet text that opens a small menu when clicked.
 */

export interface PlusMenuItem {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Shown at the right, like "›" for something that opens elsewhere. */
  trailing?: string;
  onSelect: () => void;
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

const popClass =
  "absolute bottom-full z-50 mb-2 rounded-xl border border-border/80 bg-popover p-1 text-popover-foreground shadow-[0_8px_24px_-6px_hsl(var(--shadow-hue)/0.2),0_2px_6px_hsl(var(--shadow-hue)/0.08)] animate-in fade-in zoom-in-[0.98] duration-fast";

export function PlusMenu({ items, disabled }: { items: PlusMenuItem[]; disabled?: boolean }) {
  const lang = useUiLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const label = lang === "zh" ? "添加与更多" : "Add and more";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-fast hover:bg-foreground/[0.06] hover:text-foreground active:scale-95 disabled:opacity-40",
          open && "bg-foreground/[0.06] text-foreground",
        )}
      >
        <Plus className={cn("size-[18px] transition-transform duration-fast", open && "rotate-45")} />
      </button>
      {open && (
        <div role="menu" className={cn(popClass, "left-0 w-[240px] origin-bottom-left")}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-foreground transition-colors duration-fast hover:bg-foreground/[0.06] disabled:pointer-events-none disabled:opacity-40"
            >
              <item.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="shrink-0 text-[12px] text-muted-foreground">{item.shortcut}</span>}
              {item.trailing && <span className="shrink-0 text-[13px] text-muted-foreground">{item.trailing}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Grey while there is nothing to send, clay once there is; a stop square while the AI works. */
export function SendButton({ hasContent, loading, onSend, onStop, submit }: { hasContent: boolean; loading: boolean; onSend?: () => void; onStop?: () => void; submit?: boolean }) {
  const lang = useUiLanguage();
  const zh = lang === "zh";
  if (loading) {
    const label = zh ? "停止" : "Stop";
    return (
      <button
        type="button"
        title={label}
        aria-label={label}
        disabled={!onStop}
        onClick={(e) => {
          e.preventDefault();
          onStop?.();
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-foreground transition-[background-color,transform] duration-fast hover:bg-foreground/[0.08] active:scale-90"
      >
        <Square className="size-[15px] fill-current" />
      </button>
    );
  }
  const label = zh ? "发送" : "Send";
  return (
    <button
      type={submit ? "submit" : "button"}
      title={label}
      aria-label={label}
      aria-disabled={!hasContent}
      onClick={(e) => {
        if (!hasContent) {
          e.preventDefault();
          return;
        }
        if (!submit) onSend?.();
      }}
      className={cn(
        // Just the arrow, no box round it: grey with nothing to send, the brand colour once there is.
        "flex size-9 shrink-0 items-center justify-center transition-[color,transform] duration-base ease-out-soft",
        hasContent ? "text-brand hover:text-brand-hover active:scale-90" : "cursor-default text-muted-foreground/45",
      )}
    >
      <ArrowUp className="size-[22px]" strokeWidth={2.4} />
    </button>
  );
}

/** The line under the box: the model first, then the canvas's own options. */
export type ModelChannel = "text" | "image";

/**
 * The line under the box. `channels` lists the models this canvas calls right
 * now, so only those are shown: a deck names the image model only once its
 * slides are pictures.
 */
export function StatusRow({ channels = ["text"], children }: { channels?: ModelChannel[]; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5 px-1 pt-1.5">
      {channels.map((channel) => (
        <ModelPicker key={channel} channel={channel} labelled={channels.length > 1} />
      ))}
      {children}
    </div>
  );
}

const quietButton =
  "inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12.5px] text-muted-foreground transition-colors duration-fast hover:bg-foreground/[0.05] hover:text-foreground";

function ModelPicker({ channel, labelled }: { channel: ModelChannel; labelled?: boolean }) {
  const lang = useUiLanguage();
  const zh = lang === "zh";
  const { models, current } = useModels(channel);
  const config = getAIConfig();
  const key = channel === "image" ? config.imageApiKey : config.textApiKey;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);

  if (!key || !current) {
    return (
      <button type="button" title={zh ? "去设置里配置模型" : "Set up a model in Settings"} onClick={() => openSettings("models")} className={cn(quietButton, "text-warning hover:text-warning")}>
        {channel === "image" ? (zh ? "未配置图像模型" : "No image model") : labelled ? (zh ? "未配置文本模型" : "No text model") : zh ? "未配置模型" : "No model set"}
      </button>
    );
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" title={channel === "image" ? (zh ? "图像模型" : "Image model") : zh ? "文本模型" : "Text model"} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(quietButton, open && "text-foreground")}>
        {labelled && <span>{channel === "image" ? (zh ? "图像" : "Image") : zh ? "文本" : "Text"}</span>}
        <span className="text-foreground/80">{current}</span>
        <ChevronDown className={cn("size-3 transition-transform duration-fast", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className={cn(popClass, "right-0 w-[240px] origin-bottom-right")}>
          <div className="px-2.5 pb-1 pt-1.5 text-[11.5px] text-muted-foreground">{channel === "image" ? (zh ? "图像模型" : "Image model") : zh ? "文本模型" : "Text model"}</div>
          {models.map((model) => (
            <button
              key={model}
              type="button"
              role="menuitemradio"
              aria-checked={model === current}
              onClick={() => {
                selectModel(channel, model);
                setOpen(false);
              }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-foreground hover:bg-foreground/[0.06]"
            >
              <span className="min-w-0 flex-1 truncate">{model}</span>
              {model === current && <Check className="size-3.5 shrink-0 text-muted-foreground" />}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-border/70" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openSettings("models");
            }}
            className="flex h-8 w-full items-center rounded-lg px-2.5 text-left text-[13px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {zh ? "管理模型…" : "Manage models…"}
          </button>
        </div>
      )}
    </div>
  );
}

export function StatusSelect<T extends string>({
  value,
  options,
  onChange,
  label,
  changed,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** What the option is, for the hover hint ("图片尺寸"). */
  label: string;
  /** Away from the default: the text reads darker. */
  changed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div ref={ref} className="relative">
      <button type="button" title={label} aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn(quietButton, (changed || open) && "text-foreground")}>
        {current}
        <ChevronDown className={cn("size-3 transition-transform duration-fast", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" className={cn(popClass, "right-0 min-w-[160px] origin-bottom-right")}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                setOpen(false);
                onChange(option.value);
              }}
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-foreground hover:bg-foreground/[0.06]"
            >
              <span className="flex-1">{option.label}</span>
              {option.value === value && <Check className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusToggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  const lang = useUiLanguage();
  return (
    <button type="button" aria-pressed={on} disabled={disabled} title={label} onClick={() => onChange(!on)} className={cn(quietButton, on && "text-foreground", "disabled:opacity-40")}>
      <span className={cn("size-1.5 rounded-full", on ? "bg-brand" : "bg-foreground/25")} />
      {label}
      <span className="text-muted-foreground">{on ? (lang === "zh" ? "开" : "on") : lang === "zh" ? "关" : "off"}</span>
    </button>
  );
}

/** A suggestion in the empty box (ghost text); Tab takes it. */
export function GhostHint({ text }: { text: string }) {
  const lang = useUiLanguage();
  return (
    <span className="pointer-events-none absolute left-0 top-0 flex h-6 items-center gap-2 truncate text-[15px] leading-6 text-muted-foreground/60">
      {text}
      <kbd className="rounded border border-border/80 px-1 font-sans text-[11px] text-muted-foreground">Tab</kbd>
      <span className="text-[12px]">{lang === "zh" ? "填入" : "to use"}</span>
    </span>
  );
}
