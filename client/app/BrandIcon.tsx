import { cn } from "@/shared/lib/utils";

/**
 * The mark is a fixed clay ramp rather than themed tokens: a logo that shifts
 * hue with the interface stops reading as a logo. These shades hold up on both
 * the ivory and the dark ground.
 */
export function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center", className)}>
      <svg
        viewBox="0 0 48 48"
        role="img"
        aria-label="CanvasAnvil"
        className="h-full w-full drop-shadow-[0_6px_14px_rgba(122,53,32,0.18)]"
      >
        <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#C96442" />
        <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#EFB8A2" />
        <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#B4522F" />
        <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#7A3520" />
        <path d="M13.3 36.6h21.4v4.2H13.3v-4.2Z" fill="#C96442" />
        <path d="M10 41.4h28v3.4H10v-3.4Z" fill="#7A3520" />
      </svg>
    </span>
  );
}
