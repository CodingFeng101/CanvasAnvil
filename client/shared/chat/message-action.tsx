import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** A small icon button under a message (copy, edit, regenerate); its label shows on hover. */
export function MessageAction({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-lg text-muted-foreground/80 transition-[color,background-color,transform] duration-fast ease-out-soft hover:bg-foreground/[0.06] hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
    >
      {children}
    </button>
  );
}
