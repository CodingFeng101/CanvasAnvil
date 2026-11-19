import { type CSSProperties, useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, HERO, HERO_WORKS, t, workSrc } from "../content";
import { Dot } from "../components";
import { clamp, prefersReducedMotion, scrollToId } from "../motion";
import type { PortalWorkspace } from "../data";

/*
 * S1: the headline inside a field of tiles. Tiles gather in on load, drift
 * slowly, and push outwards and fade as the page scrolls away (plan §3 S1).
 * Positions are recomputed on resize; the per-frame work only writes
 * transform and opacity.
 */

type Tile = {
  id: number;
  x: number;
  y: number;
  ph: number;
  per: number;
  amp: number;
  rot: number;
  fade: number;
  work?: (typeof HERO_WORKS)[number];
  swatch: string;
  squiggle?: { d: string; rot: number; flip: number };
};

const SQUIGGLES = [
  "M-5 70 C 20 40, 40 90, 60 60 S 95 20, 105 45",
  "M-5 30 C 25 60, 45 10, 65 40 S 90 85, 105 70",
  "M20 -5 C 50 20, 10 45, 40 65 S 70 90, 55 105",
];

function buildTiles(W: number, H: number) {
  const s = Math.round(clamp((W / 1920) * 132, 64, 132));
  const gap = s * 1.8;
  const box = { w: Math.min(820, W * 0.62) / 2, h: 210 };
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const tiles: Tile[] = [];
  let wi = 0;
  for (let y = -H / 2 - s; y < H / 2 + s; y += gap) {
    const row = Math.round(y / gap);
    for (let x = -W / 2 - s; x < W / 2 + s; x += gap) {
      const ox = x + (row % 2 ? gap / 2 : 0) + (rnd() - 0.5) * s * 0.5;
      const oy = y + (rnd() - 0.5) * s * 0.5;
      const ex = Math.abs(ox) / (box.w + s * 0.9);
      const ey = Math.abs(oy) / (box.h + s * 0.9);
      if (ex < 1 && ey < 1) continue; // keep the headline clear
      if (rnd() < 0.22) continue; // breathing room
      const isWork = rnd() < 0.62;
      const tile: Tile = { id: tiles.length, x: ox, y: oy, ph: 0, per: 0, amp: 0, rot: 0, fade: 0, swatch: "" };
      if (isWork) {
        const work = HERO_WORKS[wi++ % HERO_WORKS.length];
        tile.work = work;
        tile.swatch = CANVAS[work.k].swatch;
      } else {
        tile.swatch = CANVAS[CANVAS_ORDER[Math.floor(rnd() * 4)]].swatch;
        tile.squiggle = { d: SQUIGGLES[Math.floor(rnd() * 3)], rot: [0, 90, 180, 270][Math.floor(rnd() * 4)], flip: rnd() < 0.5 ? -1 : 1 };
      }
      const dist = Math.hypot(ox / W, oy / H);
      tile.ph = rnd() * 6.28;
      tile.per = 20 + rnd() * 20;
      tile.amp = 4 + rnd() * 4;
      tile.rot = (rnd() - 0.5) * 6;
      tile.fade = clamp(0.15 + (1 - dist) * 0.5 + rnd() * 0.25, 0.1, 0.9);
      tiles.push(tile);
    }
  }
  return { size: s, tiles };
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function HeroRing({ lang, onEnter }: { lang: UiLanguage; onEnter: (k: PortalWorkspace) => void }) {
  const heroRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const tileEls = useRef<Array<HTMLDivElement | null>>([]);
  const [field, setField] = useState(() => ({ size: 100, tiles: [] as Tile[] }));
  const [ready, setReady] = useState(false);
  const [card, setCard] = useState<{ tile: Tile; left: number; top: number } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const hideTimer = useRef<number>(0);

  // Lay the tiles out for this window size.
  useEffect(() => {
    const build = () => {
      const hero = heroRef.current;
      if (!hero) return;
      setField(buildTiles(window.innerWidth, hero.offsetHeight));
    };
    build();
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(build, 200);
    };
    window.addEventListener("resize", onResize);
    const raf = requestAnimationFrame(() => setReady(true));
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Drift, gather-in and scroll push-out.
  useEffect(() => {
    const reduce = prefersReducedMotion();
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const hero = heroRef.current;
      if (!hero) return;
      const p = clamp(window.scrollY / (hero.offsetHeight * 0.85));
      if (p >= 1) return; // off screen: nothing to move
      const intro = reduce ? 1 : easeInOut(clamp((now - t0 - 100) / 1300));
      const time = now / 1000;
      const k = 0.25 + 0.75 * intro;
      const push = 1 + p * 0.55;
      field.tiles.forEach((tile, i) => {
        const el = tileEls.current[i];
        if (!el) return;
        const dx = reduce ? 0 : Math.sin((time * 6.28) / tile.per + tile.ph) * tile.amp;
        const dy = reduce ? 0 : Math.cos((time * 6.28) / (tile.per * 1.3) + tile.ph) * tile.amp;
        const op = intro * (1 - clamp((p - (1 - tile.fade) * 0.7) * 2));
        el.style.transform = `translate(${tile.x * k * push + dx}px, ${tile.y * k * push + dy}px) rotate(${tile.rot * p}deg)`;
        el.style.opacity = op.toFixed(3);
      });
      const head = headRef.current;
      if (head) {
        head.style.transform = `translateY(${-p * 80}px)`;
        head.style.opacity = (1 - clamp(p * 1.6)).toFixed(3);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [field]);

  const showCard = (tile: Tile, el: HTMLElement) => {
    const hero = heroRef.current;
    if (!hero || !tile.work) return;
    window.clearTimeout(hideTimer.current);
    const r = el.getBoundingClientRect();
    const hr = hero.getBoundingClientRect();
    let top = r.bottom - hr.top + 30;
    if (top + 230 > hr.height) top = r.top - hr.top - 236;
    const left = clamp(r.left - hr.left + r.width / 2 - 112, 12, window.innerWidth - 236);
    setCard({ tile, left, top });
    setCardOpen(true);
  };
  const hideCard = () => {
    hideTimer.current = window.setTimeout(() => setCardOpen(false), 120);
  };

  const words = HERO.words[lang];
  let wordIndex = 0;

  return (
    <header ref={heroRef} className="p-hero" data-ready={ready}>
      <div className="p-ring">
        {field.tiles.map((tile, i) => (
          <div
            key={`${field.size}-${tile.id}`}
            ref={(el) => {
              tileEls.current[i] = el;
            }}
            className="p-tile"
            data-work={Boolean(tile.work)}
            style={{ "--s": `${field.size}px` } as CSSProperties}
            onPointerEnter={tile.work ? (e) => showCard(tile, e.currentTarget) : undefined}
            onPointerLeave={tile.work ? hideCard : undefined}
            onClick={tile.work ? () => onEnter(tile.work!.k) : undefined}
          >
            <div className="p-tile-face" style={{ "--bg": tile.swatch } as CSSProperties}>
              {tile.work ? (
                <img loading="lazy" decoding="async" src={workSrc(tile.work.img, "sm")} alt="" />
              ) : tile.squiggle ? (
                <svg viewBox="0 0 100 100" style={{ transform: `rotate(${tile.squiggle.rot}deg) scaleX(${tile.squiggle.flip})` }} aria-hidden="true">
                  <path d={tile.squiggle.d} fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              ) : null}
            </div>
            {tile.work && <div className="p-tile-cap">{t(tile.work.name, lang)}</div>}
          </div>
        ))}
      </div>

      {card?.tile.work && (
        <div
          className="p-tilecard"
          data-open={cardOpen}
          style={{ left: card.left, top: card.top }}
          onPointerEnter={() => window.clearTimeout(hideTimer.current)}
          onPointerLeave={hideCard}
        >
          <div className="p-tilecard-m">
            <img src={workSrc(card.tile.work.img, "sm")} alt="" />
          </div>
          <b>{t(card.tile.work.name, lang)}</b>
          <span className="p-tilecard-meta">
            <Dot color={CANVAS[card.tile.work.k].ink} />
            {t(CANVAS[card.tile.work.k].name, lang)}
            <button type="button" onClick={() => onEnter(card.tile.work!.k)}>
              {t(HERO.open, lang)}
            </button>
          </span>
        </div>
      )}

      <div className="p-center">
        <div ref={headRef} className="p-head">
          <h1 className="p-display" aria-label={t(HERO.title, lang)}>
            {words.map((w, i) =>
              w === null ? (
                <br key={`br-${i}`} />
              ) : (
                <span key={i} className="p-hmask" aria-hidden="true">
                  <span className="p-hword" style={{ "--i": wordIndex++ } as CSSProperties}>
                    {w}
                    {lang === "en" && words[i + 1] ? " " : null}
                  </span>
                </span>
              ),
            )}
          </h1>
          <p className="p-lead p-hfade" style={{ whiteSpace: "pre-line" }}>
            {t(HERO.sub, lang)}
          </p>
          <div className="p-ctas p-hfade">
            <button type="button" className="p-btn p-btn-ink" onClick={() => scrollToId("p-ask")}>
              {t(HERO.primary, lang)}
            </button>
            <button type="button" className="p-btn p-btn-line" onClick={() => scrollToId("p-story")}>
              {t(HERO.secondary, lang)}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
