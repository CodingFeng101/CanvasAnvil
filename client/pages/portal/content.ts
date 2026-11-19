import type { UiLanguage } from "@/shared/i18n";
import type { PortalWorkspace } from "./data";

/**
 * Everything the portal home page says and shows, in both languages
 * (docs/plans/portal-redesign-plan.md §3). Sections read from here only, so
 * a wording change never touches a component.
 */

export type L = { zh: string; en: string };
export const t = (text: L, lang: UiLanguage) => text[lang];

const P = "/examples/portal/";
/** The small (360px) and medium (1200px) webp of a portal image. */
export const img = (name: string, size: "sm" | "md" = "md") => `${P}${name}-${size}.webp`;

export const REPO_URL = "https://github.com/CodingFeng101/CanvasAnvil";

/** Each canvas owns one swatch (backgrounds, dots) and a deeper ink for small marks. */
export const CANVAS: Record<PortalWorkspace, { name: L; swatch: string; ink: string }> = {
  diagram: { name: { zh: "图表绘制", en: "Diagram" }, swatch: "#bcd1ca", ink: "#629987" },
  cad: { name: { zh: "室内设计", en: "Interior Design" }, swatch: "#e3dacc", ink: "#a8825c" },
  ppt: { name: { zh: "PPT 演示", en: "PPT" }, swatch: "#ebc9b7", ink: "#d97757" },
  canvas: { name: { zh: "自由画布", en: "Free Canvas" }, swatch: "#cbcadb", ink: "#827dbd" },
};
export const CANVAS_ORDER: PortalWorkspace[] = ["diagram", "cad", "ppt", "canvas"];

export const NAV = {
  canvases: { zh: "画布", en: "Canvases" },
  examples: { zh: "作品示例", en: "Examples" },
  how: { zh: "工作方式", en: "How it works" },
  faq: { zh: "常见问题", en: "FAQ" },
  tutorials: { zh: "教程", en: "Tutorials" },
  start: { zh: "开始创作", en: "Start creating" },
  langSwitch: { zh: "EN", en: "中文" },
  menu: { zh: "菜单", en: "Menu" },
} satisfies Record<string, L>;

export const HERO = {
  /** Words appear one by one; `null` is a line break. */
  words: {
    zh: ["把想法，", null, "落成", "一张图。"],
    en: ["Where", "ideas", null, "take", "shape."],
  } as Record<UiLanguage, Array<string | null>>,
  title: { zh: "把想法，落成一张图。", en: "Where ideas take shape." },
  sub: {
    zh: "图表、户型与施工图、演示文稿、白板。\n一句话起笔，一处一处地改。",
    en: "Diagrams, floor plans, decks and boards.\nStart with a sentence, refine one stroke at a time.",
  },
  primary: { zh: "开始创作", en: "Start creating" },
  secondary: { zh: "看看能做什么 ↓", en: "See what it can do ↓" },
  open: { zh: "打开 →", en: "Open →" },
} satisfies Record<string, unknown>;

/** Hero tiles that show a real piece of work. */
export const HERO_WORKS: Array<{ k: PortalWorkspace; img: string; name: L }> = [
  { k: "diagram", img: "dg-after", name: { zh: "新产品上市计划 · 自动排版", en: "Launch plan · auto layout" } },
  { k: "cad", img: "cad-plan", name: { zh: "110㎡ 现代原木风三室", en: "110㎡ three-bed, warm wood" } },
  { k: "ppt", img: "ppt-edit", name: { zh: "可编辑 PPTX", en: "Editable PPTX" } },
  { k: "cad", img: "cad-3d", name: { zh: "一键 3D 鸟瞰", en: "3D in one click" } },
  { k: "cad", img: "cad-quotes", name: { zh: "算量报价", en: "Quantities & quote" } },
  { k: "diagram", img: "diagram-1", name: { zh: "开题报告研究框架", en: "Thesis research framework" } },
  { k: "diagram", img: "diagram-2", name: { zh: "智能问答系统架构", en: "Q&A system architecture" } },
  { k: "diagram", img: "diagram-3", name: { zh: "项目实施路线图", en: "Project roadmap" } },
  { k: "diagram", img: "diagram-4", name: { zh: "课程设计思维导图", en: "Course design mind map" } },
  { k: "diagram", img: "diagram-5", name: { zh: "学术研究框架图", en: "Academic framework" } },
  { k: "cad", img: "cad-floorplan", name: { zh: "三室两厅平面布置", en: "3-bed floor plan" } },
  { k: "cad", img: "cad-1", name: { zh: "装修平面布置图", en: "Furnished layout" } },
  { k: "cad", img: "cad-2", name: { zh: "地面铺装图", en: "Flooring plan" } },
  { k: "cad", img: "cad-3", name: { zh: "顶面布置图", en: "Ceiling plan" } },
  { k: "cad", img: "cad-quote", name: { zh: "工程量与报价", en: "Quantities & quote" } },
  { k: "cad", img: "cad-ceiling", name: { zh: "顶面灯位", en: "Lighting layout" } },
  { k: "cad", img: "cad-7", name: { zh: "节点详图", en: "Construction detail" } },
  { k: "ppt", img: "ppt-1", name: { zh: "AI 内容创作流程", en: "AI content workflow" } },
  { k: "ppt", img: "ppt-2", name: { zh: "智能协作增长", en: "Smart collaboration" } },
  { k: "ppt", img: "ppt-3", name: { zh: "商业创新演示", en: "Business innovation" } },
  { k: "ppt", img: "ppt-4", name: { zh: "低碳校园转型", en: "Low-carbon campus" } },
  { k: "ppt", img: "ppt-academic", name: { zh: "学术答辩 · 封面", en: "Thesis defense · cover" } },
  { k: "ppt", img: "ppt-business", name: { zh: "季度复盘 · 第 4 页", en: "Quarterly review · p.4" } },
  { k: "ppt", img: "ppt-creative", name: { zh: "品牌提案 · 第 2 页", en: "Brand pitch · p.2" } },
  { k: "canvas", img: "/examples/canvas/01.svg", name: { zh: "海边灯塔 · v1", en: "Lighthouse · v1" } },
  { k: "canvas", img: "/examples/canvas/02.svg", name: { zh: "圈出天空", en: "Circle the sky" } },
  { k: "canvas", img: "/examples/canvas/03.svg", name: { zh: "加一群海鸥 · v2", en: "Add gulls · v2" } },
  { k: "canvas", img: "/examples/canvas/04.svg", name: { zh: "版本谱系", en: "Version tree" } },
];
/** A canvas svg is used as-is; anything else is a portal webp name. */
export const workSrc = (name: string, size: "sm" | "md" = "md") => (name.startsWith("/") ? name : img(name, size));

export const INTRO = {
  /** The latest update video (tools/video/out/highlights), re-encoded at 720p. */
  video: "/examples/portal/intro.mp4",
  poster: "/examples/portal/intro-poster.webp",
  videoCaption: { zh: "近期更新 · AI 做出来的，现在都能接着改", en: "Latest update · whatever AI makes, you can now keep editing" },
  videoLabel: { zh: "播放更新视频", en: "Play the update video" },
  trio: [
    {
      title: { zh: "一句话就够了", en: "A sentence is enough" },
      text: {
        zh: "不用会画图，也不用先学一个工具。说清楚要什么，结构、排版和配色交给它。",
        en: "No drawing skills, no tool to learn first. Say what you need; structure, layout and colour are taken care of.",
      },
    },
    {
      title: { zh: "做完还能接着改", en: "Keep editing after it's done" },
      text: {
        zh: "图表画完自动重新排版，户型一句话就改，PPT 导出后每个字都能改。",
        en: "Diagrams re-lay themselves out, a floor plan changes with one sentence, and every word of an exported deck stays editable.",
      },
    },
    {
      title: { zh: "拿去就能用", en: "Ready to hand in" },
      text: {
        zh: "draw.io 文件、施工图与报价、可编辑 PPT、PDF。拿去交付，或者接着改。",
        en: "draw.io files, construction drawings and quotes, editable PPT, PDF. Hand it in, or keep editing elsewhere.",
      },
    },
  ],
};

export const STORY = {
  title: { zh: ["一张书桌，", "四种", "画布"], en: ["One", "desk,", "four", "canvases"] } as Record<UiLanguage, string[]>,
  sub: { zh: "从一句话开始，到一份交得出去的文件。", en: "From a single sentence to a file you can hand in." },
  inputHint: { zh: "描述你想改的地方…", en: "Describe what to change…" },
  more: { zh: "了解{name} →", en: "More about {name} →" },
  another: { zh: "换一句话 ↗", en: "Try another ↗" },
  replay: { zh: "重播 ↻", en: "Replay ↻" },
};

export type StoryScene = {
  k: PortalWorkspace;
  title: L;
  text: L;
  prompt: L;
  steps: L[];
  img: string;
  after?: string;
  /** Hand-drawn circle, as [left, top, width, height] in % of the canvas area. */
  circle: [number, number, number, number];
  note: L;
  exports: L[];
};

export const STORY_SCENES: StoryScene[] = [
  {
    k: "diagram",
    title: { zh: "一句话，一张排得整齐的图", en: "One sentence, one tidy diagram" },
    text: {
      zh: "思维导图、流程图、系统架构。模型只说这是什么版式，位置交给布局算法；画完自动体检、重新排版，原图和矫正版随时切换。",
      en: "Mind maps, flowcharts, architectures. The model only decides the kind of layout and an algorithm places everything; each diagram is checked and re-laid out, and you can switch back to the original any time.",
    },
    prompt: { zh: "画一张新产品上市计划的思维导图", en: "A mind map for a new product launch" },
    steps: [
      { zh: "理出 4 条主线", en: "Find 4 main branches" },
      { zh: "生成节点与连线", en: "Nodes and links" },
      { zh: "自动体检，重新排版", en: "Check and re-lay out" },
    ],
    img: img("dg-before"),
    after: img("dg-after"),
    circle: [26, 48, 50, 30],
    note: { zh: "布局矫正：体检 54 → 90 分", en: "Layout fix: score 54 → 90" },
    exports: [{ zh: "draw.io", en: "draw.io" }, { zh: "PNG", en: "PNG" }, { zh: "SVG", en: "SVG" }],
  },
  {
    k: "cad",
    title: { zh: "能施工的户型，一句话就改", en: "A buildable plan, changed in a sentence" },
    text: {
      zh: "AI 只写设计意图，墙、门窗和家具交给程序来摆，自检到零错误。户型是结构化数据，所以能精确修改，一键看 3D，导出施工图和报价。",
      en: "AI writes only the design intent; walls, doors and furniture are placed by code and checked to zero errors. The plan is structured data, so edits are exact, 3D is one click away, and drawings and a quote come out at the end.",
    },
    prompt: { zh: "三室两厅 110㎡，现代原木风", en: "110㎡, three bedrooms, warm modern wood" },
    steps: [
      { zh: "整理设计方案", en: "Draft the brief" },
      { zh: "生成户型", en: "Lay out the plan" },
      { zh: "自查零错误", en: "Self-check: no errors" },
    ],
    img: img("cad-plan"),
    circle: [38, 44, 26, 20],
    note: { zh: "儿童房加一张书桌，其他不变", en: "Add a desk to the kid's room, keep the rest" },
    exports: [{ zh: "施工图 PDF", en: "Drawings PDF" }, { zh: "DXF", en: "DXF" }, { zh: "报价单", en: "Quote" }],
  },
  {
    k: "ppt",
    title: { zh: "导出的 PPT，每个字都能改", en: "Every word of the deck stays editable" },
    text: {
      zh: "先挑一套风格，一句话出整套。导出的不是整页图片：底图、图标和文字分层还原，打开 PowerPoint 就能接着改。",
      en: "Pick a style and one sentence makes the deck. The export is not a stack of pictures: background, icons and text come back as layers you can edit in PowerPoint.",
    },
    prompt: { zh: "AI 智能体行业报告，12 页", en: "A 12-slide report on AI agents" },
    steps: [
      { zh: "挑一套风格", en: "Pick a style" },
      { zh: "拟定大纲", en: "Outline" },
      { zh: "逐页生成", en: "Generate slide by slide" },
    ],
    img: img("ppt-edit"),
    circle: [32, 2, 66, 22],
    note: { zh: "在 PowerPoint 里直接改标题", en: "Edit the title right in PowerPoint" },
    exports: [{ zh: "可编辑 PPTX", en: "Editable PPTX" }, { zh: "PDF", en: "PDF" }],
  },
  {
    k: "canvas",
    title: { zh: "在图上圈一圈，就能改", en: "Mark up the picture to change it" },
    text: {
      zh: "一句话生成图片放上白板，用箭头、圈选或几个字标出要改的地方，新版本和旧版本排在一起，随时对比。",
      en: "A sentence puts a picture on the board. Arrows, circles or a few words mark what to change, and every new version sits beside the old one.",
    },
    prompt: { zh: "海边的灯塔，黄昏", en: "A lighthouse by the sea at dusk" },
    steps: [
      { zh: "生成图片", en: "Generate the picture" },
      { zh: "放上白板", en: "Place it on the board" },
    ],
    img: "/examples/canvas/01.svg",
    after: "/examples/canvas/03.svg",
    circle: [44, 34, 20, 18],
    note: { zh: "天空里加一群海鸥", en: "Add gulls to the sky" },
    exports: [{ zh: "v1 → v2", en: "v1 → v2" }, { zh: "PNG", en: "PNG" }],
  },
];

export const FILL = {
  before: { zh: "我想画一张", en: "I want a" },
  middle: { zh: "，用在", en: "for" },
  after: { zh: "里。", en: "." },
  canvases: { zh: "画布", en: "Canvas" },
  uses: { zh: "用途", en: "Use" },
  useFor: { zh: "用在{use}", en: "for {use}" },
  go: { zh: "用这句话开始 →", en: "Start with this →" },
};

export type FillItem = { type: L; use: L; img: string };
export const FILL_LIBRARY: Record<PortalWorkspace, FillItem[]> = {
  diagram: [
    { type: { zh: "研究框架图", en: "research framework" }, use: { zh: "开题报告", en: "a thesis proposal" }, img: img("diagram-1") },
    { type: { zh: "系统架构图", en: "system architecture" }, use: { zh: "设计评审", en: "a design review" }, img: img("diagram-2") },
    { type: { zh: "实施路线图", en: "project roadmap" }, use: { zh: "项目汇报", en: "a project update" }, img: img("diagram-3") },
    { type: { zh: "思维导图", en: "mind map" }, use: { zh: "上市计划", en: "a launch plan" }, img: img("dg-after") },
  ],
  cad: [
    { type: { zh: "平面布置图", en: "furnished floor plan" }, use: { zh: "自住装修", en: "my own renovation" }, img: img("cad-plan") },
    { type: { zh: "算量报价", en: "bill of quantities" }, use: { zh: "报价核对", en: "checking a quote" }, img: img("cad-quotes") },
    { type: { zh: "顶面灯位图", en: "lighting plan" }, use: { zh: "施工交底", en: "briefing the builders" }, img: img("cad-ceiling") },
    { type: { zh: "水电点位图", en: "wiring plan" }, use: { zh: "出租房翻新", en: "a rental refit" }, img: img("cad-mep") },
  ],
  ppt: [
    { type: { zh: "行业报告", en: "industry report" }, use: { zh: "组会", en: "a lab meeting" }, img: img("ppt-edit") },
    { type: { zh: "增长方案", en: "growth plan" }, use: { zh: "季度述职", en: "a quarterly review" }, img: img("ppt-2") },
    { type: { zh: "创新提案", en: "innovation pitch" }, use: { zh: "路演", en: "a pitch day" }, img: img("ppt-3") },
    { type: { zh: "转型规划", en: "transition plan" }, use: { zh: "课程分享", en: "a class talk" }, img: img("ppt-4") },
  ],
  canvas: [
    { type: { zh: "海报草图", en: "poster sketch" }, use: { zh: "活动宣传", en: "an event" }, img: "/examples/canvas/01.svg" },
    { type: { zh: "插画构思", en: "illustration idea" }, use: { zh: "绘本创作", en: "a picture book" }, img: "/examples/canvas/02.svg" },
    { type: { zh: "产品概念图", en: "product concept" }, use: { zh: "需求讨论", en: "a product discussion" }, img: "/examples/canvas/03.svg" },
    { type: { zh: "灵感板", en: "mood board" }, use: { zh: "风格探索", en: "exploring a style" }, img: "/examples/canvas/04.svg" },
  ],
};

export const EDIT = {
  eyebrow: { zh: "接着改", en: "Keep editing" },
  title: { zh: ["做出来的，", "都能", "接着改。"], en: ["Whatever", "it", "makes,", "you", "can", "keep", "editing."] } as Record<UiLanguage, string[]>,
  text: {
    zh: "AI 给的第一版很少刚好合适。所以每个画布出来的都不是一张死图：图表能重新排版，户型能精确修改，PPT 能在 PowerPoint 里一个字一个字地改。",
    en: "AI rarely gets the first version exactly right, so nothing a canvas makes is a flat picture: diagrams re-lay themselves out, floor plans change precisely, and decks open in PowerPoint word by word.",
  },
  bullets: [
    { zh: "图表：乱排 → 自动排版，原图随时切回", en: "Diagram: messy → auto layout, original one click away" },
    { zh: "PPT 导出：整页图片 → 可编辑 PPTX", en: "PPT export: flat pictures → editable PPTX" },
    { zh: "室内设计：几张效果图 → 能施工的户型", en: "Interior: a few renders → a buildable plan" },
    { zh: "PPT 开始页：先选模式 → 一个输入框搞定", en: "PPT start: pick a mode → one input box" },
  ],
  beforeImg: img("dg-before"),
  afterImg: img("dg-after"),
  before: { zh: "模型原图 · 体检 54 分", en: "Model's layout · score 54" },
  after: { zh: "自动矫正后 · 体检 90 分", en: "After the fix · score 90" },
  sliderLabel: { zh: "拖动对比矫正前后", en: "Drag to compare before and after" },
};

export const WORKS = {
  title: { zh: ["每一份，", "都留着。"], en: ["Every", "piece,", "kept."] } as Record<UiLanguage, string[]>,
  text: {
    zh: "每个画布都能存多份作品。点保存才更新，没保存的草稿不会进列表；离开时有改动，会问你保存还是放弃。",
    en: "Keep several works in every canvas. A work changes only when you press Save, drafts stay out of the list, and leaving with changes asks whether to save them.",
  },
  items: [
    { k: "diagram" as PortalWorkspace, img: "diagram-2", name: { zh: "智能问答系统架构", en: "Q&A system architecture" }, date: { zh: "11 月 18 日", en: "Nov 18" } },
    { k: "cad" as PortalWorkspace, img: "cad-plan", name: { zh: "110㎡ 现代原木风三室", en: "110㎡ three-bed, warm wood" }, date: { zh: "11 月 17 日", en: "Nov 17" } },
    { k: "ppt" as PortalWorkspace, img: "ppt-2", name: { zh: "智能协作增长", en: "Smart collaboration" }, date: { zh: "11 月 15 日", en: "Nov 15" } },
    { k: "canvas" as PortalWorkspace, img: "/examples/canvas/04.svg", name: { zh: "海边灯塔", en: "Lighthouse" }, date: { zh: "11 月 12 日", en: "Nov 12" } },
    { k: "diagram" as PortalWorkspace, img: "diagram-3", name: { zh: "项目实施路线图", en: "Project roadmap" }, date: { zh: "11 月 9 日", en: "Nov 9" } },
    { k: "ppt" as PortalWorkspace, img: "ppt-4", name: { zh: "低碳校园转型", en: "Low-carbon campus" }, date: { zh: "11 月 3 日", en: "Nov 3" } },
  ],
};

export const FAQ = {
  title: { zh: ["常见", "问题"], en: ["Questions"] } as Record<UiLanguage, string[]>,
  items: [
    {
      q: { zh: "需要自己的模型 API 吗？", en: "Do I need my own model API?" },
      a: {
        zh: "需要。在设置里填入你自己的模型服务地址和密钥即可，支持常见的 OpenAI 兼容接口。CanvasAnvil 本身不收费，也不经手你的密钥。",
        en: "Yes. Enter your own model endpoint and key in Settings; common OpenAI-compatible APIs work. CanvasAnvil itself is free and never handles your key.",
      },
    },
    {
      q: { zh: "我的数据存在哪里？", en: "Where is my data stored?" },
      a: {
        zh: "作品和对话都存在你自己电脑的浏览器里（IndexedDB），不会上传到我们的服务器。清空浏览器数据前记得先导出。",
        en: "Works and chats live in your own browser (IndexedDB) and are never uploaded to us. Export anything you want to keep before clearing browser data.",
      },
    },
    {
      q: { zh: "导出的文件能在别的软件里打开吗？", en: "Can other software open the exports?" },
      a: {
        zh: "能。图表导出 draw.io 文件，室内设计导出 DXF 图纸、施工图 PDF 和报价单，PPT 导出可编辑的 .pptx，每个字都能改。",
        en: "Yes. Diagrams export as draw.io files, interior designs as DXF drawings, a construction PDF and a quote, and decks as editable .pptx.",
      },
    },
    {
      q: { zh: "和 Codex、Claude Code 怎么一起用？", en: "How does it work with Codex or Claude Code?" },
      a: {
        zh: "CanvasAnvil 也是一个插件。在 Codex 里一行命令添加插件市场，就能在对话里直接调用各个画布。",
        en: "CanvasAnvil is also a plugin. Add its marketplace in Codex with one command and call the canvases right from your chat.",
      },
    },
    {
      q: { zh: "可以商用吗？", en: "Can I use it commercially?" },
      a: {
        zh: "可以。项目使用 MIT 协议开源，个人和商业用途都可以，保留版权声明即可。",
        en: "Yes. It is open source under the MIT licence; personal and commercial use are both fine as long as the copyright notice stays.",
      },
    },
    {
      q: { zh: "作品会自动保存吗？", en: "Are works saved automatically?" },
      a: {
        zh: "画布里的内容随时存在浏览器里，刷新不会丢；但「我的作品」里的版本只有点保存才更新。离开有改动的作品时，会问你保存还是放弃。",
        en: "What is on a canvas is kept in your browser all the time, so a reload loses nothing, but the version in My works changes only when you press Save. Leaving with changes asks whether to save them.",
      },
    },
  ],
};

export const ASK = {
  title: { zh: ["想画", "点什么？", "写一句", "就好。"], en: ["What", "will", "you", "draw?"] } as Record<UiLanguage, string[]>,
  text: { zh: "它会挑好合适的画布，把你的话带进去，接着往下画。", en: "Write one line. The right canvas opens with your words already in it." },
  placeholder: { zh: "比如：画一张开题报告的研究框架图", en: "e.g. a research framework for my thesis proposal" },
  fallback: { zh: "画一张开题报告的研究框架图", en: "A research framework for my thesis proposal" },
  submit: { zh: "开始 ↑", en: "Start ↑" },
};

export const FOOTER = {
  tagline: { zh: "把想法，落成一张图。", en: "Where ideas take shape." },
  canvases: { zh: "画布", en: "Canvases" },
  resources: { zh: "资源", en: "Resources" },
  open: { zh: "开源", en: "Open source" },
  tutorials: { zh: "教程", en: "Tutorials" },
  changelog: { zh: "更新日志", en: "Changelog" },
  docs: { zh: "文档", en: "Docs" },
  license: { zh: "MIT 协议", en: "MIT licence" },
  issues: { zh: "提交问题", en: "Report an issue" },
};

/** Which canvas a free-text request most likely belongs to. */
export function guessCanvas(text: string): PortalWorkspace {
  const s = text.toLowerCase();
  if (/户型|装修|卧|厨|卫|客厅|施工|报价|平米|㎡|floor ?plan|bedroom|renovat|kitchen|interior/.test(s)) return "cad";
  if (/ppt|演示|汇报|幻灯|路演|答辩|slide|deck|presentation|pitch/.test(s)) return "ppt";
  if (/框架|流程|架构|思维导图|路线|关系图|结构图|图表|diagram|flowchart|architecture|framework|mind ?map|roadmap/.test(s)) return "diagram";
  return "canvas";
}
