import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { BinaryFileData, DataURL, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImageElement } from "@excalidraw/excalidraw/element/types";
import { annotationMargin, boundsOverlap, elementBounds, type Bounds } from "@/workspaces/canvas/canvas/bounds";
import { lineageIdOf, makeLineageId, withImageLineage } from "@/workspaces/canvas/canvas/lineage";

/** Excalidraw's file store wants a real data URI; a generated image is usually one already, but a remote URL needs converting first. */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });
}

function detectMimeType(dataUrl: string): BinaryFileData["mimeType"] {
  const match = /^data:([^;]+);/.exec(dataUrl);
  const mime = match?.[1];
  if (mime === "image/png" || mime === "image/jpeg" || mime === "image/gif" || mime === "image/webp") return mime;
  return "image/png";
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 });
    img.onerror = () => resolve({ width: 512, height: 512 });
    img.src = dataUrl;
  });
}

const MAX_PLACED_DIMENSION = 480;
const GRID_COLUMNS = 3;
// Wide enough that neighbouring images' annotation-search boxes (see
// getAnnotationSearchBounds) never overlap -- each image's box reaches
// `annotationMargin` past its own edge, so two boxes only clear each other
// once the gap between the images covers both reaches. Falling short of this
// used to let one annotation match two images at once, which resolveTargetImage
// then refuses to resolve at all.
const GRID_GAP = annotationMargin(MAX_PLACED_DIMENSION) * 2;
const GRID_MARGIN = 40;

function fitWithinMax(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height };
  const scale = Math.min(max / width, max / height);
  return { width: width * scale, height: height * scale };
}

export interface InsertGeneratedImageResult {
  elementId: string;
  lineageId: string;
}

/**
 * Where a new picture starts: the first grid cell nothing sits in.
 *
 * Counting images to pick "the next cell" stopped working once versions are
 * laid out beside their source rather than in the grid -- the counted cell
 * could be one a version row already ran through.
 */
function nextGridSlot(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const occupied = api
    .getSceneElements()
    .filter((el) => el.type === "image")
    .map(elementBounds);
  const cell = MAX_PLACED_DIMENSION + GRID_GAP;
  for (let index = 0; ; index++) {
    const x = GRID_MARGIN + (index % GRID_COLUMNS) * cell;
    const y = GRID_MARGIN + Math.floor(index / GRID_COLUMNS) * cell;
    const box = { x: x - GRID_GAP / 2, y: y - GRID_GAP / 2, width: cell, height: cell };
    if (!occupied.some((other) => boundsOverlap(other, box))) return { x, y };
  }
}

/**
 * Where a new version of an existing picture goes: to the right of that
 * picture's last version, so its versions read left to right as one row.
 *
 * The grid slot it used to take was "the next cell", which after a few
 * pictures was nowhere near the image being edited -- the board filled up
 * with near-identical pictures and nothing said which was a version of which.
 *
 * The gap covers both pictures' annotation reach (see annotationMargin), for
 * the same reason the grid's does. If the spot is taken -- another picture
 * already sits to the right -- it steps down a row at a time until clear.
 */
function slotBesideLineage(
  api: ExcalidrawImperativeAPI,
  lineageId: string,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const images = api
    .getSceneElements()
    .filter((el) => el.type === "image") as unknown as ExcalidrawImageElement[];
  const members = images.filter((el) => lineageIdOf(el) === lineageId);
  if (members.length === 0) return null;

  const last = members.reduce((a, b) => (a.x + a.width >= b.x + b.width ? a : b));
  const gap = annotationMargin(Math.max(last.width, last.height)) + annotationMargin(Math.max(width, height));
  const occupied = images.map(elementBounds);
  const x = last.x + last.width + gap;
  let y = last.y;
  const clearOf = (slot: Bounds) =>
    !occupied.some((box) =>
      boundsOverlap(box, { x: slot.x - gap, y: slot.y - gap, width: slot.width + gap * 2, height: slot.height + gap * 2 }),
    );
  for (let tries = 0; tries < 50 && !clearOf({ x, y, width, height }); tries++) {
    y += height + gap;
  }
  return { x, y };
}

/**
 * Drops a newly generated image onto the board as a new element and selects
 * it so it's immediately available for another annotated edit.
 *
 * `lineageId` continues an existing picture's version history (an annotated
 * edit passes the source image's lineage) and places the result beside it;
 * omitted, the image starts a new picture in the next grid cell. `note`
 * records what produced this version, for the version strip.
 */
export async function insertGeneratedImage(
  api: ExcalidrawImperativeAPI,
  imageUrl: string,
  options?: { lineageId?: string; note?: string },
): Promise<InsertGeneratedImageResult> {
  const dataUrl = await toDataUrl(imageUrl);
  const naturalSize = await loadImageSize(dataUrl);
  const { width, height } = fitWithinMax(naturalSize.width, naturalSize.height, MAX_PLACED_DIMENSION);

  const fileId = `canvas-image-${Date.now()}-${Math.random().toString(36).slice(2)}` as unknown as FileId;
  api.addFiles([
    {
      id: fileId,
      dataURL: dataUrl as DataURL,
      mimeType: detectMimeType(dataUrl),
      created: Date.now(),
    },
  ]);

  const { x, y } =
    (options?.lineageId && slotBesideLineage(api, options.lineageId, width, height)) || nextGridSlot(api);

  const lineageId = options?.lineageId || makeLineageId();
  const note = options?.note?.trim();
  const [imageElement] = convertToExcalidrawElements([
    {
      type: "image",
      fileId,
      x,
      y,
      width,
      height,
      customData: withImageLineage(undefined, { lineageId, createdAt: Date.now(), ...(note ? { note } : {}) }),
    },
  ]);

  api.updateScene({
    elements: [...api.getSceneElements(), imageElement],
    appState: { selectedElementIds: { [imageElement.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.scrollToContent(imageElement, { fitToContent: true, animate: true });

  return { elementId: imageElement.id, lineageId };
}
