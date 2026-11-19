import type { PortalWorkspace } from "../data";
import { type L, img } from "../content";

/**
 * What each canvas's detail page says and shows, in both languages
 * (docs/plans/portal-redesign-plan.md §4). Images are the portal webps, or a
 * canvas svg used as-is.
 */
export type DetailContent = {
  sub: L;
  /** Headline words; they fade in one by one. */
  title: { zh: string[]; en: string[] };
  cta: L;
  hero: string;
  heroAlt: L;
  trio: Array<{ title: L; text: L }>;
  steps: Array<{ title: L; text: L }>;
  works: Array<{ title: L; img: string }>;
  placeholder: L;
};

export const DETAIL_UI = {
  crumb: { zh: "画布", en: "Canvases" },
  examples: { zh: "看示例 ↓", en: "See examples ↓" },
  how: { zh: "怎么做出来的", en: "How it gets made" },
  worksTitle: { zh: "作品示例", en: "Examples" },
  askTitle: { zh: "写一句，就从这里开始。", en: "Write one line and start here." },
  submit: { zh: "开始 ↑", en: "Start ↑" },
  back: { zh: "返回首页", en: "Back to home" },
  close: { zh: "关闭预览", en: "Close preview" },
  zoom: { zh: "查看大图", en: "View larger" },
  others: { zh: "其他画布", en: "Other canvases" },
} satisfies Record<string, L>;

export const DETAIL: Record<PortalWorkspace, DetailContent> = {
  diagram: {
    title: { zh: ["一句话，", "一张", "排得整齐的图。"], en: ["One", "sentence,", "one", "tidy", "diagram."] },
    sub: {
      zh: "思维导图、流程图、系统架构、研究框架。模型只决定版式，位置交给布局算法；画完自动体检、重新排版，还能在 draw.io 里接着拖。",
      en: "Mind maps, flowcharts, architectures, research frameworks. The model picks the layout and an algorithm places everything; each diagram is checked and re-laid out, and you can keep dragging in draw.io.",
    },
    cta: { zh: "开始绘制", en: "Start drawing" },
    hero: img("dg-after"),
    heroAlt: { zh: "新产品上市计划思维导图，自动排版后", en: "A product launch mind map after auto layout" },
    trio: [
      { title: { zh: "说清楚要什么", en: "Say what you need" }, text: { zh: "层级和关系先理清，再变成节点与连线，不用自己摆格子。", en: "Levels and relations come first, then nodes and links. No grid to fiddle with." } },
      { title: { zh: "自动排版", en: "Laid out for you" }, text: { zh: "画完逐项检查重叠、穿线和文字溢出，分数更高才替换，原图随时切回。", en: "Overlaps, crossing links and overflowing text are checked; a new layout replaces the old only if it scores higher, and the original is one click away." } },
      { title: { zh: "导出就能用", en: "Ready to export" }, text: { zh: "draw.io 文件、PNG、SVG。拿去交作业，或者接着在 draw.io 里改。", en: "draw.io, PNG, SVG. Hand it in, or keep editing it in draw.io." } },
    ],
    steps: [
      { title: { zh: "输入需求", en: "Describe" }, text: { zh: "用一句话描述想画的图。", en: "Describe the diagram in a sentence." } },
      { title: { zh: "理出结构", en: "Structure" }, text: { zh: "抽出节点、关系和方向。", en: "Nodes, relations and directions." } },
      { title: { zh: "生成图表", en: "Generate" }, text: { zh: "转换成 draw.io 兼容的图。", en: "Turned into a draw.io diagram." } },
      { title: { zh: "体检排版", en: "Check & lay out" }, text: { zh: "自动矫正布局，分数更高才替换。", en: "Re-laid out only when it scores higher." } },
      { title: { zh: "局部修改", en: "Revise" }, text: { zh: "对话或拖拽，改某个节点或连线。", en: "Change a node or link by chat or drag." } },
      { title: { zh: "导出复用", en: "Export" }, text: { zh: "draw.io、PNG、SVG。", en: "draw.io, PNG, SVG." } },
    ],
    works: [
      { title: { zh: "新产品上市计划", en: "Product launch plan" }, img: img("dg-after") },
      { title: { zh: "学术研究框架图", en: "Research framework" }, img: img("diagram-1") },
      { title: { zh: "智能问答系统架构", en: "Q&A system architecture" }, img: img("diagram-2") },
      { title: { zh: "项目实施路线图", en: "Project roadmap" }, img: img("diagram-3") },
    ],
    placeholder: { zh: "比如：画一张新产品上市计划的思维导图", en: "e.g. a mind map for a new product launch" },
  },
  cad: {
    title: { zh: ["从一句需求，", "到能施工的", "户型。"], en: ["From", "a", "brief", "to", "a", "buildable", "plan."] },
    sub: {
      zh: "说出户型、面积和生活习惯，先出设计方案，确认后生成户型。AI 只写设计意图，墙、门窗和家具交给程序来摆，自检到零错误，一句话就能精确修改。",
      en: "Describe the flat, its size and how you live. A design brief comes first, then the plan: AI writes the intent, code places walls, doors and furniture and checks them to zero errors, and one sentence changes it exactly.",
    },
    cta: { zh: "开始设计", en: "Start designing" },
    hero: img("cad-plan"),
    heroAlt: { zh: "110㎡ 现代原木风三室两厅平面图", en: "Floor plan of a 110㎡ three-bedroom flat" },
    trio: [
      { title: { zh: "先出方案", en: "A brief first" }, text: { zh: "分区、房间面积、动线和家具清单整理好，等你点头再生成户型。", en: "Zoning, room sizes, circulation and furniture are laid out for you to approve before the plan is drawn." } },
      { title: { zh: "一句话就改", en: "Change it in a sentence" }, text: { zh: "户型是结构化数据，“儿童房加一张书桌，其他不变”就只动那一处，也能直接拖拽。", en: "The plan is structured data, so “add a desk to the kid's room” changes only that. You can drag things too." } },
      { title: { zh: "一键出图", en: "Drawings in one click" }, text: { zh: "3D 鸟瞰、算量报价、A3 施工图 PDF、DXF、彩平图。", en: "3D view, quantities and quote, A3 drawing PDF, DXF and a colour plan." } },
    ],
    steps: [
      { title: { zh: "输入需求", en: "Brief" }, text: { zh: "描述户型、面积和生活方式。", en: "The flat, its size and how you live." } },
      { title: { zh: "设计方案", en: "Design plan" }, text: { zh: "分区、房间与动线，等你确认。", en: "Zoning, rooms and circulation to confirm." } },
      { title: { zh: "生成户型", en: "Floor plan" }, text: { zh: "墙体门窗、家具、水电、吊顶一次到位。", en: "Walls, doors, furniture, wiring, ceilings." } },
      { title: { zh: "自检修改", en: "Check & edit" }, text: { zh: "自查到零错误，对话或拖拽修改。", en: "Checked to zero errors; edit by chat or drag." } },
      { title: { zh: "确认户型", en: "Confirm" }, text: { zh: "锁定交付版本。", en: "Lock the version to deliver." } },
      { title: { zh: "导出交付", en: "Deliver" }, text: { zh: "报价单、施工图 PDF、DXF、3D。", en: "Quote, drawing PDF, DXF, 3D." } },
    ],
    works: [
      { title: { zh: "平面布置图", en: "Furnished floor plan" }, img: img("cad-plan") },
      { title: { zh: "一键 3D 鸟瞰", en: "3D in one click" }, img: img("cad-3d") },
      { title: { zh: "算量报价", en: "Quantities & quote" }, img: img("cad-quotes") },
      { title: { zh: "顶面灯位图", en: "Lighting plan" }, img: img("cad-ceiling") },
    ],
    placeholder: { zh: "比如：三室两厅 110㎡，现代原木风，主卧带衣帽间", en: "e.g. 110㎡, three bedrooms, warm wood, walk-in closet" },
  },
  ppt: {
    title: { zh: ["先挑风格，", "一句话", "出整套。"], en: ["Pick", "a", "style,", "get", "the", "whole", "deck."] },
    sub: {
      zh: "一个输入框就够：给主题、贴大纲或上传旧稿，它会自己判断走哪条路。导出的不是整页图片，底图、图标和文字分层还原，每个字都能在 PowerPoint 里改。",
      en: "One input box: give a topic, paste an outline or upload an old deck and it works out the rest. The export is not a stack of pictures: background, icons and text come back as layers you can edit in PowerPoint.",
    },
    cta: { zh: "开始制作", en: "Start a deck" },
    hero: img("ppt-edit"),
    heroAlt: { zh: "在 PowerPoint 里编辑导出的 PPTX", en: "Editing the exported PPTX in PowerPoint" },
    trio: [
      { title: { zh: "先挑一套风格", en: "Start from a style" }, text: { zh: "风格库里先选好整套视觉，再生成内容，不用换模板。", en: "Choose the look from the style library first, then the content follows. No template swapping." } },
      { title: { zh: "只重做这一页", en: "Redo just this slide" }, text: { zh: "哪一页不满意就改哪一页，其余页面原样保留。", en: "Change only the slide you don't like; the rest stays as it was." } },
      { title: { zh: "导出可编辑 PPT", en: "An editable PPTX" }, text: { zh: "文字、图标、底图分层，拼好后逐区比对，不像的地方会返工。", en: "Text, icons and background are separate layers, compared region by region with the original and redone where they differ." } },
    ],
    steps: [
      { title: { zh: "挑风格", en: "Style" }, text: { zh: "在风格库里选一套。", en: "Pick one from the library." } },
      { title: { zh: "给内容", en: "Content" }, text: { zh: "主题、大纲或旧稿都行。", en: "A topic, an outline or an old deck." } },
      { title: { zh: "拟定大纲", en: "Outline" }, text: { zh: "章节与讲述顺序。", en: "Sections and running order." } },
      { title: { zh: "逐页生成", en: "Slides" }, text: { zh: "按大纲和页面类型生成。", en: "Generated page by page." } },
      { title: { zh: "单页修改", en: "Revise" }, text: { zh: "改写、续写或重做某一页。", en: "Rewrite, extend or redo one slide." } },
      { title: { zh: "导出", en: "Export" }, text: { zh: "可编辑 PPTX 或 PDF。", en: "Editable PPTX or PDF." } },
    ],
    works: [
      { title: { zh: "AI 智能体行业报告", en: "AI agents report" }, img: img("ppt-edit") },
      { title: { zh: "AI 内容创作流程", en: "AI content workflow" }, img: img("ppt-1") },
      { title: { zh: "智能协作增长", en: "Smart collaboration" }, img: img("ppt-2") },
      { title: { zh: "商业创新演示", en: "Business innovation" }, img: img("ppt-3") },
    ],
    placeholder: { zh: "比如：Q3 产品增长复盘，12 页", en: "e.g. a 12-slide Q3 growth review" },
  },
  canvas: {
    title: { zh: ["在图上", "圈一圈，", "就能改。"], en: ["Mark", "up", "the", "picture", "to", "change", "it."] },
    sub: {
      zh: "一句话生成图片放上白板，用箭头、圈选、手绘或几个字标出要改的地方。它读懂标注后生成修改版，每一版都留在版本谱系里。",
      en: "A sentence puts a picture on the board. Arrows, circles, strokes or a few words mark what to change; the marks are read, a revised version is made, and every version stays in the lineage.",
    },
    cta: { zh: "开始创作", en: "Start creating" },
    hero: "/examples/canvas/03.svg",
    heroAlt: { zh: "白板上的灯塔插画，第二版", en: "A lighthouse picture on the board, version 2" },
    trio: [
      { title: { zh: "一句话上板", en: "A sentence, on the board" }, text: { zh: "生成的图片自动放到白板空位，旁边能接着画。", en: "The picture lands in free space, with room to draw beside it." } },
      { title: { zh: "标注就是指令", en: "Marks are instructions" }, text: { zh: "发送前能预览它会看到的标注，并显示它读出的修改意图。", en: "Preview the marks before sending, and see the change it read from them." } },
      { title: { zh: "版本排在一起", en: "Versions side by side" }, text: { zh: "每次修改都是新版本，随时切换、对比。", en: "Each edit is a new version you can switch to and compare." } },
    ],
    steps: [
      { title: { zh: "描述画面", en: "Describe" }, text: { zh: "一句话描述想要的图。", en: "Describe the picture." } },
      { title: { zh: "生成上板", en: "Place" }, text: { zh: "放到白板空位。", en: "It lands on the board." } },
      { title: { zh: "圈画标注", en: "Mark up" }, text: { zh: "箭头、圈选或文字。", en: "Arrows, circles or words." } },
      { title: { zh: "预览确认", en: "Preview" }, text: { zh: "看它将读到的标注。", en: "See the marks it will read." } },
      { title: { zh: "生成新版", en: "Revise" }, text: { zh: "按标注修改。", en: "Changed by the marks." } },
      { title: { zh: "版本对比", en: "Compare" }, text: { zh: "在谱系里切换。", en: "Switch in the lineage." } },
    ],
    works: [
      { title: { zh: "一句话生成图片", en: "A picture from a sentence" }, img: "/examples/canvas/01.svg" },
      { title: { zh: "在图上圈画标注", en: "Marked up on the board" }, img: "/examples/canvas/02.svg" },
      { title: { zh: "按标注生成新版", en: "A new version from the marks" }, img: "/examples/canvas/03.svg" },
      { title: { zh: "版本谱系对比", en: "Comparing versions" }, img: "/examples/canvas/04.svg" },
    ],
    placeholder: { zh: "比如：海边的灯塔，黄昏，水彩", en: "e.g. a lighthouse by the sea at dusk, watercolour" },
  },
};
