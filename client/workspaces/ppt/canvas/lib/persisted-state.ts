import { PPT_TEMPLATE_HIDDEN_PRESETS_KEY, PPT_TEMPLATE_UPLOADS_KEY } from "@/workspaces/ppt/canvas/lib/constants";
import { deriveTextElementsFromBlocks, hasRenderableTextBlocks } from "@/workspaces/ppt/canvas/lib/slide-content";
import type {
  SlideData,
  SlideImageVersion,
  SlideMaterialImage,
  SlideRenderLayer,
  UploadTemplate,
} from "@/workspaces/ppt/canvas/types";
import type { PptElement, PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

/**
 * Reading the workspace back from storage.
 *
 * Everything here is defensive: the stored shape has changed across releases,
 * and a single malformed entry must not take the whole deck down. Each
 * normaliser drops what it cannot understand rather than throwing.
 */

export const migrateLegacyTextlessVersions = (rawState: unknown): Unknown => {
  if (!isRecord(rawState)) return {};

  const state = rawState as {
    imageVersions?: unknown;
    renderLayers?: unknown;
    currentImageVersionId?: unknown;
  };

  const imageVersions: Unknown =
    state.imageVersions && typeof state.imageVersions === "object" && !Array.isArray(state.imageVersions)
      ? { ...state.imageVersions }
      : {};
  const renderLayers: Unknown =
    state.renderLayers && typeof state.renderLayers === "object" && !Array.isArray(state.renderLayers)
      ? { ...state.renderLayers }
      : {};
  const currentImageVersionId: Unknown =
    state.currentImageVersionId &&
    typeof state.currentImageVersionId === "object" &&
    !Array.isArray(state.currentImageVersionId)
      ? { ...state.currentImageVersionId }
      : {};

  for (const [slideId, rawVersions] of Object.entries(imageVersions)) {
    if (!Array.isArray(rawVersions)) continue;
    const versions = rawVersions as SlideImageVersion[];
    const storedLayers = renderLayers[slideId];
    const layerMap: Unknown = isRecord(storedLayers) ? { ...storedLayers } : {};
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

export const normalizePersistedSlides = (value: unknown): SlideData[] => {
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

export const normalizePersistedImageMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k === "string" && typeof val === "string") out[k] = val;
  }
  return out;
};

export const normalizePersistedImageVersions = (value: unknown): Record<string, SlideImageVersion[]> => {
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

/** A record whose fields still have to be checked one by one. */
type Unknown = Record<string, unknown>;

const isRecord = (value: unknown): value is Unknown =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const TEXT_BLOCK_ROLES = ["title", "bullet", "summary", "tag"];
const ELEMENT_TYPES = ["text", "image", "shape", "table", "chart", "formula", "video", "audio"];

/**
 * A block the review canvas can actually place, repaired where it can be.
 *
 * Geometry is the part that cannot be guessed: the canvas positions a block
 * from x/y/w/h, so one missing number puts an unreachable box somewhere off
 * the slide and nothing downstream looks again. An id or a role can be filled
 * in the same way the extractor fills them, which keeps layers stored before
 * either was guaranteed.
 */
const toTextBlock = (value: unknown, index: number): PptTextBlock | null => {
  if (!isRecord(value)) return null;
  if (typeof value.text !== "string") return null;
  if (![value.x, value.y, value.w, value.h].every(isFiniteNumber)) return null;

  const role = TEXT_BLOCK_ROLES.includes(String(value.role))
    ? (value.role as PptTextBlock["role"])
    : "bullet";
  const id =
    typeof value.id === "string" && value.id.trim() ? value.id.trim() : `text-block-${index + 1}`;

  return {
    ...(value as unknown as PptTextBlock),
    id,
    role,
    text: value.text,
    x: value.x as number,
    y: value.y as number,
    w: value.w as number,
    h: value.h as number,
  };
};

/** The same geometry check for the shapes the exporter draws. */
const isElement = (value: unknown): value is PptElement =>
  isRecord(value) &&
  typeof value.id === "string" &&
  ELEMENT_TYPES.includes(String(value.type)) &&
  [value.x, value.y, value.w, value.h].every(isFiniteNumber);

export const normalizePersistedRenderLayers = (value: unknown): Record<string, Record<string, SlideRenderLayer>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, SlideRenderLayer>> = {};
  for (const [slideId, versions] of Object.entries(value)) {
    if (typeof slideId !== "string" || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
    const nextVersions: Record<string, SlideRenderLayer> = {};
    for (const [versionId, layer] of Object.entries(versions)) {
      if (typeof versionId !== "string" || !isRecord(layer)) continue;
      const backgroundImageUrl = typeof layer.backgroundImageUrl === "string" ? layer.backgroundImageUrl : "";
      const textBlocks = asArray(layer.textBlocks)
        .map(toTextBlock)
        .filter((block): block is PptTextBlock => !!block);
      const storedElements = asArray(layer.elements);
      // Elements come back only if every one of them survives: a partial
      // set would render fewer shapes than the layer says it has.
      const elements =
        storedElements.length > 0 && storedElements.every(isElement)
          ? (storedElements as PptElement[])
          : deriveTextElementsFromBlocks(textBlocks);
      const status = layer.status === "pending" || layer.status === "failed" ? layer.status : "ready";
      nextVersions[versionId] = {
        backgroundImageUrl,
        textBlocks,
        elements,
        status,
        error: typeof layer.error === "string" ? layer.error : undefined,
      };
    }
    out[slideId] = nextVersions;
  }
  return out;
};

export const normalizePersistedStringMap = (value: unknown, trim = false): Record<string, string> => {
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

export const normalizePersistedSlideMaterials = (value: unknown): Record<string, SlideMaterialImage[]> => {
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

export const normalizePersistedUploadedTemplates = (value: unknown): UploadTemplate[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
    .map((x: any) => ({ id: x.id, name: x.name, dataUrl: x.dataUrl }));
};

export const normalizePersistedStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => String(item));
};
