import {
  REVIEW_BOX_COLOR,
  REVIEW_BOX_SELECTED_COLOR,
} from "@/workspaces/ppt/canvas/constants";
import type {
  ReviewResizeHandle,
  SlideData,
  SlideRenderLayer,
} from "@/workspaces/ppt/canvas/types";
import type { useExportReview } from "@/workspaces/ppt/canvas/hooks/use-export-review";

interface ReviewSelectionOverlayProps {
  slide: SlideData;
  review: ReturnType<typeof useExportReview>;
  getLayer: (slideId: string) => SlideRenderLayer | undefined;
  /** The image version a gesture writes to, resolved at gesture start. */
  getVersionId: (slideId: string) => string;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  tr: (zh: string, en: string) => string;
}

/**
 * The interactive layer over a rendered slide during export review: one box
 * per extracted text block, each draggable and resizable by eight handles.
 *
 * It only records where a gesture started -- the drag itself is tracked on the
 * window by useExportReview, so a pointer leaving the slide does not drop it.
 */
export function ReviewSelectionOverlay({
  slide,
  review,
  getLayer,
  getVersionId,
  canvasRef,
  tr,
}: ReviewSelectionOverlayProps) {
    const layer = getLayer(slide.id);
    if (!layer) return null;
    const resizeHandles: Array<{ key: ReviewResizeHandle; className: string; cursor: string }> = [
      { key: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
      { key: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
      { key: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
      { key: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
      { key: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
      { key: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
      { key: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
      { key: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    ];

    return (
      <div
        className="absolute inset-0 z-20"
        style={{ cursor: review.drawMode ? "crosshair" : "default" }}
        onPointerDown={(event) => review.beginCanvasDraw(event, slide)}
      >
        {layer.textBlocks.map((block, index) => {
          const isSelected = review.selectedBlockId === block.id;
          const borderColor = isSelected ? REVIEW_BOX_SELECTED_COLOR : REVIEW_BOX_COLOR;
          const fillColor = isSelected ? "rgba(245,158,11,0.18)" : "rgba(34,211,238,0.12)";
          return (
            <div
              key={`review-box-${block.id}`}
              className="absolute"
              style={{
                left: `${block.x * 100}%`,
                top: `${block.y * 100}%`,
                width: `${block.w * 100}%`,
                height: `${block.h * 100}%`,
                border: `2px solid ${borderColor}`,
                background: fillColor,
                boxShadow: isSelected ? `0 0 0 2px rgba(255,255,255,0.25), 0 0 18px ${borderColor}` : "none",
                pointerEvents: "auto",
                cursor: review.drawMode ? "crosshair" : "move",
              }}
              onPointerDown={(event) => {
                if (review.drawMode) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const versionId = getVersionId(slide.id);
                if (!versionId) return;
                review.setSelectedBlockId(block.id);
                review.dragRef.current = {
                  slideId: slide.id,
                  versionId,
                  blockId: block.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startX: block.x,
                  startY: block.y,
                  blockW: block.w,
                  blockH: block.h,
                  canvasWidth: rect.width,
                  canvasHeight: rect.height,
                };
                review.setDraggingBlockId(block.id);
              }}
            >
              <div className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                {`#${index + 1}`}
              </div>
              {isSelected
                ? resizeHandles.map((handle) => (
                    <button
                      key={handle.key}
                      type="button"
                      className={`absolute z-20 rounded-full border-2 border-white shadow-sm ${handle.className}`}
                      style={{
                        width: "12px",
                        height: "12px",
                        background: borderColor,
                        cursor: handle.cursor,
                      }}
                      title={tr("缩放文字框", "Resize text box")}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const versionId = getVersionId(slide.id);
                        if (!versionId) return;
                        review.resizeRef.current = {
                          slideId: slide.id,
                          versionId,
                          blockId: block.id,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          startW: block.w,
                          startH: block.h,
                          startX: block.x,
                          startY: block.y,
                          canvasWidth: rect.width,
                          canvasHeight: rect.height,
                          handle: handle.key,
                        };
                        review.setResizingBlockId(block.id);
                      }}
                    />
                  ))
                : null}
            </div>
          );
        })}
        {review.draftRect ? (
          <div
            className="absolute border-2 border-dashed"
            style={{
              left: `${Math.min(review.draftRect.startX, review.draftRect.currentX) * 100}%`,
              top: `${Math.min(review.draftRect.startY, review.draftRect.currentY) * 100}%`,
              width: `${Math.abs(review.draftRect.currentX - review.draftRect.startX) * 100}%`,
              height: `${Math.abs(review.draftRect.currentY - review.draftRect.startY) * 100}%`,
              borderColor: REVIEW_BOX_SELECTED_COLOR,
              background: "rgba(245,158,11,0.14)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    );
}
