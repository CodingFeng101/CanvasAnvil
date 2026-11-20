import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { ASK, CANVAS, CANVAS_ORDER, FAQ, WORK_VIEW, WORKS, guessCanvas, t, workSrc } from "../content";
import { Dot, Reveal, Words } from "../components";
import { useReveal } from "../motion";
import type { PortalWorkspace } from "../data";

/* The last three sections of the home page: S6 works, S7 FAQ, S8 ask (plan §3). */

const ROT = [-1.5, 1, -0.6, 1.4, -1.1, 0.7];
const LIFT = [6, -4, 10, 0, 8, -2];

export function WorksShelf({ lang, onEnter }: { lang: UiLanguage; onEnter: (k: PortalWorkspace) => void }) {
  const topRef = useReveal<HTMLDivElement>();
  const [open, setOpen] = useState<number | null>(null);
  // The viewer sits outside the section: the section's content-visibility
  // containment would otherwise trap its fixed position.
  return (
    <>
      <section className="p-works">
        <div className="p-wrap">
          <div ref={topRef} className="p-works-top">
            <Words className="p-h1" words={WORKS.title[lang]} />
            <p className="p-rv">{t(WORKS.text, lang)}</p>
          </div>
          <div className="p-shelf">
            {WORKS.items.map((w, i) => (
              <Reveal
                key={i}
                as="button"
                i={i}
                className="p-book"
                style={
                  {
                    "--r": `${ROT[i]}deg`,
                    "--y": `${LIFT[i]}px`,
                    "--c": CANVAS[w.k].swatch,
                  } as CSSProperties
                }
                onClick={() => setOpen(i)}
              >
                <span className="p-book-th" style={{ display: "block" }}>
                  <img loading="lazy" decoding="async" src={workSrc(w.img, "sm")} alt="" />
                  {w.gallery.length > 1 && <em className="p-book-count">{w.gallery.length}</em>}
                </span>
                <b>{t(w.name, lang)}</b>
                <span className="p-book-meta">
                  <Dot color={CANVAS[w.k].ink} />
                  {t(CANVAS[w.k].name, lang)} · {t(w.date, lang)}
                </span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      {open !== null && <WorkViewer work={WORKS.items[open]} lang={lang} onClose={() => setOpen(null)} onEnter={onEnter} />}
    </>
  );
}

/** The real files behind one work, one at a time, with a way into its canvas. */
function WorkViewer({
  work,
  lang,
  onClose,
  onEnter,
}: {
  work: (typeof WORKS.items)[number];
  lang: UiLanguage;
  onClose: () => void;
  onEnter: (k: PortalWorkspace) => void;
}) {
  const [i, setI] = useState(0);
  const n = work.gallery.length;
  const go = (d: number) => setI((v) => (v + d + n) % n);
  const shot = work.gallery[i];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((v) => (v + 1) % n);
      else if (e.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [n, onClose]);

  const name = t(CANVAS[work.k].name, lang);
  return (
    <div className="p-lightbox" role="dialog" aria-modal="true" aria-label={t(work.name, lang)} onClick={onClose}>
      <figure className="p-viewer" onClick={(e) => e.stopPropagation()}>
        <figcaption>
          <span>
            {t(work.name, lang)}
            <small>
              <Dot color={CANVAS[work.k].ink} />
              {name} · {t(shot.cap, lang)}
              {n > 1 && ` · ${i + 1}/${n}`}
            </small>
          </span>
          <button type="button" className="p-navtool" onClick={onClose} aria-label={t(WORK_VIEW.close, lang)} autoFocus>
            ✕
          </button>
        </figcaption>
        <div className="p-viewer-stage">
          <img key={shot.img} src={workSrc(shot.img)} alt={t(shot.cap, lang)} />
          {n > 1 && (
            <>
              <button type="button" className="p-viewer-arrow" data-side="l" onClick={() => go(-1)} aria-label={t(WORK_VIEW.prev, lang)}>
                ‹
              </button>
              <button type="button" className="p-viewer-arrow" data-side="r" onClick={() => go(1)} aria-label={t(WORK_VIEW.next, lang)}>
                ›
              </button>
            </>
          )}
        </div>
        <div className="p-viewer-foot">
          <div className="p-viewer-thumbs">
            {n > 1 &&
              work.gallery.map((g, j) => (
                <button key={g.img} type="button" data-on={j === i} aria-pressed={j === i} aria-label={t(g.cap, lang)} onClick={() => setI(j)}>
                  <img src={workSrc(g.img, "sm")} alt="" />
                </button>
              ))}
          </div>
          <button type="button" className="p-btn p-btn-ink p-btn-sm" onClick={() => onEnter(work.k)}>
            {t(WORK_VIEW.open, lang).replace("{name}", name)}
          </button>
        </div>
      </figure>
    </div>
  );
}

export function Faq({ lang }: { lang: UiLanguage }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section id="p-faq" className="p-faq">
      <div className="p-wrap p-faq-grid">
        <Words className="p-h1" words={FAQ.title[lang]} />
        <div>
          {FAQ.items.map((item, i) => (
            <div key={i} className="p-qa" data-open={open === i}>
              <button type="button" aria-expanded={open === i} aria-controls={`p-ans-${i}`} onClick={() => setOpen(open === i ? null : i)}>
                {t(item.q, lang)}
                <i aria-hidden="true">+</i>
              </button>
              <div id={`p-ans-${i}`} className="p-ans" role="region">
                <div>
                  <p>{t(item.a, lang)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function AskCta({ lang, onEnter }: { lang: UiLanguage; onEnter: (k: PortalWorkspace, prompt?: string) => void }) {
  const [text, setText] = useState("");
  const [chosen, setChosen] = useState<PortalWorkspace | null>(null);
  const wrapRef = useReveal<HTMLDivElement>();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const prompt = text.trim() || t(ASK.fallback, lang);
    onEnter(chosen ?? guessCanvas(prompt), prompt);
  };

  return (
    <section id="p-ask" className="p-ask">
      <div ref={wrapRef} className="p-wrap">
        <Words className="p-display" words={ASK.title[lang]} />
        <p className="p-lead p-rv">{t(ASK.text, lang)}</p>
        <form className="p-askbar p-rv" style={{ "--i": 1 } as CSSProperties} onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(ASK.placeholder, lang)}
            autoComplete="off"
            aria-label={t(ASK.placeholder, lang)}
          />
          <button className="p-btn p-btn-clay" type="submit">
            {t(ASK.submit, lang)}
          </button>
        </form>
        <div className="p-pick p-rv" style={{ "--i": 2 } as CSSProperties}>
          {CANVAS_ORDER.map((k) => (
            <button key={k} type="button" data-on={chosen === k} aria-pressed={chosen === k} onClick={() => setChosen(chosen === k ? null : k)}>
              <Dot color={CANVAS[k].ink} />
              {t(CANVAS[k].name, lang)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
