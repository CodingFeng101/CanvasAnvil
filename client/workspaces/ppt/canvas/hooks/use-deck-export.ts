import { useEffect, useRef, useState } from "react";
import type { SlideRenderLayer } from "@/workspaces/ppt/canvas/types";

export type ExportKind = "pptx" | "pptx_editable" | "pdf";

/**
 * The deck's export menu and the run it starts.
 *
 * Editable export used to be a guided review: the user was shown every text
 * box the model had found and had to confirm them before the file was
 * written. Nothing is extracted at export time any more, so the write is
 * immediate and this owns only the menu and the export in flight.
 */
export function useDeckExport() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<ExportKind | null>(null);

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
    layerPromiseRef,
  };
}
