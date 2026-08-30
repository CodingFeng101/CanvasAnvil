import type { PptElement, PptTextBlock } from "@/lib/ppt-service";

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

export type EditableExtractionStatus = "idle" | "extracting" | "done" | "failed";

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

export type PresetTemplate = { id: string; zhName: string; enName: string; path: string };
export type UploadTemplate = { id: string; name: string; dataUrl: string };

export type TemplateItem =
  | { id: string; name: string; kind: "preset"; previewSrc: string; presetPath: string }
  | { id: string; name: string; kind: "upload"; previewSrc: string; dataUrl: string };

export type ReviewDraftRect = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type ReviewResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
