import { cn } from "@/shared/lib/utils";

export function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center", className)}>
      <svg
        viewBox="0 0 48 48"
        role="img"
        aria-label="CanvasAnvil"
        className="h-full w-full drop-shadow-[0_8px_18px_rgba(35,108,255,0.22)]"
      >
        <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#236CFF" />
        <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#8EC1FF" />
        <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#0B77F4" />
        <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#053EA8" />
        <path d="M13.3 36.6h21.4v4.2H13.3v-4.2Z" fill="#236CFF" />
        <path d="M10 41.4h28v3.4H10v-3.4Z" fill="#053EA8" />
      </svg>
    </span>
  );
}
