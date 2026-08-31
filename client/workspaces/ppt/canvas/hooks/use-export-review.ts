import { useEffect, useRef, useState } from "react";
import { resizeRectFromHandle, type RenderLayerMap } from "@/workspaces/ppt/canvas/lib/render-layers";
import type {
  EditableExtractionStatus,
  ReviewDraftRect,
  ReviewResizeHandle,
  SlideData,
  SlideRenderLayer,
} from "@/workspaces/ppt/canvas/types";
import type { PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

/** A box smaller than this in either axis is a stray click, not a draw. */
const MIN_DRAWN_SIZE = 0.025;
const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 720;

interface DragState {
  slideId: string;
  versionId: string;
  blockId: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  blockW: number;
  blockH: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface ResizeState extends Omit<DragState, "blockW" | "blockH"> {
  startW: number;
  startH: number;
  handle?: ReviewResizeHandle;
}

/** The text-block edits the review canvas drives; they own the render layer. */
export interface ReviewTextBlockApi {
  updatePosition: (slideId: string, blockId: string, x: number, y: number, versionId?: string) => void;
  updateRect: (
    slideId: string,
    blockId: string,
    rect: Partial<Pick<PptTextBlock, "x" | "y" | "w" | "h">>,
    versionId?: string,
  ) => void;
  updateSize: (slideId: string, blockId: string, w: number, h: number, versionId?: string) => void;
  append: (slideId: string, block: PptTextBlock) => void;
  createDefault: (slideId: string, x: number, y: number, w: number, h: number) => PptTextBlock;
  getLayer: (slideId: string) => SlideRenderLayer | undefined;
}

export interface ExportReviewOptions {
  slides: SlideData[];
  currentSlideIndex: number;
  renderLayers: RenderLayerMap;
  textBlocks: ReviewTextBlockApi;
  /** The canvas the drawn rectangle is measured against. */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  onExportReviewModeChange?: (active: boolean) => void;
}

/**
 * Reviewing a deck's editable text before exporting it.
 *
 * The user drags, resizes and draws text boxes over the rendered slide, so
 * this owns the pointer gestures as well as the review-mode state and the
 * export menu. Every gesture's listener lives on the window: a drag that
 * leaves the box must keep tracking, and a pointerup outside it must still
 * end the drag.
 */
export function useExportReview({
  slides,
  currentSlideIndex,
  renderLayers,
  textBlocks,
  canvasRef,
  onExportReviewModeChange,
}: ExportReviewOptions) {
  const [isActive, setIsActive] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState<null | "pptx" | "pptx_editable" | "pdf">(null);
  const [extractionStatus, setExtractionStatus] = useState<Record<string, EditableExtractionStatus>>({});
  const [preparingSlideIds, setPreparingSlideIds] = useState<string[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [draftRect, setDraftRect] = useState<ReviewDraftRect | null>(null);
  const [panelWidth, setPanelWidth] = useState(420);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [resizingBlockId, setResizingBlockId] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const drawRef = useRef<null | { slideId: string; rect: DOMRect; startX: number; startY: number }>(null);
  const panelResizeRef = useRef<null | { startClientX: number; startWidth: number }>(null);
  /** In-flight text extractions, so two requests never race for one slide. */
  const layerPromiseRef = useRef<
    Record<string, Promise<{ versionId: string; imageUrl: string; layer: SlideRenderLayer }> | undefined>
  >({});

  useEffect(() => {
    onExportReviewModeChange?.(isActive);
  }, [isActive, onExportReviewModeChange]);

  // Dragging or resizing a text block.
  useEffect(() => {
    if (!draggingBlockId && !resizingBlockId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startClientX) / Math.max(drag.canvasWidth, 1);
        const dy = (event.clientY - drag.startClientY) / Math.max(drag.canvasHeight, 1);
        textBlocks.updatePosition(drag.slideId, drag.blockId, drag.startX + dx, drag.startY + dy, drag.versionId);
      }

      const resize = resizeRef.current;
      if (!resize) return;
      const dw = (event.clientX - resize.startClientX) / Math.max(resize.canvasWidth, 1);
      const dh = (event.clientY - resize.startClientY) / Math.max(resize.canvasHeight, 1);

      if (!resize.handle || resize.handle === "se") {
        textBlocks.updateSize(
          resize.slideId,
          resize.blockId,
          resize.startW + dw,
          resize.startH + dh,
          resize.versionId,
        );
        return;
      }

      const next = resizeRectFromHandle(
        { x: resize.startX, y: resize.startY, w: resize.startW, h: resize.startH },
        resize.handle,
        dw,
        dh,
      );
      textBlocks.updateRect(resize.slideId, resize.blockId, next, resize.versionId);
    };

    const stopDrag = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setDraggingBlockId(null);
      setResizingBlockId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
    // Registered for the duration of one gesture. The updaters it calls write
    // through the render layer's functional form, so they see current state
    // despite being captured at drag start; depending on them would tear the
    // listeners down and rebuild them on every pointermove.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingBlockId, resizingBlockId]);

  // Keeps a block selected while reviewing, and drops the selection on exit.
  useEffect(() => {
    if (!isActive) {
      setSelectedBlockId(null);
      setDrawMode(false);
      setDraftRect(null);
      return;
    }

    const activeSlide = slides[currentSlideIndex];
    const blocks = activeSlide ? textBlocks.getLayer(activeSlide.id)?.textBlocks || [] : [];
    if (blocks.length === 0) {
      setSelectedBlockId(null);
      return;
    }
    if (!selectedBlockId || !blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(blocks[0].id);
    }
  }, [isActive, slides, currentSlideIndex, renderLayers, selectedBlockId, textBlocks]);

  // Drawing a new text box.
  useEffect(() => {
    if (!drawRef.current) return;

    const handlePointerMove = (event: PointerEvent) => {
      const draft = drawRef.current;
      if (!draft) return;
      setDraftRect({
        startX: draft.startX,
        startY: draft.startY,
        currentX: Math.max(0, Math.min(1, (event.clientX - draft.rect.left) / Math.max(draft.rect.width, 1))),
        currentY: Math.max(0, Math.min(1, (event.clientY - draft.rect.top) / Math.max(draft.rect.height, 1))),
      });
    };

    const stopPointer = () => {
      const draft = drawRef.current;
      drawRef.current = null;
      if (!draft || !draftRect) {
        setDraftRect(null);
        return;
      }

      const x = Math.min(draftRect.startX, draftRect.currentX);
      const y = Math.min(draftRect.startY, draftRect.currentY);
      const w = Math.abs(draftRect.currentX - draftRect.startX);
      const h = Math.abs(draftRect.currentY - draftRect.startY);
      setDraftRect(null);
      if (w < MIN_DRAWN_SIZE || h < MIN_DRAWN_SIZE) return;

      const block = textBlocks.createDefault(draft.slideId, x, y, w, h);
      textBlocks.append(draft.slideId, block);
      setSelectedBlockId(block.id);
      setDrawMode(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointer);
    window.addEventListener("pointercancel", stopPointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointer);
      window.removeEventListener("pointercancel", stopPointer);
    };
    // Rebuilt per draw gesture, not per frame; see the drag effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftRect]);

  // Dragging the review sidebar's edge.
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const draft = panelResizeRef.current;
      if (!draft) return;
      const delta = draft.startClientX - event.clientX;
      setPanelWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, draft.startWidth + delta)));
    };
    const stopPointer = () => {
      panelResizeRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointer);
    window.addEventListener("pointercancel", stopPointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointer);
      window.removeEventListener("pointercancel", stopPointer);
    };
  }, []);

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

  const beginCanvasDraw = (event: React.PointerEvent<HTMLDivElement>, slide: SlideData) => {
    if (!drawMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const startX = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    const startY = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)));
    drawRef.current = { slideId: slide.id, rect, startX, startY };
    setDraftRect({ startX, startY, currentX: startX, currentY: startY });
  };

  const beginPanelResize = (event: React.PointerEvent<HTMLElement>) => {
    panelResizeRef.current = { startClientX: event.clientX, startWidth: panelWidth };
  };

  const getExtractionStatus = (slideId: string): EditableExtractionStatus =>
    extractionStatus[slideId] || "idle";

  const isPreparing = (slideId?: string | null) => !!slideId && preparingSlideIds.includes(slideId);

  return {
    isActive,
    setIsActive,
    menuOpen,
    setMenuOpen,
    menuRef,
    isExporting,
    setIsExporting,
    extractionStatus,
    setExtractionStatus,
    getExtractionStatus,
    preparingSlideIds,
    setPreparingSlideIds,
    isPreparing,
    selectedBlockId,
    setSelectedBlockId,
    drawMode,
    setDrawMode,
    draftRect,
    setDraftRect,
    panelWidth,
    draggingBlockId,
    setDraggingBlockId,
    resizingBlockId,
    setResizingBlockId,
    dragRef,
    resizeRef,
    layerPromiseRef,
    beginCanvasDraw,
    beginPanelResize,
  };
}
