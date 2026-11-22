import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceExtract, ReferenceItem } from "@/shared/references/types";
import { DIAGRAM_DB_KEYS } from "@/workspaces/diagram/storage";
import { renderDrawioPng } from "@/workspaces/diagram/lib/drawio-render";

/**
 * What a diagram work offers to other canvases: the diagram as it is now, as a picture. No
 * earlier versions: they are the diagram's own undo, not something to hand on. The XML and the
 * node texts stay behind (editable shapes in a PPT belong to the editable PPT export). The work
 * keeps only XML, so the picture is rendered by draw.io when it is ticked.
 */

export const isEmptyDiagram = (xml: string) => !/<mxCell\b[^>]*\b(vertex|edge)="1"/.test(xml);

export function diagramReferenceItems(current: string | null | undefined, lang: "zh" | "en", thumb?: string): ReferenceItem[] {
  if (!current || isEmptyDiagram(current)) return [];
  return [{ id: "diagram:current", kind: "image", label: lang === "zh" ? "当前图表" : "Current diagram", thumb, defaultOn: true, resolve: () => renderDrawioPng(current) }];
}

export async function extractDiagramReference(store: WorkspaceStore, lang: "zh" | "en", thumb?: string): Promise<ReferenceExtract> {
  const current = await store.read<string>(DIAGRAM_DB_KEYS.diagramXml);
  return { items: diagramReferenceItems(typeof current === "string" ? current : null, lang, thumb) };
}
