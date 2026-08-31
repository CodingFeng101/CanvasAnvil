import { PPT_TEMPLATE_HIDDEN_PRESETS_KEY, PPT_TEMPLATE_UPLOADS_KEY } from "@/workspaces/ppt/canvas/lib/constants";
import { deriveTextElementsFromBlocks, hasRenderableTextBlocks } from "@/workspaces/ppt/canvas/lib/slide-content";
import type {
  SlideData,
  SlideImageVersion,
  SlideMaterialImage,
  SlideRenderLayer,
  UploadTemplate,
} from "@/workspaces/ppt/canvas/types";

/**
 * Reading the workspace back from storage.
 *
 * Everything here is defensive: the stored shape has changed across releases,
 * and a single malformed entry must not take the whole deck down. Each
 * normaliser drops what it cannot understand rather than throwing.
 */

export const migrateLegacyTextlessVersions = (rawState: any) => {
  if (!rawState || typeof rawState !== "object") return rawState;

  const imageVersions =
    rawState.imageVersions && typeof rawState.imageVersions === "object" && !Array.isArray(rawState.imageVersions)
      ? { ...rawState.imageVersions }
      : {};
  const renderLayers =
    rawState.renderLayers && typeof rawState.renderLayers === "object" && !Array.isArray(rawState.renderLayers)
      ? { ...rawState.renderLayers }
      : {};
  const currentImageVersionId =
    rawState.currentImageVersionId &&
    typeof rawState.currentImageVersionId === "object" &&
    !Array.isArray(rawState.currentImageVersionId)
      ? { ...rawState.currentImageVersionId }
      : {};

  for (const [slideId, rawVersions] of Object.entries(imageVersions)) {
    if (!Array.isArray(rawVersions)) continue;
    const versions = rawVersions as SlideImageVersion[];
    const layerMap =
      renderLayers[slideId] && typeof renderLayers[slideId] === "object" && !Array.isArray(renderLayers[slideId])
        ? { ...renderLayers[slideId] }
        : {};
    let changed = false;

    for (const version of versions) {
      if (version?.type !== "derived_textless" || !version.sourceVersionId) continue;
      const sourceLayer = layerMap[version.sourceVersionId];
      const derivedLayer = layerMap[version.id];
      if (!hasRenderableTextBlocks(sourceLayer) && hasRenderableTextBlocks(derivedLayer)) {
        layerMap[version.sourceVersionId] = derivedLayer;
        changed = true;
      }
      if (currentImageVersionId[slideId] === version.id) {
        currentImageVersionId[slideId] = version.sourceVersionId;
      }
    }

    const filtered = versions.filter((version) => version?.type !== "derived_textless");
    if (filtered.length !== versions.length) {
      imageVersions[slideId] = filtered;
      changed = true;
    }

    if (changed) {
      renderLayers[slideId] = layerMap;
    }
  }

  return {
    ...rawState,
    imageVersions,
    renderLayers,
    currentImageVersionId,
  };
};

export const readLegacyUploadedTemplates = (): UploadTemplate[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PPT_TEMPLATE_UPLOADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
      .map((x: any) => ({ id: x.id, name: x.name, dataUrl: x.dataUrl }));
  } catch {
    return [];
  }
};

export const readLegacyHiddenPresetTemplateIds = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map((x: any) => String(x)) : [];
  } catch {
    return [];
  }
};

export const readBlobAsDataUrl = async (blob: Blob) =>
  await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });

export const persistImageUrlIfNeeded = async (url: string) => {
  const raw = String(url || "").trim();
  if (!raw || raw.startsWith("data:image")) return raw;
  try {
    const resp = await fetch(raw);
    if (!resp.ok) return raw;
    const blob = await resp.blob();
    const dataUrl = await readBlobAsDataUrl(blob);
    return dataUrl || raw;
  } catch (e) {
    console.error("Failed to persist image url", e);
    return raw;
  }
};

export const shouldInlinePersistImageUrl = (url: string) => {
  const raw = String(url || "").trim();
  return raw.startsWith("blob:") || raw.startsWith("http://") || raw.startsWith("https://");
};

export const normalizePersistedSlides = (value: any): SlideData[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s: any) => s && typeof s.id === "string")
    .map((s: any) => ({
      id: String(s.id),
      title: typeof s.title === "string" ? s.title : "",
      content: Array.isArray(s.content) ? s.content.filter((x: any) => typeof x === "string") : [],
      note: typeof s.note === "string" ? s.note : undefined,
      layout: typeof s.layout === "string" ? s.layout : undefined,
      description: typeof s.description === "string" ? s.description : undefined,
    }));
};

export const normalizePersistedImageMap = (value: any): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k === "string" && typeof val === "string") out[k] = val;
  }
  return out;
};

export const normalizePersistedImageVersions = (value: any): Record<string, SlideImageVersion[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, SlideImageVersion[]> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k !== "string" || !Array.isArray(val)) continue;
    out[k] = val
      .filter((x: any) => x && typeof x.id === "string" && typeof x.url === "string" && typeof x.timestamp === "number" && (x.type === "generated" || x.type === "edited" || x.type === "derived_textless"))
      .map((x: any) => ({
        id: x.id,
        url: x.url,
        timestamp: x.timestamp,
        type: x.type,
        instruction: typeof x.instruction === "string" ? x.instruction : undefined,
        sourceVersionId: typeof x.sourceVersionId === "string" ? x.sourceVersionId : undefined,
      }));
  }
  return out;
};

export const normalizePersistedRenderLayers = (value: any): Record<string, Record<string, SlideRenderLayer>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, SlideRenderLayer>> = {};
  for (const [slideId, versions] of Object.entries(value)) {
    if (typeof slideId !== "string" || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
    const nextVersions: Record<string, SlideRenderLayer> = {};
    for (const [versionId, layer] of Object.entries(versions)) {
      if (typeof versionId !== "string" || !layer || typeof layer !== "object" || Array.isArray(layer)) continue;
      const backgroundImageUrl = typeof (layer as any).backgroundImageUrl === "string" ? (layer as any).backgroundImageUrl : "";
      const textBlocks = Array.isArray((layer as any).textBlocks) ? (layer as any).textBlocks : [];
      const elements = Array.isArray((layer as any).elements) ? (layer as any).elements : deriveTextElementsFromBlocks(textBlocks);
      const status = (layer as any).status === "pending" || (layer as any).status === "failed" ? (layer as any).status : "ready";
      nextVersions[versionId] = {
        backgroundImageUrl,
        textBlocks,
        elements,
        status,
        error: typeof (layer as any).error === "string" ? (layer as any).error : undefined,
      };
    }
    out[slideId] = nextVersions;
  }
  return out;
};

export const normalizePersistedStringMap = (value: any, trim = false): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k !== "string" || typeof val !== "string") continue;
    if (trim && !val.trim()) continue;
    out[k] = val;
  }
  return out;
};

export const filterRecordByAllowedKeys = <T,>(value: Record<string, T>, allowedKeys: Set<string>) => {
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(value)) {
    if (allowedKeys.has(k)) out[k] = val;
  }
  return out;
};

export const normalizePersistedSlideMaterials = (value: any): Record<string, SlideMaterialImage[]> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, SlideMaterialImage[]> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k !== "string" || !Array.isArray(val)) continue;
    out[k] = val
      .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
      .map((x: any) => ({
        id: x.id,
        name: x.name,
        fileName: typeof x.fileName === "string" ? x.fileName : x.name,
        dataUrl: x.dataUrl,
        refLabel: typeof x.refLabel === "string" ? x.refLabel : undefined,
        caption: typeof x.caption === "string" ? x.caption : undefined,
        sourceFileName: typeof x.sourceFileName === "string" ? x.sourceFileName : undefined,
        sourcePage: typeof x.sourcePage === "number" ? x.sourcePage : undefined,
      }));
  }
  return out;
};

export const normalizePersistedUploadedTemplates = (value: any): UploadTemplate[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
    .map((x: any) => ({ id: x.id, name: x.name, dataUrl: x.dataUrl }));
};

export const normalizePersistedStringArray = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => String(item));
};
