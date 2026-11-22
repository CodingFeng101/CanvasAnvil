import { useEffect, useRef } from "react";
import type { PenPoint, PenStore } from "@/shared/pen-store";
import { PencilGlyph } from "@/shared/ui/pencil";

export { createPenStore, type PenPoint, type PenStore, type PenStroke } from "@/shared/pen-store";

/*
 * The AI's pen on a canvas while it draws. For each outline handed to it, the
 * pen lifts, glides to where the outline starts, sets down and traces it,
 * leaving ink behind; then the real shape takes the ink's place and the ink
 * fades. With a backlog it draws faster; with nothing left it lifts away.
 *
 * Everything moves on requestAnimationFrame, written straight to the DOM:
 * a React render per frame would stutter.
 */

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");

const easeInOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A pencil, its point at (0, 0), leaning up and to the right. */
function PencilIcon() {
  return (
    <svg width="34" height="34" viewBox="-3 -31 34 34" className="absolute -left-[3px] -top-[31px] overflow-visible" aria-hidden>
      <PencilGlyph />
    </svg>
  );
}

export function CanvasPen({ store }: { store: PenStore }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const penRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let running = false;
    let shown = false;
    let lastEpoch = store.epoch();
    let liftTimer = 0;
    let active: SVGPathElement | null = null;
    const pen = { x: 0, y: 0, lift: 0, tilt: 0 };

    const paint = (opacity?: number) => {
      const el = penRef.current;
      if (!el) return;
      el.style.transform = `translate(${pen.x}px, ${pen.y - pen.lift}px) rotate(${pen.tilt}deg)`;
      el.style.filter = `drop-shadow(${1 + pen.lift * 0.4}px ${2 + pen.lift * 0.8}px ${2 + pen.lift}px rgba(0,0,0,${0.32 - pen.lift * 0.015}))`;
      if (opacity !== undefined) el.style.opacity = String(opacity);
    };

    /** Runs fn(t) for t in 0..1 over ms; false if the queue was cleared meanwhile. */
    const animate = (ms: number, epoch: number, fn: (t: number) => void) =>
      new Promise<boolean>((resolve) => {
        const start = performance.now();
        const step = (now: number) => {
          if (!alive || epoch !== store.epoch()) return resolve(false);
          const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
          fn(t);
          if (t < 1) requestAnimationFrame(step);
          else resolve(true);
        };
        requestAnimationFrame(step);
      });

    const local = (points: PenPoint[]) => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return null;
      return points.map((p) => ({ x: p.x - box.left, y: p.y - box.top }));
    };

    const fade = (path: SVGPathElement | null) => {
      if (!path) return;
      path.style.transition = "opacity 420ms ease-out";
      path.style.opacity = "0";
      window.setTimeout(() => path.remove(), 480);
    };

    const liftAway = (epoch: number) => {
      if (!shown) return;
      shown = false;
      const from = { ...pen };
      void animate(260, epoch, (t) => {
        const e = easeInOut(t);
        pen.x = from.x + e * 14;
        pen.y = from.y - e * 10;
        pen.lift = from.lift + e * 8;
        paint(1 - e);
      });
    };

    /** Lift, glide to the start, set down. */
    const travel = async (to: PenPoint, epoch: number, hurry: number) => {
      if (!shown) {
        shown = true;
        pen.x = to.x + 16;
        pen.y = to.y - 12;
        pen.lift = 8;
        paint(0);
        return animate(200, epoch, (t) => {
          const e = easeInOut(t);
          pen.x = to.x + 16 * (1 - e);
          pen.y = to.y - 12 * (1 - e);
          pen.lift = 8 * (1 - e);
          paint(e);
        });
      }
      const from = { x: pen.x, y: pen.y };
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (dist < 2) return true;
      const ms = clamp(110 + dist * 0.45, 120, 380) / hurry;
      return animate(ms, epoch, (t) => {
        const e = easeInOut(t);
        pen.x = from.x + (to.x - from.x) * e;
        pen.y = from.y + (to.y - from.y) * e;
        // Up off the paper and back down.
        pen.lift = Math.sin(Math.PI * t) * clamp(dist / 30, 3, 9);
        pen.tilt += (clamp((to.x - from.x) / 40, -5, 5) * Math.sin(Math.PI * t) - pen.tilt) * 0.2;
        paint(1);
      });
    };

    const traceAlong = (points: PenPoint[], epoch: number, hurry: number) => {
      const lengths = [0];
      for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
      const total = lengths[lengths.length - 1];
      const svg = svgRef.current;
      if (!svg || total < 1) return Promise.resolve(true);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.25");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("opacity", "0.9");
      svg.appendChild(path);
      active = path;
      const ms = clamp(total / (0.75 * hurry), 160, 1100 / Math.sqrt(hurry));
      let i = 1;
      let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      return animate(ms, epoch, (t) => {
        const s = easeInOut(t) * total;
        while (i < points.length - 1 && lengths[i] <= s) {
          d += ` L${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
          i++;
        }
        const a = points[i - 1];
        const b = points[i];
        const seg = lengths[i] - lengths[i - 1] || 1;
        const k = clamp((s - lengths[i - 1]) / seg, 0, 1);
        const x = a.x + (b.x - a.x) * k;
        const y = a.y + (b.y - a.y) * k;
        path.setAttribute("d", `${d} L${x.toFixed(1)} ${y.toFixed(1)}`);
        // Leans a little with the stroke, as a hand does.
        const dir = (b.x - a.x) / seg;
        pen.tilt += (dir * 6 - pen.tilt) * 0.15;
        pen.x = x;
        pen.y = y;
        pen.lift = 0;
        paint(1);
      });
    };

    const run = async () => {
      if (running) return;
      running = true;
      window.clearTimeout(liftTimer);
      for (;;) {
        if (!alive) break;
        const stroke = store.take();
        if (!stroke) break;
        const epoch = store.epoch();
        if (reducedMotion()) {
          stroke.done?.();
          continue;
        }
        try {
          await stroke.prepare?.();
        } catch {
          /* draw it where it is */
        }
        if (epoch !== store.epoch()) continue;
        let measured: PenPoint[] | null = null;
        try {
          measured = stroke.points();
        } catch {
          measured = null;
        }
        const points = measured && measured.length > 1 ? local(measured) : null;
        if (!points) {
          stroke.done?.();
          continue;
        }
        const hurry = 1 + Math.min(store.pending(), 8) * 0.45;
        if (!(await travel(points[0], epoch, hurry))) continue;
        if (!(await traceAlong(points, epoch, hurry))) continue;
        stroke.done?.();
        fade(active);
        active = null;
      }
      running = false;
      const epoch = store.epoch();
      liftTimer = window.setTimeout(() => {
        if (!running && !store.pending()) liftAway(epoch);
      }, 700);
    };

    const onChange = () => {
      const epoch = store.epoch();
      if (epoch !== lastEpoch) {
        lastEpoch = epoch;
        // Cleared: the ink under way goes, and the pen lifts.
        if (active) fade(active);
        active = null;
        window.clearTimeout(liftTimer);
        liftTimer = window.setTimeout(() => {
          if (!running && !store.pending()) liftAway(store.epoch());
        }, 60);
      }
      if (store.pending()) void run();
    };
    const unsubscribe = store.subscribe(onChange);
    if (store.pending()) void run();
    return () => {
      alive = false;
      unsubscribe();
      window.clearTimeout(liftTimer);
    };
  }, [store]);

  return (
    <div ref={boxRef} aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <svg ref={svgRef} className="absolute inset-0 h-full w-full overflow-visible text-brand" />
      <div ref={penRef} className="absolute left-0 top-0 text-brand opacity-0 will-change-transform" style={{ transformOrigin: "0 0" }}>
        <PencilIcon />
      </div>
    </div>
  );
}
