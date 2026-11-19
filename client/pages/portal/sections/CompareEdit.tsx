import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { EDIT, t } from "../content";
import { Reveal, Words } from "../components";
import { clamp, prefersReducedMotion, useReveal } from "../motion";

/*
 * S5: whatever a canvas makes can still be changed. A before/after slider on
 * the diagram layout fix; it slides itself to the middle the first time it
 * is on screen, then follows the pointer or the arrow keys (plan §3 S5).
 */
export function CompareEdit({ lang }: { lang: UiLanguage }) {
  const [x, setX] = useState(100);
  const cmpRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const textRef = useReveal<HTMLDivElement>();

  useEffect(() => {
    const el = cmpRef.current;
    if (!el) return;
    let raf = 0;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const dur = prefersReducedMotion() ? 1 : 1400;
        timer = window.setTimeout(() => {
          const t0 = performance.now();
          const step = (now: number) => {
            if (dragging.current) return;
            const p = clamp((now - t0) / dur);
            setX(100 - 50 * (1 - Math.pow(1 - p, 3)));
            if (p < 1) raf = requestAnimationFrame(step);
          };
          raf = requestAnimationFrame(step);
        }, 500);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  const follow = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setX(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      dragging.current = true;
      setX((v) => clamp(v + (e.key === "ArrowLeft" ? -5 : 5), 0, 100));
    }
  };

  return (
    <section id="p-edit" className="p-edit">
      <div className="p-wrap p-edit-grid">
        <div ref={textRef}>
          <div className="p-micro p-rv">{t(EDIT.eyebrow, lang)}</div>
          <Words className="p-h1" words={EDIT.title[lang]} style={{ marginTop: 14 }} />
          <p className="p-edit-text p-rv" style={{ "--i": 1 } as CSSProperties}>
            {t(EDIT.text, lang)}
          </p>
          <div className="p-bul p-rv" style={{ "--i": 2 } as CSSProperties}>
            {EDIT.bullets.map((b, i) => (
              <span key={i}>{t(b, lang)}</span>
            ))}
          </div>
        </div>

        <Reveal i={1}>
          <div
            ref={cmpRef}
            className="p-cmp"
            style={{ "--x": `${x}%` } as CSSProperties}
            role="slider"
            tabIndex={0}
            aria-label={t(EDIT.sliderLabel, lang)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(x)}
            onPointerDown={(e) => {
              dragging.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              follow(e);
            }}
            onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && follow(e)}
            onKeyDown={onKey}
          >
            <img src={EDIT.beforeImg} alt={t(EDIT.before, lang)} loading="lazy" decoding="async" />
            <img className="p-cmp-after" src={EDIT.afterImg} alt={t(EDIT.after, lang)} loading="lazy" decoding="async" />
            <div className="p-cmp-bar" />
            <span className="p-cmp-lab" style={{ left: 14 }}>
              {t(EDIT.before, lang)}
            </span>
            <span className="p-cmp-lab" style={{ right: 14 }}>
              {t(EDIT.after, lang)}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
