import type { PptPage } from "@/workspaces/ppt/lib/ppt-service";
import type {
  ReferenceVisualAsset,
  SlideData,
  SlideMaterialImage,
} from "@/workspaces/ppt/canvas/types";

/**
 * Reference images are attached to a slide and referred to from its
 * description by a `{{image:Name}}` token. The token is what tells the image
 * model which picture goes where, so losing one silently drops the user's
 * material from the rendered slide.
 */

export type MaterialLang = "zh" | "en";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The display name a material gets from its position in the slide's list. */
export function materialLabel(index: number, lang: MaterialLang): string {
  return lang === "zh" ? `第${index}张` : `Image ${index}`;
}

export function materialToken(name: string): string {
  return `{{image:${name}}}`;
}

/**
 * Drops every reference to a material from a description, and tidies the
 * whitespace the removal leaves behind.
 */
export function removeMaterialToken(description: string, name: string): string {
  const pattern = new RegExp(escapeRegExp(materialToken(name)), "g");
  return String(description || "")
    .replace(pattern, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n");
}

const PLACEMENTS: Record<MaterialLang, string[]> = {
  zh: [
    "放在左侧主视觉区域，约占画面宽度 40%",
    "放在右上区域，作为辅助图示",
    "放在底部横向区域，作为补充对比",
  ],
  en: [
    "place it in the left primary visual area, about 40% width",
    "place it in the upper-right area as a supporting visual",
    "place it in the bottom horizontal area as supplementary comparison",
  ],
};

/**
 * Makes sure every attached material is both mentioned and placed in the
 * description, appending a sentence for any that is not.
 *
 * A token carried over from the other language keeps its placement wording in
 * that language, which the image model then follows inconsistently; those are
 * stripped so the sentence below replaces them.
 */
export function ensureDescriptionHasMaterialTokens(
  description: string,
  materials: Array<{ name: string; caption?: string }>,
  lang: MaterialLang,
): string {
  const source = String(description || "");
  const placements = PLACEMENTS[lang];
  let working = source;
  const added: string[] = [];

  materials.forEach((material, i) => {
    const token = materialToken(material.name);
    const escaped = escapeRegExp(token);
    const placement = placements[Math.min(i, placements.length - 1)];
    const caption = String(material.caption || "").trim();
    const sentence =
      lang === "zh"
        ? `${token}${placement}${caption ? `，内容重点为：${caption}` : ""}。`
        : `${token} ${placement}${caption ? `, focus: ${caption}` : ""}.`;

    const wrongLanguage =
      lang === "zh"
        ? new RegExp(`${escaped}[^\\n]*\\bplace\\b[^\\n]*`, "gi")
        : new RegExp(`${escaped}[^\\n]*放在[^\\n]*`, "g");
    if (wrongLanguage.test(working)) working = working.replace(wrongLanguage, "");

    const hasToken = working.includes(token);
    const hasPlacement =
      lang === "zh"
        ? new RegExp(`${escaped}[^\\n]*放在`).test(working)
        : new RegExp(`${escaped}[^\\n]*\\bplace\\b`, "i").test(working);
    if (!hasToken || !hasPlacement) added.push(sentence);
  });

  working = working
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (added.length === 0) return working || source;
  return working ? `${working}\n${added.join("\n")}` : added.join("\n");
}

/** At most this many reference images ride along with one slide. */
const MAX_MATERIALS_PER_SLIDE = 3;

/**
 * Attaches the reference images the model asked for, by label, to the slides
 * that asked for them.
 *
 * When the model returns no labels at all, a few assets are spread across the
 * deck instead: the user can then see and adjust real attachments rather than
 * an empty materials list that looks like the upload failed.
 */
export function buildSlideMaterialsFromAutoLabels(
  pages: PptPage[],
  slides: SlideData[],
  assets: ReferenceVisualAsset[],
  lang: MaterialLang,
): { nextSlides: SlideData[]; nextMaterials: Record<string, SlideMaterialImage[]> } {
  const byLabel = new Map(assets.map((a) => [a.label, a]));

  const pageLabels: string[][] = slides.map((_, idx) => {
    const labels = pages[idx]?.materialLabels;
    if (!Array.isArray(labels)) return [];
    return labels
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, MAX_MATERIALS_PER_SLIDE);
  });

  const explicitCount = pageLabels.reduce((sum, arr) => sum + arr.length, 0);
  if (explicitCount === 0 && assets.length > 0 && slides.length > 0) {
    const fallbackCount = Math.min(
      assets.length,
      Math.max(1, Math.min(6, Math.ceil(slides.length / 2))),
    );
    const step = Math.max(1, Math.floor(slides.length / fallbackCount));
    for (let n = 0; n < fallbackCount; n += 1) {
      const slideIndex = Math.min(slides.length - 1, n * step);
      const label = assets[n]?.label;
      if (!label) continue;
      if (!pageLabels[slideIndex].includes(label)) pageLabels[slideIndex].push(label);
    }
  }

  const nextMaterials: Record<string, SlideMaterialImage[]> = {};
  const nextSlides = slides.map((slide, idx) => {
    const matched = pageLabels[idx]
      .slice(0, MAX_MATERIALS_PER_SLIDE)
      .map((label) => byLabel.get(label))
      .filter((a): a is ReferenceVisualAsset => !!a)
      .slice(0, MAX_MATERIALS_PER_SLIDE);
    if (matched.length === 0) return slide;

    const items: SlideMaterialImage[] = matched.map((asset, n) => ({
      id: `auto-mat-${slide.id}-${asset.label}-${n + 1}`,
      name: materialLabel(n + 1, lang),
      fileName: asset.sourceFileName,
      dataUrl: asset.dataUrl,
      refLabel: asset.label,
      caption: asset.caption,
      sourceFileName: asset.sourceFileName,
      sourcePage: asset.sourcePage,
    }));
    nextMaterials[slide.id] = items;

    return {
      ...slide,
      description: ensureDescriptionHasMaterialTokens(
        String(slide.description || ""),
        items.map((m) => ({ name: m.name, caption: m.caption })),
        lang,
      ),
    };
  });

  return { nextSlides, nextMaterials };
}
