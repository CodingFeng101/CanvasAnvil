/*
 * The AI's pencil: the one pen that writes and draws everywhere (the canvas
 * pen tracing diagrams and plans, the sketches while pictures are drawn, the
 * PPT outline being written and pages wiped in). Its body takes currentColor,
 * so it follows the brand colour of whatever holds it.
 */

/** The pencil inside an SVG, its point at (0, 0), leaning up and to the right; about 32 units long. */
export function PencilGlyph({ body = "currentColor" }: { body?: string }) {
  return (
    <g transform="rotate(-45)">
      {/* Point, wood, body, ferrule, eraser. */}
      <path d="M0 0 L8 -3.6 L8 3.6 Z" fill="#e8c497" />
      <path d="M0 0 L2.6 -1.2 L2.6 1.2 Z" fill="#3b3631" />
      <rect x="8" y="-3.6" width="17" height="7.2" rx="0.6" fill={body} />
      <rect x="8" y="-3.6" width="17" height="2.4" fill="#ffffff" opacity="0.18" />
      <rect x="25" y="-3.6" width="3.2" height="7.2" fill="#b9b4ab" />
      <rect x="28.2" y="-3.6" width="3.4" height="7.2" rx="1.4" fill="#e58f8f" />
    </g>
  );
}

/**
 * The pencil as an inline mark in HTML, `size` px square, its point at the
 * bottom-left corner (so place that corner where the writing is).
 */
export function PencilMark({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="-2 -28 30 30" className={className} aria-hidden>
      <PencilGlyph />
    </svg>
  );
}
