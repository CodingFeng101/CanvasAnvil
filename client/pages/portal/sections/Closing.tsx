import { type CSSProperties, type FormEvent, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { ASK, CANVAS, CANVAS_ORDER, FAQ, WORKS, guessCanvas, t, workSrc } from "../content";
import { Dot, Reveal, Words } from "../components";
import { useReveal } from "../motion";
import type { PortalWorkspace } from "../data";

/* The last three sections of the home page: S6 works, S7 FAQ, S8 ask (plan §3). */

const ROT = [-1.5, 1, -0.6, 1.4, -1.1, 0.7];
const LIFT = [6, -4, 10, 0, 8, -2];

export function WorksShelf({ lang, onEnter }: { lang: UiLanguage; onEnter: (k: PortalWorkspace) => void }) {
  const topRef = useReveal<HTMLDivElement>();
  return (
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
              style={{ "--r": `${ROT[i]}deg`, "--y": `${LIFT[i]}px`, "--c": CANVAS[w.k].swatch } as CSSProperties}
              onClick={() => onEnter(w.k)}
            >
              <span className="p-book-th" style={{ display: "block" }}>
                <img loading="lazy" decoding="async" src={workSrc(w.img, "sm")} alt="" />
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
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t(ASK.placeholder, lang)} autoComplete="off" aria-label={t(ASK.placeholder, lang)} />
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
