import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceExtract, ReferenceItem } from "@/shared/references/types";
import { CANVAS_SCENE_KEY } from "@/workspaces/canvas/storage";

/**
 * What a free-canvas work offers to other canvases: the pictures on its board
 * and each picture's versions (an annotated edit adds a version next to the
 * one it started from; they share a lineage id, see canvas/lineage.ts).
 * Annotations and hand-drawn elements stay behind.
 */

type SceneElement = {
  id: string;
  type: string;
  isDeleted?: boolean;
  fileId?: string | null;
  customData?: { canvasAnvil?: { lineageId?: string; createdAt?: number; note?: string } };
};
type StoredScene = { elements?: SceneElement[]; files?: Record<string, { dataURL?: string; mimeType?: string }> };

const shorten = (text: string, limit = 18) => {
  const line = text.replace(/\s+/g, " ").trim();
  return Array.from(line).length > limit ? `${Array.from(line).slice(0, limit).join("")}…` : line;
};

export function canvasReferenceItems(scene: StoredScene | null | undefined, lang: "zh" | "en"): ReferenceItem[] {
  const files = scene?.files ?? {};
  const pictures = new Map<string, Array<{ id: string; dataUrl: string; createdAt: number; note?: string; order: number }>>();
  (scene?.elements ?? []).forEach((element, order) => {
    if (element.type !== "image" || element.isDeleted || !element.fileId) return;
    const dataUrl = files[element.fileId]?.dataURL;
    if (!dataUrl) return;
    const lineage = element.customData?.canvasAnvil;
    const key = lineage?.lineageId || element.id;
    const list = pictures.get(key) ?? [];
    list.push({ id: element.id, dataUrl, createdAt: lineage?.createdAt ?? 0, note: lineage?.note, order });
    pictures.set(key, list);
  });

  const items: ReferenceItem[] = [];
  let n = 0;
  for (const [lineageId, versions] of pictures) {
    n += 1;
    versions.sort((a, b) => a.createdAt - b.createdAt || a.order - b.order);
    const first = versions[0];
    const name = first.note ? shorten(first.note) : lang === "zh" ? `图片 ${n}` : `Picture ${n}`;
    versions.forEach((version, index) => {
      const latest = index === versions.length - 1;
      const versionLabel = versions.length === 1 ? "" : lang === "zh" ? ` · 版本 ${index + 1}` : ` · version ${index + 1}`;
      items.push({
        id: `canvas:${version.id}`,
        kind: "image",
        label: `${name}${versionLabel}`,
        group: versions.length > 1 ? `canvas:${lineageId}` : undefined,
        dataUrl: version.dataUrl,
        defaultOn: latest,
      });
    });
  }
  return items;
}

export async function extractCanvasReference(store: WorkspaceStore, lang: "zh" | "en"): Promise<ReferenceExtract> {
  const scene = await store.read<StoredScene>(CANVAS_SCENE_KEY);
  return { items: canvasReferenceItems(scene, lang) };
}
