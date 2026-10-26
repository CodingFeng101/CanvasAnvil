import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";

/**
 * Which "logical picture" an image element belongs to.
 *
 * An annotated edit never overwrites the image it started from -- it drops a
 * new element next to it (see insert-image.ts) -- so the only way to find
 * "the other versions of this picture" later is a shared id stashed in each
 * element's customData.
 */
export interface ImageLineageData {
  lineageId: string;
  createdAt: number;
}

export interface SelectedImageInfo {
  elementId: string;
  lineageId: string;
}

export interface ImageVersion {
  elementId: string;
  url: string;
  createdAt: number;
}

const CUSTOM_DATA_KEY = "canvasAnvil";

export function getImageLineage(element: ExcalidrawImageElement): ImageLineageData | null {
  const data = (element.customData as Record<string, unknown> | undefined)?.[CUSTOM_DATA_KEY] as
    | Partial<ImageLineageData>
    | undefined;
  if (!data || typeof data.lineageId !== "string") return null;
  return { lineageId: data.lineageId, createdAt: typeof data.createdAt === "number" ? data.createdAt : 0 };
}

export function withImageLineage(
  customData: Record<string, unknown> | undefined,
  lineage: ImageLineageData,
): Record<string, unknown> {
  return { ...customData, [CUSTOM_DATA_KEY]: lineage };
}

export function makeLineageId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

/** Every live image sharing a lineage, oldest first -- the version history for one logical picture. */
export function getLineageVersions(api: ExcalidrawImperativeAPI, lineageId: string): ImageVersion[] {
  const files = api.getFiles();
  return api
    .getSceneElements()
    .filter((el) => el.type === "image")
    .map((el) => el as unknown as ExcalidrawImageElement)
    .filter((el) => (getImageLineage(el)?.lineageId || el.id) === lineageId)
    .map((el) => ({
      elementId: el.id,
      url: el.fileId ? files[el.fileId]?.dataURL || "" : "",
      createdAt: getImageLineage(el)?.createdAt ?? 0,
    }))
    .filter((version) => !!version.url)
    .sort((a, b) => a.createdAt - b.createdAt);
}
