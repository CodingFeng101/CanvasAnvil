import { useEffect, useId, useRef } from "react";

/*
 * The AI's pencil painting a little watercolour on a sheet whose picture is
 * still being generated (a picture cannot stream, so this is the pen at work):
 * on warm paper the pencil draws the scene line by line, and as each line goes
 * down its wash of colour blooms in under it, soft-edged like paint on wet
 * paper. Once the scene is done it rests a moment, fades, and starts again.
 * Fills its positioned parent; the real picture takes its place when it comes.
 *
 * Everything moves on requestAnimationFrame, written straight to the DOM. With
 * reduced motion the finished painting stands still and the pencil is away.
 */

type Wash = { d: string; fill: string; opacity?: number };
type Stroke = { d: string; width?: number; washes?: Wash[] };
type Scene = { box: [number, number]; sky?: [string, string]; strokes: Stroke[] };

const SCENES: Record<"picture" | "slide", Scene> = {
  // A landscape at dusk: mountains, the sun, a green hill with a tree, a lake, two birds.
  picture: {
    box: [160, 120],
    sky: ["#bcd8e6", "#f7d3b5"],
    strokes: [
      {
        d: "M0 78 L22 56 L34 63 L50 46 L62 44 L86 64 L104 52 L130 70 L160 58",
        washes: [
          { d: "M0 0 H160 V82 H0 Z", fill: "url(#sky)", opacity: 0.95 },
          { d: "M0 78 L22 56 L34 63 L50 46 L62 44 L86 64 L104 52 L130 70 L160 58 L160 96 L0 96 Z", fill: "#a3b1d8", opacity: 0.9 },
        ],
      },
      { d: "M125 38 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0", washes: [{ d: "M126 38 a 13 13 0 1 0 -26 0 a 13 13 0 1 0 26 0", fill: "#f4a259", opacity: 0.9 }] },
      {
        d: "M0 92 C 30 72, 60 74, 86 88 S 140 76, 160 84",
        washes: [{ d: "M0 92 C 30 72, 60 74, 86 88 S 140 76, 160 84 L160 120 L0 120 Z", fill: "#93c09a", opacity: 0.92 }],
      },
      {
        d: "M36 98 L36 84 M36 86 C 26 86, 25 74, 32 71 C 33 63, 44 63, 45 71 C 52 74, 47 86, 36 86",
        washes: [{ d: "M36 87 C 24 87, 23 73, 31 70 C 33 61, 45 61, 46 70 C 54 74, 49 87, 36 87 Z", fill: "#5f9a6c", opacity: 0.85 }],
      },
      {
        d: "M60 106 C 70 104, 84 108, 96 105 M74 112 C 86 110, 100 114, 116 111 M104 104 C 112 102, 124 105, 134 103",
        washes: [{ d: "M44 100 C 80 96, 120 104, 160 98 L160 120 L44 120 C 46 112, 44 106, 44 100 Z", fill: "#84bfd0", opacity: 0.8 }],
      },
      { d: "M58 30 q 4 -5 8 0 q 4 -5 8 0 M78 22 q 3 -4 6 0 q 3 -4 6 0" },
    ],
  },
  // A page: a title with a brush mark under it, three lines with coloured dots, a picture with a hill and the sun.
  slide: {
    box: [160, 90],
    strokes: [
      {
        d: "M14 20 C 26 17, 40 22, 54 18 S 70 19, 76 18",
        width: 1.5,
        washes: [{ d: "M12 24 C 30 20, 56 26, 80 21 L80 27 C 56 31, 30 26, 12 29 Z", fill: "#f6c177", opacity: 0.85 }],
      },
      { d: "M22 40 C 32 39, 44 41, 58 40", washes: [{ d: "M17 40 a 2.4 2.4 0 1 0 -4.8 0 a 2.4 2.4 0 1 0 4.8 0", fill: "#e07a5f" }] },
      { d: "M22 52 C 30 51, 42 53, 54 52", washes: [{ d: "M17 52 a 2.4 2.4 0 1 0 -4.8 0 a 2.4 2.4 0 1 0 4.8 0", fill: "#81b29a" }] },
      { d: "M22 64 C 32 63, 40 65, 50 64", washes: [{ d: "M17 64 a 2.4 2.4 0 1 0 -4.8 0 a 2.4 2.4 0 1 0 4.8 0", fill: "#7aa5d6" }] },
      {
        d: "M86 30 L146 29 L147 74 L87 75 Z",
        washes: [{ d: "M87 31 L145 30 L146 73 L88 74 Z", fill: "#bcd8e6", opacity: 0.95 }],
      },
      {
        d: "M88 68 C 98 54, 108 52, 118 62 S 136 58, 146 66",
        washes: [{ d: "M88 68 C 98 54, 108 52, 118 62 S 136 58, 146 66 L146 73 L88 74 Z", fill: "#93c09a", opacity: 0.92 }],
      },
      { d: "M136 42 a 6 6 0 1 0 -12 0 a 6 6 0 1 0 12 0", washes: [{ d: "M137 42 a 7 7 0 1 0 -14 0 a 7 7 0 1 0 14 0", fill: "#f4a259", opacity: 0.9 }] },
    ],
  },
};

const INK = "#3d3843";
const DRAW_MS_PER_UNIT = 9; // the pencil's pace along a line
const TRAVEL_MS = 260; // from the end of one line to the start of the next
const HOLD_MS = 1500; // the finished painting rests
const FADE_MS = 700;
const BLOOM_MS = 1100;

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/** A pencil, its point at (0, 0), leaning up and to the right. */
function Pencil() {
  return (
    <g transform="rotate(-50)">
      <path d="M0 0 L5 -2.2 L5 2.2 Z" fill="#e8c497" />
      <path d="M0 0 L1.6 -0.75 L1.6 0.75 Z" fill={INK} />
      <rect x="5" y="-2.2" width="11" height="4.4" rx="0.4" fill="#e07a5f" />
      <rect x="5" y="-2.2" width="11" height="1.4" fill="#ffffff" opacity="0.25" />
      <rect x="16" y="-2.2" width="2" height="4.4" fill="#b9b4ab" />
      <rect x="18" y="-2.2" width="2.2" height="4.4" rx="0.9" fill="#f2b5b5" />
    </g>
  );
}

export function PenSketch({ motif = "picture", phase = "0s" }: { motif?: keyof typeof SCENES; phase?: string }) {
  const scene = SCENES[motif];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const inkRefs = useRef<Array<SVGPathElement | null>>([]);
  const washRefs = useRef<Array<Array<SVGPathElement | null>>>([]);
  const artRef = useRef<SVGGElement>(null);
  const penRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const inks = inkRefs.current.slice(0, scene.strokes.length);
    if (inks.some((ink) => !ink)) return;
    const lengths = inks.map((ink) => ink!.getTotalLength());
    // Each line's start and end in the loop, the pencil travelling between them.
    const times: Array<[number, number]> = [];
    let at = 300;
    for (const length of lengths) {
      times.push([at, at + length * DRAW_MS_PER_UNIT]);
      at += length * DRAW_MS_PER_UNIT + TRAVEL_MS;
    }
    const drawn = at - TRAVEL_MS;
    const period = drawn + HOLD_MS + FADE_MS;
    inks.forEach((ink, i) => ink!.style.setProperty("stroke-dasharray", `${lengths[i]}`));
    const offset = (Number.parseFloat(phase) || 0) * 1000;
    const [w, h] = scene.box;
    const rest = { x: w + 10, y: h * 0.7 };
    const startOf = (i: number) => inks[i]!.getPointAtLength(0);
    const endOf = (i: number) => inks[i]!.getPointAtLength(lengths[i]);

    const paint = (t: number) => {
      inks.forEach((ink, i) => {
        const [s, e] = times[i];
        ink!.style.strokeDashoffset = `${lengths[i] * (1 - clamp01((t - s) / (e - s)))}`;
        const bloom = easeOut(clamp01((t - s) / BLOOM_MS));
        for (const wash of washRefs.current[i] ?? []) {
          if (!wash) continue;
          wash.style.opacity = `${bloom * Number(wash.dataset.opacity ?? 1)}`;
          wash.style.transform = `scale(${0.94 + 0.06 * bloom})`;
        }
      });
      if (artRef.current) artRef.current.style.opacity = `${1 - easeInOut(clamp01((t - drawn - HOLD_MS) / FADE_MS))}`;
      // Where the pencil is: on a line, between two, or off the sheet.
      let pen = rest;
      let lift = 1;
      const i = times.findIndex(([s, e]) => t >= s - TRAVEL_MS && t <= e);
      if (i >= 0) {
        const [s, e] = times[i];
        if (t >= s) {
          const p = inks[i]!.getPointAtLength(lengths[i] * clamp01((t - s) / (e - s)));
          pen = { x: p.x, y: p.y };
          lift = 0;
        } else {
          const from = i > 0 ? endOf(i - 1) : rest;
          const to = startOf(i);
          const k = easeInOut(clamp01((t - (s - TRAVEL_MS)) / TRAVEL_MS));
          pen = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
          lift = Math.sin(Math.PI * k);
        }
      } else if (t > drawn) {
        const from = endOf(inks.length - 1);
        const k = easeInOut(clamp01((t - drawn) / 600));
        pen = { x: from.x + (rest.x - from.x) * k, y: from.y + (rest.y - from.y) * k };
        lift = k;
      }
      if (penRef.current) {
        penRef.current.setAttribute("transform", `translate(${pen.x.toFixed(2)} ${(pen.y - lift * 3).toFixed(2)})`);
        penRef.current.style.opacity = t > drawn + 500 ? "0" : "1";
      }
    };

    if (reducedMotion()) {
      paint(drawn);
      if (penRef.current) penRef.current.style.opacity = "0";
      return;
    }
    let frame = 0;
    const start = performance.now() - offset;
    const tick = (now: number) => {
      paint((((now - start) % period) + period) % period);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, phase]);

  const [w, h] = scene.box;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Paint on wet paper: ragged, soft edges. */}
          <filter id={`wet${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="3.2" />
            <feGaussianBlur stdDeviation="0.45" />
          </filter>
          <filter id={`grain${uid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.07 0" />
          </filter>
          {scene.sky && (
            <linearGradient id={`sky${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={scene.sky[0]} />
              <stop offset="1" stopColor={scene.sky[1]} />
            </linearGradient>
          )}
        </defs>
        <rect width={w} height={h} fill="#f8f2e7" />
        <rect width={w} height={h} filter={`url(#grain${uid})`} />
        <g ref={artRef}>
          <g filter={`url(#wet${uid})`} style={{ mixBlendMode: "multiply" }}>
            {scene.strokes.map((stroke, i) =>
              (stroke.washes ?? []).map((wash, j) => (
                <path
                  key={`${i}-${j}`}
                  ref={(el) => {
                    (washRefs.current[i] ??= [])[j] = el;
                  }}
                  d={wash.d}
                  fill={wash.fill === "url(#sky)" ? `url(#sky${uid})` : wash.fill}
                  data-opacity={wash.opacity ?? 0.9}
                  style={{ opacity: 0, transformBox: "fill-box", transformOrigin: "center" }}
                />
              )),
            )}
          </g>
          {scene.strokes.map((stroke, i) => (
            <path
              key={i}
              ref={(el) => {
                inkRefs.current[i] = el;
              }}
              d={stroke.d}
              fill="none"
              stroke={INK}
              strokeOpacity={0.78}
              strokeWidth={stroke.width ?? 0.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: 9999, strokeDashoffset: 9999 }}
            />
          ))}
        </g>
        <g ref={penRef} style={{ opacity: 0 }}>
          <Pencil />
        </g>
      </svg>
    </div>
  );
}
