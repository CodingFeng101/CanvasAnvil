import type { WorkspaceId } from "@/app/workspaces";

/**
 * Every workspace gets a card and a detail page here. Keying on WorkspaceId
 * (rather than a hand-kept union) means a canvas added to WORKSPACES without
 * its portal entries fails to compile instead of silently going missing.
 */
export type PortalWorkspace = WorkspaceId;

export type PortalCanvasItem = {
  id: PortalWorkspace;
  zhTitle: string;
  enTitle: string;
  zhSummary: string;
  enSummary: string;
  image: string;
  angle: number;
  accent: string;
};

export const portalCanvasItems: PortalCanvasItem[] = [
  {
    id: "flow",
    zhTitle: "图表画布",
    enTitle: "Diagram Canvas",
    zhSummary: "结构化图表与节点级局部修改",
    enSummary: "Structured diagrams with node-level edits",
    image: "/examples/flow/01.png",
    angle: -90,
    accent: "#C96442",
  },
  {
    id: "cad",
    zhTitle: "室内设计画布",
    enTitle: "Interior Canvas",
    zhSummary: "平面方案、效果图与材料清单联动",
    enSummary: "Layouts, renders, and material lists in one pass",
    image: "/examples/cad/01.png",
    angle: 0,
    accent: "#7C8B6E",
  },
  {
    id: "ppt",
    zhTitle: "PPT画布",
    enTitle: "PPT Canvas",
    zhSummary: "先大纲后视觉，导出可编辑稿、PDF 和图片版",
    enSummary: "Outline-first decks with editable, PDF, and image exports",
    image: "/examples/ppt/ppt1/01.png",
    angle: 90,
    accent: "#A8825C",
  },
  {
    id: "canvas",
    zhTitle: "自由画布",
    enTitle: "Free Canvas",
    zhSummary: "一句话生成图片，圈画标注即可改图",
    enSummary: "Prompt images onto a board, then mark them up to edit",
    image: "/examples/canvas/01.svg",
    angle: 180,
    accent: "#6E8594",
  },
];
