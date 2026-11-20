import { type CSSProperties, Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, STORY, STORY_SCENES, t } from "../content";
import { CanvasIcon, Dot, Words } from "../components";
import { clamp, prefersReducedMotion, scrollToId, useIsNarrow } from "../motion";
import type { PortalWorkspace } from "../data";

/*
 * S3: one desk, four canvases. The section is tall with a sticky stage;
 * scrolling moves through the four scenes. Each scene plays real screenshots
 * of that canvas at work, one after another, each with a short caption
 * (plan §3 S3). Below 960px the stage stops pinning and the dock switches
 * scenes instead.
 */

const OUT_MS = 320;
/** How long each screenshot stays before the next one. */
const SHOT_MS = 2800;
const TICKS_PER_GAP = 6;
/** Rail ticks per scene: the scene's own long tick plus the short ones up to the next. */
const TICK_STEP = TICKS_PER_GAP + 1;

/** Warm the browser cache so the next scene's first picture is ready when it is needed. */
function preload(i: number) {
  const scene = STORY_SCENES[i];
  if (!scene) return;
  scene.shots.forEach((s) => {
    const im = new Image();
    im.decoding = "async";
    im.src = s.img;
  });
}

export function DeskStory({ lang, onDetail }: { lang: UiLanguage; onDetail: (k: PortalWorkspace) => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const narrow = useIsNarrow();
  const [cur, setCur] = useState(-1);
  const [shown, setShown] = useState(0); // the scene whose copy and desk are on screen
  const [swap, setSwap] = useState(false);
  const [shot, setShot] = useState(0);
  const timers = useRef<number[]>([]);

  const run = useCallback((i: number) => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    // The old scene slides out first; the new window comes up only then,
    // so a switch reads as turning to the next sheet, not as a freeze.
    setSwap(true);
    later(() => {
      setShown(i);
      setShot(0);
      setSwap(false);
    }, OUT_MS);
    const n = STORY_SCENES[i].shots.length;
    if (!prefersReducedMotion()) {
      for (let j = 1; j < n; j++) later(() => setShot(j), OUT_MS + j * SHOT_MS);
    }
    preload(i + 1);
  }, []);

  const curRef = useRef(-1);
  const setScene = useCallback(
    (i: number, force = false) => {
      if (curRef.current === i && !force) return;
      curRef.current = i;
      setCur(i);
      run(i);
    },
    [run],
  );

  // Desktop: the scroll position inside the tall section picks the scene.
  useEffect(() => {
    if (narrow) return;
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.4) return;
      const total = el.offsetHeight - window.innerHeight;
      const p = clamp(-r.top / total);
      // The rail fills continuously with the scroll, so scrolling always shows movement.
      el.style.setProperty("--sp", (p * STORY_SCENES.length * TICK_STEP).toFixed(2));
      setScene(Math.min(3, Math.floor(p * 4)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [narrow, setScene]);

  // Start the first scene as soon as the section shows up, and fetch its pictures a little earlier.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          preload(0);
          near.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && curRef.current === -1) setScene(0);
      },
      { threshold: 0.3 },
    );
    near.observe(el);
    io.observe(el);
    return () => {
      near.disconnect();
      io.disconnect();
    };
  }, [setScene]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const goScene = (i: number) => {
    const el = sectionRef.current;
    if (narrow || !el) {
      setScene(i, true);
      return;
    }
    const top = el.offsetTop + ((el.offsetHeight - window.innerHeight) * (i + 0.5)) / 4;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const active = Math.max(cur, 0);
  const scene = STORY_SCENES[shown];
  const others = CANVAS_ORDER.filter((k) => k !== scene.k);
  const next = cur >= 0 && cur < STORY_SCENES.length - 1 ? STORY_SCENES[cur + 1] : null;
  const cap = scene.shots[shot];

  let tick = 0;
  return (
    <section ref={sectionRef} id="p-story" className="p-story">
      <div className="p-pin">
        <div className="p-wrap">
          <div className="p-story-title">
            <Words className="p-h1" words={STORY.title[lang]} />
            <p>{t(STORY.sub, lang)}</p>
          </div>

          <div className="p-stage">
            <div className="p-railv" aria-hidden="true">
              {STORY_SCENES.map((s, i) => (
                <Fragment key={s.k}>
                  <div className="p-tk" data-big="true" data-on={i <= cur} data-cur={i === cur}>
                    <i style={{ "--k": tick++ } as CSSProperties} />
                    <em>{t(CANVAS[s.k].name, lang)}</em>
                  </div>
                  {i < STORY_SCENES.length - 1 &&
                    Array.from({ length: TICKS_PER_GAP }, (_, j) => (
                      <div key={j} className="p-tk">
                        <i style={{ "--k": tick++ } as CSSProperties} />
                      </div>
                    ))}
                </Fragment>
              ))}
            </div>

            <div className="p-copy3" data-swap={swap} aria-live="polite">
              <span className="p-chip">
                <Dot color={CANVAS[scene.k].ink} />
                {t(CANVAS[scene.k].name, lang)}
              </span>
              <h3>{t(scene.title, lang)}</h3>
              <p>{t(scene.text, lang)}</p>
              <button type="button" className="p-more" onClick={() => onDetail(scene.k)}>
                {t(STORY.more, lang).replace("{name}", t(CANVAS[scene.k].name, lang))}
              </button>
            </div>

            <div className="p-deskcol">
              <div className="p-paperstack">
                <div className="p-sheet" style={{ background: CANVAS[others[0]].swatch }} />
                <div className="p-sheet p-sheet-2" style={{ background: CANVAS[others[1]].swatch }} />
                <div className="p-desk" data-swap={swap} style={{ background: CANVAS[scene.k].swatch }}>
                  <div key={scene.k} className="p-win">
                    <div className="p-win-bar" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <span>CanvasAnvil · {t(CANVAS[scene.k].name, lang)}</span>
                    </div>
                    <div className="p-win-shots">
                      {scene.shots.map((s, j) => (
                        <img key={s.img} src={s.img} alt={t(s.cap, lang)} data-show={j === shot} decoding="async" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-shotcap" data-swap={swap}>
                <div className="p-shotsteps" aria-hidden="true">
                  {scene.shots.map((s, j) => (
                    <i key={s.img} data-on={j <= shot} />
                  ))}
                </div>
                <span key={`${scene.k}-${shot}`}>{t(cap.cap, lang)}</span>
              </div>
              <div className="p-under">
                <div className="p-under-acts">
                  <button type="button" className="p-btn p-btn-line p-btn-sm" onClick={() => scrollToId("p-fill")}>
                    {t(STORY.another, lang)}
                  </button>
                  <button type="button" className="p-btn p-btn-line p-btn-sm" onClick={() => setScene(active, true)}>
                    {t(STORY.replay, lang)}
                  </button>
                </div>
                <div className="p-dock">
                  {STORY_SCENES.map((s, i) => (
                    <button key={s.k} type="button" data-on={i === cur} aria-pressed={i === cur} aria-label={t(CANVAS[s.k].name, lang)} onClick={() => goScene(i)}>
                      <CanvasIcon k={s.k} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {!narrow && (
          <div className="p-scrollhint" data-show={Boolean(next)} aria-hidden="true">
            {next ? t(STORY.next, lang).replace("{name}", t(CANVAS[next.k].name, lang)) : " "}
            <i>↓</i>
          </div>
        )}
      </div>
    </section>
  );
}
