import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, t } from "../content";
import { Dot, Reveal, Words } from "../components";
import { scrollToId, useReveal } from "../motion";
import type { PortalWorkspace } from "../data";
import { DETAIL, DETAIL_UI } from "./detailContent";

/*
 * One canvas's detail page, in the home page's design system
 * (docs/plans/portal-redesign-plan.md §4): headline, a large piece of work on
 * paper, three promises, the six steps on a timeline, examples with a
 * lightbox, and an input box locked to this canvas.
 */

type Preview = { title: string; src: string };

export function CanvasDetailPage({
  canvas,
  lang,
  onEnter,
  onDetail,
  onHome,
}: {
  canvas: PortalWorkspace;
  lang: UiLanguage;
  onEnter: (k: PortalWorkspace, prompt?: string) => void;
  onDetail: (k: PortalWorkspace) => void;
  onHome: () => void;
}) {
  const d = DETAIL[canvas];
  const c = CANVAS[canvas];
  const others = CANVAS_ORDER.filter((k) => k !== canvas);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [text, setText] = useState("");
  const trioRef = useReveal<HTMLDivElement>();
  const stepsRef = useReveal<HTMLOListElement>();

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onEnter(canvas, text.trim() || undefined);
  };

  return (
    <>
      <section className="p-dhead">
        <div className="p-wrap">
          <nav className="p-crumb" aria-label={t(DETAIL_UI.crumb, lang)}>
            <button type="button" onClick={onHome}>
              {t(DETAIL_UI.crumb, lang)}
            </button>
            <span aria-hidden="true">/</span>
            <span>
              <Dot color={c.ink} /> {t(c.name, lang)}
            </span>
          </nav>
          <Words as="h1" key={`${canvas}-${lang}`} className="p-display" words={d.title[lang]} />
          <Reveal as="p" i={1} className="p-lead p-dsub">
            {t(d.sub, lang)}
          </Reveal>
          <Reveal i={2} className="p-ctas p-dctas">
            <button type="button" className="p-btn p-btn-ink" onClick={() => onEnter(canvas)}>
              {t(d.cta, lang)}
            </button>
            <button type="button" className="p-btn p-btn-line" onClick={() => scrollToId("p-dworks")}>
              {t(DETAIL_UI.examples, lang)}
            </button>
          </Reveal>
        </div>
      </section>

      <section className="p-wrap">
        <Reveal i={1} className="p-dhero">
          <div className="p-sheet" style={{ background: CANVAS[others[0]].swatch }} />
          <div className="p-sheet p-sheet-2" style={{ background: CANVAS[others[1]].swatch }} />
          <button
            type="button"
            className="p-dhero-base"
            style={{ background: c.swatch }}
            aria-label={`${t(DETAIL_UI.zoom, lang)}: ${t(d.heroAlt, lang)}`}
            onClick={() => setPreview({ title: t(d.heroAlt, lang), src: d.hero })}
          >
            <img src={d.hero} alt={t(d.heroAlt, lang)} decoding="async" />
          </button>
        </Reveal>
      </section>

      <section className="p-dsec">
        <div ref={trioRef} className="p-wrap p-trio">
          {d.trio.map((item, i) => (
            <div key={i} className="p-rv" style={{ "--i": i } as CSSProperties}>
              <div className="p-rule" />
              <div className="p-micro p-trio-num">{String(i + 1).padStart(2, "0")}</div>
              <h3>{t(item.title, lang)}</h3>
              <p>{t(item.text, lang)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-dsec p-dsteps">
        <div className="p-wrap">
          <Words className="p-h1" words={[t(DETAIL_UI.how, lang)]} />
          <ol ref={stepsRef} className="p-timeline">
            {d.steps.map((step, i) => (
              <li key={i} style={{ "--i": i } as CSSProperties}>
                <span className="p-tl-num">{String(i + 1).padStart(2, "0")}</span>
                <b>{t(step.title, lang)}</b>
                <span>{t(step.text, lang)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="p-dworks" className="p-dsec">
        <div className="p-wrap">
          <Words className="p-h1" words={[t(DETAIL_UI.worksTitle, lang)]} />
          <div className="p-dworks">
            {d.works.map((w, i) => (
              <Reveal key={`${canvas}-${i}`} i={i % 2} className="p-dwork">
                <button type="button" onClick={() => setPreview({ title: t(w.title, lang), src: w.img })} aria-label={`${t(DETAIL_UI.zoom, lang)}: ${t(w.title, lang)}`}>
                  <span className="p-dwork-th" style={{ background: c.swatch }}>
                    <img src={w.img} alt="" loading="lazy" decoding="async" />
                  </span>
                </button>
                <b>{t(w.title, lang)}</b>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="p-ask p-dask">
        <div className="p-wrap">
          <Words className="p-h1" words={[t(DETAIL_UI.askTitle, lang)]} />
          <form className="p-askbar" onSubmit={submit}>
            <span className="p-chip">
              <Dot color={c.ink} />
              {t(c.name, lang)}
            </span>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t(d.placeholder, lang)} autoComplete="off" aria-label={t(d.placeholder, lang)} />
            <button className="p-btn p-btn-clay" type="submit">
              {t(DETAIL_UI.submit, lang)}
            </button>
          </form>
          <div className="p-pick">
            <span className="p-pick-label">{t(DETAIL_UI.others, lang)}</span>
            {others.map((k) => (
              <button key={k} type="button" onClick={() => onDetail(k)}>
                <Dot color={CANVAS[k].ink} />
                {t(CANVAS[k].name, lang)} →
              </button>
            ))}
          </div>
        </div>
      </section>

      {preview && (
        <div className="p-lightbox" role="dialog" aria-modal="true" aria-label={preview.title} onClick={() => setPreview(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            <figcaption>
              <span>{preview.title}</span>
              <button type="button" className="p-navtool" onClick={() => setPreview(null)} aria-label={t(DETAIL_UI.close, lang)} autoFocus>
                ✕
              </button>
            </figcaption>
            <img src={preview.src} alt={preview.title} />
          </figure>
        </div>
      )}
    </>
  );
}
