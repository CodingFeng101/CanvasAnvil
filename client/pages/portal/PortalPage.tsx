import { useCallback, useEffect, useRef, useState } from "react";
import { useUiLanguage } from "@/shared/i18n";
import "./portal.css";
import type { PortalWorkspace } from "./data";
import { scrollToId } from "./motion";
import { PortalFooter, PortalNav } from "./sections/Chrome";
import { HeroRing } from "./sections/HeroRing";
import { IntroTrio } from "./sections/IntroTrio";
import { DeskStory } from "./sections/DeskStory";
import { FillSentence } from "./sections/FillSentence";
import { CompareEdit } from "./sections/CompareEdit";
import { AskCta, Faq, WorksShelf } from "./sections/Closing";
import { CanvasDetailPage } from "./detail/CanvasDetailPage";

/*
 * The portal: one long page in the warm, literary style of
 * docs/plans/portal-redesign-plan.md, plus a detail page per canvas.
 * This file only assembles the sections; each lives in ./sections.
 */

type PortalPageProps = {
  /** Open a canvas. `prompt` is the sentence the visitor wrote, if any (carried over in P4). */
  onEnterWorkspace: (workspace: PortalWorkspace, prompt?: string) => void;
  onOpenTutorials: () => void;
};

type PortalView = "home" | PortalWorkspace;

export function PortalPage({ onEnterWorkspace, onOpenTutorials }: PortalPageProps) {
  const lang = useUiLanguage();
  const [view, setView] = useState<PortalView>("home");
  const pendingScroll = useRef<string | null>(null);


  const openDetail = useCallback((k: PortalWorkspace) => {
    setView(k);
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /** Jump to a home-page section, coming back from a detail page first if needed. */
  const goSection = useCallback(
    (id: string) => {
      if (view === "home") scrollToId(id);
      else {
        pendingScroll.current = id;
        setView("home");
      }
    },
    [view],
  );

  useEffect(() => {
    if (view !== "home" || !pendingScroll.current) return;
    const id = pendingScroll.current;
    pendingScroll.current = null;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [view]);

  // Other parts of the app can still ask the portal to show a page.
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<PortalView>).detail;
      if (target === "home") goHome();
      else if (target) openDetail(target);
    };
    document.addEventListener("portal:navigate", onNavigate);
    return () => document.removeEventListener("portal:navigate", onNavigate);
  }, [goHome, openDetail]);

  return (
    <div className="portal" data-lang={lang} lang={lang === "zh" ? "zh-CN" : "en"}>
      <PortalNav lang={lang} onHome={goHome} onSection={goSection} onTutorials={onOpenTutorials} />

      {view === "home" ? (
        <main>
          <HeroRing lang={lang} onEnter={onEnterWorkspace} />
          <IntroTrio lang={lang} />
          <DeskStory lang={lang} onDetail={openDetail} />
          <FillSentence lang={lang} onEnter={onEnterWorkspace} />
          <CompareEdit lang={lang} />
          <WorksShelf lang={lang} onEnter={onEnterWorkspace} />
          <Faq lang={lang} />
          <AskCta lang={lang} onEnter={onEnterWorkspace} />
        </main>
      ) : (
        <main key={view}>
          <CanvasDetailPage canvas={view} lang={lang} onEnter={onEnterWorkspace} onDetail={openDetail} onHome={() => goSection("p-story")} />
        </main>
      )}

      <PortalFooter lang={lang} onDetail={openDetail} onTutorials={onOpenTutorials} />
    </div>
  );
}
