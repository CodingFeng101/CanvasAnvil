import { useEffect, useRef, useState } from "react";
import { Excalidraw, restoreAppState, restoreElements, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { canvasStore, CANVAS_SCENE_KEY } from "@/workspaces/canvas/storage";
import { getAnnotationSearchBounds, resolveTargetImage } from "@/workspaces/canvas/canvas/bounds";
import { getImageLineage, type SelectedImageInfo } from "@/workspaces/canvas/canvas/lineage";

type PersistedScene = {
  elements: OrderedExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

/** Volatile fields (selection, collaborators, cursor...) are dropped; only the view itself survives a reload. */
const PERSISTED_APP_STATE_KEYS = ["viewBackgroundColor", "scrollX", "scrollY", "zoom"] as const;

function pickAppState(appState: AppState): Partial<AppState> {
  const picked: Partial<AppState> = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    (picked as Record<string, unknown>)[key] = appState[key];
  }
  return picked;
}

interface CanvasBoardProps {
  theme: "light" | "dark";
  langCode: string;
  onApiReady?: (api: ExcalidrawImperativeAPI) => void;
  /** Fires only when the resolved target image (if any) actually changes, not on every selection tweak. */
  onSelectedImageChange?: (info: SelectedImageInfo | null) => void;
}

interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const SAVE_DEBOUNCE_MS = 600;

export function CanvasBoard({ theme, langCode, onApiReady, onSelectedImageChange }: CanvasBoardProps) {
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null | undefined>(undefined);
  const [boundaryRect, setBoundaryRect] = useState<OverlayRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSelectedImageKeyRef = useRef("");
  const lastBoundaryKeyRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const persisted = await canvasStore.read<PersistedScene>(CANVAS_SCENE_KEY);
        if (cancelled) return;
        if (!persisted) {
          setInitialData(null);
          return;
        }
        setInitialData({
          elements: restoreElements(persisted.elements, null),
          appState: restoreAppState(persisted.appState, null),
          files: persisted.files || {},
        });
      } catch (e) {
        console.error("Failed to load persisted canvas scene", e);
        if (!cancelled) setInitialData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const selectedIds = appState.selectedElementIds;
    const selectedElements = elements.filter((el) => selectedIds[el.id] && !el.isDeleted);
    const targetImage = resolveTargetImage(elements, selectedElements);

    const info: SelectedImageInfo | null = targetImage
      ? { elementId: targetImage.id, lineageId: getImageLineage(targetImage)?.lineageId || targetImage.id }
      : null;
    const infoKey = info ? `${info.elementId}:${info.lineageId}` : "";
    if (infoKey !== lastSelectedImageKeyRef.current) {
      lastSelectedImageKeyRef.current = infoKey;
      onSelectedImageChange?.(info);
    }

    const boundaryKey = targetImage
      ? [
          targetImage.id,
          targetImage.x,
          targetImage.y,
          targetImage.width,
          targetImage.height,
          appState.scrollX,
          appState.scrollY,
          appState.zoom.value,
          appState.offsetLeft,
          appState.offsetTop,
        ].join(":")
      : "";
    if (boundaryKey !== lastBoundaryKeyRef.current) {
      lastBoundaryKeyRef.current = boundaryKey;
      if (!targetImage) {
        setBoundaryRect(null);
      } else {
        const box = getAnnotationSearchBounds(targetImage);
        const topLeft = sceneCoordsToViewportCoords({ sceneX: box.x, sceneY: box.y }, appState);
        const bottomRight = sceneCoordsToViewportCoords({ sceneX: box.x + box.width, sceneY: box.y + box.height }, appState);
        const containerBox = containerRef.current?.getBoundingClientRect();
        setBoundaryRect({
          left: topLeft.x - (containerBox?.left ?? 0),
          top: topLeft.y - (containerBox?.top ?? 0),
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
        });
      }
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      const snapshot: PersistedScene = {
        elements: elements as OrderedExcalidrawElement[],
        appState: pickAppState(appState),
        files,
      };
      void canvasStore.save(CANVAS_SCENE_KEY, snapshot).catch((e) => {
        console.error("Failed to persist canvas scene", e);
      });
    }, SAVE_DEBOUNCE_MS);
  };

  if (initialData === undefined) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full relative">
      <Excalidraw
        initialData={initialData || undefined}
        onChange={handleChange}
        excalidrawAPI={onApiReady}
        theme={theme}
        langCode={langCode}
      />
      {boundaryRect && (
        <div
          className="absolute rounded-md border-2 border-dashed border-primary/60 pointer-events-none z-[3]"
          style={{
            left: boundaryRect.left,
            top: boundaryRect.top,
            width: boundaryRect.width,
            height: boundaryRect.height,
          }}
        />
      )}
    </div>
  );
}
