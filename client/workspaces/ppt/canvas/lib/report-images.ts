import type { ReferenceItem } from "@/shared/references/types";
import type { SlideData } from "@/workspaces/ppt/canvas/types";

/**
 * Pictures of a referenced interior design, waiting for the report's outline: each goes to the
 * first slide whose title or points talk about what the picture shows (renders to the renders
 * slide, plans to the plan slide, the original floorplan to the before/after slide).
 */

export const REPORT_IMAGES_KEY = "report-images";

export interface PendingReportImages {
  workName: string;
  items: ReferenceItem[];
}

const RULES: Array<{ picture: RegExp; slide: RegExp }> = [
  { picture: /效果图|render/i, slide: /效果|渲染|render|visual/i },
  { picture: /彩平|colou?r plan/i, slide: /彩平|平面|布置|layout|plan/i },
  { picture: /平面布置|furnished plan/i, slide: /平面|布置|layout|plan/i },
  { picture: /原始户型|original/i, slide: /原始|现状|改造|前后|original|before|existing/i },
];

/**
 * What of a referenced design goes into the chat as the report's source: the texts and the quote
 * table the picker would tick by default (the pictures wait for the outline, the drawings and
 * DXFs are for builders, not for a report).
 */
export function reportSourceItems(items: ReferenceItem[]): ReferenceItem[] {
  return items.filter((item) => item.defaultOn !== false && (item.kind === "text" || /\.csv$/i.test(item.fileName ?? "")));
}

const slideText =(slide: SlideData) => [slide.title, ...(slide.content ?? []), slide.layout].filter(Boolean).join(" ");

/** Pictures by slide id, and the pictures no slide asked for. */
export function matchReportImages(slides: SlideData[], items: ReferenceItem[]): { bySlide: Map<string, ReferenceItem[]>; unmatched: ReferenceItem[] } {
  const bySlide = new Map<string, ReferenceItem[]>();
  const unmatched: ReferenceItem[] = [];
  for (const item of items) {
    if (item.kind !== "image" || !item.dataUrl) continue;
    const rule = RULES.find((r) => r.picture.test(item.label));
    const slide = rule ? slides.find((s) => rule.slide.test(slideText(s))) : undefined;
    if (!slide) {
      unmatched.push(item);
      continue;
    }
    bySlide.set(slide.id, [...(bySlide.get(slide.id) ?? []), item]);
  }
  return { bySlide, unmatched };
}
