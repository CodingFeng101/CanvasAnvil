import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceExtract, ReferenceItem } from "@/shared/references/types";
import { PPT_STATE_KEY, PPT_TEMPLATE_LIBRARY_KEY, pptStore } from "@/workspaces/ppt/storage";
import { PRESET_TEMPLATES } from "@/workspaces/ppt/canvas/lib/constants";
import type { SlideData, SlideImageVersion, SlideMaterialImage, UploadTemplate } from "@/workspaces/ppt/canvas/types";

/**
 * What a PPT work offers to other canvases: the outline (one text), the
 * speaker notes (one text), each slide's picture with its earlier versions,
 * each slide's material pictures, and the template picture. The editable
 * layers (text blocks, elements) stay behind: nothing else uses them.
 */

export type StoredDeck = {
  localSlides?: SlideData[];
  generatedImages?: Record<string, string>;
  imageVersions?: Record<string, SlideImageVersion[]>;
  currentImageVersionId?: Record<string, string>;
  slideMaterials?: Record<string, SlideMaterialImage[]>;
  selectedTemplateId?: string | null;
};

type Lang = "zh" | "en";
const pageLabel = (index: number, title: string | undefined, lang: Lang) => {
  const page = lang === "zh" ? `第 ${index + 1} 页` : `Slide ${index + 1}`;
  return title?.trim() ? `${page} · ${title.trim()}` : page;
};

export function outlineMarkdown(slides: SlideData[], lang: Lang): string {
  return slides
    .map((slide, index) => {
      const head = `## ${pageLabel(index, slide.title, lang)}`;
      const points = (slide.content || []).filter((line) => line?.trim()).map((line) => `- ${line.trim()}`);
      const layout = slide.layout?.trim() ? [`${lang === "zh" ? "版式" : "Layout"}：${slide.layout.trim()}`] : [];
      return [head, ...points, ...layout].join("\n");
    })
    .join("\n\n");
}

export function notesMarkdown(slides: SlideData[], lang: Lang): string {
  return slides
    .map((slide, index) => (slide.note?.trim() ? `## ${pageLabel(index, slide.title, lang)}\n${slide.note.trim()}` : ""))
    .filter(Boolean)
    .join("\n\n");
}

export function pptReferenceItems(deck: StoredDeck | null | undefined, lang: Lang): ReferenceItem[] {
  const slides = deck?.localSlides ?? [];
  const items: ReferenceItem[] = [];
  if (slides.length) {
    items.push({ id: "ppt:outline", kind: "text", label: lang === "zh" ? "大纲" : "Outline", text: outlineMarkdown(slides, lang), defaultOn: true });
    const notes = notesMarkdown(slides, lang);
    if (notes) items.push({ id: "ppt:notes", kind: "text", label: lang === "zh" ? "讲稿" : "Speaker notes", text: notes });
  }
  slides.forEach((slide, index) => {
    const label = pageLabel(index, slide.title, lang);
    const versions = (deck?.imageVersions?.[slide.id] ?? []).filter((version) => version?.url && version.type !== "derived_textless");
    const currentId = deck?.currentImageVersionId?.[slide.id];
    const current = versions.find((version) => version.id === currentId)?.url || deck?.generatedImages?.[slide.id];
    const group = `ppt:slide:${slide.id}`;
    if (current) items.push({ id: `ppt:slide:${slide.id}`, kind: "image", label, group, dataUrl: current, defaultOn: true });
    versions
      .filter((version) => version.url !== current)
      .forEach((version, n) => {
        const name = lang === "zh" ? `${label} · 历史版本 ${n + 1}` : `${label} · earlier version ${n + 1}`;
        items.push({ id: `ppt:version:${slide.id}:${version.id}`, kind: "image", label: name, group, dataUrl: version.url });
      });
    (deck?.slideMaterials?.[slide.id] ?? []).forEach((material) => {
      if (!material?.dataUrl) return;
      const name = material.name || material.fileName || (lang === "zh" ? "素材" : "Material");
      items.push({ id: `ppt:material:${slide.id}:${material.id}`, kind: "image", label: `${label} · ${name}`, group, dataUrl: material.dataUrl });
    });
  });
  return items;
}

async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function templateItem(id: string | null | undefined, lang: Lang): Promise<ReferenceItem | null> {
  if (!id) return null;
  const label = lang === "zh" ? "所选模板" : "Template";
  const preset = PRESET_TEMPLATES.find((template) => template.id === id);
  if (preset) {
    const name = lang === "zh" ? preset.zhName : preset.enName;
    return { id: `ppt:template:${id}`, kind: "image", label: `${label} · ${name}`, thumb: preset.path, resolve: () => urlToDataUrl(preset.path) };
  }
  const library = await pptStore.read<{ uploadedTemplates?: UploadTemplate[] }>(PPT_TEMPLATE_LIBRARY_KEY);
  const upload = library?.uploadedTemplates?.find((template) => template.id === id);
  return upload?.dataUrl ? { id: `ppt:template:${id}`, kind: "image", label: `${label} · ${upload.name}`, dataUrl: upload.dataUrl } : null;
}

export async function extractPptReference(store: WorkspaceStore, lang: Lang): Promise<ReferenceExtract> {
  const deck = await store.read<StoredDeck>(PPT_STATE_KEY);
  const items = pptReferenceItems(deck, lang);
  const template = await templateItem(deck?.selectedTemplateId, lang);
  if (template) items.push(template);
  return { items };
}
