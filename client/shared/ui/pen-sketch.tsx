import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PencilGlyph } from "@/shared/ui/pencil";

/*
 * The AI's pencil drawing a little scene on a sheet whose picture is still
 * being generated (a picture cannot stream, so this is the pen at work). On
 * warm paper the pencil draws the scene line by line, and as each line goes
 * down its flat colour comes in under it. Three scenes take turns: a seaside
 * town (the horizon with sky, sea and sun, the quay, the houses one by one, the
 * lighthouse, clouds, birds, waves), a desk by the window, and a valley with a
 * little railway. Once drawn the scene comes alive for a while (the beam
 * sweeps and a boat sails by; steam rises and the cat flicks its tail; the
 * train runs through), then it fades and the next scene is drawn. Fills its
 * positioned parent; the real picture takes its place when it comes.
 *
 * The pencil and the colours move on requestAnimationFrame, written straight
 * to the DOM; each scene's own motion is CSS (index.css, town-*, desk-*,
 * train-*). With reduced motion the finished scene stands still and the pencil
 * is away.
 */

const INK = "#2b2622";
const PAPER = "#fffdf8";

type Stroke = {
  d: string;
  /** Line colour, when not ink (white crests on the sea). */
  ink?: string;
  width?: number;
  /** What comes in as the line is drawn: flat colour, or something that then moves. */
  fills?: ReactNode;
};

/** A house on the quay (y 96): its walls, roof, door and window. */
function house(x: number, w: number, h: number, wall: string, roof: string, lit: number): Stroke {
  const top = 96 - h;
  const peak = top - Math.min(12, w * 0.45);
  const wx = x + w * 0.58;
  const wy = top + h * 0.28;
  return {
    d: `M${x} 96 V${top} H${x + w} V96 M${x - 2} ${top} L${x + w / 2} ${peak} L${x + w + 2} ${top} M${x + w * 0.22} 96 V${96 - h * 0.34} H${x + w * 0.42} V96 M${wx} ${wy} h${w * 0.24} v${w * 0.24} h${-w * 0.24} Z`,
    fills: (
      <>
        <rect x={x} y={top} width={w} height={h} fill={wall} />
        <path d={`M${x - 2} ${top} L${x + w / 2} ${peak} L${x + w + 2} ${top} Z`} fill={roof} />
        <rect x={x + w * 0.22} y={96 - h * 0.34} width={w * 0.2} height={h * 0.34} fill={INK} opacity={0.75} />
        <rect x={wx} y={wy} width={w * 0.24} height={w * 0.24} fill="#f3d27a" className="town-window" style={{ animationDelay: `${lit}s` }} />
      </>
    ),
  };
}

const TOWN: Stroke[] = [
  {
    d: "M0 80 H200",
    fills: (
      <>
        <rect width="200" height="80" fill="#f1e2c6" />
        <rect y="80" width="200" height="16" fill="#a9c4d6" />
        <rect y="102" width="200" height="48" fill="#7fa3ba" />
      </>
    ),
  },
  { d: "M70 42 a 12 12 0 1 0 -24 0 a 12 12 0 1 0 24 0", fills: <circle cx="58" cy="42" r="12.5" fill="#e9b65a" /> },
  { d: "M0 96 H200 M0 102 H200", fills: <rect y="96" width="200" height="6" fill="#d9c3a5" /> },
  house(12, 20, 26, "#cc7a5a", "#8c4a35", 0),
  house(36, 18, 38, "#9dae8b", "#5e7356", 0.8),
  house(58, 22, 24, "#c9c3da", "#7d74a3", 1.6),
  house(84, 16, 34, "#e2b451", "#a87d24", 0.4),
  house(104, 20, 28, "#efe6d6", "#cc7a5a", 1.2),
  house(128, 14, 20, "#7fa3ba", "#4f6f86", 2),
  {
    d: "M158 96 L161 44 H169 L172 96 Z M160 36 H170 V44 H160 Z M157 36 L165 28 L173 36",
    fills: (
      <>
        <path d="M158 96 L161 44 H169 L172 96 Z" fill={PAPER} />
        <path d="M160.2 58 H169.8 L170.3 66 H159.7 Z M159.2 76 H170.8 L171.4 84 H158.6 Z" fill="#cc7a5a" />
        <path d="M157 36 L165 28 L173 36 Z" fill={INK} />
        {/* The lamp, and its beam sweeping the sea. */}
        <g className="town-beam">
          <path d="M165 40 L215 26 L215 54 Z" fill="#f3d27a" opacity="0.5" />
        </g>
        <rect x="160" y="36" width="10" height="8" fill="#f3d27a" />
      </>
    ),
  },
  {
    d: "M96 30 c 2 -6 10 -7 13 -2 c 3 -5 12 -3 12 3 c 5 0 6 7 0 7 h -24 c -5 0 -6 -7 -1 -8 M140 18 c 2 -5 8 -6 11 -2 c 3 -4 10 -2 10 3 c 4 0 4 6 0 6 h -20 c -4 0 -5 -6 -1 -7",
    width: 1.2,
    fills: <path d="M96 30 c 2 -6 10 -7 13 -2 c 3 -5 12 -3 12 3 c 5 0 6 7 0 7 h -24 c -5 0 -6 -7 -1 -8 Z M140 18 c 2 -5 8 -6 11 -2 c 3 -4 10 -2 10 3 c 4 0 4 6 0 6 h -20 c -4 0 -5 -6 -1 -7 Z" fill={PAPER} />,
  },
  { d: "M22 24 q 3 -4 6 0 q 3 -4 6 0 M34 16 q 2.4 -3 4.8 0 q 2.4 -3 4.8 0", width: 1.1 },
  {
    d: "M8 116 q 8 -3 16 0 t 16 0 M60 126 q 8 -3 16 0 t 16 0 M124 114 q 8 -3 16 0 t 16 0 M30 138 q 8 -3 16 0 t 16 0 M150 134 q 8 -3 16 0 t 16 0",
    ink: PAPER,
    width: 1.1,
    fills: (
      // The boat: comes in with the sea's crests, then sails across.
      <g className="town-boat">
        <path d="M-2 120 H22 L17 127 H3 Z" fill={INK} />
        <path d="M10 120 V102 L22 117 Z" fill={PAPER} stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
        <path d="M9 120 V105 L1 117 Z" fill="#cc7a5a" />
      </g>
    ),
  },
];

/*
 * A desk by the window: the hills and a tree outside, a curtain, a shelf, a
 * stack of books with a cat asleep on it, a cup of coffee, a lamp, a notebook,
 * a plant. Then the steam rises, the curtain stirs, the cat flicks its tail and
 * the lamp glows.
 */
const DESK: Stroke[] = [
  {
    d: "M0 98 H200",
    fills: (
      <>
        <rect width="200" height="98" fill="#efe1c9" />
        <rect y="98" width="200" height="52" fill="#b98a5e" />
        <path d="M0 112 H200 M0 128 H200 M0 142 H200" stroke="#a37750" strokeWidth="0.6" />
      </>
    ),
  },
  {
    d: "M32 16 H110 V78 H32 Z M71 16 V78 M32 47 H110 M28 80 H114",
    fills: (
      <>
        <rect x="32" y="16" width="78" height="62" fill="#cfe0e6" />
        <path d="M44 28 c 1.5 -4 7 -5 9 -1.5 c 2 -3 8 -2 8 2 c 3.5 0 4 5 0 5 h -16 c -3.5 0 -4 -5 -1 -5.5 Z" fill={PAPER} />
        <path d="M32 62 Q55 44 75 56 T110 50 V78 H32 Z" fill="#9dae8b" />
        <path d="M32 70 Q60 60 110 68 V78 H32 Z" fill="#7d9670" />
        <rect x="91" y="54" width="2" height="12" fill="#6b4f3a" />
        <circle cx="92" cy="50" r="7" fill="#5e7356" />
        <rect x="28" y="78" width="86" height="3" fill="#d9c3a5" />
      </>
    ),
  },
  {
    d: "M26 12 H132 M112 12 Q120 45 114 82 M126 12 Q132 45 128 82",
    width: 0.9,
    fills: (
      <g className="desk-curtain">
        <path d="M112 12 Q120 45 114 82 L128 82 Q132 45 126 12 Z" fill="#cc7a5a" />
        <path d="M117 14 Q123 45 119 80 M122 14 Q127 45 124 80" stroke="#b0654a" strokeWidth="0.7" fill="none" />
      </g>
    ),
  },
  {
    d: "M140 40 H190 M146 40 V30 H154 V40 M166 40 V24 H180 V40",
    fills: (
      <>
        <rect x="140" y="40" width="50" height="2.5" fill="#8c6a4a" />
        <path d="M146 40 V33 Q146 30 150 30 Q154 30 154 33 V40 Z" fill="#7fa3ba" />
        <path d="M150 30 V22 M150 25 l -3 -3 M150 24 l 3 -4" stroke="#5e7356" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        <rect x="166" y="24" width="14" height="16" fill="#e2b451" />
        <rect x="168.5" y="26.5" width="9" height="11" fill="#f6f0e4" />
        <path d="M169 36 L172 31 L175 34 L177 32 V37 H169 Z" fill="#9dae8b" />
      </>
    ),
  },
  {
    d: "M128 98 V88 H174 V98 M132 88 V79 H172 V88 M130 79 V71 H172 V79",
    fills: (
      <>
        <rect x="128" y="88" width="46" height="10" fill="#7fa3ba" />
        <rect x="132" y="79" width="40" height="9" fill="#e2b451" />
        <rect x="130" y="71" width="42" height="8" fill="#c9c3da" />
        <path d="M134 88 V98 M168 88 V98 M137 79 V88 M166 79 V88 M135 71 V79" stroke={PAPER} strokeWidth="0.8" opacity="0.7" />
      </>
    ),
  },
  {
    d: "M137 66 Q140 58 150 58 Q158 58 159 56 L160 51 L163 55 L166 51 L166 57 Q168 63 162 65 Q156 72 140 71 Q136 70 137 66 M159.5 60 q 1 1 2 0 M163.5 60 q 1 1 2 0",
    fills: (
      <>
        <g className="desk-tail">
          <path d="M139 69 Q126 72 128 62" stroke="#e8dcc4" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M139 69 Q126 72 128 62" stroke={INK} strokeOpacity="0.8" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        </g>
        <path d="M137 66 Q140 58 150 58 Q158 58 159 56 L160 51 L163 55 L166 51 L166 57 Q168 63 162 65 Q156 72 140 71 Q136 70 137 66 Z" fill="#e8dcc4" />
        <path d="M145 60 q 1 4 0 9 M150 59 q 1 4 0 10 M155 59 q 1 4 0 9" stroke="#cc9a6a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  {
    d: "M88 82 H102 L100 97 H90 Z M102 85 Q108 86 101 92",
    fills: (
      <>
        <path d="M88 82 H102 L100 97 H90 Z" fill="#efe6d6" />
        <path d="M89 86 H101" stroke="#cc7a5a" strokeWidth="1.4" />
        <ellipse cx="95" cy="82.5" rx="6.5" ry="1.2" fill="#6b4f3a" />
        <g stroke="#a0958a" strokeWidth="0.8" fill="none" strokeLinecap="round">
          <path className="desk-steam" d="M93 79 q -2 -4 0 -7 q 2 -3 0 -6" />
          <path className="desk-steam" style={{ animationDelay: "1.2s" }} d="M97 79 q 2 -4 0 -7 q -2 -3 0 -6" />
          <path className="desk-steam" style={{ animationDelay: "2.1s" }} d="M95 78 q -1.5 -3 0 -6 q 1.5 -3 0 -5" />
        </g>
      </>
    ),
  },
  {
    d: "M40 68 L60 68 L55 58 L45 58 Z M50 68 L44 86 L50 97 M42 97 H58",
    fills: (
      <>
        <circle className="desk-glow" cx="50" cy="74" r="20" fill="#f3d27a" />
        <path d="M40 68 L60 68 L55 58 L45 58 Z" fill="#e2b451" />
        <rect x="42" y="96" width="16" height="2" fill={INK} opacity="0.8" />
      </>
    ),
  },
  {
    d: "M60 108 L84 104 L88 116 L64 120 Z M73 106 L76 118 M66 110 L71 109.2 M66.6 112.4 L71.6 111.6 M78 107.8 L82 107.2",
    fills: (
      <>
        <path d="M60 108 L84 104 L88 116 L64 120 Z" fill="#fbf6ec" />
        <path d="M90 104 L104 110" stroke="#cc7a5a" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    d: "M10 84 H26 L24 97 H12 Z",
    fills: (
      <>
        <path d="M18 84 Q6 76 6 62 Q15 68 18 84 Z" fill="#5e7356" />
        <path d="M18 84 Q20 66 31 60 Q32 74 18 84 Z" fill="#7d9670" />
        <path d="M18 84 Q13 70 17 52 Q24 68 18 84 Z" fill="#5e7356" />
        <path d="M10 84 H26 L24 97 H12 Z" fill="#cc7a5a" />
        <path d="M10.6 88 H25.4" stroke="#b0654a" strokeWidth="0.8" />
      </>
    ),
  },
];

/*
 * A valley with a little railway: three ranges of hills, the pines, a river
 * under a wooden bridge, a station with its signal, the track. Then the train
 * runs through puffing smoke, the signal blinks and the clouds drift.
 */
const VALLEY: Stroke[] = [
  {
    d: "M0 70 L30 36 L52 54 L80 28 L112 58 L140 34 L170 52 L200 30",
    fills: (
      <>
        <rect width="200" height="100" fill="#f1e2c6" />
        <path d="M0 70 L30 36 L52 54 L80 28 L112 58 L140 34 L170 52 L200 30 V100 H0 Z" fill="#c9c3da" />
        <path d="M24 43 L30 36 L36 41 L32 40 L29 43 Z M73 36 L80 28 L88 37 L84 35 L80 38 L76 35 Z M134 41 L140 34 L146 40 L142 39 L139 42 Z" fill={PAPER} />
      </>
    ),
  },
  { d: "M0 82 Q30 58 60 74 Q95 54 130 72 Q165 56 200 70", fills: <path d="M0 82 Q30 58 60 74 Q95 54 130 72 Q165 56 200 70 V104 H0 Z" fill="#9dae8b" /> },
  {
    d: "M0 96 Q40 82 90 92 Q140 82 200 90",
    fills: (
      <>
        <path d="M0 96 Q40 82 90 92 Q140 82 200 90 V150 H0 Z" fill="#7d9670" />
        <path d="M0 140 Q60 132 110 138 T200 136 V150 H0 Z" fill="#6d8a62" />
      </>
    ),
  },
  {
    d: "M14 92 L19 78 L24 92 M24 90 L28 79 L32 90 M6 94 L10 84 L14 94 M168 88 L173 73 L178 88 M179 89 L183 79 L187 89 M188 90 L192 78 L196 90",
    fills: (
      <g fill="#4f6a4a">
        <path d="M14 92 L19 78 L24 92 Z M24 90 L28 79 L32 90 Z M6 94 L10 84 L14 94 Z" />
        <path d="M168 88 L173 73 L178 88 Z M179 89 L183 79 L187 89 Z M188 90 L192 78 L196 90 Z" />
      </g>
    ),
  },
  {
    d: "M0 126 Q60 118 100 124 T200 122 M0 136 Q60 130 100 134 T200 132 M58 124 Q70 114 82 124 M60 123 V131 M80 123 V131",
    fills: (
      <>
        <path d="M0 126 Q60 118 100 124 T200 122 V132 Q140 130 100 134 T0 136 Z" fill="#7fa3ba" />
        <path d="M20 129 h 8 M120 127 h 10 M160 128 h 6" stroke={PAPER} strokeWidth="0.8" strokeLinecap="round" opacity="0.8" />
        <path d="M56 125 Q70 113 84 125 L84 127 Q70 116 56 127 Z" fill="#8c6a4a" />
      </>
    ),
  },
  {
    d: "M104 93 L121 82 L138 93 M108 93 V108 H134 V93 M118 108 V100 H124 V108 M127 97 H132 V102 H127 Z",
    fills: (
      <>
        <rect x="108" y="93" width="26" height="15" fill="#e2b451" />
        <path d="M104 93 L121 82 L138 93 Z" fill="#cc7a5a" />
        <rect x="118" y="100" width="6" height="8" fill="#8c4a35" />
        <rect className="town-window" x="127" y="97" width="5" height="5" fill="#f3d27a" />
        <rect x="110" y="96" width="6" height="2" fill="#a87d24" />
      </>
    ),
  },
  {
    d: "M146 110 V88 M143 88 H149 V81 H143 Z",
    fills: (
      <>
        <rect x="143" y="81" width="6" height="7" fill={INK} opacity="0.85" />
        <circle className="train-signal" cx="146" cy="84.5" r="1.8" fill="#cc5a4a" />
      </>
    ),
  },
  {
    d: "M0 113 H200 M0 116 H200",
    fills: (
      <path
        d="M4 112 v5 M14 112 v5 M24 112 v5 M34 112 v5 M44 112 v5 M54 112 v5 M64 112 v5 M74 112 v5 M84 112 v5 M94 112 v5 M104 112 v5 M114 112 v5 M124 112 v5 M134 112 v5 M144 112 v5 M154 112 v5 M164 112 v5 M174 112 v5 M184 112 v5 M194 112 v5"
        stroke="#6b4f3a"
        strokeWidth="0.9"
      />
    ),
  },
  {
    d: "M20 22 c 1.5 -5 8 -6 11 -2 c 3 -4 10 -2 10 3 c 4 0 4 5 0 5 h -20 c -4 0 -5 -5 -1 -6 M128 16 c 1.5 -4 7 -5 10 -1.5 c 3 -3.5 9 -2 9 2.5 c 3.5 0 3.5 5 0 5 h -18 c -3.5 0 -4 -5 -1 -6",
    width: 1.1,
    fills: (
      <g className="train-cloud">
        <path d="M20 22 c 1.5 -5 8 -6 11 -2 c 3 -4 10 -2 10 3 c 4 0 4 5 0 5 h -20 c -4 0 -5 -5 -1 -6 Z M128 16 c 1.5 -4 7 -5 10 -1.5 c 3 -3.5 9 -2 9 2.5 c 3.5 0 3.5 5 0 5 h -18 c -3.5 0 -4 -5 -1 -6 Z" fill={PAPER} />
      </g>
    ),
  },
  {
    d: "M58 14 q 3 -4 6 0 q 3 -4 6 0 M70 8 q 2.4 -3 4.8 0 q 2.4 -3 4.8 0",
    width: 1.1,
    fills: (
      // The train: comes in with the birds, then runs along the track.
      <g className="train-run">
        <g stroke={INK} strokeOpacity="0.85" strokeWidth="0.8" strokeLinejoin="round">
          <rect x="0" y="100" width="22" height="11" rx="1" fill="#cc7a5a" />
          <rect x="24" y="100" width="22" height="11" rx="1" fill="#e2b451" />
          <rect x="48" y="95" width="26" height="16" rx="1" fill="#4f6f86" />
          <rect x="66" y="89" width="5" height="7" fill={INK} />
          <path d="M45 104 h 4 M21 104 h 4" />
        </g>
        <g fill="#efe6d6">
          <rect x="4" y="102" width="5" height="4" />
          <rect x="13" y="102" width="5" height="4" />
          <rect x="28" y="102" width="5" height="4" />
          <rect x="37" y="102" width="5" height="4" />
          <rect x="51" y="98" width="7" height="5" />
        </g>
        <g fill={INK}>
          <circle cx="5" cy="111" r="2" />
          <circle cx="17" cy="111" r="2" />
          <circle cx="29" cy="111" r="2" />
          <circle cx="41" cy="111" r="2" />
          <circle cx="54" cy="110.6" r="2.4" />
          <circle cx="68" cy="110.6" r="2.4" />
        </g>
        <g fill={PAPER}>
          <circle className="train-puff" cx="68.5" cy="87" r="3" />
          <circle className="train-puff" style={{ animationDelay: "0.5s" }} cx="68.5" cy="87" r="3" />
          <circle className="train-puff" style={{ animationDelay: "1s" }} cx="68.5" cy="87" r="3" />
        </g>
      </g>
    ),
  },
];

/** The scenes the pen takes turns with, one per round. */
const SCENES = [TOWN, DESK, VALLEY];
/** Each new sheet starts on the next scene, so two pictures in a row are not the same drawing. */
let nextScene = 0;

const DRAW_MS_PER_UNIT = 5.5; // the pencil's pace along a line
const TRAVEL_MS = 220; // from the end of one line to the start of the next
const HOLD_MS = 6000; // the finished town, alive
const FADE_MS = 800;
const BLOOM_MS = 900;

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

/** A pencil, its point at (0, 0), leaning up and to the right. */
function Pencil() {
  return (
    <g transform="scale(0.64)">
      <PencilGlyph body="#cc7a5a" />
    </g>
  );
}

const BOX = [200, 150] as const;

/**
 * `scene` picks the first scene (the PPT pages each start on their own); left
 * out, each new sheet takes the next one. After a round the next scene is drawn.
 */
export function PenSketch({ phase = "0s", scene: first }: { phase?: string; scene?: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [scene, setScene] = useState(() => (first ?? nextScene++) % SCENES.length);
  // Only the first round starts part-way in (the phase); later ones start at the beginning.
  const firstRound = useRef(true);
  const inkRefs = useRef<Array<SVGPathElement | null>>([]);
  const fillRefs = useRef<Array<SVGGElement | null>>([]);
  const artRef = useRef<SVGGElement>(null);
  const penRef = useRef<SVGGElement>(null);
  const STROKES = SCENES[scene];

  useEffect(() => {
    const STROKES = SCENES[scene];
    const inks = inkRefs.current.slice(0, STROKES.length);
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
    const offset = firstRound.current ? (Math.abs(Number.parseFloat(phase) || 0) * 1000) % period : 0;
    const [w, h] = BOX;
    const rest = { x: w + 10, y: h * 0.7 };
    const startOf = (i: number) => inks[i]!.getPointAtLength(0);
    const endOf = (i: number) => inks[i]!.getPointAtLength(lengths[i]);

    const paint = (t: number) => {
      inks.forEach((ink, i) => {
        const [s, e] = times[i];
        ink!.style.strokeDashoffset = `${lengths[i] * (1 - clamp01((t - s) / (e - s)))}`;
        const fill = fillRefs.current[i];
        if (fill) {
          const bloom = easeOut(clamp01((t - s) / BLOOM_MS));
          fill.style.opacity = `${bloom}`;
          fill.style.transform = `translateY(${(1 - bloom) * 2}px)`;
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
      const t = now - start;
      if (t >= period) {
        // The round is over: on to the next scene.
        firstRound.current = false;
        setScene((current) => (current + 1) % SCENES.length);
        return;
      }
      paint(Math.max(0, t));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, scene]);

  const [w, h] = BOX;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Cut paper: edges a touch uneven. */}
          <filter id={`edge${uid}`} x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="5" />
            <feDisplacementMap in="SourceGraphic" scale="1.4" />
          </filter>
          <filter id={`grain${uid}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.06 0" />
          </filter>
        </defs>
        <rect width={w} height={h} fill="#f6f0e4" />
        <g ref={artRef} key={scene}>
          <g filter={`url(#edge${uid})`}>
            {STROKES.map((stroke, i) => (
              <g
                key={i}
                ref={(el) => {
                  fillRefs.current[i] = el;
                }}
                style={{ opacity: 0 }}
              >
                {stroke.fills}
              </g>
            ))}
          </g>
          {STROKES.map((stroke, i) => (
            <path
              key={i}
              ref={(el) => {
                inkRefs.current[i] = el;
              }}
              d={stroke.d}
              fill="none"
              stroke={stroke.ink ?? INK}
              strokeOpacity={stroke.ink ? 0.9 : 0.82}
              strokeWidth={stroke.width ?? 0.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ strokeDasharray: 9999, strokeDashoffset: 9999 }}
            />
          ))}
        </g>
        <rect width={w} height={h} filter={`url(#grain${uid})`} />
        <g ref={penRef} style={{ opacity: 0 }}>
          <Pencil />
        </g>
      </svg>
    </div>
  );
}
