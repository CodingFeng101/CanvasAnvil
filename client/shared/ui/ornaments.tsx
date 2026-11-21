import { cn } from "@/shared/lib/utils";

/*
 * Hand-drawn ornaments, each made for one place rather than one motif
 * repeated everywhere: a flourish that opens a docs chapter, the anvil
 * colophon that closes one, a strip of film for the empty video shelf, a
 * blank sheet and pencil for an empty My works. Single strokes in
 * currentColor, so they take the colour around them and follow the theme.
 * Decorative only: hidden from screen readers.
 */

type Props = { className?: string };

const stroke = { stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Opens a docs chapter, between the title and its first line: two lifted strokes and a diamond. */
export function Flourish({ className }: Props) {
  return (
    <svg viewBox="0 0 120 12" fill="none" aria-hidden className={cn("h-3 w-[120px]", className)}>
      <path d="M2 6.5c12-2.2 26-2.6 40-.6 4.6.7 8.8.4 12.6-1.1" strokeWidth="1.1" {...stroke} />
      <path d="M118 6.5c-12-2.2-26-2.6-40-.6-4.6.7-8.8.4-12.6-1.1" strokeWidth="1.1" {...stroke} />
      <path d="M60 2.4 63 5.6 60 8.8 57 5.6Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The printer's mark at the end of a page, after the name: a small anvil
 * with three sparks flying off it, between two hairlines.
 */
export function AnvilColophon({ className }: Props) {
  return (
    <svg viewBox="0 0 168 30" fill="none" aria-hidden className={cn("h-[30px] w-[168px]", className)}>
      <path d="M4 22h52" strokeWidth="0.9" opacity="0.55" {...stroke} />
      <path d="M112 22h52" strokeWidth="0.9" opacity="0.55" {...stroke} />
      {/* the anvil: horn to the left, waist, foot */}
      <path d="M66 13.5h31v3.2h-6.2c-.9 0-1.4.5-1.4 1.4v2.6h3.1l2.3 4.3H72.6l2.3-4.3H78v-2.6c0-.9-.5-1.4-1.4-1.4h-4.4c-3.1 0-5.2-1.2-6.2-3.2Z" strokeWidth="1.1" {...stroke} />
      {/* sparks */}
      <path d="M86 10.2 84.2 5.4M89.4 10.4l.9-5.6M92.6 11.4l3.8-3.4" strokeWidth="1.1" {...stroke} />
      <circle cx="99.4" cy="6.2" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** For the empty video shelf: a strip of film, a little askew, its frames still blank. */
export function FilmStrip({ className }: Props) {
  return (
    <svg viewBox="0 0 64 34" fill="none" aria-hidden className={cn("h-[34px] w-16", className)}>
      <g transform="rotate(-7 32 17)">
        <rect x="6" y="7" width="52" height="20" rx="2.5" strokeWidth="1.1" {...stroke} />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i}>
            <rect x={9.4 + i * 7} y="9.2" width="2.6" height="2" rx="0.5" fill="currentColor" />
            <rect x={9.4 + i * 7} y="22.8" width="2.6" height="2" rx="0.5" fill="currentColor" />
          </g>
        ))}
        <path d="M23.5 13.4v7.2M40.5 13.4v7.2" strokeWidth="0.9" {...stroke} />
        <path d="M29.6 14.6v4.8l4.2-2.4Z" strokeWidth="1" {...stroke} />
      </g>
    </svg>
  );
}

/** For an empty My works: a blank sheet with its corner turned, and a pencil laid across it. */
export function BlankPage({ className }: Props) {
  return (
    <svg viewBox="0 0 52 44" fill="none" aria-hidden className={cn("h-11 w-[52px]", className)}>
      <path d="M11 4.5h19.5l8 8V39H11Z" strokeWidth="1.1" {...stroke} />
      <path d="M30.5 4.5v8h8" strokeWidth="1.1" {...stroke} />
      {/* the pencil */}
      <path d="M31 35.5 45.2 21.3l3.3 3.3-14.2 14.2-4.6 1.3Z" strokeWidth="1.1" {...stroke} />
      <path d="M42.6 23.9l3.3 3.3M31 35.5l3.3 3.3" strokeWidth="0.9" {...stroke} />
    </svg>
  );
}
