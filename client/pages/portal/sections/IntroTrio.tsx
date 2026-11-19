import { type CSSProperties, useState } from "react";
import type { UiLanguage } from "@/shared/i18n";
import { INTRO, t } from "../content";
import { Reveal } from "../components";
import { useReveal } from "../motion";

/*
 * S2: the latest update video, then three numbered promises (plan §3 S2).
 * The video loads only once someone presses play; until then it is a poster.
 */
export function IntroTrio({ lang }: { lang: UiLanguage }) {
  const [playing, setPlaying] = useState(false);
  const trioRef = useReveal<HTMLDivElement>();

  return (
    <section className="p-s2">
      <div className="p-wrap">
        <Reveal className="p-video">
          {playing ? (
            <video src={INTRO.video} poster={INTRO.poster} controls autoPlay playsInline preload="auto" />
          ) : (
            <>
              <img src={INTRO.poster} alt="" loading="lazy" decoding="async" />
              <button type="button" className="p-video-play" aria-label={t(INTRO.videoLabel, lang)} onClick={() => setPlaying(true)}>
                <span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5.5v13l10.5-6.5z" />
                  </svg>
                </span>
              </button>
            </>
          )}
        </Reveal>
        <Reveal as="p" i={1} className="p-vcap">
          {t(INTRO.videoCaption, lang)}
        </Reveal>

        <div ref={trioRef} className="p-trio">
          {INTRO.trio.map((item, i) => (
            <div key={i} className="p-rv" style={{ "--i": i } as CSSProperties}>
              <div className="p-rule" />
              <div className="p-micro p-trio-num">{String(i + 1).padStart(2, "0")}</div>
              <h3>{t(item.title, lang)}</h3>
              <p>{t(item.text, lang)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
