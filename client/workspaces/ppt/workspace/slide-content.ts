import { textBlocksToPptElements, type PptElement, type PptTextBlock } from "@/lib/ppt-service";
import type { SlideRenderLayer } from "@/workspaces/ppt/workspace/types";

/** Text-shape helpers: bullets, layout hints, and slide-title normalisation. */

export const hasRenderableTextBlocks = (layer?: SlideRenderLayer) =>
  Array.isArray(layer?.textBlocks) && layer.textBlocks.length > 0;

export const cloneSerializable = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const stripLeadingBullet = (value: string) =>
  value.replace(/^[•●▪◦·]\s*/, "").trim();

export const textToLines = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

export const deriveTextElementsFromBlocks = (textBlocks: PptTextBlock[] = []): PptElement[] =>
  textBlocksToPptElements(textBlocks);

export const mergeTextBlocksIntoElements = (textBlocks: PptTextBlock[] = [], elements: PptElement[] = []): PptElement[] => {
  const nonTextElements = elements.filter((element) => element?.type !== "text");
  return [...nonTextElements, ...deriveTextElementsFromBlocks(textBlocks)];
};

export const localizeLayoutHint = (layout: string, lang: "zh" | "en") => {
  const raw = String(layout || "").trim();
  if (!raw) return raw;
  const key = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[+_/-]/g, "");
  const map: Record<string, { zh: string; en: string }> = {
    cover: { zh: "封面页", en: "Cover" },
    titlebullets: { zh: "标题+要点", en: "Title + Bullets" },
    titlebullet: { zh: "标题+要点", en: "Title + Bullets" },
    twocolumn: { zh: "双栏布局", en: "Two-column" },
    lefttextrightimage: { zh: "左文右图", en: "Left text, right image" },
    titleandcontent: { zh: "标题+内容", en: "Title + Content" },
    封面页: { zh: "封面页", en: "Cover" },
    标题要点: { zh: "标题+要点", en: "Title + Bullets" },
    双栏布局: { zh: "双栏布局", en: "Two-column" },
    左文右图: { zh: "左文右图", en: "Left text, right image" },
    标题内容: { zh: "标题+内容", en: "Title + Content" },
  };
  const hit = map[key];
  if (!hit) return raw;
  return lang === "zh" ? hit.zh : hit.en;
};

export const parseSlideNo = (value: string): number | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m1 = raw.match(/^(?:slide|page)[\s_-]*(\d+)$/i);
  if (m1) return Number(m1[1]);
  const m2 = raw.match(/^第\s*(\d+)\s*页$/i);
  if (m2) return Number(m2[1]);
  const m3 = raw.match(/^(\d+)$/);
  if (m3) return Number(m3[1]);
  return null;
};

export const normalizeLocalizedSlideTitle = (
  title: string,
  uiLang: "zh" | "en",
  fallbackNo?: number | null
) => {
  const raw = String(title || "").trim();
  const fromTitle = parseSlideNo(raw);
  const no = fromTitle || (typeof fallbackNo === "number" ? fallbackNo : null);
  if (uiLang === "zh") {
    if (/^(?:slide|page)(?:\s|_|-)*\d*$/i.test(raw) || /^slide$/i.test(raw) || /^page$/i.test(raw)) {
      return no ? `第 ${no} 页` : "幻灯片";
    }
    return raw;
  }
  if (/^第\s*\d+\s*页$/i.test(raw)) {
    return no ? `Slide ${no}` : "Slide";
  }
  return raw;
};
