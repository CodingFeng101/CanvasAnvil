import type { UiLanguage } from "@/lib/ui-language";

export const CAD_RENDER_SLOT_TITLES = [
  { zh: "装修平面布置图", en: "Renovation Plan Layout" },
  { zh: "地面铺装图", en: "Floor Finish Plan" },
  { zh: "顶面布置图", en: "Reflected Ceiling Plan" },
  { zh: "墙体定位图", en: "Wall Setting-Out Plan" },
  { zh: "机电点位图（强弱电+给排水）", en: "MEP Plan (Electrical + Low Voltage + Plumbing)" },
  { zh: "立面索引图+室内立面图", en: "Elevation Index Plan + Interior Elevations" },
  { zh: "节点大样图", en: "Detail Drawings" },
] as const;

export function getCadRenderSlotTitles(lang: UiLanguage): string[] {
  return CAD_RENDER_SLOT_TITLES.map((item) => (lang === "zh" ? item.zh : item.en));
}

export function getCadRenderFallbackTitle(lang: UiLanguage, index: number): string {
  const item = CAD_RENDER_SLOT_TITLES[index];
  if (item) return lang === "zh" ? item.zh : item.en;
  return lang === "zh" ? `图纸 ${index + 1}` : `Drawing ${index + 1}`;
}
