import { useEffect, useRef, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, FILL, FILL_LIBRARY, t, workSrc } from "../content";
import type { PortalWorkspace } from "../data";

/*
 * S4: "I want a ___ for ___." Both blanks open a small menu of the current
 * canvas's options; the lists below switch canvas and use, and the paper
 * stack shows the matching piece of work (plan §3 S4).
 */
export function FillSentence({ lang, onEnter }: { lang: UiLanguage; onEnter: (k: PortalWorkspace, prompt?: string) => void }) {
  const [ck, setCk] = useState<PortalWorkspace>("diagram");
  const [ci, setCi] = useState(0);
  const [menu, setMenu] = useState<{ col: "type" | "use"; left: number; top: number } | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const item = FILL_LIBRARY[ck][ci];
  const others = CANVAS_ORDER.filter((k) => k !== ck);
  const sentence = `${t(FILL.before, lang)}${lang === "en" ? " " : ""}${t(item.type, lang)}${lang === "en" ? " " : ""}${t(FILL.middle, lang)}${lang === "en" ? " " : ""}${t(item.use, lang)}${t(FILL.after, lang)}`;

  const openMenu = (col: "type" | "use", el: HTMLElement) => {
    const section = sectionRef.current;
    if (!section) return;
    const r = el.getBoundingClientRect();
    const pr = section.getBoundingClientRect();
    setMenu({ col, left: Math.min(r.left - pr.left, pr.width - 220), top: r.bottom - pr.top + 10 });
  };

  const slot = (col: "type" | "use") => (
    <button
      type="button"
      className="p-slot"
      aria-haspopup="menu"
      aria-expanded={menu?.col === col}
      onClick={(e) => {
        e.stopPropagation();
        if (menu?.col === col) setMenu(null);
        else openMenu(col, e.currentTarget);
      }}
    >
      {t(col === "type" ? item.type : item.use, lang)}
    </button>
  );

  return (
    <section ref={sectionRef} id="p-fill" className="p-fill">
      <div className="p-wrap">
        <h2 className="p-h1 p-sentence">
          {t(FILL.before, lang)} {slot("type")}
          {lang === "en" ? " " : ""}
          {t(FILL.middle, lang)} {slot("use")}
          {lang === "zh" ? " " : ""}
          {t(FILL.after, lang)}
        </h2>

        <div className="p-menu" role="menu" data-open={Boolean(menu)} style={menu ? { left: menu.left, top: menu.top } : { left: 0, top: 0 }}>
          {FILL_LIBRARY[ck].map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              tabIndex={menu ? 0 : -1}
              onClick={() => {
                setCi(i);
                setMenu(null);
              }}
            >
              {t(menu?.col === "use" ? it.use : it.type, lang)}
            </button>
          ))}
        </div>

        <div className="p-lib">
          <div>
            <h4>{t(FILL.canvases, lang)}</h4>
            <ul>
              {CANVAS_ORDER.map((k) => (
                <li key={k}>
                  <button
                    type="button"
                    data-on={k === ck}
                    onClick={() => {
                      setCk(k);
                      setCi(0);
                    }}
                  >
                    {t(CANVAS[k].name, lang)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-stack">
            <div className="p-sheet" style={{ background: CANVAS[others[0]].swatch }} />
            <div className="p-sheet p-sheet-2" style={{ background: CANVAS[others[1]].swatch }} />
            <div className="p-stack-base" style={{ background: CANVAS[ck].swatch }}>
              <div key={`${ck}-${ci}`} className="p-art">
                <div className="p-art-bar">
                  <i />
                  <i />
                  <i />
                  <span style={{ marginLeft: 6 }}>
                    {t(item.type, lang)} · {t(CANVAS[ck].name, lang)}
                  </span>
                </div>
                <img src={workSrc(item.img)} alt={t(item.type, lang)} loading="lazy" decoding="async" />
              </div>
              <button type="button" className="p-btn p-btn-ink p-btn-sm p-stack-go" onClick={() => onEnter(ck, sentence)}>
                {t(FILL.go, lang)}
              </button>
            </div>
          </div>

          <div className="p-lib-right">
            <h4>{t(FILL.uses, lang)}</h4>
            <ul>
              {FILL_LIBRARY[ck].map((it, i) => (
                <li key={i}>
                  <button type="button" data-on={i === ci} onClick={() => setCi(i)}>
                    {t(it.type, lang)}
                  </button>
                  <small>{t(FILL.useFor, lang).replace("{use}", t(it.use, lang))}</small>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
