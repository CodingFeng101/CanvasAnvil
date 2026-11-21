import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceExtract, ReferenceItem } from "@/shared/references/types";
import { DIAGRAM_DB_KEYS } from "@/workspaces/diagram/storage";
import { renderDrawioPng } from "@/workspaces/diagram/lib/drawio-render";

/**
 * What a diagram work offers to other canvases: the diagram as a picture, and
 * its earlier versions as pictures. The XML and the node texts stay behind
 * (editable shapes in a PPT belong to the editable PPT export). The work keeps
 * only XML, so each picture is rendered by draw.io when it is ticked.
 */

export const isEmptyDiagram = (xml: string) => !/<mxCell\b[^>]*\b(vertex|edge)="1"/.test(xml);

export function diagramReferenceItems(
  current: string | null | undefined,
  snapshots: Array<[number, string]> | null | undefined,
  lang: "zh" | "en",
  thumb?: string,
): ReferenceItem[] {
  const items: ReferenceItem[] = [];
  const group = "diagram:versions";
  if (current && !isEmptyDiagram(current)) {
    items.push({ id: "diagram:current", kind: "image", label: lang === "zh" ? "当前图表" : "Current diagram", group, thumb, defaultOn: true, resolve: () => renderDrawioPng(current) });
  }
  const seen = new Set(current ? [current] : []);
  const earlier = (snapshots ?? []).filter(([, xml]) => xml && !isEmptyDiagram(xml) && !seen.has(xml));
  earlier.reverse().forEach(([index, xml], n) => {
    seen.add(xml);
    items.push({
      id: `diagram:version:${index}`,
      kind: "image",
      label: lang === "zh" ? `历史版本 ${earlier.length - n}` : `Earlier version ${earlier.length - n}`,
      group,
      resolve: () => renderDrawioPng(xml),
    });
  });
  return items;
}

export async function extractDiagramReference(store: WorkspaceStore, lang: "zh" | "en", thumb?: string): Promise<ReferenceExtract> {
  const [current, snapshots] = await Promise.all([
    store.read<string>(DIAGRAM_DB_KEYS.diagramXml),
    store.read<Array<[number, string]>>(DIAGRAM_DB_KEYS.xmlSnapshots),
  ]);
  return { items: diagramReferenceItems(typeof current === "string" ? current : null, Array.isArray(snapshots) ? snapshots : null, lang, thumb) };
}
