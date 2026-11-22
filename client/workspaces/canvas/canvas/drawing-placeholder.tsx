import { useEffect, useState } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useUiLanguage } from "@/shared/i18n";
import { PenSketch } from "@/shared/ui/pen-sketch";

/*
 * Where a picture being generated will land on the board, at the size it will
 * have: a sheet whose frame and a loose sketch are drawn in over and over while
 * the pen hatches across it, as the PPT pages do while they are drawn. A picture
 * cannot be drawn as it streams, so this is a stand-in; the picture takes its
 * place once it arrives. It follows the board as it is panned and zoomed.
 */

export type DrawingBox = { x: number; y: number; width: number; height: number };

export function DrawingPlaceholder({ api, box }: { api: ExcalidrawImperativeAPI; box: DrawingBox }) {
  const uiLang = useUiLanguage();
  const [view, setView] = useState(() => {
    const state = api.getAppState();
    return { scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom.value };
  });
  useEffect(
    () => api.onScrollChange((scrollX, scrollY, zoom) => setView({ scrollX, scrollY, zoom: zoom.value })),
    [api],
  );
  const left = (box.x + view.scrollX) * view.zoom;
  const top = (box.y + view.scrollY) * view.zoom;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      <div
        className="drawing-sheet absolute overflow-hidden rounded-[6px] shadow-soft"
        style={{ left, top, width: box.width * view.zoom, height: box.height * view.zoom }}
      >
        <PenSketch motif="picture" />
        <span className="absolute inset-x-0 bottom-2 text-center text-xs text-[#7a6f66]">
          {uiLang === "zh" ? "正在画…" : "Drawing…"}
        </span>
      </div>
    </div>
  );
}

/** The view moved so the box sits in the middle of it, at the zoom it has. */
export function centreOn(api: ExcalidrawImperativeAPI, box: DrawingBox) {
  const state = api.getAppState();
  const zoom = state.zoom.value;
  api.updateScene({
    appState: {
      scrollX: state.width / (2 * zoom) - (box.x + box.width / 2),
      scrollY: state.height / (2 * zoom) - (box.y + box.height / 2),
    },
  });
}
