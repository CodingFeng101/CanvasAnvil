import { cn } from "@/shared/lib/utils";

/*
 * CanvasAnvil's anvil (the brand mark, smaller) with a hammer that keeps
 * striking it while the AI works: the head comes down, a few sparks fly, it
 * lifts again. At rest (or with reduced motion) the hammer stays raised.
 *
 * The motion lives in index.css (`.anvil-mark`), so it costs no renders.
 */
export function AnvilMark({ active = true, className }: { active?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("anvil-mark shrink-0", active && "is-active", className)}>
      {/* The brand anvil, set lower to leave room for the swing. */}
      <g transform="translate(7 17) scale(0.71)">
        <path d="M24 3.8 42 12.8 24 21.8 6 12.8 24 3.8Z" fill="#C96442" />
        <path d="M24 8.6 32.4 12.8 24 17 15.6 12.8 24 8.6Z" fill="#EFB8A2" />
        <path d="M8.8 17.5 24 25.1l15.2-7.6v5.7L24 30.8 8.8 23.2v-5.7Z" fill="#B4522F" />
        <path d="M16.5 29.3h15l-2.7 4.4h-9.6l-2.7-4.4Z" fill="#7A3520" />
        <path d="M13.3 36.6h21.4v4.2H13.3v-4.2Z" fill="#C96442" />
        <path d="M10 41.4h28v3.4H10v-3.4Z" fill="#7A3520" />
      </g>
      {/* Sparks where the head lands. */}
      <g className="anvil-sparks" stroke="#E8875F" strokeWidth="2.2" strokeLinecap="round">
        <line x1="18" y1="25" x2="12.5" y2="22.5" />
        <line x1="18.5" y1="21.5" x2="15" y2="16.5" />
        <line x1="32" y1="24" x2="37" y2="21" />
      </g>
      {/* Hammer, drawn level (handle to the right, head upright) and swung about the handle's end. */}
      <g className="anvil-hammer">
        <path d="M44 9H25" stroke="#7A3520" strokeWidth="3" strokeLinecap="round" />
        <rect x="18" y="2" width="8" height="15" rx="1.6" fill="#B4522F" />
        <rect x="18" y="2" width="8" height="3.2" rx="1.2" fill="#7A3520" />
      </g>
    </svg>
  );
}
