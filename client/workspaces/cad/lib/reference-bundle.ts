import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceItem } from "@/shared/references/types";
import type { DesignerBridge, DesignerExportKey } from "../designer/designer-bridge";
import type { ElecAudit } from "./design/elec-audit";
import type { CadDesign, InternalPlan, RoomArea, SinglePlan } from "./design/types";

/**
 * What a confirmed interior design hands to other canvases: the designer's own exports
 * (quote, drawings, DXFs, colour plan, render) plus the plan picture, the original floorplan
 * and a few texts. Made in the interior-design canvas, where the designer lives, and kept
 * under its own key with the revision it was made from: a later edit makes it stale.
 */

export const REFERENCE_BUNDLE_KEY = "reference-bundle";

export interface ReferenceBundle {
  revision: number;
  createdAt: number;
  items: ReferenceItem[];
  /** Exports that failed, by name, for the reader. */
  failed?: string[];
}

export const BUNDLE_EXPORTS: DesignerExportKey[] = ["quote", "drawings", "planDxf", "mepDxf", "colour", "render"];

type Lang = "zh" | "en";
const isSingle = (plan: InternalPlan): plan is SinglePlan => (plan as { kind?: string }).kind !== "building";
const round = (value: number) => Math.round(value * 10) / 10;

/** Room areas come in m²; the designer's geometry is mm, so anything huge is mm² and gets converted. */
const squareMetres = (area: number) => (area > 10000 ? area / 1e6 : area);

export function overviewMarkdown(plan: InternalPlan, rooms: RoomArea[], lang: Lang): string {
  const total = rooms.reduce((sum, room) => sum + squareMetres(room.area || 0), 0);
  const zh = lang === "zh";
  const lines = [`# ${plan.name || (zh ? "户型" : "Floorplan")}`];
  if (!isSingle(plan)) lines.push(zh ? `- ${plan.floors.length} 层` : `- ${plan.floors.length} floors`);
  lines.push(zh ? `- 房间：${rooms.length} 个` : `- Rooms: ${rooms.length}`);
  if (total) lines.push(zh ? `- 室内面积合计：约 ${round(total)} ㎡` : `- Interior area: about ${round(total)} m²`);
  if (isSingle(plan)) lines.push(zh ? `- 家具：${plan.furniture.length} 件` : `- Furniture: ${plan.furniture.length} pieces`);
  return lines.join("\n");
}

export function areaTableMarkdown(rooms: RoomArea[], lang: Lang): string {
  if (!rooms.length) return "";
  const zh = lang === "zh";
  const rows = rooms.map((room) => `| ${room.name || (zh ? "未命名" : "Unnamed")} | ${round(squareMetres(room.area || 0))} |`);
  const total = rooms.reduce((sum, room) => sum + squareMetres(room.area || 0), 0);
  return [zh ? "| 房间 | 面积（㎡） |" : "| Room | Area (m²) |", "|---|---|", ...rows, zh ? `| 合计 | ${round(total)} |` : `| Total | ${round(total)} |`].join("\n");
}

const inRoom = (room: RoomArea, x: number, y: number) =>
  room.rects?.length ? room.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) : false;

export function furnitureMarkdown(plan: InternalPlan, rooms: RoomArea[], lang: Lang): string {
  if (!isSingle(plan) || !plan.furniture.length) return "";
  const zh = lang === "zh";
  const other = zh ? "其他" : "Other";
  const byRoom = new Map<string, Map<string, number>>();
  for (const item of plan.furniture) {
    const room = rooms.find((r) => inRoom(r, item.x, item.y))?.name || other;
    const name = String(item.name || item.key);
    const counts = byRoom.get(room) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    byRoom.set(room, counts);
  }
  return [...byRoom]
    .map(([room, counts]) => `## ${room}\n${[...counts].map(([name, n]) => `- ${name}${n > 1 ? ` × ${n}` : ""}`).join("\n")}`)
    .join("\n\n");
}

export function mepMarkdown(audit: ElecAudit | null, lang: Lang): string {
  if (!audit) return "";
  const zh = lang === "zh";
  const head = zh
    ? `点位合计 ${audit.total.points} 个（灯 ${audit.total.lights}、开关 ${audit.total.switches}）`
    : `${audit.total.points} points (${audit.total.lights} lights, ${audit.total.switches} switches)`;
  const rows = audit.rooms.map((r) => `| ${r.name} | ${r.lights} | ${r.switches} | ${r.sockets} |`);
  const table = rows.length ? [zh ? "| 房间 | 灯 | 开关 | 插座 |" : "| Room | Lights | Switches | Sockets |", "|---|---|---|---|", ...rows].join("\n") : "";
  return [head, table].filter(Boolean).join("\n\n");
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const EXPORT_LABELS: Record<DesignerExportKey, { zh: string; en: string; kind: "image" | "file"; group: string }> = {
  quote: { zh: "报价单", en: "Quote", kind: "file", group: "files" },
  drawings: { zh: "施工图", en: "Construction drawings", kind: "file", group: "files" },
  planDxf: { zh: "平面图 DXF", en: "Plan DXF", kind: "file", group: "files" },
  mepDxf: { zh: "水电图 DXF", en: "MEP DXF", kind: "file", group: "files" },
  colour: { zh: "彩平图", en: "Colour plan", kind: "image", group: "images" },
  render: { zh: "3D 效果图", en: "3D render", kind: "image", group: "images" },
};

export interface BuildBundleOptions {
  bridge: DesignerBridge;
  design: CadDesign;
  /** The user's requests in the chat, oldest first. */
  requirements: string[];
  lang: Lang;
  onStep?: (label: string, index: number, total: number) => void;
}

export async function buildReferenceBundle({ bridge, design, requirements, lang, onStep }: BuildBundleOptions): Promise<ReferenceBundle> {
  const zh = lang === "zh";
  const text = (id: string, zhLabel: string, enLabel: string, body: string, defaultOn = true): ReferenceItem | null =>
    body.trim() ? { id: `cad:${id}`, kind: "text", label: zh ? zhLabel : enLabel, group: "texts", text: body, defaultOn } : null;

  const plan = bridge.readPlan();
  const rooms = bridge.roomAreas();
  const items: Array<ReferenceItem | null> = [
    text("requirements", "设计需求", "Design brief", requirements.map((line) => `- ${line.replace(/\s+/g, " ").trim()}`).join("\n")),
    text("overview", "户型概况", "Overview", overviewMarkdown(plan, rooms, lang)),
    text("areas", "面积表", "Room areas", areaTableMarkdown(rooms, lang)),
    text("furniture", "家具清单", "Furniture list", furnitureMarkdown(plan, rooms, lang), false),
    text("mep", "水电统计", "MEP summary", mepMarkdown(bridge.elecAudit(), lang), false),
  ];

  try {
    const shot = bridge.shot2d();
    if (shot) items.push({ id: "cad:plan", kind: "image", label: zh ? "平面布置图" : "Furnished plan", group: "images", dataUrl: shot, defaultOn: true });
  } catch (error) {
    console.warn("[CAD] plan picture failed", error);
  }
  const underlay = design.underlay?.src;
  if (underlay?.startsWith("data:image/")) items.push({ id: "cad:original", kind: "image", label: zh ? "原始户型图" : "Original floorplan", group: "images", dataUrl: underlay, defaultOn: true });

  const results = await bridge.exportFiles(BUNDLE_EXPORTS, (key, index) => onStep?.(zh ? EXPORT_LABELS[key].zh : EXPORT_LABELS[key].en, index, BUNDLE_EXPORTS.length));
  const failed: string[] = [];
  for (const result of results) {
    const meta = EXPORT_LABELS[result.key];
    const label = zh ? meta.zh : meta.en;
    if (!result.blob) {
      failed.push(label);
      console.warn("[CAD] export failed", result.key, result.error);
      continue;
    }
    items.push({
      id: `cad:${result.key}`,
      kind: meta.kind,
      label,
      group: meta.group,
      dataUrl: await blobToDataUrl(result.blob),
      ...(meta.kind === "file" ? { fileName: result.fileName } : {}),
      // The quote and the pictures go into a report; drawings and DXFs are for whoever builds it.
      defaultOn: result.key === "quote" || meta.kind === "image",
    });
  }
  return { revision: design.revision, createdAt: Date.now(), items: items.filter((item): item is ReferenceItem => item !== null), ...(failed.length ? { failed } : {}) };
}

export async function readReferenceBundle(store: WorkspaceStore): Promise<ReferenceBundle | null> {
  const bundle = await store.read<ReferenceBundle>(REFERENCE_BUNDLE_KEY).catch(() => null);
  return bundle && Array.isArray(bundle.items) && typeof bundle.revision === "number" ? bundle : null;
}

/** A bundle counts only for a confirmed design at the revision it was made from. */
export function isBundleCurrent(bundle: ReferenceBundle | null, design: CadDesign | null | undefined): bundle is ReferenceBundle {
  return !!bundle && !!design && design.status === "confirmed" && bundle.revision === design.revision;
}
