import { useEffect, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useUiLanguage } from "@/shared/i18n";

/**
 * An image inside a chat message, with a lightbox.
 *
 * These used to be inert boxes: a render or a floor plan arrived capped at
 * 240px tall with no way to see it larger, which is the one thing you want
 * from a picture the model just produced.
 */
export function MessageImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const uiLang = useUiLanguage();
  const [open, setOpen] = useState(false);
  const label = uiLang === "zh" ? "放大查看" : "View larger";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen(true)}
        className={cn(
          "group relative block w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/70 bg-muted shadow-xs",
          "transition-[border-color,box-shadow,transform] duration-base ease-out-soft",
          "hover:-translate-y-px hover:border-border hover:shadow-soft",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
          className,
        )}
      >
        <img
          src={src}
          alt={alt}
          className="w-full max-h-[240px] object-contain transition-transform duration-slow ease-out-soft group-hover:scale-[1.02]"
        />
        <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-overlay/55 text-white opacity-0 backdrop-blur-[1px] transition-opacity duration-fast ease-out-soft group-hover:opacity-100">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-overlay/80 p-6 backdrop-blur-sm animate-fade-in"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={alt}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={uiLang === "zh" ? "关闭" : "Close"}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white transition-[background-color,transform] duration-fast ease-out-soft hover:bg-white/22 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt={alt}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-soft-xl animate-scale-in"
          />
        </div>
      )}
    </>
  );
}
