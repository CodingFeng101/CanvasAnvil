import { useCallback, useEffect, useRef, useState } from "react";

/** Safari still exposes the pre-standard names. */
type LegacyFullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type LegacyFullscreenDocument = Document & {
  webkitExitFullscreen?: () => void;
  webkitFullscreenElement?: Element | null;
};

async function requestFullscreen(root: HTMLElement) {
  try {
    if (document.fullscreenElement === root) return;
    if (root.requestFullscreen) {
      await root.requestFullscreen();
      return;
    }
    (root as LegacyFullscreenElement).webkitRequestFullscreen?.();
  } catch {
    // A refused fullscreen request still leaves a usable windowed slideshow.
  }
}

async function leaveFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    (document as LegacyFullscreenDocument).webkitExitFullscreen?.();
  } catch {
    // Nothing to do: the browser keeps whatever state it is in.
  }
}

/**
 * Full-screen presentation of the finished deck.
 *
 * Owns which slide is showing, whether the browser granted fullscreen, and
 * the keyboard bindings a presenter expects: arrows and space to advance,
 * Escape to step back out one level at a time.
 */
export function useSlideshow(slideCount: number) {
  const [isOpen, setIsOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startIndexRef = useRef<number | null>(null);

  const enterFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const root = rootRef.current;
    if (root) await requestFullscreen(root);
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    await leaveFullscreen();
  }, []);

  const open = useCallback((startIndex: number) => {
    startIndexRef.current = startIndex;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    void exitFullscreen();
  }, [exitFullscreen]);

  // Jump to the requested slide and go fullscreen once the dialog has
  // actually mounted -- requestFullscreen needs the element to be in the
  // document, which it is not until after this render commits.
  useEffect(() => {
    if (!isOpen) return;
    setIndex(startIndexRef.current ?? 0);
    startIndexRef.current = null;
    const timer = window.setTimeout(() => {
      void enterFullscreen();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, enterFullscreen]);

  // The user can leave fullscreen by pressing F11 or Escape without going
  // through us, so the flag follows the browser rather than our own calls.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFullscreenChange = () => {
      const root = rootRef.current;
      const active =
        document.fullscreenElement || (document as LegacyFullscreenDocument).webkitFullscreenElement || null;
      setIsFullscreen(!!root && !!active && (active === root || root.contains(active)));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    };
  }, []);

  const next = useCallback(() => {
    setIndex((v) => (slideCount === 0 ? 0 : (v + 1) % slideCount));
  }, [slideCount]);

  const previous = useCallback(() => {
    setIndex((v) => (slideCount === 0 ? 0 : (v - 1 + slideCount) % slideCount));
  }, [slideCount]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (slideCount === 0) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        previous();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Escape leaves fullscreen first, and only closes the slideshow on a
        // second press, so it never drops the presenter straight to the editor.
        if (isFullscreen) void exitFullscreen();
        else close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, slideCount, isFullscreen, next, previous, exitFullscreen, close]);

  return {
    isOpen,
    index,
    isFullscreen,
    rootRef,
    open,
    close,
    next,
    previous,
    setIndex,
    enterFullscreen,
    exitFullscreen,
  };
}
