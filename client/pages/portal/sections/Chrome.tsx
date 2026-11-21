import { useEffect, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { CANVAS, CANVAS_ORDER, FOOTER, NAV, REPO_URL, t } from "../content";
import { docsHref } from "@/pages/docs/route";
import { BrandMark, GithubIcon } from "../components";
import type { PortalWorkspace } from "../data";

/* S0 nav and S9 footer, shared by the home page and the detail pages. */

export function PortalNav({
  lang,
  onHome,
  onSection,
  onTutorials,
}: {
  lang: UiLanguage;
  onHome: () => void;
  onSection: (id: string) => void;
  onTutorials: () => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links: Array<[string, keyof typeof NAV]> = [
    ["p-story", "canvases"],
    ["p-fill", "examples"],
    ["p-edit", "how"],
    ["p-faq", "faq"],
  ];

  return (
    <nav className="p-nav" data-scrolled={scrolled} aria-label="CanvasAnvil">
      <div className="p-wrap p-nav-row">
        <button type="button" className="p-brand" onClick={onHome}>
          <BrandMark />
          CanvasAnvil
        </button>
        <div className="p-links">
          {links.map(([id, key]) => (
            <button key={id} type="button" className="p-navlink" onClick={() => onSection(id)}>
              {t(NAV[key], lang)}
            </button>
          ))}
        </div>
        <div className="p-nav-r">
          <button type="button" className="p-navtool p-hide-m" onClick={onTutorials}>
            {t(NAV.tutorials, lang)}
          </button>
          <a className="p-navtool p-hide-m" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="GitHub">
            <GithubIcon />
          </a>
          <button type="button" className="p-btn p-btn-ink p-btn-sm" style={{ marginLeft: 6 }} onClick={() => onSection("p-ask")}>
            {t(NAV.start, lang)}
          </button>
        </div>
      </div>
    </nav>
  );
}

export function PortalFooter({
  lang,
  onDetail,
  onTutorials,
}: {
  lang: UiLanguage;
  onDetail: (k: PortalWorkspace) => void;
  onTutorials: () => void;
}) {
  return (
    <footer className="p-footer">
      <div className="p-wrap">
        <div className="p-footer-cols">
          <div>
            <span className="p-brand">
              <BrandMark />
              CanvasAnvil
            </span>
            <p className="p-footer-tag">{t(FOOTER.tagline, lang)}</p>
          </div>
          <div>
            <h5>{t(FOOTER.canvases, lang)}</h5>
            <ul>
              {CANVAS_ORDER.map((k) => (
                <li key={k}>
                  <button type="button" onClick={() => onDetail(k)}>
                    {t(CANVAS[k].name, lang)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>{t(FOOTER.resources, lang)}</h5>
            <ul>
              <li>
                <button type="button" onClick={onTutorials}>
                  {t(FOOTER.tutorials, lang)}
                </button>
              </li>
              <li>
                <a href={docsHref("changelog")}>
                  {t(FOOTER.changelog, lang)}
                </a>
              </li>
              <li>
                <a href={docsHref()}>
                  {t(FOOTER.docs, lang)}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h5>{t(FOOTER.open, lang)}</h5>
            <ul>
              <li>
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
              <li>
                <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  {t(FOOTER.license, lang)}
                </a>
              </li>
              <li>
                <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
                  {t(FOOTER.issues, lang)}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="p-footer-base">
          <span>© 2026 CanvasAnvil</span>
        </div>
      </div>
    </footer>
  );
}
