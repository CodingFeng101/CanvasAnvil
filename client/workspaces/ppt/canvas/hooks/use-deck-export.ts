import { useEffect, useRef, useState } from "react";
import type { SlideRenderLayer } from "@/workspaces/ppt/canvas/types";

export type ExportKind = "pptx" | "pptx_editable" | "pdf";

/**
 * How far an export has got, for a run long enough that silence looks broken.
 *
 * Counted in model calls rather than slides: a slide costs three of them, and
 * a two-slide deck that only ticks per slide sits at 0 for minutes.
 */
export interface ExportProgress {
  done: number;
  total: number;
}

/**
 * The deck's export menu and the run it starts.
 *
 * Editable export used to be a guided review: the user was shown every text
 * box the model had found and had to confirm them before the file was
 * written. The boxes are still extracted exactly the same way -- the deck
 * just no longer stops to ask -- so what is left here is the menu, the export
 * in flight, and enough progress to show the run is alive.
 */
export function useDeckExport() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<ExportKind | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  /** In-flight text extractions, so two requests never race for one slide. */
  const layerPromiseRef = useRef<
    Record<string, Promise<{ versionId: string; imageUrl: string; layer: SlideRenderLayer }> | undefined>
  >({});

  // A click outside dismisses the export menu.
  useEffect(() => {
    if (!menuOpen || typeof document === "undefined") return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  // An export in progress leaves nothing left to choose.
  useEffect(() => {
    if (isExporting) setMenuOpen(false);
  }, [isExporting]);

  return {
    menuOpen,
    setMenuOpen,
    menuRef,
    isExporting,
    setIsExporting,
    progress,
    setProgress,
    layerPromiseRef,
  };
}
