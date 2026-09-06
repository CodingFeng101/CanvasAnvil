import type { PptElement, PptTextBlock } from "@/workspaces/ppt/lib/ppt-service";

/** The PPT workspace's own model of a deck, its slides, and their versions. */

export interface SlideData {
  id: string;
  title: string;
  content: string[];
  note?: string;
  layout?: string;
  description?: string; // Add description support
}

export type SlideRenderLayer = {
  backgroundImageUrl: string;
  textBlocks: PptTextBlock[];
  elements: PptElement[];
  status: "pending" | "ready" | "failed";
  error?: string;
};

export type SlideImageVersionType = "generated" | "edited" | "derived_textless";


export type SlideImageVersion = {
  id: string;
  url: string;
  timestamp: number;
  type: SlideImageVersionType;
  instruction?: string;
  sourceVersionId?: string;
};

export interface PptData {
  theme?: string;
  slides: SlideData[];
}

export type CreationStep = 'idle' | 'input' | 'outline' | 'generating_content' | 'generating_images' | 'done';
export type CreationMode = 'idea' | 'outline' | 'beautify' | 'image_transform';

export type ReferenceFile = { id: string; filename: string; content: string; charCount: number };

export type SlideMaterialImage = {
  id: string;
  name: string;
  fileName: string;
  dataUrl: string;
  refLabel?: string;
  caption?: string;
  sourceFileName?: string;
  sourcePage?: number;
};

export type ReferenceVisualAsset = {
  id: string;
  label: string;
  caption: string;
  sourceFileName: string;
  sourcePage?: number;
  dataUrl: string;
  textHint: string;
};

/**
 * A bucket in the template picker. The set is deliberately wider than the
 * presets that exist today: adding a template is then a matter of dropping a
 * file in and naming its categories, with no UI change.
 */
export type TemplateCategory = { id: string; zhName: string; enName: string };

/**
 * A template can sit in more than one bucket -- a frosted-glass deck is both
 * "tech" and "minimal" -- so listing it twice is not a mistake.
 */
export type PresetTemplate = {
  id: string;
  zhName: string;
  enName: string;
  path: string;
  categories: string[];
};
export type UploadTemplate = { id: string; name: string; dataUrl: string };

export type TemplateItem =
  | { id: string; name: string; kind: "preset"; previewSrc: string; presetPath: string; categories: string[] }
  | { id: string; name: string; kind: "upload"; previewSrc: string; dataUrl: string; categories: string[] };
