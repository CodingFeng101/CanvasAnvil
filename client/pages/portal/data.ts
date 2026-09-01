export type PortalWorkspace = "flow" | "cad" | "ppt";

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
    zhTitle: "\u6d41\u7a0b\u753b\u5e03",
    enTitle: "Flow Canvas",
    zhSummary: "\u7ed3\u6784\u5316\u6d41\u7a0b\u56fe\u4e0e\u8282\u70b9\u7ea7\u5c40\u90e8\u4fee\u6539",
    enSummary: "Structured flow diagrams with node-level edits",
    image: "/examples/flow/01.png",
    angle: -90,
    accent: "#236CFF",
  },
  {
    id: "cad",
    zhTitle: "\u5ba4\u5185\u8bbe\u8ba1\u753b\u5e03",
    enTitle: "Interior Canvas",
    zhSummary: "\u5e73\u9762\u65b9\u6848\u3001\u6548\u679c\u56fe\u4e0e\u6750\u6599\u6e05\u5355\u8054\u52a8",
    enSummary: "Layouts, renders, and material lists in one flow",
    image: "/examples/cad/01.png",
    angle: 30,
    accent: "#8B5CF6",
  },
  {
    id: "ppt",
    zhTitle: "PPT\u753b\u5e03",
    enTitle: "PPT Canvas",
    zhSummary: "\u5148\u5927\u7eb2\u540e\u89c6\u89c9\uff0c\u5bfc\u51fa\u53ef\u7f16\u8f91\u7a3f\u3001PDF \u548c\u56fe\u7247\u7248",
    enSummary: "Outline-first decks with editable, PDF, and image exports",
    image: "/examples/ppt/ppt1/01.png",
    angle: 150,
    accent: "#1F63F3",
  },
];
