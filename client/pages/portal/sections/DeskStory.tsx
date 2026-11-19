import { type CSSProperties, Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, STORY, STORY_SCENES, t } from "../content";
import { CanvasIcon, Dot, Words } from "../components";
import { clamp, scrollToId, useIsNarrow } from "../motion";
import type { PortalWorkspace } from "../data";

/*
 * S3: one desk, four canvases. The section is 460vh tall with a sticky
 * stage; scrolling moves through the four scenes, and each scene plays a
 * short timeline: the prompt types itself, steps tick off, the result
 * appears, a hand-drawn circle marks a change, and export chips land
 * (plan §3 S3). Below 960px the stage stops pinning and the dock switches
 * scenes instead.
 */

type Play = {
  typed: string;
  steps: number;
  shot: string;
  shotOn: boolean;
  draw: boolean;
  patch: boolean;
  exports: boolean;
  note: boolean;
};

const EMPTY: Play = { typed: "", steps: 0, shot: "", shotOn: false, draw: false, patch: false, exports: false, note: false };

export function DeskStory({ lang, onDetail }: { lang: UiLanguage; onDetail: (k: PortalWorkspace) => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const narrow = useIsNarrow();
  const [cur, setCur] = useState(-1);
  const [shown, setShown] = useState(0); // the scene whose copy is on screen
  const [swap, setSwap] = useState(false);
  const [play, setPlay] = useState<Play>(EMPTY);
  const timers = useRef<number[]>([]);

  const run = useCallback(
    (i: number) => {
      timers.current.forEach(window.clearTimeout);
      timers.current = [];
      const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
      const s = STORY_SCENES[i];
      const prompt = t(s.prompt, lang);
      setSwap(true);
      later(() => {
        setShown(i);
        setSwap(false);
      }, 300);
      setPlay(EMPTY);
      let ms = 350;
      [...prompt].forEach((_, j) => later(() => setPlay((p) => ({ ...p, typed: prompt.slice(0, j + 1) })), ms + j * 45));
      ms += prompt.length * 45 + 300;
      s.steps.forEach((_, j) => later(() => setPlay((p) => ({ ...p, steps: j + 1 })), ms + j * 450));
      ms += s.steps.length * 450 + 200;
      later(() => setPlay((p) => ({ ...p, shot: s.img, shotOn: true })), ms);
      ms += 900;
      later(() => setPlay((p) => ({ ...p, draw: true, note: true })), ms);
      ms += 1200;
      later(() => {
        setPlay((p) => ({ ...p, patch: true, shotOn: s.after ? false : p.shotOn }));
        if (s.after) later(() => setPlay((p) => ({ ...p, shot: s.after!, shotOn: true })), 300);
      }, ms);
      ms += 700;
      later(() => setPlay((p) => ({ ...p, exports: true })), ms);
    },
    [lang],
  );

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
      setScene(Math.min(3, Math.floor(p * 4)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [narrow, setScene]);

  // Start the first scene as soon as the section shows up.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && curRef.current === -1) setScene(0);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [setScene]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  // A language switch replays the current scene in the new language.
  useEffect(() => {
    if (curRef.current >= 0) run(curRef.current);
  }, [run]);

  // The circle is placed in % of the picture, so track where the picture sits.
  const mainRef = useRef<HTMLDivElement>(null);
  const shotRef = useRef<HTMLImageElement>(null);
  const [frame, setFrame] = useState<CSSProperties>({});
  const measure = useCallback(() => {
    const img = shotRef.current;
    if (!img || !img.naturalWidth) return;
    setFrame({ left: img.offsetLeft, top: img.offsetTop, width: img.offsetWidth, height: img.offsetHeight });
  }, []);
  useEffect(() => {
    const main = mainRef.current;
    if (!main || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    return () => ro.disconnect();
  }, [measure]);

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
  const scene = STORY_SCENES[active];
  const copyScene = STORY_SCENES[shown];
  const others = CANVAS_ORDER.filter((k) => k !== scene.k);
  const [l, tp, w, h] = scene.circle;
  const box = { left: `${l}%`, top: `${tp}%`, width: `${w}%`, height: `${h}%` };

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
                    Array.from({ length: 6 }, (_, j) => (
                      <div key={j} className="p-tk" data-on={i < cur}>
                        <i style={{ "--k": tick++ } as CSSProperties} />
                      </div>
                    ))}
                </Fragment>
              ))}
            </div>

            <div className="p-copy3" data-swap={swap} aria-live="polite">
              <span className="p-chip">
                <Dot color={CANVAS[copyScene.k].ink} />
                {t(CANVAS[copyScene.k].name, lang)}
              </span>
              <h3>{t(copyScene.title, lang)}</h3>
              <p>{t(copyScene.text, lang)}</p>
              <button type="button" className="p-more" onClick={() => onDetail(copyScene.k)}>
                {t(STORY.more, lang).replace("{name}", t(CANVAS[copyScene.k].name, lang))}
              </button>
            </div>

            <div>
              <div className="p-paperstack">
                <div className="p-sheet" style={{ background: CANVAS[others[0]].swatch }} />
                <div className="p-sheet p-sheet-2" style={{ background: CANVAS[others[1]].swatch }} />
                <div className="p-desk" style={{ background: CANVAS[scene.k].swatch }}>
                  <div className="p-win">
                    <div className="p-win-side">
                      <div className="p-bubble">
                        <span>{play.typed}</span>
                        <span className="p-caret" />
                      </div>
                      <div className="p-steps">
                        {scene.steps.map((step, i) => (
                          <div key={i} className="p-step" data-show={i < play.steps}>
                            {t(step, lang)}
                          </div>
                        ))}
                      </div>
                      <div className="p-note" data-show={play.note}>
                        ✎ {t(scene.note, lang)}
                      </div>
                      <div className="p-inp">
                        {t(STORY.inputHint, lang)}
                        <i>↑</i>
                      </div>
                    </div>
                    <div ref={mainRef} className="p-win-main">
                      {play.shot && (
                        <img ref={shotRef} className="p-shot" data-show={play.shotOn} src={play.shot} alt={t(scene.title, lang)} onLoad={measure} />
                      )}
                      <div className="p-shotframe" style={frame}>
                        <div className="p-patch" data-show={play.patch} style={box} />
                        <svg className="p-hand" data-draw={play.draw} style={box} viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
                          <path pathLength={1} d="M8 34 C 6 12, 44 4, 74 9 S 98 30, 86 46 S 30 60, 14 48 S 4 30, 22 18" />
                        </svg>
                      </div>
                      <div className="p-exports" data-show={play.exports}>
                        {scene.exports.map((x, j) => (
                          <span key={j} className="p-chip" style={{ "--i": j } as CSSProperties}>
                            {t(x, lang)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
                    <button key={s.k} type="button" data-on={i === cur} aria-label={t(CANVAS[s.k].name, lang)} onClick={() => goScene(i)}>
                      <CanvasIcon k={s.k} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
