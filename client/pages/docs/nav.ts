import type { UiLanguage } from "@/shared/i18n";

/**
 * The docs' table of contents: groups in reading order, each page a markdown
 * file under content/<lang>/<slug>.md. The order here is also the order of
 * the previous / next links at the foot of every page.
 */

export type DocPage = { slug: string; zh: string; en: string };
export type DocGroup = { id: string; zh: string; en: string; pages: DocPage[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    id: "start",
    zh: "开始使用",
    en: "Getting started",
    pages: [
      { slug: "introduction", zh: "简介", en: "Introduction" },
      { slug: "quickstart", zh: "快速开始", en: "Quickstart" },
      { slug: "models", zh: "接入模型", en: "Connecting a model" },
    ],
  },
  {
    id: "canvases",
    zh: "画布指南",
    en: "Canvases",
    pages: [
      { slug: "diagram", zh: "图表绘制", en: "Diagram" },
      { slug: "interior", zh: "室内设计", en: "Interior design" },
      { slug: "ppt", zh: "PPT 演示", en: "Slides" },
      { slug: "canvas", zh: "自由画布", en: "Free canvas" },
    ],
  },
  {
    id: "features",
    zh: "功能",
    en: "Features",
    pages: [
      { slug: "works", zh: "作品与保存", en: "Works and saving" },
      { slug: "settings", zh: "设置一览", en: "Settings" },
    ],
  },
  {
    id: "principles",
    zh: "原理",
    en: "How it works",
    pages: [
      { slug: "principles", zh: "设计取向", en: "Design stance" },
      { slug: "diagram-layout", zh: "图表的排版", en: "Diagram layout" },
      { slug: "diagram-pipeline", zh: "图表的对话管线", en: "Diagram chat pipeline" },
      { slug: "interior-engine", zh: "户型从意图到图纸", en: "Floor plans, intent to drawings" },
      { slug: "ppt-pipeline", zh: "演示文稿的生成", en: "How decks are made" },
      { slug: "canvas-edit", zh: "按标注改图", en: "Editing by annotation" },
      { slug: "works-storage", zh: "作品如何保存", en: "How works are stored" },
    ],
  },
  {
    id: "skills",
    zh: "技能与插件",
    en: "Skills and plugins",
    pages: [{ slug: "skills", zh: "在编程助手里用画布", en: "Canvases in coding agents" }],
  },
  {
    id: "dev",
    zh: "开发者",
    en: "Developers",
    pages: [
      { slug: "architecture", zh: "架构", en: "Architecture" },
      { slug: "api", zh: "接口与模型客户端", en: "API and model client" },
      { slug: "extending", zh: "扩展与测试", en: "Extending and testing" },
    ],
  },
  {
    id: "reference",
    zh: "参考",
    en: "Reference",
    pages: [
      { slug: "faq", zh: "常见问题", en: "FAQ" },
      { slug: "changelog", zh: "更新日志", en: "Changelog" },
    ],
  },
];

export const DOC_PAGES: DocPage[] = DOC_GROUPS.flatMap((g) => g.pages);
export const DEFAULT_DOC = DOC_PAGES[0].slug;

export const pageTitle = (page: DocPage, lang: UiLanguage) => (lang === "zh" ? page.zh : page.en);
export const groupOf = (slug: string) => DOC_GROUPS.find((g) => g.pages.some((p) => p.slug === slug));
