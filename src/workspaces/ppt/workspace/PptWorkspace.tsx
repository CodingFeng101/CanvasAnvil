import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion } from "framer-motion";
import { generateImage, generateChatMessage } from '@/lib/ai-client';
import { pptService, PptPage, type PptTextBlock, type SlideEditRoutingItem, estimateTextBlockFontSize, PPT_REFERENCE_SLIDE_HEIGHT, PPT_REFERENCE_SLIDE_WIDTH } from '@/lib/ppt-service';
import { getTemplateGenerationPrompt } from '@/lib/ppt-prompts';
import { clearPersistedPptWorkspaceState, readPersistedPptWorkspaceState, savePersistedPptWorkspaceState } from '@/lib/ppt-persistence';
import { Loader2, Plus, Image as ImageIcon, MessageSquarePlus, Upload, Presentation, Sparkles, Check, Play, FileText, Download, Lightbulb, X, ArrowLeft, ArrowRight, Eye, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/workspaces/ppt/ui/context-menu";
import { Button } from "@/workspaces/ppt/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/workspaces/ppt/ui/dialog";
import { Textarea } from "@/workspaces/ppt/ui/textarea";
import { useUiLanguage } from "@/lib/use-ui-language";
import { useFileProcessor as useFlowFileProcessor } from "@/workspaces/flow/next/lib/use-file-processor";

interface SlideData {
  id: string;
  title: string;
  content: string[];
  note?: string;
  layout?: string;
  description?: string; // Add description support
}

type SlideRenderLayer = {
  backgroundImageUrl: string;
  textBlocks: PptTextBlock[];
  status: "pending" | "ready" | "failed";
  error?: string;
};

type SlideImageVersionType = "generated" | "edited" | "derived_textless";

type SlideImageVersion = {
  id: string;
  url: string;
  timestamp: number;
  type: SlideImageVersionType;
  instruction?: string;
  sourceVersionId?: string;
};

const hasRenderableTextBlocks = (layer?: SlideRenderLayer) =>
  Array.isArray(layer?.textBlocks) && layer.textBlocks.length > 0;

const migrateLegacyTextlessVersions = (rawState: any) => {
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

const stripLeadingBullet = (value: string) =>
  value.replace(/^[•●▪◦·]\s*/, "").trim();

const textToLines = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

interface PptData {
  theme?: string;
  slides: SlideData[];
}

const localizeLayoutHint = (layout: string, lang: "zh" | "en") => {
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

const parseSlideNo = (value: string): number | null => {
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

const normalizeLocalizedSlideTitle = (
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

interface PptWorkspaceProps {
  data?: PptData;
  onAddToChat?: (json: string, name: string) => void;
  onPptReadyChange?: (ready: boolean) => void;
  onPptStageChange?: (stage: "start" | "outline" | "slides") => void;
  onCreationModeChange?: (mode: "idea" | "outline" | "beautify" | "image_transform") => void;
  incomingEdit?: { id: string; payload: string } | null;
  onIncomingEditHandled?: (id: string) => void;
  onResetWorkspace?: () => void;
}

type TextBlockOverlayProps = {
  block: PptTextBlock;
  slideId: string;
  editable: boolean;
  uiLang: "zh" | "en";
  canvasWidth: number;
  canvasHeight: number;
  isDragging: boolean;
  isEditing: boolean;
  onFocusBlock: (blockId: string) => void;
  onBlurBlock: (blockId: string, nextText: string) => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>, block: PptTextBlock, slideId: string) => void;
  tr: (zh: string, en: string) => string;
};

const PPT_POINT_TO_CSS_PX = 96 / 72;

function TextBlockOverlay({
  block,
  slideId,
  editable,
  uiLang,
  canvasWidth,
  canvasHeight,
  isDragging,
  isEditing,
  onFocusBlock,
  onBlurBlock,
  onDragStart,
  tr,
}: TextBlockOverlayProps) {
  const style = block.style || {};
  const rawFontSize = Number(style.fontSize || 0);
  const isSingleLine = !String(block.text || "").includes("\n");
  const isTitle = block.role === "title";
  const isTag =
    block.role === "tag" ||
    (block.role === "summary" && block.text.trim().length <= 12 && block.w <= 0.2 && block.h <= 0.09);
  const isPanelHeading =
    !isTitle &&
    !isTag &&
    isSingleLine &&
    block.text.trim().length <= 22 &&
    block.h <= 0.13 &&
    (rawFontSize >= 16 || Number(style.fontWeight || 0) >= 620 || block.role === "bullet");
  const scale = Math.max(0.45, Math.min(1.8, Math.min(canvasWidth / 1100, canvasHeight / 619)));
  const basePaddingX = Math.max(2, Math.round((isTitle ? 12 : isTag ? 9 : 10) * scale));
  const basePaddingY = Math.max(1, Math.round((isTitle ? 8 : isTag ? 4 : 6) * scale));
  const dragHandleSize = Math.max(14, Math.round(20 * scale));
  const dragHandleOffset = Math.max(2, Math.round(4 * scale));
  const paddingLeft = basePaddingX;
  const paddingRight = basePaddingX;
  const paddingTop = basePaddingY;
  const paddingBottom = basePaddingY;
  const lineHeightRatio = Number(style.lineHeight || (isTitle ? 1.12 : isTag ? 1.04 : 1.35));
  const slideScale = Math.min(canvasWidth / PPT_REFERENCE_SLIDE_WIDTH, canvasHeight / PPT_REFERENCE_SLIDE_HEIGHT);
  const referenceFontSize = Math.max(
    10,
    estimateTextBlockFontSize(block, PPT_REFERENCE_SLIDE_WIDTH, PPT_REFERENCE_SLIDE_HEIGHT)
  );
  const estimatedFontSize = Math.max(10, referenceFontSize * slideScale);
  const [resolvedFontSize, setResolvedFontSize] = useState(estimatedFontSize);
  const outerRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const baseColor = style.color || (isTitle ? "#ffffff" : isTag || isPanelHeading ? "#ffd66b" : "#ffffff");
  const gradientFrom = style.gradientFrom || (isTitle ? "#ffffff" : undefined);
  const gradientTo = style.gradientTo || (isTitle ? "#22d3ee" : undefined);
  const hasGradient = Boolean(gradientFrom && gradientTo && isTitle);
  const relaxedVerticalFit = isTitle || isPanelHeading || isTag;
  const outerBackground = isTag
    ? "linear-gradient(180deg, rgba(26,89,160,0.55) 0%, rgba(32,159,230,0.24) 100%)"
    : "transparent";
  const outerBorder = isTag ? "1px solid rgba(116,217,255,0.55)" : "none";
  const outerRadius = isTag ? `${Math.max(12, Math.round(18 * scale))}px` : "0px";
  const outerShadow = isTag ? "0 0 0 1px rgba(255,255,255,0.08) inset, 0 8px 18px rgba(15,23,42,0.18)" : "none";
  const effectiveFontWeight = Number(
    style.fontWeight || (isTitle ? 900 : isTag || isPanelHeading ? 800 : 500)
  );
  const effectiveFontFamily = style.fontFamily || (uiLang === "zh" ? "Microsoft YaHei" : "Aptos");
  const effectiveTextShadow = isTitle
    ? "0 2px 10px rgba(15,23,42,0.55), 0 0 16px rgba(34,211,238,0.22)"
    : isTag || isPanelHeading
      ? "0 1px 6px rgba(15,23,42,0.45), 0 0 10px rgba(250,204,21,0.18)"
      : "0 1px 4px rgba(15,23,42,0.18)";
  const effectiveStroke = style.strokeColor
    ? `${Number(style.strokeWidth || Math.max(0.6, 1.1 * scale))}px ${style.strokeColor}`
    : isTitle
      ? `${Math.max(0.7, 1.25 * scale)}px rgba(8,15,36,0.42)`
      : isPanelHeading
        ? `${Math.max(0.45, 0.8 * scale)}px rgba(8,15,36,0.28)`
      : "0px transparent";

  useEffect(() => {
    setResolvedFontSize(estimatedFontSize);
  }, [estimatedFontSize, block.id, block.text]);

  useEffect(() => {
    if (!editable || !isEditing) return;
    const el = textRef.current;
    if (!el) return;
    el.focus();
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editable, isEditing]);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const text = textRef.current;
    if (!outer || !text) return;

    const minSize = Math.max(5, Math.round(estimatedFontSize * 0.72), Math.round(6 * scale));
    const availableWidth = Math.max(8, outer.clientWidth - paddingLeft - paddingRight);
    const targetWidth = availableWidth * (isTitle ? 0.99 : isTag ? 0.97 : 0.985);

    const apply = (fontSize: number) => {
      text.style.fontSize = `${fontSize}px`;
      text.style.lineHeight = String(lineHeightRatio);
      text.style.wordBreak = "break-word";
      text.style.overflowWrap = "anywhere";
    };

    let size = estimatedFontSize;
    apply(size);
    for (let i = 0; i < 24 && text.scrollWidth > targetWidth + 1 && size > minSize; i += 1) {
      size = Math.max(minSize, size - 0.5);
      apply(size);
    }
    apply(size);

    if (Math.abs(size - resolvedFontSize) > 0.25) {
      setResolvedFontSize(size);
    }
  }, [
    block.id,
    block.text,
    block.x,
    block.y,
    block.w,
    block.h,
    canvasWidth,
    canvasHeight,
    estimatedFontSize,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
    lineHeightRatio,
    resolvedFontSize,
    scale,
    block.text,
    isTitle,
    isTag,
    isPanelHeading,
    relaxedVerticalFit,
  ]);

  return (
    <div
      ref={outerRef}
      className={relaxedVerticalFit ? "absolute overflow-visible" : "absolute overflow-hidden"}
      style={{
        left: `${block.x * 100}%`,
        top: `${block.y * 100}%`,
        width: `${block.w * 100}%`,
        height: `${block.h * 100}%`,
        padding: `${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px`,
        boxSizing: "border-box",
        pointerEvents: editable ? "auto" : "none",
        color: baseColor,
        fontFamily: effectiveFontFamily,
        fontWeight: effectiveFontWeight,
        fontStyle: style.fontStyle || "normal",
        letterSpacing: `${style.letterSpacing || 0}px`,
        textAlign: style.align || "left",
        textShadow: effectiveTextShadow,
        background: outerBackground,
        border: outerBorder,
        borderRadius: outerRadius,
        boxShadow: outerShadow,
        cursor: editable ? "text" : "default",
        outline: editable && isDragging ? "2px solid rgba(59,130,246,0.45)" : "none",
      }}
    >
      {editable ? (
        <button
          type="button"
          className="absolute z-20 rounded bg-black/55 text-white leading-none shadow-sm cursor-grab active:cursor-grabbing"
          title={tr("拖动文本框", "Drag text block")}
          style={{
            right: `${-Math.round(dragHandleSize * 0.45)}px`,
            top: `${-Math.round(dragHandleSize * 0.3)}px`,
            width: `${dragHandleSize}px`,
            height: `${dragHandleSize}px`,
            fontSize: `${Math.max(8, Math.round(10 * scale))}px`,
          }}
          onPointerDown={(event) => onDragStart(event, block, slideId)}
        >
          +
        </button>
      ) : null}
      <div
        ref={textRef}
        contentEditable={editable && isEditing}
        suppressContentEditableWarning
        spellCheck={false}
        className={relaxedVerticalFit
          ? "h-full w-full whitespace-pre-wrap break-words bg-transparent outline-none overflow-visible"
          : "h-full w-full whitespace-pre-wrap break-words bg-transparent outline-none overflow-hidden"}
        onClick={() => {
          if (editable && !isEditing) onFocusBlock(block.id);
        }}
        onFocus={() => {
          if (editable && isEditing) onFocusBlock(block.id);
        }}
        onBlur={(event) => {
          if (!editable || !isEditing) return;
          const nextText = textToLines(event.currentTarget.textContent || "").join("\n");
          onBlurBlock(block.id, nextText);
        }}
        style={{
          fontSize: `${resolvedFontSize}px`,
          lineHeight: String(lineHeightRatio),
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          color: hasGradient ? "transparent" : baseColor,
          fontWeight: effectiveFontWeight,
          textShadow: effectiveTextShadow,
          backgroundImage: hasGradient ? `linear-gradient(90deg, ${gradientFrom}, ${gradientTo})` : undefined,
          backgroundClip: hasGradient ? "text" : undefined,
          WebkitBackgroundClip: hasGradient ? "text" : undefined,
          WebkitTextFillColor: hasGradient ? "transparent" : undefined,
          WebkitTextStroke: effectiveStroke,
          outline: editable && isEditing ? "2px solid rgba(59,130,246,0.35)" : "none",
        }}
      >
        {block.text}
      </div>
    </div>
  );
}

type CreationStep = 'idle' | 'input' | 'outline' | 'generating_content' | 'generating_images' | 'done';
type CreationMode = 'idea' | 'outline' | 'beautify' | 'image_transform';
type ReferenceFile = { id: string; filename: string; content: string; charCount: number };
type SlideMaterialImage = {
  id: string;
  name: string;
  fileName: string;
  dataUrl: string;
  refLabel?: string;
  caption?: string;
  sourceFileName?: string;
  sourcePage?: number;
};
type ReferenceVisualAsset = {
  id: string;
  label: string;
  caption: string;
  sourceFileName: string;
  sourcePage?: number;
  dataUrl: string;
  textHint: string;
};

type PresetTemplate = { id: string; zhName: string; enName: string; path: string };
type UploadTemplate = { id: string; name: string; dataUrl: string };
type TemplateItem =
  | { id: string; name: string; kind: "preset"; previewSrc: string; presetPath: string }
  | { id: string; name: string; kind: "upload"; previewSrc: string; dataUrl: string };

const PPT_TEMPLATE_UPLOADS_KEY = "ppt_template_uploads_v1";
const PPT_TEMPLATE_HIDDEN_PRESETS_KEY = "ppt_template_hidden_presets_v1";
const PPT_WORKSPACE_STORAGE_KEY = "CanvasAnvil-ppt-state-v1";

const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "preset-tech-business", zhName: "科技商务", enName: "Tech Business", path: "/templates/template_b.png" },
  { id: "preset-academic", zhName: "学术汇报", enName: "Academic", path: "/templates/template_academic.jpg" },
  { id: "preset-minimal", zhName: "极简主义", enName: "Minimal", path: "/templates/template_s.png" },
  { id: "preset-vector", zhName: "矢量插画", enName: "Vector Illustration", path: "/templates/template_vector_illustration.png" },
  { id: "preset-yellow", zhName: "活力黄", enName: "Vibrant Yellow", path: "/templates/template_y.png" },
  { id: "preset-glass", zhName: "磨砂玻璃", enName: "Frosted Glass", path: "/templates/template_glass.png" },
];

const MODEL_CONCURRENCY = 5;
const BEAUTIFY_CONCURRENCY = 5;
const BEAUTIFY_RETRY_MAX_ATTEMPTS = 3;
const BEAUTIFY_RETRY_BASE_DELAY_MS = 1200;

const readBlobAsDataUrl = async (blob: Blob) =>
  await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });

const persistImageUrlIfNeeded = async (url: string) => {
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

const shouldInlinePersistImageUrl = (url: string) => {
  const raw = String(url || "").trim();
  return raw.startsWith("blob:") || raw.startsWith("http://") || raw.startsWith("https://");
};

const normalizePersistedSlides = (value: any): SlideData[] => {
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

const normalizePersistedImageMap = (value: any): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k === "string" && typeof val === "string") out[k] = val;
  }
  return out;
};

const normalizePersistedImageVersions = (value: any): Record<string, SlideImageVersion[]> => {
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

const normalizePersistedRenderLayers = (value: any): Record<string, Record<string, SlideRenderLayer>> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Record<string, SlideRenderLayer>> = {};
  for (const [slideId, versions] of Object.entries(value)) {
    if (typeof slideId !== "string" || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
    const nextVersions: Record<string, SlideRenderLayer> = {};
    for (const [versionId, layer] of Object.entries(versions)) {
      if (typeof versionId !== "string" || !layer || typeof layer !== "object" || Array.isArray(layer)) continue;
      const backgroundImageUrl = typeof (layer as any).backgroundImageUrl === "string" ? (layer as any).backgroundImageUrl : "";
      const textBlocks = Array.isArray((layer as any).textBlocks) ? (layer as any).textBlocks : [];
      const status = (layer as any).status === "pending" || (layer as any).status === "failed" ? (layer as any).status : "ready";
      nextVersions[versionId] = {
        backgroundImageUrl,
        textBlocks,
        status,
        error: typeof (layer as any).error === "string" ? (layer as any).error : undefined,
      };
    }
    out[slideId] = nextVersions;
  }
  return out;
};

const normalizePersistedStringMap = (value: any, trim = false): Record<string, string> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(value)) {
    if (typeof k !== "string" || typeof val !== "string") continue;
    if (trim && !val.trim()) continue;
    out[k] = val;
  }
  return out;
};

const filterRecordByAllowedKeys = <T,>(value: Record<string, T>, allowedKeys: Set<string>) => {
  const out: Record<string, T> = {};
  for (const [k, val] of Object.entries(value)) {
    if (allowedKeys.has(k)) out[k] = val;
  }
  return out;
};

const normalizePersistedSlideMaterials = (value: any): Record<string, SlideMaterialImage[]> => {
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

export function PptWorkspace({ data, onAddToChat, onPptReadyChange, onPptStageChange, onCreationModeChange, incomingEdit, onIncomingEditHandled, onResetWorkspace }: PptWorkspaceProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  const initialPptStateRef = useRef<any>(undefined);
  if (typeof initialPptStateRef.current === "undefined") {
    initialPptStateRef.current = (() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(PPT_WORKSPACE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== "object") return null;
        return migrateLegacyTextlessVersions(parsed as any);
      } catch {
        return null;
      }
    })();
  }
  const initialPptState = initialPptStateRef.current;

  // If data is provided by AI, use it. Otherwise maintain local state for demo.
  const [localSlides, setLocalSlides] = useState<SlideData[]>(() => {
    const v = initialPptState?.localSlides;
    if (!Array.isArray(v)) return [];
    return v
      .filter((s: any) => s && typeof s.id === "string")
      .map((s: any) => ({
        id: String(s.id),
        title: typeof s.title === "string" ? s.title : "",
        content: Array.isArray(s.content) ? s.content.filter((x: any) => typeof x === "string") : [],
        note: typeof s.note === "string" ? s.note : undefined,
        layout: typeof s.layout === "string" ? s.layout : undefined,
        description: typeof s.description === "string" ? s.description : undefined,
      }));
  });
  const [currentSlideIndex, setCurrentSlideIndex] = useState(() => {
    const v = initialPptState?.currentSlideIndex;
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  });
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    const v = initialPptState?.selectedTemplateId;
    return typeof v === "string" ? v : null;
  });
  const [uploadedTemplates, setUploadedTemplates] = useState<UploadTemplate[]>(() => {
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
  });
  const [templateGeneratorOpen, setTemplateGeneratorOpen] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [templateGeneratorRequirement, setTemplateGeneratorRequirement] = useState("");
  const [templateGeneratorIsGenerating, setTemplateGeneratorIsGenerating] = useState(false);
  const [hiddenPresetTemplateIds, setHiddenPresetTemplateIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((x: any) => String(x)) : [];
    } catch {
      return [];
    }
  });
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>(() => {
    const v = initialPptState?.generatedImages;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string") out[k] = val;
    }
    return out;
  });
  const [imageVersions, setImageVersions] = useState<Record<string, SlideImageVersion[]>>(() => {
    const v = initialPptState?.imageVersions;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, SlideImageVersion[]> = {};
    for (const [k, val] of Object.entries(v)) {
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
  });
  const [currentImageVersionId, setCurrentImageVersionId] = useState<Record<string, string>>(() => {
    const v = initialPptState?.currentImageVersionId;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string") out[k] = val;
    }
    return out;
  });
  const [renderLayers, setRenderLayers] = useState<Record<string, Record<string, SlideRenderLayer>>>(() => {
    const v = initialPptState?.renderLayers;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, Record<string, SlideRenderLayer>> = {};
    for (const [slideId, versions] of Object.entries(v)) {
      if (typeof slideId !== "string" || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
      const nextVersions: Record<string, SlideRenderLayer> = {};
      for (const [versionId, layer] of Object.entries(versions)) {
        if (typeof versionId !== "string" || !layer || typeof layer !== "object" || Array.isArray(layer)) continue;
        const backgroundImageUrl = typeof (layer as any).backgroundImageUrl === "string" ? (layer as any).backgroundImageUrl : "";
        const textBlocks = Array.isArray((layer as any).textBlocks) ? (layer as any).textBlocks : [];
        const status = (layer as any).status === "pending" || (layer as any).status === "failed" ? (layer as any).status : "ready";
        nextVersions[versionId] = {
          backgroundImageUrl,
          textBlocks,
          status,
          error: typeof (layer as any).error === "string" ? (layer as any).error : undefined,
        };
      }
      out[slideId] = nextVersions;
    }
    return out;
  });
  const [editingTextBlockId, setEditingTextBlockId] = useState<string | null>(null);
  const [draggingTextBlockId, setDraggingTextBlockId] = useState<string | null>(null);
  const [resizingTextBlockId, setResizingTextBlockId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isExporting, setIsExporting] = useState<null | "pptx" | "pdf">(null);
  
  // Creation Wizard State
  const [creationStep, setCreationStep] = useState<CreationStep>(() => {
    const v = initialPptState?.creationStep;
    if (v === "idle" || v === "input" || v === "outline" || v === "done") return v;
    return localSlides.length > 0 ? "done" : "idle";
  });
  useEffect(() => {
    if (creationStep === "done") {
      onPptStageChange?.("slides");
      return;
    }
    if (creationStep === "outline") {
      onPptStageChange?.("outline");
      return;
    }
    onPptStageChange?.("start");
  }, [creationStep, onPptStageChange]);
  const [creationMode, setCreationMode] = useState<CreationMode>(() => {
    const v = initialPptState?.creationMode;
    return v === "idea" || v === "outline" || v === "beautify" || v === "image_transform" ? v : "idea";
  });
  useEffect(() => {
    onCreationModeChange?.(creationMode);
  }, [creationMode, onCreationModeChange]);
  const [ideaInput, setIdeaInput] = useState(() => (typeof initialPptState?.ideaInput === "string" ? initialPptState.ideaInput : ""));
  const [outlineInput, setOutlineInput] = useState(() => (typeof initialPptState?.outlineInput === "string" ? initialPptState.outlineInput : ""));
  const [beautifyRequirement, setBeautifyRequirement] = useState(() => (typeof initialPptState?.beautifyRequirement === "string" ? initialPptState.beautifyRequirement : ""));
  const [beautifyUseTemplate, setBeautifyUseTemplate] = useState(() => Boolean(initialPptState?.beautifyUseTemplate));
  const [beautifyFile, setBeautifyFile] = useState<File | null>(null);
  const [imageTransformFile, setImageTransformFile] = useState<File | null>(null);
  const [beautifyFailures, setBeautifyFailures] = useState<Record<string, string>>(() => {
    const v = initialPptState?.beautifyFailures;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string" && val.trim()) out[k] = val;
    }
    return out;
  });
  const [imageTransformFailures, setImageTransformFailures] = useState<Record<string, string>>(() => {
    const v = initialPptState?.imageTransformFailures;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string" && val.trim()) out[k] = val;
    }
    return out;
  });
  const {
    files: referenceUploadFiles,
    pdfData: referencePdfData,
    visualAssets: referenceVisualAssetsRaw,
    handleFileChange: handleReferenceFileChange,
    setFiles: setReferenceUploadFiles
  } = useFlowFileProcessor("ppt");
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false);
  const [referencePreviewFile, setReferencePreviewFile] = useState<ReferenceFile | null>(null);
  const [slideMaterials, setSlideMaterials] = useState<Record<string, SlideMaterialImage[]>>(() => {
    const v = initialPptState?.slideMaterials;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, SlideMaterialImage[]> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k !== "string" || !Array.isArray(val)) continue;
      out[k] = val
        .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
        .map((x: any) => ({
          id: x.id,
          name: x.name,
          fileName: typeof x.fileName === "string" ? x.fileName : x.name,
          dataUrl: x.dataUrl,
        }));
    }
    return out;
  });
  const [materialPickerSlideId, setMaterialPickerSlideId] = useState<string | null>(null);
  const [materialPickerPos, setMaterialPickerPos] = useState<{ left: number; top: number } | null>(null);
  const [materialPickerActiveIndex, setMaterialPickerActiveIndex] = useState(0);
  const materialPickerReplaceRangeRef = useRef<Range | null>(null);
  const materialPickerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const beautifyFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageTransformFileInputRef = useRef<HTMLInputElement | null>(null);
  const slideMaterialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const descriptionTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const descriptionEditorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const descriptionEditorAppliedRef = useRef<Record<string, string>>({});
  const descriptionEditorFocusedRef = useRef<string | null>(null);
  const assetCaptionCacheRef = useRef<Record<string, string>>({});
  const derivedProcessingRef = useRef<Set<string>>(new Set());
  const pptImagePersistenceRunningRef = useRef(false);
  const pptImagePersistenceRetryRef = useRef(false);
  const [isPersistenceHydrated, setIsPersistenceHydrated] = useState(false);
  const latestWorkspaceUpdatedAtRef = useRef(
    typeof initialPptState?.updatedAt === "number" ? initialPptState.updatedAt : 0
  );
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const textBlockDragRef = useRef<null | {
    slideId: string;
    versionId: string;
    blockId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    blockW: number;
    blockH: number;
    canvasWidth: number;
    canvasHeight: number;
  }>(null);
  const textBlockResizeRef = useRef<null | {
    slideId: string;
    versionId: string;
    blockId: string;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
    startX: number;
    startY: number;
    canvasWidth: number;
    canvasHeight: number;
  }>(null);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const slideshowRootRef = useRef<HTMLDivElement | null>(null);
  const [materialPreview, setMaterialPreview] = useState<{ open: boolean; slideTitle: string; item: SlideMaterialImage | null }>({
    open: false,
    slideTitle: "",
    item: null
  });
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
  const [previewCanvasSize, setPreviewCanvasSize] = useState({ width: 1100, height: 619 });
  const isParsingReferenceFiles = Array.from(referencePdfData.values()).some((x) => x.isExtracting);
  const referenceFiles: ReferenceFile[] = referenceUploadFiles
    .map((file) => {
      const meta = referencePdfData.get(file);
      if (!meta || meta.isExtracting || !meta.text) return null;
      return {
        id: `ref-${file.name}-${file.lastModified}-${file.size}`,
        filename: file.name,
        content: String(meta.text || "").slice(0, 150000),
        charCount: meta.charCount || 0,
      } as ReferenceFile;
    })
    .filter((x): x is ReferenceFile => !!x);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await readPersistedPptWorkspaceState<any>();
        if (cancelled || !raw || typeof raw !== "object") return;
        const persistedState = migrateLegacyTextlessVersions(raw);
        const snapshotState =
          initialPptStateRef.current && typeof initialPptStateRef.current === "object"
            ? initialPptStateRef.current
            : null;
        const snapshotUpdatedAt =
          typeof snapshotState?.updatedAt === "number" ? snapshotState.updatedAt : 0;
        const persistedUpdatedAt =
          typeof persistedState?.updatedAt === "number" ? persistedState.updatedAt : 0;
        const coreState =
          snapshotState && snapshotUpdatedAt > persistedUpdatedAt ? snapshotState : persistedState;

        const nextSlides = normalizePersistedSlides(coreState?.localSlides);
        const allowedSlideIds = new Set(nextSlides.map((slide) => slide.id));
        const nextGeneratedImages = {
          ...filterRecordByAllowedKeys(
            normalizePersistedImageMap(coreState?.generatedImages),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedImageMap(persistedState?.generatedImages),
            allowedSlideIds,
          ),
        };
        const nextImageVersions = {
          ...filterRecordByAllowedKeys(
            normalizePersistedImageVersions(coreState?.imageVersions),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedImageVersions(persistedState?.imageVersions),
            allowedSlideIds,
          ),
        };
        const nextRenderLayers = {
          ...filterRecordByAllowedKeys(
            normalizePersistedRenderLayers(coreState?.renderLayers),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedRenderLayers(persistedState?.renderLayers),
            allowedSlideIds,
          ),
        };
        const nextSlideMaterials = {
          ...filterRecordByAllowedKeys(
            normalizePersistedSlideMaterials(coreState?.slideMaterials),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedSlideMaterials(persistedState?.slideMaterials),
            allowedSlideIds,
          ),
        };
        setLocalSlides(nextSlides);
        setCurrentSlideIndex(
          typeof coreState?.currentSlideIndex === "number" && Number.isFinite(coreState.currentSlideIndex)
            ? Math.max(0, Math.floor(coreState.currentSlideIndex))
            : 0,
        );
        setSelectedTemplateId(
          typeof coreState?.selectedTemplateId === "string" ? coreState.selectedTemplateId : null,
        );
        setGeneratedImages(nextGeneratedImages);
        setImageVersions(nextImageVersions);
        setCurrentImageVersionId(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.currentImageVersionId),
            allowedSlideIds,
          ),
        );
        setRenderLayers(nextRenderLayers);
        setCreationStep(
          coreState?.creationStep === "idle" ||
            coreState?.creationStep === "input" ||
            coreState?.creationStep === "outline" ||
            coreState?.creationStep === "done"
            ? coreState.creationStep
            : nextSlides.length > 0
              ? "done"
              : "idle",
        );
        setCreationMode(
          coreState?.creationMode === "idea" ||
            coreState?.creationMode === "outline" ||
            coreState?.creationMode === "beautify" ||
            coreState?.creationMode === "image_transform"
            ? coreState.creationMode
            : "idea",
        );
        setIdeaInput(typeof coreState?.ideaInput === "string" ? coreState.ideaInput : "");
        setOutlineInput(typeof coreState?.outlineInput === "string" ? coreState.outlineInput : "");
        setBeautifyRequirement(
          typeof coreState?.beautifyRequirement === "string" ? coreState.beautifyRequirement : "",
        );
        setBeautifyUseTemplate(Boolean(coreState?.beautifyUseTemplate));
        setBeautifyFailures(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.beautifyFailures, true),
            allowedSlideIds,
          ),
        );
        setImageTransformFailures(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.imageTransformFailures, true),
            allowedSlideIds,
          ),
        );
        setSlideMaterials(nextSlideMaterials);
        latestWorkspaceUpdatedAtRef.current = Math.max(snapshotUpdatedAt, persistedUpdatedAt);
      } catch (e) {
        console.error("Failed to load persisted PPT workspace from IndexedDB", e);
      } finally {
        if (!cancelled) setIsPersistenceHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const templates: TemplateItem[] = [
    ...PRESET_TEMPLATES
      .filter((t) => !hiddenPresetTemplateIds.includes(t.id))
      .map((t) => ({ id: t.id, name: uiLang === "zh" ? t.zhName : t.enName, kind: "preset" as const, previewSrc: t.path, presetPath: t.path })),
    ...uploadedTemplates.map((t) => ({ id: t.id, name: t.name, kind: "upload" as const, previewSrc: t.dataUrl, dataUrl: t.dataUrl })),
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_TEMPLATE_UPLOADS_KEY, JSON.stringify(uploadedTemplates));
    } catch (e) {
      console.error("Failed to persist uploaded PPT templates", e);
    }
  }, [uploadedTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY, JSON.stringify(hiddenPresetTemplateIds));
    } catch {
    }
  }, [hiddenPresetTemplateIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPersistenceHydrated) return;
    const updatedAt = Date.now();
    latestWorkspaceUpdatedAtRef.current = updatedAt;
    const workspaceState = {
      localSlides,
      currentSlideIndex,
      selectedTemplateId,
      generatedImages,
      imageVersions,
      currentImageVersionId,
      renderLayers,
      creationStep,
      creationMode,
      ideaInput,
      outlineInput,
      slideMaterials,
      beautifyRequirement,
      beautifyUseTemplate,
      beautifyFailures,
      imageTransformFailures,
      updatedAt,
    };
    try {
      localStorage.setItem(
        PPT_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          localSlides,
          currentSlideIndex,
          selectedTemplateId,
          generatedImages: {},
          imageVersions: {},
          currentImageVersionId,
          renderLayers: {},
          creationStep,
          creationMode,
          ideaInput,
          outlineInput,
          slideMaterials: {},
          beautifyRequirement,
          beautifyUseTemplate,
          beautifyFailures,
          imageTransformFailures,
          updatedAt,
        })
      );
    } catch (e) {
      console.error("Failed to persist PPT workspace snapshot to localStorage", e);
    }
    void savePersistedPptWorkspaceState(workspaceState).catch((e) => {
      console.error("Failed to persist PPT workspace to IndexedDB", e);
    });
  }, [
    localSlides,
    currentSlideIndex,
    selectedTemplateId,
    generatedImages,
    imageVersions,
    currentImageVersionId,
    renderLayers,
    creationStep,
    creationMode,
    ideaInput,
    outlineInput,
    slideMaterials,
    beautifyRequirement,
    beautifyUseTemplate,
    beautifyFailures,
    imageTransformFailures,
    isPersistenceHydrated,
  ]);

  useEffect(() => {
    if (pptImagePersistenceRunningRef.current) {
      pptImagePersistenceRetryRef.current = true;
      return;
    }

    const pendingGenerated = Object.values(generatedImages).some(shouldInlinePersistImageUrl);
    const pendingVersions = Object.values(imageVersions).some((versions) =>
      Array.isArray(versions) && versions.some((item) => shouldInlinePersistImageUrl(item?.url || ""))
    );
    const pendingLayers = Object.values(renderLayers).some((versions) =>
      versions &&
      typeof versions === "object" &&
      Object.values(versions).some((layer) => shouldInlinePersistImageUrl(layer?.backgroundImageUrl || ""))
    );
    if (!pendingGenerated && !pendingVersions && !pendingLayers) return;

    let cancelled = false;
    pptImagePersistenceRunningRef.current = true;
    pptImagePersistenceRetryRef.current = false;

    void (async () => {
      try {
        const cache = new Map<string, string>();
        const resolveUrl = async (url: string) => {
          const raw = String(url || "").trim();
          if (!shouldInlinePersistImageUrl(raw)) return raw;
          if (cache.has(raw)) return cache.get(raw) || raw;
          const persisted = await persistImageUrlIfNeeded(raw);
          cache.set(raw, persisted);
          return persisted;
        };

        let generatedChanged = false;
        const nextGenerated: Record<string, string> = {};
        for (const [slideId, url] of Object.entries(generatedImages)) {
          const persisted = await resolveUrl(url);
          nextGenerated[slideId] = persisted;
          if (persisted !== url) generatedChanged = true;
        }

        let versionsChanged = false;
        const nextVersions: Record<string, SlideImageVersion[]> = {};
        for (const [slideId, versions] of Object.entries(imageVersions)) {
          const next = await Promise.all(
            (versions || []).map(async (item) => {
              const persisted = await resolveUrl(item.url);
              if (persisted !== item.url) versionsChanged = true;
              return persisted === item.url ? item : { ...item, url: persisted };
            })
          );
          nextVersions[slideId] = next;
        }

        let layersChanged = false;
        const nextLayers: Record<string, Record<string, SlideRenderLayer>> = {};
        for (const [slideId, versions] of Object.entries(renderLayers)) {
          const nextVersionMap: Record<string, SlideRenderLayer> = {};
          for (const [versionId, layer] of Object.entries(versions || {})) {
            const currentUrl = String(layer?.backgroundImageUrl || "");
            const persisted = await resolveUrl(currentUrl);
            if (persisted !== currentUrl) layersChanged = true;
            nextVersionMap[versionId] =
              persisted === currentUrl
                ? layer
                : { ...layer, backgroundImageUrl: persisted };
          }
          nextLayers[slideId] = nextVersionMap;
        }

        if (cancelled) return;
        if (generatedChanged) setGeneratedImages(nextGenerated);
        if (versionsChanged) setImageVersions(nextVersions);
        if (layersChanged) setRenderLayers(nextLayers);
      } finally {
        pptImagePersistenceRunningRef.current = false;
        if (!cancelled && pptImagePersistenceRetryRef.current) {
          pptImagePersistenceRetryRef.current = false;
          setGeneratedImages((prev) => ({ ...prev }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generatedImages, imageVersions, renderLayers]);

  useEffect(() => {
    onPptReadyChange?.(localSlides.length > 0);
  }, [localSlides.length]);

  useEffect(() => {
      if (typeof window === "undefined") return;
      const handleResize = () => {
          setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const target = previewCanvasRef.current;
    if (!target) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setPreviewCanvasSize({ width, height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [currentSlideIndex, imageVersions, currentImageVersionId, generatedImages, creationStep]);

  const getSlideshowDimensions = () => {
      if (!windowDimensions.width) return { width: '90vw', height: '50.625vw' }; // Fallback
      const maxWidth = windowDimensions.width * 0.9;
      const maxHeight = windowDimensions.height * 0.85;
      
      let w = maxWidth;
      let h = w * 9 / 16;
      
      if (h > maxHeight) {
          h = maxHeight;
          w = h * 16 / 9;
      }
      return { width: w, height: h };
  };

  const setTemplateFromItem = async (item: TemplateItem) => {
    setSelectedTemplateId(item.id);
    if (item.kind === "upload") {
      setTemplateImage(item.dataUrl);
      return;
    }
    try {
      const response = await fetch(item.presetPath);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateImage(reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error("Failed to load template", e);
    }
  };

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(null);
      setTemplateImage(null);
      return;
    }
    const selected = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;
    if (!selected) {
      void setTemplateFromItem(templates[0]);
      return;
    }
    if (!templateImage) {
      void setTemplateFromItem(selected);
      return;
    }
    if (selected.kind === "upload" && templateImage !== selected.dataUrl) {
      setTemplateImage(selected.dataUrl);
    }
  }, [selectedTemplateId, templateImage, hiddenPresetTemplateIds.join("|"), uploadedTemplates.map((t) => t.id).join("|")]);

  const addUploadedTemplates = async (files: File[]) => {
    const imageFiles = Array.from(files || []).filter((f) => f && f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const toDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const baseName = (name: string) => String(name || "").replace(/\.[^.]+$/, "") || tr("模板", "Template");

    const created: UploadTemplate[] = [];
    for (const f of imageFiles) {
      try {
        const dataUrl = await toDataUrl(f);
        const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const name = baseName(f.name);
        created.push({ id, name, dataUrl });
      } catch (e) {
        console.error("Failed to read template image", e);
      }
    }
    if (created.length === 0) return;
    setUploadedTemplates((prev) => [...prev, ...created]);
    const last = created[created.length - 1];
    setSelectedTemplateId(last.id);
    setTemplateImage(last.dataUrl);
  };

  const handleTemplateUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await addUploadedTemplates(files);
  };

  const toDataUrlIfNeeded = async (url: string) => {
    const dataUrl = await persistImageUrlIfNeeded(url);
    return dataUrl.startsWith("data:image") ? dataUrl : "";
  };

  const addGeneratedTemplate = async (imageUrl: string) => {
    const dataUrl = await toDataUrlIfNeeded(imageUrl);
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      throw new Error(tr("生成模板持久化失败：无法读取图片数据", "Failed to persist generated template: cannot read image data"));
    }
    const id = `generated-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = `${tr("AI 模板", "AI Template")}-${Date.now()}`;
    const created: UploadTemplate = { id, name, dataUrl };
    setUploadedTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateImage(created.dataUrl);
  };

  const handleGenerateTemplate = async () => {
    const requirement = templateGeneratorRequirement.trim();
    if (!requirement) {
      alert(tr("请输入模板需求。", "Please enter template requirements."));
      return;
    }
    setTemplateGeneratorIsGenerating(true);
    try {
      const prompt = getTemplateGenerationPrompt({ requirements: requirement, language: uiLang });
      const imageUrl = await generateImage({ prompt });
      if (!imageUrl) {
        alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
        return;
      }
      await addGeneratedTemplate(imageUrl);
      setTemplateGeneratorRequirement("");
      setTemplateGeneratorOpen(false);
    } catch (e: any) {
      console.error("Template generation failed", e);
      alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
    } finally {
      setTemplateGeneratorIsGenerating(false);
    }
  };

  const deleteTemplate = (item: TemplateItem) => {
    if (item.kind === "preset") {
      setHiddenPresetTemplateIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      return;
    }
    setUploadedTemplates((prev) => prev.filter((t) => t.id !== item.id));
  };

  const [isApplyingEdits, setIsApplyingEdits] = useState(false);

  const setSlidesKeepingSelection = (nextSlides: SlideData[]) => {
    const currentId = localSlides[currentSlideIndex]?.id;
    setLocalSlides(nextSlides);
    if (!Array.isArray(nextSlides) || nextSlides.length === 0) {
      setCurrentSlideIndex(0);
      return;
    }
    if (currentId) {
      const nextIdx = nextSlides.findIndex((s) => s.id === currentId);
      if (nextIdx >= 0) {
        setCurrentSlideIndex(nextIdx);
        return;
      }
    }
    setCurrentSlideIndex((prev) => {
      const safePrev = Number.isFinite(prev) ? Math.max(0, Math.floor(prev)) : 0;
      return Math.min(safePrev, nextSlides.length - 1);
    });
  };

  useEffect(() => {
    if (data && data.slides && data.slides.length > 0) {
      setSlidesKeepingSelection(data.slides);
      setCreationStep('done');
      onPptReadyChange?.(true);
    }
  }, [data]);

  const applyIncomingSlideEdits = async (payload: string) => {
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const toolTypeRaw = String(parsed?.type || "").trim().toLowerCase();
    if (toolTypeRaw && toolTypeRaw !== "ppt_edit") return;

    const incomingSlidesRaw: any[] = Array.isArray(parsed?.slides)
      ? parsed.slides
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (incomingSlidesRaw.length === 0) return;

    const uploadedImages: string[] = Array.isArray(parsed?.uploadedImages)
      ? Array.from(new Set((parsed.uploadedImages as any[]).map((x: any) => String(x || "").trim()).filter(Boolean))).slice(0, 2)
      : [];
    const existingById = new Map(localSlides.map((s) => [s.id, s] as const));
    const getCurrentSlideImageUrlById = (slideId: string) => {
      const versions = imageVersions[slideId] || [];
      const currentVersion = currentImageVersionId[slideId];
      const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[slideId];
      return String(currentUrl || "").trim();
    };

    const existing = localSlides.length > 0 ? [...localSlides] : [];
    const resolveIncomingSlideId = (inc: any): string => {
      const rawId = String(inc?.id || "").trim();
      if (rawId && existing.some((s) => s.id === rawId)) return rawId;
      const fromIdNo = parseSlideNo(rawId);
      if (fromIdNo && existing[fromIdNo - 1]) return existing[fromIdNo - 1].id;
      const titleNo = parseSlideNo(String(inc?.title || "").trim());
      if (titleNo && existing[titleNo - 1]) return existing[titleNo - 1].id;
      return rawId;
    };

    const incomingSlides: any[] = incomingSlidesRaw
      .map((inc) => {
        const resolvedId = resolveIncomingSlideId(inc);
        if (!resolvedId) return null;
        return { ...inc, id: resolvedId };
      })
      .filter(Boolean);

    if (incomingSlides.length === 0) return;

    const toSlideData = (inc: any, fallbackId: string, source?: SlideData): SlideData => ({
      id: fallbackId,
      title: typeof inc?.title === "string"
        ? normalizeLocalizedSlideTitle(inc.title, uiLang as "zh" | "en", parseSlideNo(fallbackId))
        : (source?.title || tr("幻灯片", "Slide")),
      content: Array.isArray(inc?.content) ? inc.content.map((x: any) => String(x)) : (source?.content || []),
      description: typeof inc?.description === "string" ? inc.description : source?.description,
      note: typeof inc?.note === "string" ? inc.note : source?.note,
      layout: typeof inc?.layout === "string" ? localizeLayoutHint(inc.layout, uiLang as "zh" | "en") : source?.layout,
    });

    let mergedSlides: SlideData[] = localSlides.slice();
    let mergedIncomingSlides = incomingSlides.slice();
    mergedSlides = (() => {
      const byId = new Map(existing.map((s) => [s.id, s] as const));
      const order: string[] = existing.map((s) => s.id);

      for (const inc of incomingSlides) {
        const id = String(inc?.id || "");
        if (!id) continue;
        if (creationStep === "done" && !byId.has(id)) {
          // In slide-edit stage, unknown ids should not append new pages.
          continue;
        }
        const next: SlideData = toSlideData(inc, id, byId.get(id));
        byId.set(id, next);
        if (!order.includes(id)) order.push(id);
      }

      return order.map((id) => byId.get(id)!).filter(Boolean);
    })();
    mergedIncomingSlides = incomingSlides;
    setSlidesKeepingSelection(mergedSlides);

    const allowImageEdits = creationStep === "done";
    if (!allowImageEdits) return;

    const routedEditTasks: Array<() => Promise<void>> = [];
    for (const inc of mergedIncomingSlides) {
      const id = String(inc?.id || "");
      if (!id) continue;
      const slide = mergedSlides.find((s) => s.id === id);
      if (!slide) continue;

      const incomingImageUrl = typeof inc?.imageUrl === "string" ? inc.imageUrl : "";
      const instruction = typeof inc?.imageEditInstruction === "string"
        ? inc.imageEditInstruction
        : typeof inc?.instruction === "string"
          ? inc.instruction
          : "";
      const before = existingById.get(id);
      const changedByPatch =
        !!before &&
        (
          before.title !== slide.title ||
          before.description !== slide.description ||
          before.layout !== slide.layout ||
          before.note !== slide.note ||
          JSON.stringify(before.content || []) !== JSON.stringify(slide.content || [])
        );
      const isNewSlide = !before;
      const editType = normalizeSlideEditType(inc, before, slide);
      const styleRefSlideIds = Array.isArray(inc?.styleRefSlideIds)
        ? inc.styleRefSlideIds.map((x: any) => String(x || "").trim()).filter((x: string) => !!x && x !== id)
        : [];
      const styleRefPolicy: "style_only" | "style_and_layout" =
        inc?.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only";
      const explicitStyleRefImageUrls = Array.isArray(inc?.styleRefImageUrls)
        ? inc.styleRefImageUrls.map((x: any) => String(x || "").trim()).filter((x: string) => !!x)
        : [];
      const explicitMaterialImageUrls = Array.isArray(inc?.materialImageUrls)
        ? inc.materialImageUrls.map((x: any) => String(x || "").trim()).filter((x: string) => !!x)
        : [];
      const styleRefRefsFromSlides = styleRefSlideIds
        .map((sid: string) => {
          const url = getCurrentSlideImageUrlById(sid);
          if (!url) return null;
          const safeSid = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
          return { url, label: `STYLE_REF_SLIDE_${safeSid}`, source: sid };
        })
        .filter(Boolean) as Array<{ url: string; label: string; source: string }>;
      const explicitStyleRefRefs = explicitStyleRefImageUrls.map((url: string, idx: number) => ({
        url,
        label: `STYLE_REF_EXTERNAL_${idx + 1}`,
        source: `external-${idx + 1}`,
      }));
      const styleRefRefs = Array.from(
        new Map([...styleRefRefsFromSlides, ...explicitStyleRefRefs].map((x) => [x.url, x] as const)).values()
      );
      const styleRefImageUrls = styleRefRefs.map((x) => x.url);
      const styleRefMappingText = styleRefRefs.length > 0
        ? styleRefRefs.map((x, i) => `${i + 1}. ${x.label} => ${x.source}`).join("\n")
        : "";
      /*
      const styleReferenceInstruction = styleRefImageUrls.length > 0
        ? (
            styleRefPolicy === "style_and_layout"
              ? tr(
                  `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n可参考其视觉风格与版式结构，但禁止复用其文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                )
              : tr(
                  `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n仅参考其视觉风格（配色、质感、氛围），不要复制其版式与文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                )
          )
        : "";
      */
      const styleReferenceInstruction = styleRefImageUrls.length > 0
        ? (
            styleRefPolicy === "style_and_layout"
              ? tr(
                  `参考映射如下（标签 => 来源）:\n${styleRefMappingText}\n可参考其风格和版式，但不要复制其中的文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                )
              : tr(
                  `参考映射如下（标签 => 来源）:\n${styleRefMappingText}\n仅参考风格，不要复制其版式和文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                )
          )
        : "";
      const page: PptPage = {
        id,
        title: slide.title,
        content: slide.content || [],
        description: slide.description,
        note: slide.note,
        layout: slide.layout,
      };

      if (incomingImageUrl.trim()) {
        routedEditTasks.push(async () => {
          const persistedIncomingImageUrl = await persistImageUrlIfNeeded(incomingImageUrl);
          const versionId = pushImageVersion(
            id,
            persistedIncomingImageUrl,
            "edited",
            instruction.trim() ? instruction : undefined,
          );
          await processRenderedSlideVersion(slide, persistedIncomingImageUrl, versionId);
        });
        continue;
      }

      if (editType === "text_only" || editType === "text_relayout") {
        routedEditTasks.push(async () => {
          const currentVersionMeta = getSlideVersionMeta(id);
          const currentLayer = currentVersionMeta.versionId ? renderLayers[id]?.[currentVersionMeta.versionId] : undefined;
          if (!isNewSlide && currentVersionMeta.versionId && currentLayer?.textBlocks?.length) {
            await applySlideTextLayerEdit(slide, currentVersionMeta.versionId, editType);
            return;
          }
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...getSlideMaterialImageRefs(id),
            ],
            [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", instruction.trim() || undefined);
          }
        });
        continue;
      }

      routedEditTasks.push(async () => {
        const versions = imageVersions[id] || [];
        const currentVersion = currentImageVersionId[id];
        const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[id];
        const shouldRegenerate = isNewSlide || !currentUrl || changedByPatch;
        if (shouldRegenerate) {
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...getSlideMaterialImageRefs(id),
            ],
            [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", instruction.trim() || undefined);
          }
          return;
        }
        const editedUrl = await pptService.editPageImage(
          page,
          [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([
            ...styleRefImageUrls,
            ...explicitMaterialImageUrls,
            ...uploadedImages,
            ...getSlideMaterialImageUrls(id),
          ]))
        );
        if (editedUrl) {
          await pushImageVersionAndProcess(slide, editedUrl, "edited", instruction.trim() || undefined);
        }
      });
    }

    if (routedEditTasks.length > 0) {
      setIsApplyingEdits(true);
      try {
        await runInParallel(routedEditTasks, MODEL_CONCURRENCY);
      } catch (e) {
        console.error("Failed to apply image edits", e);
      } finally {
        setIsApplyingEdits(false);
      }
      return;
    }

    const editTasks: Array<() => Promise<void>> = [];
    for (const inc of mergedIncomingSlides) {
      const id = String(inc?.id || "");
      if (!id) continue;
      const incomingImageUrl = typeof inc?.imageUrl === "string" ? inc.imageUrl : "";
      const kind = inc?.kind === "content" || inc?.kind === "visual" || inc?.kind === "both" ? inc.kind : null;
      const instruction = typeof inc?.imageEditInstruction === "string"
        ? inc.imageEditInstruction
        : typeof inc?.instruction === "string"
          ? inc.instruction
          : "";
      const styleRefSlideIds = Array.isArray(inc?.styleRefSlideIds)
        ? inc.styleRefSlideIds
            .map((x: any) => String(x || "").trim())
            .filter((x: string) => !!x && x !== id)
        : [];
      const styleRefPolicy: "style_only" | "style_and_layout" =
        inc?.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only";
      const explicitStyleRefImageUrls = Array.isArray(inc?.styleRefImageUrls)
        ? inc.styleRefImageUrls
            .map((x: any) => String(x || "").trim())
            .filter((x: string) => !!x)
        : [];
      const styleRefRefsFromSlides = styleRefSlideIds
        .map((sid: string) => {
          const url = getCurrentSlideImageUrlById(sid);
          if (!url) return null;
          const safeSid = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
          return {
            url,
            label: `STYLE_REF_SLIDE_${safeSid}`,
            source: sid,
          };
        })
        .filter(Boolean) as Array<{ url: string; label: string; source: string }>;
      const explicitStyleRefRefs = explicitStyleRefImageUrls.map((url: string, idx: number) => ({
        url,
        label: `STYLE_REF_EXTERNAL_${idx + 1}`,
        source: `external-${idx + 1}`,
      }));
      const styleRefRefs = Array.from(
        new Map(
          [...styleRefRefsFromSlides, ...explicitStyleRefRefs].map((x) => [x.url, x] as const)
        ).values()
      );
      const styleRefImageUrls = styleRefRefs.map((x) => x.url);
      const styleRefMappingText = styleRefRefs.length > 0
        ? styleRefRefs.map((x, i) => `${i + 1}. ${x.label} => ${x.source}`).join("\n")
        : "";

      const slide = mergedSlides.find((s) => s.id === id);
      if (!slide) continue;

      if (incomingImageUrl.trim()) {
        editTasks.push(async () => {
          const persistedIncomingImageUrl = await persistImageUrlIfNeeded(incomingImageUrl);
          const versionId = pushImageVersion(
            id,
            persistedIncomingImageUrl,
            "edited",
            instruction.trim() ? instruction : undefined,
          );
          await processRenderedSlideVersion(slide, persistedIncomingImageUrl, versionId);
        });
        continue;
      }

      const before = existingById.get(id);
      const changedByPatch =
        !!before &&
        (
          before.title !== slide.title ||
          before.description !== slide.description ||
          before.layout !== slide.layout ||
          before.note !== slide.note ||
          JSON.stringify(before.content || []) !== JSON.stringify(slide.content || [])
        );
      const isNewSlide = !before;

      if (kind === "content" || kind === "both" || (!kind && (changedByPatch || isNewSlide))) {
        editTasks.push(async () => {
          const page: PptPage = {
            id,
            title: slide.title,
            content: slide.content || [],
            description: slide.description,
            note: slide.note,
            layout: slide.layout,
          };
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...getSlideMaterialImageRefs(id),
            ],
            [
              kind === "both" && instruction.trim() ? instruction : "",
              styleRefImageUrls.length > 0
                ? (
                    styleRefPolicy === "style_and_layout"
                      ? tr(
                          `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n可参考其视觉风格与版式结构，但禁止复用其文字内容。`,
                          `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                        )
                      : tr(
                          `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n仅参考其视觉风格（配色、质感、氛围），不要复制其版式与文字内容。`,
                          `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                        )
                  )
                : "",
            ].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", kind === "both" ? instruction : undefined);
          }
        });
        if (kind === "content" || kind === "both") continue;
      }

      if (!instruction.trim()) continue;
      editTasks.push(async () => {
        const versions = imageVersions[id] || [];
        const currentVersion = currentImageVersionId[id];
        const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[id];
        if (!currentUrl) return;

        const page: PptPage = {
          id,
          title: slide.title,
          content: slide.content || [],
          description: slide.description
        };
        const editedUrl = await pptService.editPageImage(
          page,
          [
            instruction,
            styleRefImageUrls.length > 0
              ? (
                  styleRefPolicy === "style_and_layout"
                    ? tr(
                        `附加参考图中，前 ${styleRefImageUrls.length} 张为风格参考图，顺序与映射如下（序号. 标签 => 来源）：\n${styleRefMappingText}\n可参考风格和版式，不可复用文字。`,
                        `In additional reference images, the first ${styleRefImageUrls.length} are style references. Mapping (index. label => source):\n${styleRefMappingText}\nYou may follow style and layout, but do not copy text.`
                      )
                    : tr(
                        `附加参考图中，前 ${styleRefImageUrls.length} 张为风格参考图，顺序与映射如下（序号. 标签 => 来源）：\n${styleRefMappingText}\n仅参考风格，不可复用版式与文字。`,
                        `In additional reference images, the first ${styleRefImageUrls.length} are style references. Mapping (index. label => source):\n${styleRefMappingText}\nStyle only, do not copy layout/text.`
                      )
                )
              : "",
          ].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([...styleRefImageUrls, ...uploadedImages, ...getSlideMaterialImageUrls(id)]))
        );
        if (editedUrl) {
          await pushImageVersionAndProcess(slide, editedUrl, "edited", instruction);
        }
      });
    }

    if (editTasks.length > 0) {
      setIsApplyingEdits(true);
      try {
        await runInParallel(editTasks, MODEL_CONCURRENCY);
      } catch (e) {
        console.error("Failed to apply image edits", e);
      } finally {
        setIsApplyingEdits(false);
      }
    }
  };

  useEffect(() => {
      if (!incomingEdit?.payload) return;
      const id = incomingEdit.id;
      Promise.resolve(applyIncomingSlideEdits(incomingEdit.payload))
        .catch((e) => {
          console.error("Failed to apply incoming slide edits", e);
        })
        .finally(() => {
          if (id) onIncomingEditHandled?.(id);
        });
  }, [incomingEdit?.id]);

  const getSlideVersionMeta = (slideId: string) => {
      const versions = imageVersions[slideId] || [];
      const visibleVersions = versions.filter((version) => {
        const layer = renderLayers[slideId]?.[version.id];
        return hasRenderableTextBlocks(layer) || (creationMode === "image_transform" && layer?.status === "ready");
      });
      const requestedVersionId = currentImageVersionId[slideId] || "";
      const resolvedVersionId =
        (requestedVersionId && visibleVersions.some((item) => item.id === requestedVersionId)
          ? requestedVersionId
          : visibleVersions[visibleVersions.length - 1]?.id) ||
        requestedVersionId ||
        versions[versions.length - 1]?.id ||
        "";
      const version = resolvedVersionId ? versions.find((x) => x.id === resolvedVersionId) : undefined;
      return {
        versionId: resolvedVersionId,
        version,
        imageUrl: version?.url || generatedImages[slideId] || "",
      };
  };
  const getVisibleSlideVersions = (slideId: string) => {
    const versions = imageVersions[slideId] || [];
    const visible = versions.filter((version) => {
      const layer = renderLayers[slideId]?.[version.id];
      return hasRenderableTextBlocks(layer) || (creationMode === "image_transform" && layer?.status === "ready");
    });
    return visible;
  };
  const getSlideImageUrl = (slideId: string) => getSlideVersionMeta(slideId).imageUrl;
  const getOriginalSlideVersion = (slideId: string) => {
    const versions = imageVersions[slideId] || [];
    return versions.find((version) => !version.sourceVersionId) || versions[0];
  };
  const getSlideRenderLayer = (slideId: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return undefined;
    return renderLayers[slideId]?.[versionId];
  };
  const getSlideBackgroundUrl = (slideId: string) => {
    const layer = getSlideRenderLayer(slideId);
    return layer?.backgroundImageUrl || getSlideImageUrl(slideId) || "";
  };

  const normalizeSlideEditType = (
    incoming: any,
    before?: SlideData,
    after?: SlideData
  ): SlideEditRoutingItem["editType"] => {
    if (incoming?.editType === "text_only" || incoming?.editType === "text_relayout" || incoming?.editType === "background_redraw") {
      return incoming.editType;
    }
    const hasImageUrl = typeof incoming?.imageUrl === "string" && incoming.imageUrl.trim().length > 0;
    const hasImageEditInstruction =
      typeof incoming?.imageEditInstruction === "string" && incoming.imageEditInstruction.trim().length > 0;
    const hasInstruction = typeof incoming?.instruction === "string" && incoming.instruction.trim().length > 0;
    const hasMaterialImages =
      Array.isArray(incoming?.materialImageUrls) &&
      incoming.materialImageUrls.some((x: any) => String(x || "").trim().length > 0);
    const hasStyleRefImages =
      Array.isArray(incoming?.styleRefImageUrls) &&
      incoming.styleRefImageUrls.some((x: any) => String(x || "").trim().length > 0);
    const hasStyleRefSlides =
      Array.isArray(incoming?.styleRefSlideIds) &&
      incoming.styleRefSlideIds.some((x: any) => String(x || "").trim().length > 0);
    const styleNeedsLayout =
      (incoming?.styleRefPolicy === "style_and_layout" && (hasStyleRefImages || hasStyleRefSlides));
    const legacyKind = incoming?.kind === "content" || incoming?.kind === "visual" || incoming?.kind === "both" ? incoming.kind : null;
    if (legacyKind === "visual" || legacyKind === "both") return "background_redraw";
    if (legacyKind === "content") return "text_relayout";
    if (hasImageUrl || hasImageEditInstruction || hasMaterialImages || styleNeedsLayout) return "background_redraw";
    const layoutChanged = !!before && !!after && before.layout !== after.layout;
    if (layoutChanged) return "background_redraw";
    if (!before) return hasInstruction ? "text_relayout" : "text_only";
    const textChanged =
      !!after &&
      (
        before.title !== after.title ||
        before.description !== after.description ||
        before.note !== after.note ||
        JSON.stringify(before.content || []) !== JSON.stringify(after.content || [])
      );
    if (textChanged || hasInstruction || hasStyleRefImages || hasStyleRefSlides) return "text_relayout";
    return "text_only";
  };

  const updateSlideRenderLayerBlocks = (slideId: string, versionId: string, textBlocks: PptTextBlock[]) => {
    setRenderLayers((prev) => {
      const layer = prev[slideId]?.[versionId];
      if (!layer) return prev;
      return {
        ...prev,
        [slideId]: {
          ...(prev[slideId] || {}),
          [versionId]: {
            ...layer,
            textBlocks,
          },
        },
      };
    });
  };

  const createRenderLayerSnapshotVersion = (
    slideId: string,
    sourceVersionId: string,
    nextLayer: SlideRenderLayer,
    instruction: string,
  ) => {
    const versions = imageVersions[slideId] || [];
    const sourceVersion = versions.find((item) => item.id === sourceVersionId);
    if (!sourceVersion) return sourceVersionId;
    const nextVersionType: SlideImageVersionType = "edited";
    const nextVersionId = pushImageVersion(
      slideId,
      sourceVersion.url,
      nextVersionType,
      instruction,
      {
        sourceVersionId: sourceVersion.sourceVersionId || sourceVersionId,
      }
    );
    setRenderLayerState(slideId, nextVersionId, nextLayer);
    return nextVersionId;
  };

  const applySlideTextLayerEdit = async (
    slide: SlideData,
    versionId: string,
    editType: "text_only" | "text_relayout",
  ) => {
    const layer = renderLayers[slide.id]?.[versionId];
    if (!layer || !Array.isArray(layer.textBlocks) || layer.textBlocks.length === 0) return;
    const nextBlocks = await pptService.rewriteSlideTextBlocks(
      {
        id: slide.id,
        title: slide.title,
        content: slide.content || [],
        description: slide.description,
        note: slide.note,
        layout: slide.layout,
      },
      layer.textBlocks,
      editType,
      uiLang as "zh" | "en",
    );
    if (!Array.isArray(nextBlocks) || nextBlocks.length === 0) return;
    createRenderLayerSnapshotVersion(
      slide.id,
      versionId,
      {
        ...layer,
        textBlocks: nextBlocks,
      },
      tr("文字层调整", "Text layer update"),
    );
  };

  const updateSlideTextBlock = (slideId: string, blockId: string, nextText: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return;
    const currentLayer = renderLayers[slideId]?.[versionId];
    const nextBlocks = (currentLayer?.textBlocks || []).map((block) =>
      block.id === blockId ? { ...block, text: nextText } : block
    );
    setRenderLayers((prev) => {
      const layer = prev[slideId]?.[versionId];
      if (!layer) return prev;
      return {
        ...prev,
        [slideId]: {
          ...(prev[slideId] || {}),
          [versionId]: {
            ...layer,
            textBlocks: nextBlocks,
          },
        },
      };
    });
    setLocalSlides((prev) =>
      prev.map((slide) => {
        if (slide.id !== slideId) return slide;
        const titleBlock = nextBlocks.find((block) => block.role === "title");
        const bulletBlocks = nextBlocks.filter((block) => block.role === "bullet");
        const summaryBlocks = nextBlocks.filter((block) => block.role === "summary");
        return {
          ...slide,
          title: titleBlock ? titleBlock.text.trim() : slide.title,
          content: bulletBlocks.length > 0 ? bulletBlocks.map((block) => stripLeadingBullet(block.text)).filter(Boolean) : slide.content,
          description: summaryBlocks.length > 0 ? summaryBlocks.map((block) => block.text.trim()).filter(Boolean).join("\n") : slide.description,
        };
      })
    );
  };

  const updateSlideTextBlockPosition = (slideId: string, blockId: string, nextX: number, nextY: number, targetVersionId?: string) => {
    const { versionId: currentVersionId } = getSlideVersionMeta(slideId);
    const versionId = targetVersionId || currentVersionId;
    if (!versionId) return;
    setRenderLayers((prev) => {
      const layer = prev[slideId]?.[versionId];
      if (!layer) return prev;
      return {
        ...prev,
        [slideId]: {
          ...(prev[slideId] || {}),
          [versionId]: {
            ...layer,
            textBlocks: layer.textBlocks.map((block) =>
              block.id === blockId
                ? {
                    ...block,
                    x: Math.max(0, Math.min(1 - block.w, nextX)),
                    y: Math.max(0, Math.min(1 - block.h, nextY)),
                  }
                : block
            ),
          },
        },
      };
    });
  };

  const updateSlideTextBlockSize = (
    slideId: string,
    blockId: string,
    nextW: number,
    nextH: number,
    targetVersionId?: string,
  ) => {
    const { versionId: currentVersionId } = getSlideVersionMeta(slideId);
    const versionId = targetVersionId || currentVersionId;
    if (!versionId) return;
    setRenderLayers((prev) => {
      const layer = prev[slideId]?.[versionId];
      if (!layer) return prev;
      return {
        ...prev,
        [slideId]: {
          ...(prev[slideId] || {}),
          [versionId]: {
            ...layer,
            textBlocks: layer.textBlocks.map((block) => {
              if (block.id !== blockId) return block;
              const minW = Math.max(0.05, block.role === "title" ? 0.18 : block.role === "tag" ? 0.07 : 0.1);
              const minH = Math.max(0.04, block.role === "title" ? 0.08 : block.role === "tag" ? 0.045 : 0.06);
              return {
                ...block,
                w: Math.max(minW, Math.min(1 - block.x, nextW)),
                h: Math.max(minH, Math.min(1 - block.y, nextH)),
              };
            }),
          },
        },
      };
    });
  };

  const beginTextBlockDrag = (slideId: string, sourceVersionId: string) => {
    return sourceVersionId;
  };

  const beginTextBlockResize = (slideId: string, sourceVersionId: string) => {
    return sourceVersionId;
  };

  useEffect(() => {
    if (!draggingTextBlockId && !resizingTextBlockId) return;
    const handlePointerMove = (event: PointerEvent) => {
      const drag = textBlockDragRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startClientX) / Math.max(drag.canvasWidth, 1);
        const dy = (event.clientY - drag.startClientY) / Math.max(drag.canvasHeight, 1);
        updateSlideTextBlockPosition(
          drag.slideId,
          drag.blockId,
          drag.startX + dx,
          drag.startY + dy,
          drag.versionId,
        );
      }
      const resize = textBlockResizeRef.current;
      if (resize) {
        const dw = (event.clientX - resize.startClientX) / Math.max(resize.canvasWidth, 1);
        const dh = (event.clientY - resize.startClientY) / Math.max(resize.canvasHeight, 1);
        updateSlideTextBlockSize(
          resize.slideId,
          resize.blockId,
          resize.startW + dw,
          resize.startH + dh,
          resize.versionId,
        );
      }
    };
    const stopDrag = () => {
      textBlockDragRef.current = null;
      textBlockResizeRef.current = null;
      setDraggingTextBlockId(null);
      setResizingTextBlockId(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [draggingTextBlockId, resizingTextBlockId]);

  const renderSlideTextBlocks = (
    slide: SlideData,
    editable = false,
    canvasWidth = 1100,
    canvasHeight = 619
  ) => {
    const layer = getSlideRenderLayer(slide.id);
    if (!layer || layer.textBlocks.length === 0) return null;
    const scale = Math.max(0.45, Math.min(1.8, Math.min(canvasWidth / 1100, canvasHeight / 619)));
    return layer.textBlocks.map((block) => {
      const style = block.style || {};
      const fontSize = Math.max(10, estimateTextBlockFontSize(block, canvasWidth, canvasHeight));
      const isDragging = draggingTextBlockId === block.id;
      const paddingX = Math.max(6, Math.round((block.role === "title" ? 14 : 12) * scale));
      const paddingY = Math.max(4, Math.round((block.role === "title" ? 10 : 8) * scale));
      const dragHandleSize = Math.max(14, Math.round(20 * scale));
      const dragHandleOffset = Math.max(2, Math.round(4 * scale));
      return (
        <div
          key={block.id}
          className="absolute overflow-hidden"
          style={{
            left: `${block.x * 100}%`,
            top: `${block.y * 100}%`,
            width: `${block.w * 100}%`,
            height: `${block.h * 100}%`,
            padding: `${paddingY}px ${paddingX}px`,
            pointerEvents: editable ? "auto" : "none",
            color: style.color || "#111827",
            fontFamily: style.fontFamily || (uiLang === "zh" ? "Microsoft YaHei" : "Aptos"),
            fontSize: `${fontSize}px`,
            fontWeight: style.fontWeight || (block.role === "title" ? 700 : 500),
            fontStyle: style.fontStyle || "normal",
            lineHeight: String(style.lineHeight || (block.role === "title" ? 1.18 : 1.35)),
            letterSpacing: `${style.letterSpacing || 0}px`,
            textAlign: style.align || "left",
            textShadow: "0 1px 4px rgba(15,23,42,0.18)",
            cursor: editable ? "text" : "default",
            outline: editable && isDragging ? "2px solid rgba(59,130,246,0.45)" : "none",
          }}
        >
          {editable ? (
            <button
              type="button"
              className="absolute z-20 rounded bg-black/55 text-white leading-none shadow-sm cursor-grab active:cursor-grabbing"
              title={tr("拖动文本框", "Drag text block")}
              style={{
                right: `${dragHandleOffset}px`,
                top: `${dragHandleOffset}px`,
                width: `${dragHandleSize}px`,
                height: `${dragHandleSize}px`,
                fontSize: `${Math.max(8, Math.round(10 * scale))}px`,
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const rect = previewCanvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const { versionId: sourceVersionId } = getSlideVersionMeta(slide.id);
                if (!sourceVersionId) return;
                const editableVersionId = beginTextBlockDrag(slide.id, sourceVersionId);
                textBlockDragRef.current = {
                  slideId: slide.id,
                  versionId: editableVersionId,
                  blockId: block.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startX: block.x,
                  startY: block.y,
                  blockW: block.w,
                  blockH: block.h,
                  canvasWidth: rect.width,
                  canvasHeight: rect.height,
                };
                setDraggingTextBlockId(block.id);
              }}
            >
              +
            </button>
          ) : null}
          <div
            contentEditable={editable}
            suppressContentEditableWarning
            spellCheck={false}
            className="h-full w-full whitespace-pre-wrap break-words bg-transparent outline-none"
            onFocus={() => {
              if (editable) setEditingTextBlockId(block.id);
            }}
            onBlur={(event) => {
              if (!editable) return;
              setEditingTextBlockId((current) => (current === block.id ? null : current));
              const nextText = textToLines(event.currentTarget.textContent || "").join("\n");
              if (!nextText || nextText === block.text) return;
              updateSlideTextBlock(slide.id, block.id, nextText);
            }}
            style={{
              outline: editable && editingTextBlockId === block.id ? "2px solid rgba(59,130,246,0.35)" : "none",
            }}
          >
            {block.text}
          </div>
        </div>
      );
    });
  };

  const renderResponsiveSlideTextBlocks = (
    slide: SlideData,
    editable = false,
    canvasWidth = 1100,
    canvasHeight = 619
  ) => {
    const layer = getSlideRenderLayer(slide.id);
    if (!layer || layer.textBlocks.length === 0) return null;
    return layer.textBlocks.map((block) => (
      <TextBlockOverlay
        key={block.id}
        block={block}
        slideId={slide.id}
        editable={editable}
        uiLang={uiLang as "zh" | "en"}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        isDragging={draggingTextBlockId === block.id}
        isEditing={editingTextBlockId === block.id}
        onFocusBlock={(blockId) => {
          if (editable) setEditingTextBlockId(blockId);
        }}
        onBlurBlock={(blockId, nextText) => {
          if (!editable) return;
          setEditingTextBlockId((current) => (current === blockId ? null : current));
          if (!nextText || nextText === block.text) return;
          updateSlideTextBlock(slide.id, blockId, nextText);
        }}
        onDragStart={(event, activeBlock, activeSlideId) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = previewCanvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const { versionId: sourceVersionId } = getSlideVersionMeta(activeSlideId);
          if (!sourceVersionId) return;
          const editableVersionId = beginTextBlockDrag(activeSlideId, sourceVersionId);
          textBlockDragRef.current = {
            slideId: activeSlideId,
            versionId: editableVersionId,
            blockId: activeBlock.id,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startX: activeBlock.x,
            startY: activeBlock.y,
            blockW: activeBlock.w,
            blockH: activeBlock.h,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
          };
          setDraggingTextBlockId(activeBlock.id);
        }}
        tr={tr}
      />
    ));
  };

  const renderFixedSlideTextSvg = (slide: SlideData) => {
    const layer = getSlideRenderLayer(slide.id);
    if (!layer || layer.textBlocks.length === 0) return null;

    return (
      <div className="absolute inset-0 z-10 pointer-events-none">
        {layer.textBlocks.map((block) => {
          if (editingTextBlockId === block.id) return null;
          const style = block.style || {};
          const refFontSize = Math.max(
            10,
            estimateTextBlockFontSize(block, PPT_REFERENCE_SLIDE_WIDTH, PPT_REFERENCE_SLIDE_HEIGHT)
          );
          const previewFontSize = refFontSize * PPT_POINT_TO_CSS_PX;
          const lineHeightRatio = Number(style.lineHeight || (block.role === "title" ? 1.12 : block.role === "tag" ? 1.05 : 1.35));
          const x = block.x * PPT_REFERENCE_SLIDE_WIDTH;
          const y = block.y * PPT_REFERENCE_SLIDE_HEIGHT;
          const w = block.w * PPT_REFERENCE_SLIDE_WIDTH;
          const h = block.h * PPT_REFERENCE_SLIDE_HEIGHT;
          const isTag = block.role === "tag";
          const justifyContent = style.align === "center" ? "center" : style.align === "right" ? "flex-end" : "flex-start";
          const textColor = style.color || (block.role === "title" ? "#ffffff" : isTag ? "#ffd66b" : "#ffffff");
          const fontFamily = style.fontFamily || "Aptos";

          return (
            <div
              key={block.id}
              className="absolute overflow-visible"
              style={{
                left: `${x}px`,
                top: `${y}px`,
                width: `${w}px`,
                height: `${h}px`,
                display: "flex",
                alignItems: "center",
                justifyContent,
                background: "transparent",
                border: "none",
                boxShadow: "none",
              }}
            >
              <div
                style={{
                  width: "100%",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  textAlign: style.align || "left",
                  fontFamily,
                  fontSize: `${previewFontSize}px`,
                  fontWeight: Number(style.fontWeight || (block.role === "title" ? 900 : isTag ? 800 : 500)),
                  fontStyle: style.fontStyle || "normal",
                  lineHeight: String(lineHeightRatio),
                  letterSpacing: `${Number(style.letterSpacing || 0)}px`,
                  color: textColor,
                }}
              >
                {block.text}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSlideInteractionLayer = (slide: SlideData) => {
    const layer = getSlideRenderLayer(slide.id);
    if (!layer || layer.textBlocks.length === 0) return null;

    return layer.textBlocks.map((block) => {
      const style = block.style || {};
      const refFontSize = Math.max(
        10,
        estimateTextBlockFontSize(block, PPT_REFERENCE_SLIDE_WIDTH, PPT_REFERENCE_SLIDE_HEIGHT)
      );
      const previewFontSize = refFontSize * PPT_POINT_TO_CSS_PX;
      const isEditing = editingTextBlockId === block.id;
      const dragHandleSize = 20;
      const resizeHandleSize = 18;
      return (
        <div
          key={`interactive-${block.id}`}
          className="absolute"
          style={{
            left: `${block.x * 100}%`,
            top: `${block.y * 100}%`,
            width: `${block.w * 100}%`,
            height: `${block.h * 100}%`,
            pointerEvents: "auto",
            outline:
              draggingTextBlockId === block.id || resizingTextBlockId === block.id
                ? "2px solid rgba(59,130,246,0.45)"
                : "none",
          }}
        >
          <button
            type="button"
            className="absolute z-20 rounded bg-black/55 text-white leading-none shadow-sm cursor-grab active:cursor-grabbing"
            title={tr("拖动文本框", "Drag text block")}
            style={{
              right: "-8px",
              top: "-6px",
              width: `${dragHandleSize}px`,
              height: `${dragHandleSize}px`,
              fontSize: "10px",
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = previewCanvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              const { versionId: sourceVersionId } = getSlideVersionMeta(slide.id);
              if (!sourceVersionId) return;
              const editableVersionId = beginTextBlockDrag(slide.id, sourceVersionId);
              textBlockDragRef.current = {
                slideId: slide.id,
                versionId: editableVersionId,
                blockId: block.id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startX: block.x,
                startY: block.y,
                blockW: block.w,
                blockH: block.h,
                canvasWidth: rect.width,
                canvasHeight: rect.height,
              };
              setDraggingTextBlockId(block.id);
            }}
          >
            +
          </button>
          <button
            type="button"
            className="absolute z-20 rounded bg-blue-600/75 text-white leading-none shadow-sm cursor-nwse-resize active:cursor-nwse-resize"
            title={tr("缩放文本框", "Resize text box")}
            style={{
              right: "-7px",
              bottom: "-7px",
              width: `${resizeHandleSize}px`,
              height: `${resizeHandleSize}px`,
              fontSize: "10px",
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = previewCanvasRef.current?.getBoundingClientRect();
              if (!rect) return;
              const { versionId: sourceVersionId } = getSlideVersionMeta(slide.id);
              if (!sourceVersionId) return;
              const editableVersionId = beginTextBlockResize(slide.id, sourceVersionId);
              textBlockResizeRef.current = {
                slideId: slide.id,
                versionId: editableVersionId,
                blockId: block.id,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startW: block.w,
                startH: block.h,
                startX: block.x,
                startY: block.y,
                canvasWidth: rect.width,
                canvasHeight: rect.height,
              };
              setResizingTextBlockId(block.id);
            }}
          >
            {uiLang === "zh" ? "缩" : "↘"}
          </button>
          {isEditing ? (
            <div
              className="absolute inset-0 flex"
              style={{
                alignItems: "center",
                justifyContent: style.align === "center" ? "center" : style.align === "right" ? "flex-end" : "flex-start",
              }}
            >
              <div
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                className="w-full whitespace-pre-wrap break-words bg-transparent outline-none"
                onBlur={(event) => {
                  const nextText = textToLines(event.currentTarget.textContent || "").join("\n");
                  setEditingTextBlockId((current) => (current === block.id ? null : current));
                  if (!nextText || nextText === block.text) return;
                  updateSlideTextBlock(slide.id, block.id, nextText);
                }}
                ref={(node) => {
                  if (!node || editingTextBlockId !== block.id) return;
                  node.focus();
                  const selection = window.getSelection();
                  if (!selection) return;
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  range.collapse(false);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }}
                style={{
                  textAlign: style.align || "left",
                  fontFamily: style.fontFamily || "Aptos",
                  fontSize: `${previewFontSize}px`,
                  fontWeight: Number(style.fontWeight || (block.role === "title" ? 900 : block.role === "tag" ? 800 : 500)),
                  fontStyle: style.fontStyle || "normal",
                  lineHeight: String(style.lineHeight || (block.role === "title" ? 1.12 : block.role === "tag" ? 1.05 : 1.35)),
                  color: style.color || (block.role === "title" ? "#ffffff" : block.role === "tag" ? "#ffd66b" : "#ffffff"),
                  outline: "2px solid rgba(59,130,246,0.35)",
                }}
              >
                {block.text}
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="absolute inset-0 bg-transparent"
              onClick={() => setEditingTextBlockId(block.id)}
              aria-label={`Edit ${block.id}`}
            />
          )}
        </div>
      );
    });
  };

  const renderScaledSlideScene = (
    slide: SlideData,
    editable = false,
    outerWidth = PPT_REFERENCE_SLIDE_WIDTH,
    outerHeight = PPT_REFERENCE_SLIDE_HEIGHT,
  ) => {
    const backgroundUrl = getSlideBackgroundUrl(slide.id);
    const hasTextLayer = (getSlideRenderLayer(slide.id)?.textBlocks || []).length > 0;
    const scale = Math.min(
      outerWidth / PPT_REFERENCE_SLIDE_WIDTH,
      outerHeight / PPT_REFERENCE_SLIDE_HEIGHT
    ) || 1;

    if (!backgroundUrl) return null;

    return (
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute left-0 top-0"
          style={{
            width: `${PPT_REFERENCE_SLIDE_WIDTH}px`,
            height: `${PPT_REFERENCE_SLIDE_HEIGHT}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <img
            src={backgroundUrl}
            className="absolute inset-0 w-full h-full object-cover bg-white"
            alt={`Slide ${slide.id}`}
          />
          {hasTextLayer ? renderFixedSlideTextSvg(slide) : null}
          {editable && hasTextLayer ? <div className="absolute inset-0 z-20">{renderSlideInteractionLayer(slide)}</div> : null}
        </div>
      </div>
    );
  };

  const activeSlides = localSlides.length > 0 ? localSlides : [];
  const currentSlide = activeSlides[currentSlideIndex];
  const currentSlideImage = currentSlide ? getSlideBackgroundUrl(currentSlide.id) : "";
  const currentSlideHasTextLayer = currentSlide ? ((getSlideRenderLayer(currentSlide.id)?.textBlocks || []).length > 0) : false;
  const failedBeautifyCount = activeSlides.reduce((n, s) => n + (beautifyFailures[s.id] ? 1 : 0), 0);
  const failedImageTransformCount = activeSlides.reduce((n, s) => n + (imageTransformFailures[s.id] ? 1 : 0), 0);
  const currentSlideFailure = currentSlide
    ? (creationMode === "image_transform" ? imageTransformFailures[currentSlide.id] : beautifyFailures[currentSlide.id])
    : "";

  const formatImageVersionLabel = (version: SlideImageVersion, index: number) => {
    return tr(`第 ${index + 1} 版`, `Version ${index + 1}`);
  };

  const enterSlideshowFullscreen = async () => {
    if (typeof document === "undefined") return;
    const root = slideshowRootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) return;
      if (root.requestFullscreen) {
        await root.requestFullscreen();
        return;
      }
      const anyRoot = root as any;
      if (typeof anyRoot.webkitRequestFullscreen === "function") {
        anyRoot.webkitRequestFullscreen();
      }
    } catch {
    }
  };

  const exitSlideshowFullscreen = async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      const anyDoc = document as any;
      if (typeof anyDoc.webkitExitFullscreen === "function") {
        anyDoc.webkitExitFullscreen();
      }
    } catch {
    }
  };

  const closeSlideshow = () => {
    setSlideshowOpen(false);
    void exitSlideshowFullscreen();
  };

  const openSlideshow = () => {
    if (activeSlides.length === 0) return;
    setSlideshowOpen(true);
  };

  useEffect(() => {
      if (!slideshowOpen) return;
      setSlideshowIndex(currentSlideIndex);
      const timer = window.setTimeout(() => {
        void enterSlideshowFullscreen();
      }, 0);
      return () => window.clearTimeout(timer);
  }, [slideshowOpen, currentSlideIndex]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFullscreenChange = () => {
      const root = slideshowRootRef.current;
      const fullEl = document.fullscreenElement || (document as any).webkitFullscreenElement || null;
      setSlideshowFullscreen(!!root && !!fullEl && (fullEl === root || root.contains(fullEl)));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!slideshowOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeSlides.length === 0) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setSlideshowIndex((v) => (v + 1) % activeSlides.length);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setSlideshowIndex((v) => (v - 1 + activeSlides.length) % activeSlides.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (slideshowFullscreen) {
          void exitSlideshowFullscreen();
        } else {
          closeSlideshow();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slideshowOpen, activeSlides.length, slideshowFullscreen]);

  const setRenderLayerState = (slideId: string, versionId: string, layer: SlideRenderLayer) => {
      setRenderLayers((prev) => ({
          ...prev,
          [slideId]: {
              ...(prev[slideId] || {}),
              [versionId]: layer,
          },
      }));
  };

  const getDerivedProcessingKey = (slideId: string, sourceVersionId: string) => `${slideId}::${sourceVersionId}`;

  const processRenderedSlideVersion = async (slide: SlideData, slideImageUrl: string, versionId: string) => {
      try {
          const persistedSlideImageUrl = await persistImageUrlIfNeeded(slideImageUrl);
          const page: PptPage = {
            id: slide.id,
            title: slide.title,
            content: slide.content,
            description: slide.description,
            note: slide.note,
            layout: slide.layout,
          };
          const textBlocks = await pptService.extractSlideTextBlocks(
            page,
            persistedSlideImageUrl,
            uiLang as "zh" | "en"
          );
          const backgroundImageUrlRaw = await pptService.generateTextlessPageImage(
            page,
            persistedSlideImageUrl,
            textBlocks,
            uiLang as "zh" | "en"
          );
          const backgroundImageUrl = await persistImageUrlIfNeeded(backgroundImageUrlRaw || persistedSlideImageUrl);
          const reviewedTextBlocks = await pptService.reviewSlideTextBlocks(
            page,
            persistedSlideImageUrl,
            backgroundImageUrl || persistedSlideImageUrl,
            textBlocks,
            uiLang as "zh" | "en"
          );
          return {
              backgroundImageUrl: backgroundImageUrl || persistedSlideImageUrl,
              textBlocks: reviewedTextBlocks,
              status: "ready",
          } satisfies SlideRenderLayer;
      } catch (error) {
          console.error("Failed to build PPT render layer", error);
          const persistedSlideImageUrl = await persistImageUrlIfNeeded(slideImageUrl);
          const failedLayer = {
              backgroundImageUrl: persistedSlideImageUrl,
              textBlocks: [],
              status: "failed",
              error: error instanceof Error ? error.message : "Failed to process slide",
          } satisfies SlideRenderLayer;
          setRenderLayerState(slide.id, versionId, failedLayer);
          return failedLayer;
      }
  };

  const pushImageVersion = (
    slideId: string,
    url: string,
    type: SlideImageVersionType,
    instruction?: string,
    options?: { setCurrent?: boolean; sourceVersionId?: string }
  ) => {
      const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setImageVersions(prev => ({
          ...prev,
          [slideId]: [
              ...(prev[slideId] || []),
              { id: versionId, url, timestamp: Date.now(), type, instruction, sourceVersionId: options?.sourceVersionId }
          ]
      }));
      if (options?.setCurrent !== false) {
        setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
        setGeneratedImages(prev => ({ ...prev, [slideId]: url }));
      }
      return versionId;
  };

  const pushImageVersionAndProcess = async (slide: SlideData, url: string, type: "generated" | "edited", instruction?: string) => {
      const persistedUrl = await persistImageUrlIfNeeded(url);
      const originalVersionId = pushImageVersion(slide.id, persistedUrl, type, instruction);
      const processingKey = getDerivedProcessingKey(slide.id, originalVersionId);
      derivedProcessingRef.current.add(processingKey);
      setRenderLayerState(slide.id, originalVersionId, {
          backgroundImageUrl: persistedUrl,
          textBlocks: [],
          status: "ready",
      });
      try {
        const derived = await processRenderedSlideVersion(slide, persistedUrl, originalVersionId);
        if (derived?.backgroundImageUrl) {
          setRenderLayerState(slide.id, originalVersionId, derived);
        }
        return originalVersionId;
      } finally {
        derivedProcessingRef.current.delete(processingKey);
      }
  };

  const deriveTextlessVersionFromExisting = async (slide: SlideData, sourceVersion: SlideImageVersion) => {
      const processingKey = getDerivedProcessingKey(slide.id, sourceVersion.id);
      if (derivedProcessingRef.current.has(processingKey)) return sourceVersion.id;
      derivedProcessingRef.current.add(processingKey);
      try {
        const derived = await processRenderedSlideVersion(slide, sourceVersion.url, sourceVersion.id);
        if (derived?.backgroundImageUrl) {
          setRenderLayerState(slide.id, sourceVersion.id, derived);
        }
        return sourceVersion.id;
      } finally {
        derivedProcessingRef.current.delete(processingKey);
      }
  };

  const createTwoStageSlideProgressTracker = (
    slideCount: number,
    initialZh: string,
    initialEn: string,
    processingZh: string,
    processingEn: string,
  ) => {
    const safeTotal = Math.max(1, slideCount);
    const counter = { doneUnits: 0 };
    const setStage = (current: number, zhLabel: string, enLabel: string) => {
      setProgress({
        current,
        total: safeTotal,
        message: tr(zhLabel, enLabel),
      });
    };

    return {
      start() {
        setStage(0, initialZh, initialEn);
      },
      markBaseReady() {
        counter.doneUnits = Math.min(safeTotal * 2, counter.doneUnits + 1);
        setStage(counter.doneUnits / 2, processingZh, processingEn);
      },
      markSlideFinished(baseReady: boolean) {
        counter.doneUnits = Math.min(safeTotal * 2, counter.doneUnits + (baseReady ? 1 : 2));
        setStage(counter.doneUnits / 2, processingZh, processingEn);
      },
    };
  };

  useEffect(() => {
      if (creationMode === "image_transform") return;
      activeSlides.forEach((slide) => {
        const { versionId, version, imageUrl } = getSlideVersionMeta(slide.id);
        if (!versionId || !version || !imageUrl) return;
        if (version.type === "derived_textless") return;
        if (derivedProcessingRef.current.has(getDerivedProcessingKey(slide.id, versionId))) return;
        const hasDerivedVersion = (imageVersions[slide.id] || []).some((item) => item.sourceVersionId === versionId && item.type === "derived_textless");
        if (hasDerivedVersion) return;
        const layer = renderLayers[slide.id]?.[versionId];
        if (layer?.status === "pending" || hasRenderableTextBlocks(layer)) return;
        void deriveTextlessVersionFromExisting(slide, version);
      });
  }, [activeSlides, imageVersions, currentImageVersionId, renderLayers, creationMode]);

  const handleReferenceFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (files.length === 0) return;
      await handleReferenceFileChange([...referenceUploadFiles, ...files]);
  };

  const openReferencePreview = (file: ReferenceFile) => {
      setReferencePreviewFile(file);
      setReferencePreviewOpen(true);
  };

  const getMaterialLabel = (index: number) => {
    return uiLang === "zh" ? `第${index}张` : `Image ${index}`;
  };

  const parseJsonLoose = (text: string) => {
    const raw = String(text || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
    }
    const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
      try {
        return JSON.parse(String(jsonBlock[1]).trim());
      } catch {
      }
    }
    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const candidate = raw.slice(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(candidate);
      } catch {
      }
    }
    return null;
  };

  const buildReferenceVisualAssetsWithCaptions = async (): Promise<ReferenceVisualAsset[]> => {
    const raw = (referenceVisualAssetsRaw || []).filter((x: any) => x && typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:image"));
    if (raw.length === 0) return [];

    const baseItems = raw.slice(0, 24).map((x: any, idx: number) => {
      const label = `FIG_${idx + 1}`;
      const sourcePage = typeof x.page === "number" ? x.page : undefined;
      const textHint = String(x.textHint || "").slice(0, 800);
      const cached = assetCaptionCacheRef.current[x.id];
      const fallbackCaption = cached || (sourcePage ? tr(`来自第 ${sourcePage} 页的图表`, `Figure/table from page ${sourcePage}`) : tr("参考素材图片", "Reference visual asset"));
      return {
        id: String(x.id || `asset-${idx + 1}`),
        label,
        sourceFileName: String(x.sourceFileName || tr("参考文件", "Reference file")),
        sourcePage,
        dataUrl: String(x.dataUrl || ""),
        textHint,
        caption: fallbackCaption,
      } as ReferenceVisualAsset;
    });

    const uncached = baseItems.filter((item) => !assetCaptionCacheRef.current[item.id]);
    if (uncached.length === 0) return baseItems;

    try {
      const prompt = [
        "你是论文素材caption生成器。返回JSON数组，不要任何额外文字。",
        "任务：为每个素材生成一句简短中文说明（18-36字），偏重实验数据/图表含义，不要编造具体数值。",
        "格式：[{\"id\":\"...\",\"caption\":\"...\"}]",
        "素材列表：",
        ...uncached.map((item, idx) => {
          const pageText = typeof item.sourcePage === "number" ? `page=${item.sourcePage}` : "page=NA";
          return `${idx + 1}. id=${item.id}; source=${item.sourceFileName}; ${pageText}; text_hint=${item.textHint || "(none)"}`;
        }),
      ].join("\n");

      const resp = await generateChatMessage([{ role: "user", content: prompt }], undefined, { timeoutMs: 90000 });
      const parsed = parseJsonLoose(resp);
      const arr = Array.isArray(parsed) ? parsed : [];
      for (const it of arr) {
        const id = String(it?.id || "").trim();
        const caption = String(it?.caption || "").trim();
        if (!id || !caption) continue;
        assetCaptionCacheRef.current[id] = caption.slice(0, 80);
      }
    } catch (e) {
      console.error("Failed to generate asset captions", e);
    }

    return baseItems.map((item) => ({
      ...item,
      caption: assetCaptionCacheRef.current[item.id] || item.caption,
    }));
  };

  const ensureDescriptionHasMaterialTokens = (description: string, materials: Array<{ name: string; caption?: string }>) => {
    const source = String(description || "");
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const placementsZh = [
      "放在左侧主视觉区域，约占画面宽度 40%",
      "放在右上区域，作为辅助图示",
      "放在底部横向区域，作为补充对比",
    ];
    const placementsEn = [
      "place it in the left primary visual area, about 40% width",
      "place it in the upper-right area as a supporting visual",
      "place it in the bottom horizontal area as supplementary comparison",
    ];

    let working = source;
    const lines: string[] = [];
    for (let i = 0; i < materials.length; i += 1) {
      const m = materials[i];
      const token = `{{image:${m.name}}}`;
      const tokenEscaped = escapeRegExp(token);
      const placement = uiLang === "zh"
        ? placementsZh[Math.min(i, placementsZh.length - 1)]
        : placementsEn[Math.min(i, placementsEn.length - 1)];
      const captionPart = String(m.caption || "").trim();
      const sentence = uiLang === "zh"
        ? `${token}${placement}${captionPart ? `，内容重点为：${captionPart}` : ""}。`
        : `${token} ${placement}${captionPart ? `, focus: ${captionPart}` : ""}.`;

      const wrongLangPlacementRe = uiLang === "zh"
        ? new RegExp(`${tokenEscaped}[^\\n]*\\bplace\\b[^\\n]*`, "gi")
        : new RegExp(`${tokenEscaped}[^\\n]*放在[^\\n]*`, "g");
      if (wrongLangPlacementRe.test(working)) {
        working = working.replace(wrongLangPlacementRe, "");
      }

      const hasToken = working.includes(token);
      const hasPlacement = uiLang === "zh"
        ? new RegExp(`${tokenEscaped}[^\\n]*放在`).test(working)
        : new RegExp(`${tokenEscaped}[^\\n]*\\bplace\\b`, "i").test(working);
      if (!hasToken || !hasPlacement) lines.push(sentence);
    }

    working = working
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (lines.length === 0) return working || source;
    const trimmed = working.trim();
    if (!trimmed) return lines.join("\n");
    return `${trimmed}\n${lines.join("\n")}`;
  };

  const buildSlideMaterialsFromAutoLabels = (
    pages: PptPage[],
    slides: SlideData[],
    assets: ReferenceVisualAsset[]
  ) => {
    const assetMap = new Map<string, ReferenceVisualAsset>();
    for (const a of assets) assetMap.set(a.label, a);

    const pageLabels: string[][] = slides.map((_, idx) => {
      const labels = Array.isArray(pages[idx]?.materialLabels)
        ? pages[idx]!.materialLabels!.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      return labels.slice(0, 3);
    });
    const explicitLabelCount = pageLabels.reduce((sum, arr) => sum + arr.length, 0);

    // Fallback: if AI returned no labels at all but assets exist, attach a few assets
    // to representative slides so users can review and adjust instead of seeing empty materials.
    if (explicitLabelCount === 0 && assets.length > 0 && slides.length > 0) {
      const fallbackCount = Math.min(assets.length, Math.max(1, Math.min(6, Math.ceil(slides.length / 2))));
      const step = Math.max(1, Math.floor(slides.length / fallbackCount));
      for (let n = 0; n < fallbackCount; n += 1) {
        const slideIndex = Math.min(slides.length - 1, n * step);
        const label = assets[n]?.label;
        if (!label) continue;
        if (!pageLabels[slideIndex]) pageLabels[slideIndex] = [];
        if (!pageLabels[slideIndex].includes(label)) pageLabels[slideIndex].push(label);
      }
    }

    const nextMaterials: Record<string, SlideMaterialImage[]> = {};
    const nextSlides = slides.map((slide, idx) => {
      const labels = (pageLabels[idx] || []).slice(0, 3);
      const matched = labels
        .map((lb) => assetMap.get(lb))
        .filter((x): x is ReferenceVisualAsset => !!x)
        .slice(0, 3);
      if (matched.length === 0) return slide;

      const materialItems: SlideMaterialImage[] = matched.map((asset, mIdx) => ({
        id: `auto-mat-${slide.id}-${asset.label}-${mIdx + 1}`,
        name: getMaterialLabel(mIdx + 1),
        fileName: asset.sourceFileName,
        dataUrl: asset.dataUrl,
        refLabel: asset.label,
        caption: asset.caption,
        sourceFileName: asset.sourceFileName,
        sourcePage: asset.sourcePage,
      }));
      nextMaterials[slide.id] = materialItems;

      const withTokens = ensureDescriptionHasMaterialTokens(
        String(slide.description || ""),
        materialItems.map((m) => ({ name: m.name, caption: m.caption }))
      );
      return { ...slide, description: withTokens };
    });

    return { nextSlides, nextMaterials };
  };

  const addSlideMaterialImages = async (slideId: string, files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const toDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    const currentCount = (slideMaterials[slideId] || []).length;
    const created: SlideMaterialImage[] = [];
    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      try {
        const dataUrl = await toDataUrl(file);
        if (!dataUrl.startsWith("data:image")) continue;
        const label = getMaterialLabel(currentCount + i + 1);
        created.push({
          id: `mat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: label,
          fileName: file.name,
          dataUrl,
        });
      } catch (e) {
        console.error("Failed to read slide material image", file.name, e);
      }
    }
    if (created.length === 0) return;
    setSlideMaterials((prev) => ({
      ...prev,
      [slideId]: [...(prev[slideId] || []), ...created],
    }));
  };

  const removeSlideMaterialImage = (slideId: string, id: string) => {
    const removed = (slideMaterials[slideId] || []).find((x) => x.id === id);
    setSlideMaterials((prev) => ({
      ...prev,
      [slideId]: (prev[slideId] || []).filter((x) => x.id !== id),
    }));
    if (!removed) return;

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenRe = new RegExp(`\\{\\{image:${escapeRegExp(removed.name)}\\}\\}`, "g");
    setLocalSlides((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const nextDesc = String(s.description || "")
          .replace(tokenRe, "")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/ *\n */g, "\n");
        return { ...s, description: nextDesc };
      })
    );

    const editor = descriptionEditorRefs.current[slideId];
    if (editor) {
      for (const node of Array.from(editor.querySelectorAll("[data-material-token]"))) {
        const el = node as HTMLElement;
        if (el.getAttribute("data-material-token") === removed.name) {
          el.remove();
        }
      }
    }
  };

  const getSlideMaterialImageUrls = (slideId: string) =>
    (slideMaterials[slideId] || []).map((x) => x.dataUrl).filter(Boolean);

  const getSlideMaterialImageRefs = (slideId: string) =>
    (slideMaterials[slideId] || [])
      .map((x) => ({ url: x.dataUrl, label: x.name }))
      .filter((x) => !!x.url);

  const getTextAreaCaretPosition = (textarea: HTMLTextAreaElement) => {
    const div = document.createElement("div");
    const style = window.getComputedStyle(textarea);
    const props = [
      "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth",
      "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight",
      "fontFamily", "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing",
      "tabSize", "MozTabSize",
    ] as const;
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    for (const prop of props) {
      (div.style as any)[prop] = (style as any)[prop];
    }
    div.textContent = textarea.value.substring(0, textarea.selectionStart || 0);
    const span = document.createElement("span");
    span.textContent = textarea.value.substring(textarea.selectionStart || 0) || ".";
    div.appendChild(span);
    document.body.appendChild(div);
    const rect = textarea.getBoundingClientRect();
    const caretRect = span.getBoundingClientRect();
    const left = caretRect.left - rect.left + textarea.scrollLeft;
    const top = caretRect.top - rect.top + textarea.scrollTop + 2;
    document.body.removeChild(div);
    return { left, top };
  };

  const extractMaterialTokenNames = (text: string) => {
    const out: string[] = [];
    const re = /\{\{image:([^}]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(text || "")))) {
      const name = String(m[1] || "").trim();
      if (name) out.push(name);
    }
    return out;
  };

  const insertMaterialTokenToSlideDescription = (slideIndex: number, slideId: string, materialName: string) => {
    const token = `{{image:${materialName}}}`;
    const editor = descriptionEditorRefs.current[slideId];
    if (editor) {
      const sel = window.getSelection();
      const replaceRange = materialPickerReplaceRangeRef.current;
      if (replaceRange) {
        replaceRange.deleteContents();
        const chip = document.createElement("span");
        chip.setAttribute("data-material-token", materialName);
        chip.setAttribute("contenteditable", "false");
        chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
        chip.textContent = materialName;
        replaceRange.insertNode(chip);
        const space = document.createTextNode(" ");
        replaceRange.collapse(false);
        replaceRange.insertNode(space);
        const next = document.createRange();
        next.setStartAfter(space);
        next.collapse(true);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(next);
        }
      } else {
        const chip = document.createElement("span");
        chip.setAttribute("data-material-token", materialName);
        chip.setAttribute("contenteditable", "false");
        chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
        chip.textContent = materialName;
        editor.appendChild(chip);
      }

      const parseEditorValue = () => {
        const parts: string[] = [];
        for (const node of Array.from(editor.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent || "");
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          if (el.tagName === "BR") {
            parts.push("\n");
            continue;
          }
          const tokenName = el.getAttribute("data-material-token");
          if (tokenName) {
            parts.push(`{{image:${tokenName}}}`);
            continue;
          }
          parts.push(el.textContent || "");
        }
        return parts.join("");
      };

      const nextValue = parseEditorValue();
      descriptionEditorAppliedRef.current[slideId] = nextValue;
      const newSlides = [...localSlides];
      newSlides[slideIndex].description = nextValue;
      setLocalSlides(newSlides);
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      materialPickerReplaceRangeRef.current = null;
      return;
    }

    const textarea = descriptionTextareaRefs.current[slideId];
    const prev = localSlides[slideIndex]?.description || "";
    if (!textarea) {
      const newSlides = [...localSlides];
      newSlides[slideIndex].description = `${prev}${token}`;
      setLocalSlides(newSlides);
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      return;
    }

    const cursor = textarea.selectionStart ?? prev.length;
    const before = prev.slice(0, cursor);
    const slashAt = Math.max(before.lastIndexOf("/"), before.lastIndexOf("／"));
    const nextValue =
      slashAt >= 0 ? `${prev.slice(0, slashAt)}${token}${prev.slice(cursor)}` : `${before}${token}${prev.slice(cursor)}`;
    const nextCursor = (slashAt >= 0 ? slashAt : cursor) + token.length;
    const newSlides = [...localSlides];
    newSlides[slideIndex].description = nextValue;
    setLocalSlides(newSlides);
    setMaterialPickerSlideId(null);
    setMaterialPickerPos(null);
    setMaterialPickerActiveIndex(0);
    requestAnimationFrame(() => {
      const input = descriptionTextareaRefs.current[slideId];
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const openMaterialPickerAtCaret = (slideId: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (!editor.contains(r.startContainer)) return;
    if (!r.collapsed) return;
    if (r.startContainer.nodeType !== Node.TEXT_NODE) return;
    const textNode = r.startContainer as Text;
    if (r.startOffset <= 0) return;
    const prevChar = textNode.data[r.startOffset - 1];
    if (prevChar !== "/" && prevChar !== "／") return;

    const replaceRange = document.createRange();
    replaceRange.setStart(textNode, r.startOffset - 1);
    replaceRange.setEnd(textNode, r.startOffset);
    materialPickerReplaceRangeRef.current = replaceRange;

    const marker = r.cloneRange();
    marker.setStart(textNode, r.startOffset);
    marker.collapse(true);
    const rect = marker.getBoundingClientRect();
    const hostRect = editor.getBoundingClientRect();
    setMaterialPickerPos({
      left: editor.offsetLeft + (rect.left - hostRect.left),
      top: editor.offsetTop + (rect.bottom - hostRect.top) + 2,
    });
    setMaterialPickerActiveIndex(0);
    setMaterialPickerSlideId(slideId);
  };

  useEffect(() => {
    if (!materialPickerSlideId) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (materialPickerRef.current?.contains(target)) return;
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      materialPickerReplaceRangeRef.current = null;
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [materialPickerSlideId]);

  useEffect(() => {
    if (!materialPickerSlideId) return;
    const len = (slideMaterials[materialPickerSlideId] || []).length;
    if (len <= 0) return;
    setMaterialPickerActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= len) return len - 1;
      return prev;
    });
  }, [materialPickerSlideId, slideMaterials]);

  const renderDescriptionEditor = (slideId: string, value: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return;
    if (descriptionEditorFocusedRef.current === slideId) return;
    if (descriptionEditorAppliedRef.current[slideId] === value) return;
    descriptionEditorAppliedRef.current[slideId] = value;
    editor.innerHTML = "";
    const text = String(value || "");
    const re = /\{\{image:([^}]+)\}\}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const appendText = (s: string) => {
      const lines = s.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]) editor.appendChild(document.createTextNode(lines[i]));
        if (i < lines.length - 1) editor.appendChild(document.createElement("br"));
      }
    };
    while ((m = re.exec(text))) {
      const before = text.slice(last, m.index);
      if (before) appendText(before);
      const name = String(m[1] || "").trim();
      const chip = document.createElement("span");
      chip.setAttribute("data-material-token", name);
      chip.setAttribute("contenteditable", "false");
      chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
      chip.textContent = name;
      editor.appendChild(chip);
      editor.appendChild(document.createTextNode(" "));
      last = m.index + m[0].length;
    }
    const rest = text.slice(last);
    if (rest) appendText(rest);
    if (!editor.lastChild) editor.appendChild(document.createTextNode(""));
  };

  const parseDescriptionEditor = (slideId: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return "";
    const out: string[] = [];
    for (const node of Array.from(editor.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent || "");
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        out.push("\n");
        continue;
      }
      const name = el.getAttribute("data-material-token");
      if (name) {
        out.push(`{{image:${name}}}`);
        continue;
      }
      out.push(el.textContent || "");
    }
    return out.join("");
  };

  const resetGenerationState = () => {
      console.log("Resetting generation state...");
      setGeneratedImages({});
      setImageVersions({});
      setCurrentImageVersionId({});
      setRenderLayers({});
      setCurrentSlideIndex(0);
  };

  const extractJsonArray = (text: string) => {
      const match = text.match(/\[[\s\S]*\]/);
      return match ? match[0] : null;
  };

  const parseSlides = (raw: string): SlideData[] | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const jsonArrayText = extractJsonArray(trimmed);
    if (jsonArrayText) {
      try {
        const parsed = JSON.parse(jsonArrayText);
        if (Array.isArray(parsed)) {
          return parsed.map((it: any, i: number) => ({
            id: String(it.id || `slide-${i + 1}`),
            title: String(it.title || tr(`第 ${i + 1} 页`, `Slide ${i + 1}`)),
            content: Array.isArray(it.content) ? it.content.map((x: any) => String(x)) : [],
            description: typeof it.description === "string" ? it.description : undefined,
            note: typeof it.note === "string" ? it.note : undefined,
            layout: typeof it.layout === "string" ? localizeLayoutHint(it.layout, uiLang as "zh" | "en") : undefined,
          }));
        }
      } catch {
      }
    }

    const lines = trimmed.split(/\r?\n/);
    const slides: SlideData[] = [];
    let current: SlideData | null = null;
    const ensureCurrent = () => {
      if (!current) {
        current = {
          id: `slide-${slides.length + 1}`,
          title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`),
          content: [],
        };
      }
      return current;
    };
    const pushCurrent = () => {
      if (current) slides.push(current);
      current = null;
    };

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;

      const heading = l.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        pushCurrent();
        current = {
          id: `slide-${slides.length + 1}`,
          title: heading[2].trim() || tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`),
          content: [],
        };
        continue;
      }

      const bullet = l.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        ensureCurrent().content.push(bullet[1].trim());
        continue;
      }

      const desc = l.match(/^description[:：]\s*(.*)$/i);
      if (desc) {
        ensureCurrent().description = desc[1].trim();
        continue;
      }

      const note = l.match(/^note[:：]\s*(.*)$/i);
      if (note) {
        ensureCurrent().note = note[1].trim();
        continue;
      }

      const layout = l.match(/^layout[:：]\s*(.*)$/i);
      if (layout) {
        ensureCurrent().layout = layout[1].trim();
      }
    }
    pushCurrent();
    return slides.length > 0 ? slides : null;
  };

  const runInParallel = async (tasks: (() => Promise<void>)[], limit: number) => {
      const results: Promise<void>[] = [];
      const executing: Promise<void>[] = [];
      for (const task of tasks) {
          const p = Promise.resolve().then(() => task());
          results.push(p);
          let e: Promise<void>;
          e = p
            .catch(() => {
            })
            .then(() => {
              executing.splice(executing.indexOf(e), 1);
            });
          executing.push(e);
          if (executing.length >= limit) {
              await Promise.race(executing);
          }
      }
      await Promise.all(results);
  };

  const isBeautifyPdfFile = (file: File) => {
    const name = String(file?.name || "").toLowerCase();
    return file?.type === "application/pdf" || name.endsWith(".pdf");
  };

  const isImageTransformSourceFile = (file: File) => {
    const name = String(file?.name || "").toLowerCase();
    return file?.type === "application/pdf" || name.endsWith(".pdf");
  };

  const extractPdfPagesAsImages = async (file: File) => {
    const { getPdfDocumentFromUrl, renderPdfPageToCanvas } = await import("@/lib/pdf-utils");
    const objectUrl = URL.createObjectURL(file);
    try {
      const pdf = await getPdfDocumentFromUrl(objectUrl);
      const pageCount = (pdf as any)?.numPages ?? 0;
      const out: string[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        setProgress({
          current: pageNumber - 1,
          total: pageCount,
          message: tr(`正在解析 PDF... (${pageNumber - 1}/${pageCount})`, `Parsing PDF... (${pageNumber - 1}/${pageCount})`),
        });
        const canvas = document.createElement("canvas");
        await renderPdfPageToCanvas({ pdf, pageNumber, canvas, targetWidth: 1280 });
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl && dataUrl.startsWith("data:image")) out.push(dataUrl);
      }
      setProgress({
        current: pageCount,
        total: pageCount,
        message: tr(`正在解析 PDF... (${pageCount}/${pageCount})`, `Parsing PDF... (${pageCount}/${pageCount})`),
      });
      return out;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const extractImageDeckPages = async (file: File) => {
    if (isBeautifyPdfFile(file)) {
      return await extractPdfPagesAsImages(file);
    }
    throw new Error(tr("仅支持 PDF 文件。", "Only PDF files are supported."));
  };


  const handleBeautifyFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setBeautifyFile(f);
  };

  const handleImageTransformFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setImageTransformFile(f);
  };

  const createImageTransformSlideVersion = async (slide: SlideData, sourceUrl: string) => {
    const persistedSourceUrl = await persistImageUrlIfNeeded(sourceUrl);
    const originalVersionId = pushImageVersion(
      slide.id,
      persistedSourceUrl,
      "generated",
      tr("原始上传页", "Original uploaded page"),
      { setCurrent: false }
    );
    setRenderLayerState(slide.id, originalVersionId, {
      backgroundImageUrl: persistedSourceUrl,
      textBlocks: [],
      status: "ready",
    });

    const reconstructedVersionId = pushImageVersion(
      slide.id,
      persistedSourceUrl,
      "edited",
      tr("图片PPT转化结果", "Image PPT reconstruction"),
      { sourceVersionId: originalVersionId }
    );
    setRenderLayerState(slide.id, reconstructedVersionId, {
      backgroundImageUrl: persistedSourceUrl,
      textBlocks: [],
      status: "pending",
    });

    try {
      const derived = await processRenderedSlideVersion(slide, persistedSourceUrl, reconstructedVersionId);
      setRenderLayerState(slide.id, reconstructedVersionId, derived);
      if (derived.status === "failed") {
        setImageTransformFailures((prev) => ({
          ...prev,
          [slide.id]: derived.error || tr("图片PPT转化失败", "Image PPT transform failed"),
        }));
      } else {
        setImageTransformFailures((prev) => {
          if (!prev[slide.id]) return prev;
          const next = { ...prev };
          delete next[slide.id];
          return next;
        });
      }
      return reconstructedVersionId;
    } catch (error) {
      const message = getErrorMessage(error);
      setImageTransformFailures((prev) => ({ ...prev, [slide.id]: message }));
      return reconstructedVersionId;
    }
  };

  const handleStartImageTransform = async () => {
    const file = imageTransformFile;
    if (!file) return;

    resetGenerationState();
    setBeautifyFailures({});
    setImageTransformFailures({});
    setCreationStep("generating_content");
    setProgress({ current: 0, total: 0, message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = await extractImageDeckPages(file);
      if (pageImages.length === 0) {
        alert(tr("无法解析页面图片，请确认文件格式。", "Failed to extract slide images. Please check the file format."));
        setCreationStep("idle");
        setProgress({ current: 0, total: 0, message: "" });
        return;
      }

      const slides: SlideData[] = pageImages.map((_, i) => ({
        id: `slide-${i + 1}`,
        title: tr(`第 ${i + 1} 页`, `Slide ${i + 1}`),
        content: [],
        description: "",
      }));

      setLocalSlides(slides);
      setCreationStep("generating_images");

      const progressTracker = createTwoStageSlideProgressTracker(
        slides.length,
        "正在创建原始版本...",
        "Creating original slide versions...",
        "正在重建可编辑文字层...",
        "Rebuilding editable text layers...",
      );
      progressTracker.start();

      const tasks = slides.map((slide, index) => async () => {
        let baseReady = false;
        try {
          progressTracker.markBaseReady();
          baseReady = true;
          await createImageTransformSlideVersion(slide, pageImages[index]);
        } catch (error) {
          setImageTransformFailures((prev) => ({
            ...prev,
            [slide.id]: getErrorMessage(error),
          }));
        } finally {
          progressTracker.markSlideFinished(baseReady);
        }
      });

      await runInParallel(tasks, MODEL_CONCURRENCY);
      setCreationStep("done");
      onPptReadyChange?.(true);
    } catch (error) {
      console.error("Image PPT transform failed", error);
      alert(getErrorMessage(error));
      setCreationStep("idle");
    } finally {
      setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const buildBeautifyInstruction = (req: string) => {
    const r = String(req || "").trim();
    const parts = [
      "Beautify the slide while preserving all original text, numbers, and meaning.",
      "Improve typography, spacing, alignment, color harmony, hierarchy, and visual balance.",
      "Do not add watermarks. Keep 16:9 landscape.",
      "Do not translate or rewrite text unless explicitly requested.",
      r ? `User requirements: ${r}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    return tr("未知错误", "Unknown error");
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isRetryableBeautifyError = (error: unknown) => {
    const msg = getErrorMessage(error).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("524") ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("networkerror") ||
      msg.includes("fetch") ||
      msg.includes("rate limit")
    );
  };

  const editPageImageWithRetry = async (
    page: PptPage,
    instruction: string,
    baseImageUrl: string,
    beautifyTemplate?: string
  ) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= BEAUTIFY_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const edited = await pptService.editPageImage(page, instruction, baseImageUrl, beautifyTemplate);
        if (edited) return edited;
        lastError = new Error(tr("模型返回空结果", "Empty model result"));
      } catch (e) {
        lastError = e;
        if (!isRetryableBeautifyError(e) || attempt >= BEAUTIFY_RETRY_MAX_ATTEMPTS) break;
      }

      if (attempt < BEAUTIFY_RETRY_MAX_ATTEMPTS) {
        const jitter = Math.floor(Math.random() * 350);
        const delay = BEAUTIFY_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
  };

  const handleStartBeautify = async () => {
    const file = beautifyFile;
    if (!file) return;

    resetGenerationState();
    setBeautifyFailures({});
    setCreationStep("generating_content");
    setProgress({ current: 0, total: 0, message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = isBeautifyPdfFile(file)
        ? await extractPdfPagesAsImages(file)
        : [];

      if (pageImages.length === 0) {
        alert(tr("无法解析页面图片，请确认文件格式（仅支持 .pdf）。", "Failed to extract pages. Please upload a .pdf file."));
        setCreationStep("idle");
        setProgress({ current: 0, total: 0, message: "" });
        return;
      }

      const slides: SlideData[] = pageImages.map((_, i) => ({
        id: `slide-${i + 1}`,
        title: tr(`第 ${i + 1} 页`, `Slide ${i + 1}`),
        content: [],
        description: "",
      }));

      const persistedPageImages = await Promise.all(
        pageImages.map(async (url) => await persistImageUrlIfNeeded(url))
      );
      const initialGenerated: Record<string, string> = {};
      const initialCurrent: Record<string, string> = {};
      const initialVersions: Record<string, SlideImageVersion[]> = {};

      for (let i = 0; i < slides.length; i += 1) {
        const slideId = slides[i].id;
        const url = persistedPageImages[i] || pageImages[i];
        const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        initialGenerated[slideId] = url;
        initialCurrent[slideId] = versionId;
        initialVersions[slideId] = [{ id: versionId, url, timestamp: Date.now(), type: "generated", instruction: tr("原始页面", "Original full slide") }];
      }

      setLocalSlides(slides);
      setGeneratedImages(initialGenerated);
      setCurrentImageVersionId(initialCurrent);
      setImageVersions(initialVersions);

      setCreationStep("generating_images");
      const progressTracker = createTwoStageSlideProgressTracker(
        slides.length,
        "正在生成美化页图...",
        "Generating beautified slides...",
        "正在处理美化页文字层...",
        "Processing beautified slide text layers...",
      );
      progressTracker.start();

      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
      const tasks = slides.map((s, i) => async () => {
        let baseReady = false;
        try {
          const page: PptPage = { id: s.id, title: s.title, content: s.content || [], description: s.description || "" };
          const edited = await editPageImageWithRetry(
            page,
            instruction,
            persistedPageImages[i] || pageImages[i],
            beautifyTemplate,
          );
          progressTracker.markBaseReady();
          baseReady = true;
          if (edited) {
            await pushImageVersionAndProcess(s, edited, "edited", instruction);
            setBeautifyFailures((prev) => {
              if (!prev[s.id]) return prev;
              const next = { ...prev };
              delete next[s.id];
              return next;
            });
          } else {
            setBeautifyFailures((prev) => ({ ...prev, [s.id]: tr("模型返回空结果", "Empty model result") }));
          }
        } catch (e) {
          console.error(`Beautify failed for slide ${i + 1}`, e);
          setBeautifyFailures((prev) => ({ ...prev, [s.id]: getErrorMessage(e) }));
        } finally {
          progressTracker.markSlideFinished(baseReady);
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      setCreationStep("done");
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Beautify failed", e);
      alert(tr("美化失败，请重试", "Beautify failed. Please retry."));
      setCreationStep("idle");
    } finally {
      setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleRetryFailedBeautify = async () => {
    if (creationMode !== "beautify") return;
    const failedSlideIds = activeSlides
      .map((s) => s.id)
      .filter((id) => !!beautifyFailures[id]);
    if (failedSlideIds.length === 0) return;

    setCreationStep("generating_images");
    const progressTracker = createTwoStageSlideProgressTracker(
      failedSlideIds.length,
      "正在重试生成页图...",
      "Retrying slide generation...",
      "正在处理重试页文字层...",
      "Processing retried slide text layers...",
    );
    progressTracker.start();

    try {
      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
      const tasks = failedSlideIds.map((slideId) => async () => {
        let baseReady = false;
        const slide = activeSlides.find((x) => x.id === slideId);
        const baseImageUrl = generatedImages[slideId] || getSlideImageUrl(slideId);
        if (!slide || !baseImageUrl) {
          setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("缺少可重试的原始图片", "Missing base image for retry") }));
          progressTracker.markSlideFinished(false);
          return;
        }
        try {
          const page: PptPage = { id: slide.id, title: slide.title, content: slide.content || [], description: slide.description || "" };
          const edited = await editPageImageWithRetry(page, instruction, baseImageUrl, beautifyTemplate);
          progressTracker.markBaseReady();
          baseReady = true;
          if (!edited) {
            setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("模型返回空结果", "Empty model result") }));
          } else {
            await pushImageVersionAndProcess(slide, edited, "edited", instruction);
            setBeautifyFailures((prev) => {
              if (!prev[slideId]) return prev;
              const next = { ...prev };
              delete next[slideId];
              return next;
            });
          }
        } catch (e) {
          setBeautifyFailures((prev) => ({ ...prev, [slideId]: getErrorMessage(e) }));
        } finally {
          if (slide && baseImageUrl) {
            progressTracker.markSlideFinished(baseReady);
          }
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      setCreationStep("done");
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Retry failed slides error", e);
      alert(tr("重试失败页时出错，请重试。", "Retrying failed slides failed. Please try again."));
      setCreationStep("done");
    } finally {
      setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleLoadOutline = async () => {
      if (!outlineInput.trim()) return;
      resetGenerationState();
      setCreationStep("input");
      setProgress({ current: 0, total: 0, message: tr("正在解析参考素材...", "Preparing reference assets...") });
      try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        setProgress({ current: 0, total: 0, message: tr("正在生成计划...", "Generating plan...") });
        const pages = await pptService.generatePlanFromOutline(
          outlineInput,
          uiLang as "zh" | "en",
          referenceFiles,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          }))
        );
        const slides: SlideData[] = pages.map((p, i) => ({
            id: p.id || `slide-${i + 1}`,
            title: normalizeLocalizedSlideTitle(p.title, uiLang as "zh" | "en", i + 1),
            content: p.content,
            description: p.description || "",
            note: p.note || "",
            layout: localizeLayoutHint(p.layout || "", uiLang as "zh" | "en"),
        }));
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets);
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        setCreationStep("outline");
        onPptReadyChange?.(true);
      } catch (e) {
        console.error("Failed to build plan from outline", e);
        alert(e instanceof Error ? e.message : tr("大纲转计划失败，请重试。", "Failed to build plan from outline. Please retry."));
        setCreationStep("idle");
      } finally {
        setProgress({ current: 0, total: 0, message: "" });
      }
  };
  const handleGenerateOutline = async () => {
    if (!ideaInput.trim()) return;
    
    resetGenerationState();
    setCreationStep('input'); // Keep input visible but loading
    setProgress({ current: 0, total: 0, message: tr("正在解析参考素材...", "Preparing reference assets...") });
    
    try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        setProgress({ current: 0, total: 0, message: tr("正在生成大纲...", "Generating outline...") });
        const pages = await pptService.generateOutline(
          ideaInput,
          uiLang as "zh" | "en",
          referenceFiles,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          }))
        );
        if (!Array.isArray(pages) || pages.length === 0) {
            throw new Error("Invalid outline response");
        }
        const slides: SlideData[] = pages.map((p, i) => ({
            id: `slide-${i + 1}`,
            title: normalizeLocalizedSlideTitle(p.title, uiLang as "zh" | "en", i + 1),
            content: p.content,
            description: p.description,
            note: p.note,
            layout: localizeLayoutHint(p.layout || "", uiLang as "zh" | "en")
        }));
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets);
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        setCreationStep('outline');
        onPptReadyChange?.(true);
    } catch (e) {
        console.error("Failed to generate outline", e);
        const name = (e as any)?.name;
        const isAbort = name === "AbortError" || name === "APIUserAbortError";
        const msg = isAbort
          ? tr("生成大纲超时或被中断（120s）。请检查网络和模型可用性后重试。", "Outline generation timed out or was interrupted (120s). Check network/model availability and retry.")
          : e instanceof Error
            ? e.message
            : tr("生成大纲失败，请重试", "Failed to generate outline. Please retry.");
        alert(msg);
        setCreationStep("idle");
    } finally {
        setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleGenerateFullPpt = async () => {
    setCreationStep('generating_images');
    
    // Convert SlideData back to PptPage for service
    const pages: PptPage[] = localSlides.map(s => ({
        id: s.id,
        title: s.title,
        content: s.content,
        description: s.description,
        note: s.note,
        layout: s.layout,
        status: 'outline_generated'
    }));

    try {
        const progressTracker = createTwoStageSlideProgressTracker(
          pages.length,
          "正在生成页图...",
          "Generating slide images...",
          "正在处理页文字层...",
          "Processing slide text layers...",
        );
        progressTracker.start();
        const imageTasks = pages.map((_, i) => async () => {
             let baseReady = false;
             try {
                 const imageUrl = await pptService.generatePageImage(
                  pages[i],
                  uiLang as "zh" | "en",
                  templateImage || undefined,
                 getSlideMaterialImageRefs(pages[i].id || `slide-${i + 1}`)
                );
                 progressTracker.markBaseReady();
                 baseReady = true;
                 if (imageUrl) {
                     const slide = localSlides[i];
                     if (slide) {
                       await pushImageVersionAndProcess(slide, imageUrl, 'generated');
                     }
                 }
             } catch (e) {
                 console.error(`Failed to generate image for slide ${i}`, e);
             } finally {
                 progressTracker.markSlideFinished(baseReady);
             }
        });

        await runInParallel(imageTasks, MODEL_CONCURRENCY);

        setCreationStep('done');
        onPptReadyChange?.(true);

    } catch (e) {
        console.error("Full generation failed", e);
        alert(tr("生成过程中出错。", "An error occurred during generation."));
        setCreationStep('done'); // Allow viewing what's done
        onPptReadyChange?.(true);
    }
  };

  const handleGenerateImagesOnly = async () => {
      if (localSlides.length === 0) return;
      setCreationStep('generating_images');

      const pages: PptPage[] = localSlides.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content || [],
          description: s.description,
          status: "description_generated"
      }));

      const progressTracker = createTwoStageSlideProgressTracker(
        pages.length,
        "正在生成页图...",
        "Generating slide images...",
        "正在处理页文字层...",
        "Processing slide text layers...",
      );
      progressTracker.start();
      const imageTasks = pages.map((_, i) => async () => {
          let baseReady = false;
          try {
              const imageUrl = await pptService.generatePageImage(
                pages[i],
                uiLang as "zh" | "en",
                templateImage || undefined,
                getSlideMaterialImageRefs(pages[i].id || `slide-${i + 1}`)
              );
              progressTracker.markBaseReady();
              baseReady = true;
              if (imageUrl) {
                  const slide = localSlides[i];
                  if (slide) {
                    await pushImageVersionAndProcess(slide, imageUrl, 'generated');
                  }
              }
          } catch (e) {
              console.error(`Failed to generate image for slide ${i}`, e);
          } finally {
              progressTracker.markSlideFinished(baseReady);
          }
      });

      try {
          await runInParallel(imageTasks, MODEL_CONCURRENCY);
          setCreationStep('done');
          onPptReadyChange?.(true);
      } catch (e) {
          console.error("Image-only generation failed", e);
          setCreationStep('done');
          onPptReadyChange?.(true);
      }
  };

  const handleGenerateAiImage = async () => {
    if (!currentSlide) return;
    
    setIsGeneratingImage(true);
    try {
        if (creationMode === "image_transform") {
          const originalVersion = getOriginalSlideVersion(currentSlide.id);
          if (!originalVersion?.url) return;
          await createImageTransformSlideVersion(currentSlide, originalVersion.url);
          return;
        }
        let imageUrl: string | null = null;
        const pages: PptPage[] = localSlides.map(s => ({
          id: s.id,
          title: s.title,
          content: s.content,
          status: 'description_generated',
          description: s.description,
          note: s.note,
          layout: s.layout
        }));
        const pageIndex = localSlides.findIndex(s => s === currentSlide);
        imageUrl = await pptService.generatePageImage(
          pages[pageIndex],
          uiLang as "zh" | "en",
          templateImage || undefined,
          getSlideMaterialImageRefs(currentSlide.id || `slide-${pageIndex + 1}`)
        );

        if (imageUrl) {
            await pushImageVersionAndProcess(currentSlide, imageUrl, 'generated');
        }
    } catch (e) {
        console.error("Failed to generate slide image", e);
    } finally {
        setIsGeneratingImage(false);
    }
  };

  const toRenderablePage = (slide: SlideData): PptPage => {
    const layer = getSlideRenderLayer(slide.id);
    return {
      id: slide.id,
      title: slide.title,
      content: slide.content,
      description: slide.description,
      note: slide.note,
      layout: slide.layout,
      textBlocks: layer?.textBlocks || [],
      backgroundImageUrl: layer?.backgroundImageUrl || getSlideImageUrl(slide.id) || undefined,
      status: "completed",
    };
  };

  const handleAddSlideToChat = (slide: SlideData) => {
    if (onAddToChat) {
        const slideId = slide.id || `slide-${currentSlideIndex + 1}`;
        const currentVersion = currentImageVersionId[slideId];
        const versions = imageVersions[slideId] || [];
        const imageUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[slideId];
        const layer = getSlideRenderLayer(slideId);
        const materialImages = (slideMaterials[slideId] || []).map((x) => ({
          name: x.name,
          url: x.dataUrl,
          caption: x.caption || "",
          sourceFileName: x.sourceFileName || "",
          sourcePage: typeof x.sourcePage === "number" ? x.sourcePage : undefined,
          refLabel: x.refLabel || "",
        }));
        onAddToChat(JSON.stringify({
          ...slide,
          imageUrl,
          backgroundImageUrl: layer?.backgroundImageUrl || imageUrl,
          textBlocks: layer?.textBlocks || [],
          materialImages,
        }, null, 2), `${slideId}.json`);
    }
  };

  const handleDownloadPpt = async () => {
    if (isExporting) return;
    setIsExporting("pptx");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images: Record<string, string> = {};
        for (const s of activeSlides) {
            const versions = imageVersions[s.id] || [];
            const currentVersion = currentImageVersionId[s.id];
            const currentUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[s.id];
            if (currentUrl) images[s.id] = currentUrl;
        }
        await pptService.exportPptx(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        setIsExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting("pdf");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images: Record<string, string> = {};
        for (const s of activeSlides) {
            const versions = imageVersions[s.id] || [];
            const currentVersion = currentImageVersionId[s.id];
            const currentUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[s.id];
            if (currentUrl) images[s.id] = currentUrl;
        }
        await pptService.exportPdf(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        setIsExporting(null);
    }
  };

  const resetToStart = () => {
    if (typeof onResetWorkspace === "function") {
      onResetWorkspace();
      return;
    }
    try {
      localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY);
    } catch {
    }
    void clearPersistedPptWorkspaceState().catch((e) => {
      console.error("Failed to clear persisted PPT workspace", e);
    });
    setLocalSlides([]);
    resetGenerationState();
    setCreationStep("idle");
    setIdeaInput("");
    setOutlineInput("");
    setBeautifyRequirement("");
    setBeautifyUseTemplate(false);
    setBeautifyFile(null);
    setImageTransformFile(null);
    setBeautifyFailures({});
    setImageTransformFailures({});
    setReferenceUploadFiles([]);
    setSlideMaterials({});
    setMaterialPickerSlideId(null);
    setTemplateImage(null);
    setSelectedTemplateId(null);
    setProgress({ current: 0, total: 0, message: "" });
  };

  const handleBackToStart = () => {
    setBackConfirmOpen(true);
  };

  const handleBackToInputFromOutline = () => {
    setLocalSlides([]);
    setSlideMaterials({});
    resetGenerationState();
    setCreationStep("idle");
  };

  const createOutlineSlide = (displayIndex: number): SlideData => ({
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: tr(`第 ${displayIndex + 1} 页`, `Slide ${displayIndex + 1}`),
    content: [],
    description: "",
    note: "",
    layout: "",
  });

  const handleAddOutlineSlide = (afterIndex?: number) => {
    setLocalSlides((prev) => {
      const insertAt = typeof afterIndex === "number"
        ? Math.max(0, Math.min(afterIndex + 1, prev.length))
        : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, createOutlineSlide(insertAt));
      return next;
    });
  };

  const handleDeleteOutlineSlide = (slideId: string) => {
    setLocalSlides((prev) => prev.filter((s) => s.id !== slideId));
    setGeneratedImages((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setImageVersions((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setCurrentImageVersionId((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setRenderLayers((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setBeautifyFailures((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setImageTransformFailures((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setSlideMaterials((prev) => {
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
  };

  // Render Creation Wizard
  if (activeSlides.length === 0 && (creationStep === 'idle' || creationStep === 'input' || creationStep === 'done')) {
      const tabs = [
        { id: 'idea', label: tr('想法', 'Idea') },
        { id: 'outline', label: tr('大纲', 'Outline') },
        { id: 'beautify', label: tr('PPT美化', 'Beautify') },
        { id: 'image_transform', label: tr('图片PPT转化', 'Image PPT Transform') },
      ];
      const modeCopy = (() => {
          if (creationMode === "outline") {
              return {
                  hint: tr("已有大纲？直接粘贴即可快速生成，AI 将自动结构化。", "Have an outline? Paste it and AI will structure it into slides."),
                  placeholder: tr(
                    "粘贴你的 PPT 大纲，例如：\n第一部分：AI 起源\n- 1950 年代\n- 达特茅斯会议",
                    "Paste your PPT outline, for example:\nPart 1: Origins of AI\n- 1950s\n- Dartmouth workshop"
                  )
              };
          }
          if (creationMode === "beautify") {
              return {
                  hint: tr("上传 PDF，输入美化要求，然后并发渲染每一页。", "Upload PDF, enter requirements, then beautify each page in parallel."),
                  placeholder: tr(
                    "例如：整体更高级、留白更充足、标题层级更明显、配色更统一；保持原文案不变。",
                    "e.g. More premium look, more whitespace, stronger title hierarchy, unified palette, higher contrast; keep all original text unchanged."
                  )
              };
          }
          if (creationMode === "image_transform") {
              return {
                  hint: tr("上传 PDF，系统会为每一页生成原始版本和可编辑重建版本。", "Upload a PDF, and the system will build both the original slide version and an editable reconstructed version for each page."),
                  placeholder: "",
              };
          }
          return {
              hint: tr("输入你的想法，AI 将为你生成完整 PPT", "Describe your idea and AI will generate a full deck."),
              placeholder: tr("例如：生成一份关于 AI 发展史的演讲 PPT", "e.g. Create a presentation about the history of AI")
          };
      })();

      return (
        <div className="w-full h-full bg-zinc-50/50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-4xl mx-auto space-y-8 bg-white dark:bg-zinc-800 p-8 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700/50">

                <div className="space-y-8">
                    {/* Template Selection */}
                    {creationMode !== "image_transform" ? (
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">1</span>
                            {tr("选择或上传参考模板", "Choose or upload a reference template")}
                        </label>
                        
                        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                            <label className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-zinc-800/50">
                                <div className="flex flex-col items-center text-zinc-400 group-hover:text-blue-500 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("添加模板", "Add template")}</span>
                                </div>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={handleTemplateUploadInputChange} />
                            </label>
                            <button
                              type="button"
                              onClick={() => setTemplateGeneratorOpen(true)}
                              title={tr("AI生成模板", "AI generate template")}
                              className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-zinc-800/50"
                            >
                                <div className="flex flex-col items-center text-zinc-400 group-hover:text-blue-500 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("AI生成模板", "AI generate")}</span>
                                </div>
                            </button>
                            {templates.map((t) => (
                                <div
                                    key={t.id}
                                    onClick={() => void setTemplateFromItem(t)}
                                    className={`cursor-pointer border rounded-xl overflow-hidden relative aspect-video group transition-all duration-200 bg-zinc-100 dark:bg-zinc-900 ${
                                        selectedTemplateId === t.id
                                            ? "border-blue-500 ring-2 ring-blue-500 shadow-md"
                                            : "border-zinc-200 dark:border-zinc-700 hover:ring-2 hover:ring-blue-500 hover:shadow-md"
                                    }`}
                                >
                                    <img src={t.previewSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={t.name} />
                                    {selectedTemplateId === t.id && (
                                        <div className="absolute top-2 left-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                                            {tr("已选择", "Selected")}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteTemplate(t);
                                        }}
                                        className="absolute top-2 right-2 rounded-full bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title={tr("删除模板", "Delete template")}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <div className="text-white text-xs font-medium text-center">{t.name}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    ) : null}

                    {/* Mode Selection & Input */}
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">{creationMode === "image_transform" ? "1" : "2"}</span>
                            {tr("输入内容", "Input")}
                        </label>

                        {/* Segmented Control */}
                        <div className="bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-lg inline-flex w-full sm:w-auto">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setCreationMode(tab.id as any)}
                                    title={tab.label}
                                    className={`relative flex-1 sm:flex-none px-6 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                                        creationMode === tab.id 
                                            ? "text-zinc-900 dark:text-zinc-100 shadow-sm" 
                                            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    }`}
                                >
                                    {creationMode === tab.id && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-md"
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        <input
                            ref={referenceFileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.zip,.tex,.tgz,.tar.gz,application/pdf,application/zip,application/x-zip-compressed,application/gzip,application/x-gzip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                            className="hidden"
                            onChange={handleReferenceFileInputChange}
                        />

                        <motion.div
                            key={creationMode}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                        >
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                                {creationMode === "beautify" ? <Sparkles className="w-4 h-4 text-blue-600" /> : creationMode === "image_transform" ? <Presentation className="w-4 h-4 text-blue-600" /> : <Lightbulb className="w-4 h-4 text-amber-500" />}
                                <span>{modeCopy.hint}</span>
                            </div>

                            {creationMode === "beautify" ? (
                              <div className="space-y-3">
                                <input
                                  ref={beautifyFileInputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={handleBeautifyFileInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                      {beautifyFile ? beautifyFile.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => beautifyFileInputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 cursor-pointer">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("启用模板美化（可选）", "Use template for beautify (optional)")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {tr("开启后将把当前模板传给美化模型；关闭则仅基于上传的幻灯片美化。", "When enabled, current template is passed to beautify model; otherwise beautify uses only uploaded slides.")}
                                    </div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={beautifyUseTemplate}
                                    onChange={(e) => setBeautifyUseTemplate(e.target.checked)}
                                    className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                  />
                                </label>

                                <textarea
                                  value={beautifyRequirement}
                                  onChange={(e) => setBeautifyRequirement(e.target.value)}
                                  className="w-full h-36 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none outline-none"
                                  placeholder={modeCopy.placeholder}
                                />
                              </div>
                            ) : creationMode === "image_transform" ? (
                              <div className="space-y-3">
                                <input
                                  ref={imageTransformFileInputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={handleImageTransformFileInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                      {imageTransformFile ? imageTransformFile.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => imageTransformFileInputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 leading-6">
                                  <div>{tr("处理结果：", "Output:")}</div>
                                  <div>{tr("第 1 版保留原始上传页图。", "Version 1 keeps the original uploaded slide image.")}</div>
                                  <div>{tr("第 2 版生成无字底图并覆盖可编辑文字层。", "Version 2 generates a textless background and overlays an editable text layer.")}</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="relative">
                                    <textarea 
                                        value={creationMode === "idea" ? ideaInput : outlineInput}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (creationMode === "idea") setIdeaInput(v);
                                            else setOutlineInput(v);
                                        }}
                                        className="w-full h-40 p-4 pb-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none outline-none"
                                        placeholder={modeCopy.placeholder}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => referenceFileInputRef.current?.click()}
                                        disabled={isParsingReferenceFiles}
                                        title={tr("上传参考文件", "Upload reference files")}
                                        className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors disabled:opacity-60"
                                    >
                                        {isParsingReferenceFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {tr("上传文件", "Upload files")}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {tr(
                                          "上传 PDF/Word/LaTeX/TXT作为参考资料（可选）；推荐 Word/LaTeX，图表素材更稳定。",
                                          "Upload PDF/Word/LaTeX/TXT as reference (optional); Word/LaTeX recommended for stable figures."
                                        )}
                                    </div>
                                    {referenceFiles.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setReferenceUploadFiles([])}
                                            title={tr("清空参考文件", "Clear reference files")}
                                            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                            disabled={isParsingReferenceFiles}
                                        >
                                            {tr("清空", "Clear")}
                                        </button>
                                    )}
                                </div>

                                {referenceFiles.length > 0 && (
                                    <div className="grid gap-2">
                                        {referenceFiles.map((f) => (
                                            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openReferencePreview(f)}
                                                    title={tr("预览文件", "Preview file")}
                                                    className="flex items-center gap-2 min-w-0 text-left"
                                                >
                                                    <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                                    <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">{f.filename}</span>
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">({f.charCount} chars)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                                    title={tr("移除文件", "Remove file")}
                                                    onClick={() => {
                                                      const nextFiles = referenceUploadFiles.filter((rf) => rf.name !== f.filename);
                                                      void handleReferenceFileChange(nextFiles);
                                                    }}
                                                >
                                                    {tr("移除", "Remove")}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                              </>
                            )}
                        </motion.div>
                    </div>

                    <Button 
                        onClick={creationMode === "beautify" ? handleStartBeautify : creationMode === "image_transform" ? handleStartImageTransform : creationMode === "idea" ? handleGenerateOutline : handleLoadOutline}
                        disabled={Boolean(progress.message) || (creationMode === "beautify" ? !beautifyFile : creationMode === "image_transform" ? !imageTransformFile || !isImageTransformSourceFile(imageTransformFile) : isParsingReferenceFiles || (creationMode === "idea" ? !ideaInput.trim() : !outlineInput.trim()))}
                        className="w-full py-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {progress.message ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
                        {progress.message || (creationMode === "beautify" ? tr("开始渲染", "Start rendering") : creationMode === "image_transform" ? tr("开始转化", "Start transform") : creationMode === "idea" ? tr("开始生成大纲", "Generate outline") : tr("载入大纲", "Load outline"))}
                    </Button>
                </div>

                <Dialog open={referencePreviewOpen} onOpenChange={setReferencePreviewOpen}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>{referencePreviewFile?.filename || tr("参考文件", "Reference file")}</DialogTitle>
                        </DialogHeader>
                        <Textarea value={referencePreviewFile?.content || ""} readOnly className="min-h-[420px] font-mono text-xs" />
                    </DialogContent>
                </Dialog>

                <Dialog open={templateGeneratorOpen} onOpenChange={setTemplateGeneratorOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{tr("AI生成模板", "AI Template Generator")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {tr("生成的模板会自动加入模板列表，可随时删除。", "Generated templates will be added to the template list automatically and can be deleted anytime.")}
                            </div>
                            <Textarea
                              value={templateGeneratorRequirement}
                              onChange={(e) => setTemplateGeneratorRequirement(e.target.value)}
                              placeholder={tr(
                                "例如：科技感、深色背景、蓝紫渐变、玻璃拟态、留白充足；不要出现任何文字。",
                                "e.g. Futuristic, dark background, blue-purple gradient, glassmorphism, generous whitespace; no text."
                              )}
                              className="min-h-[140px]"
                              disabled={templateGeneratorIsGenerating}
                            />
                            <div className="flex justify-end gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setTemplateGeneratorOpen(false)}
                                  disabled={templateGeneratorIsGenerating}
                                >
                                  {tr("取消", "Cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={handleGenerateTemplate}
                                  disabled={templateGeneratorIsGenerating || !templateGeneratorRequirement.trim()}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {templateGeneratorIsGenerating ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      {tr("生成中...", "Generating...")}
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      {tr("生成并保存", "Generate & Save")}
                                    </>
                                  )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
              </div>
            </div>
        </div>
      );
  }

  // Render Outline Review
  if (creationStep === 'outline') {
      return (
        <div className="w-full h-full bg-zinc-50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-6">
              <div className="w-full min-h-full bg-white dark:bg-zinc-800 rounded-xl shadow-sm flex flex-col overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-lg">{tr("确认大纲", "Review outline")}</h3>
                    <div className="text-sm text-muted-foreground">{tr(`共 ${localSlides.length} 页`, `${localSlides.length} slides`)}</div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {localSlides.length === 0 && (
                      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                        {tr("当前没有大纲，请返回修改后重新生成。", "No outline yet. Go back and regenerate.")}
                      </div>
                    )}
                    {localSlides.map((slide, i) => (
                        <div key={slide.id || i} className="flex gap-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                            <div className="w-8 h-8 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full border text-sm font-medium text-muted-foreground">
                                {i + 1}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <input 
                                      value={slide.title}
                                      onChange={(e) => {
                                          const newSlides = [...localSlides];
                                          newSlides[i].title = e.target.value;
                                          setLocalSlides(newSlides);
                                      }}
                                      className="w-full font-medium bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                                  />
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button variant="outline" size="sm" onClick={() => handleAddOutlineSlide(i)} title={tr("在当前页后新增大纲", "Add outline after current")}>
                                      <Plus className="w-4 h-4 mr-1" />
                                      {tr("新增", "Add")}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteOutlineSlide(slide.id)}
                                      title={tr("删除当前大纲", "Delete current outline")}
                                    >
                                      <Trash2 className="w-4 h-4 mr-1" />
                                      {tr("删除", "Delete")}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleAddSlideToChat(slide)} className="shrink-0">
                                      <MessageSquarePlus className="w-4 h-4 mr-2" />
                                      {tr("加入对话", "Add to chat")}
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs font-medium text-foreground mb-1">{tr("要点内容（content）", "Bullet content (content)")}</div>
                                  <textarea
                                    value={(slide.content || []).join("\n")}
                                    onChange={(e) => {
                                      const lines = String(e.target.value || "")
                                        .split(/\r?\n/)
                                        .map((x) => x.trim())
                                        .filter((x) => x.length > 0);
                                      const newSlides = [...localSlides];
                                      newSlides[i].content = lines;
                                      setLocalSlides(newSlides);
                                    }}
                                    className="w-full h-24 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder={tr("每行一个要点，例如：\n市场现状与挑战\n核心方案与价值\n落地计划与里程碑", "One bullet per line, e.g.:\nMarket status and challenges\nCore solution and value\nExecution plan and milestones")}
                                  />
                                </div>
                                <div className="pt-3 grid gap-3">
                                  <div>
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("布局提示（layout）", "Layout hint (layout)")}</div>
                                    <input
                                      value={slide.layout || ""}
                                      onChange={(e) => {
                                        const newSlides = [...localSlides];
                                        newSlides[i].layout = e.target.value;
                                        setLocalSlides(newSlides);
                                      }}
                                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：cover / title+bullets / two-column / left-text-right-image", "e.g. cover / title+bullets / two-column / left-text-right-image")}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("演讲者备注（note）", "Speaker notes (note)")}</div>
                                    <textarea
                                      value={slide.note || ""}
                                      onChange={(e) => {
                                        const newSlides = [...localSlides];
                                        newSlides[i].note = e.target.value;
                                        setLocalSlides(newSlides);
                                      }}
                                      className="w-full h-20 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：这一页强调三个关键点；讲解时先抛出问题再给答案。", "e.g. Emphasize three key points; start with a question, then answer it.")}
                                    />
                                  </div>
                                  <div className="relative">
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("画面描述（description，用于生图）", "Visual description (description)")}</div>
                                    <div
                                      ref={(el) => {
                                        descriptionEditorRefs.current[slide.id] = el;
                                        if (el) renderDescriptionEditor(slide.id, slide.description || "");
                                      }}
                                      contentEditable
                                      suppressContentEditableWarning
                                      onFocus={() => {
                                        descriptionEditorFocusedRef.current = slide.id;
                                      }}
                                      onBlur={() => {
                                        descriptionEditorFocusedRef.current = null;
                                        const nextValue = parseDescriptionEditor(slide.id);
                                        descriptionEditorAppliedRef.current[slide.id] = nextValue;
                                        const newSlides = [...localSlides];
                                        newSlides[i].description = nextValue;
                                        setLocalSlides(newSlides);
                                      }}
                                      onInput={() => {
                                        const nextValue = parseDescriptionEditor(slide.id);
                                        descriptionEditorAppliedRef.current[slide.id] = nextValue;
                                        const newSlides = [...localSlides];
                                        newSlides[i].description = nextValue;
                                        setLocalSlides(newSlides);
                                      }}
                                      onKeyDown={(e) => {
                                        if (materialPickerSlideId === slide.id && (slideMaterials[slide.id] || []).length > 0) {
                                          const list = slideMaterials[slide.id] || [];
                                          const len = list.length;
                                          if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            setMaterialPickerActiveIndex((prev) => (prev + 1) % len);
                                            return;
                                          }
                                          if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            setMaterialPickerActiveIndex((prev) => (prev - 1 + len) % len);
                                            return;
                                          }
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const idx = Math.max(0, Math.min(materialPickerActiveIndex, len - 1));
                                            const picked = list[idx];
                                            if (picked) {
                                              insertMaterialTokenToSlideDescription(i, slide.id, picked.name);
                                            }
                                            return;
                                          }
                                        }
                                        if (e.key === "Escape") {
                                          setMaterialPickerSlideId(null);
                                          setMaterialPickerPos(null);
                                          setMaterialPickerActiveIndex(0);
                                          materialPickerReplaceRangeRef.current = null;
                                          return;
                                        }
                                        if ((e.key === "Backspace" || e.key === "Delete") && e.currentTarget) {
                                          const root = e.currentTarget;
                                          const sel = window.getSelection();
                                          if (!sel || sel.rangeCount === 0) return;
                                          const r = sel.getRangeAt(0);
                                          if (!root.contains(r.startContainer) || !r.collapsed) return;
                                          const tryRemoveToken = (el: Element | null) => {
                                            if (!el) return false;
                                            const token = (el as HTMLElement).getAttribute("data-material-token");
                                            if (!token) return false;
                                            el.remove();
                                            return true;
                                          };
                                          if (r.startContainer.nodeType === Node.TEXT_NODE) {
                                            const t = r.startContainer as Text;
                                            if (e.key === "Backspace" && r.startOffset === 0) {
                                              const prev = t.previousSibling;
                                              if (prev && prev.nodeType === Node.ELEMENT_NODE && tryRemoveToken(prev as Element)) {
                                                e.preventDefault();
                                              }
                                            }
                                            if (e.key === "Delete" && r.startOffset === t.data.length) {
                                              const next = t.nextSibling;
                                              if (next && next.nodeType === Node.ELEMENT_NODE && tryRemoveToken(next as Element)) {
                                                e.preventDefault();
                                              }
                                            }
                                          }
                                        }
                                      }}
                                      onKeyUp={(e) => {
                                        if ((slideMaterials[slide.id] || []).length === 0) return;
                                        if (e.key === "/" || e.key === "／") {
                                          openMaterialPickerAtCaret(slide.id);
                                        }
                                      }}
                                      className="w-full min-h-[96px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-placeholder={tr("例如：科技感蓝色渐变背景，中间是 AI 芯片与电路纹理，留白清晰。", "e.g. Futuristic blue gradient background, abstract AI chip and circuit textures, clean whitespace.")}
                                    />
                                    {materialPickerSlideId === slide.id && (slideMaterials[slide.id] || []).length > 0 && (
                                      <div
                                        ref={materialPickerRef}
                                        className="absolute z-20 w-56 rounded-md border border-border bg-popover p-2 shadow-sm"
                                        style={{ left: materialPickerPos?.left ?? 8, top: materialPickerPos?.top ?? 8 }}
                                      >
                                        <div className="max-h-56 space-y-1 overflow-y-auto">
                                          {(slideMaterials[slide.id] || []).map((img, idx) => (
                                          <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => insertMaterialTokenToSlideDescription(i, slide.id, img.name)}
                                            onMouseEnter={() => setMaterialPickerActiveIndex(idx)}
                                            title={tr(`插入第 ${idx + 1} 张素材`, `Insert material ${idx + 1}`)}
                                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                                              materialPickerActiveIndex === idx
                                                ? "border-blue-300 bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                                                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                              }`}
                                            >
                                              <img src={img.dataUrl} alt={img.name} className="h-8 w-8 rounded object-cover" />
                                              <span className="truncate">{img.name}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                                      <span>{tr("素材图片（用于该页生图）", "Material images (for this slide)")}</span>
                                      <button
                                        type="button"
                                        onClick={() => slideMaterialInputRefs.current[slide.id]?.click()}
                                        title={tr("上传素材图片", "Upload material images")}
                                        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        {tr("上传", "Upload")}
                                      </button>
                                      <input
                                        ref={(el) => {
                                          slideMaterialInputRefs.current[slide.id] = el;
                                        }}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          const files = Array.from(e.target.files || []);
                                          e.target.value = "";
                                          void addSlideMaterialImages(slide.id, files);
                                        }}
                                      />
                                    </div>
                                    {(slideMaterials[slide.id] || []).length === 0 ? (
                                      <div className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
                                        {tr("暂无素材，上传后可在 description 输入 / 选择变量", "No materials yet. Upload images, then type / in description to insert variables.")}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-3">
                                        {(slideMaterials[slide.id] || []).map((img) => (
                                          <div key={img.id} className="w-20">
                                            <div
                                              className="group relative h-20 w-20 cursor-zoom-in overflow-hidden rounded-md border bg-background"
                                              onClick={() => setMaterialPreview({ open: true, slideTitle: slide.title, item: img })}
                                              title={tr("点击查看素材", "Click to preview material")}
                                            >
                                              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setMaterialPreview({ open: true, slideTitle: slide.title, item: img });
                                                }}
                                                className="absolute bottom-1 left-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/85 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-700"
                                                aria-label={tr("查看素材", "Preview material")}
                                                title={tr("查看", "Preview")}
                                              >
                                                <Eye className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  removeSlideMaterialImage(slide.id, img.id);
                                                }}
                                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-black/80"
                                                aria-label={tr("移除素材", "Remove material")}
                                                title={tr("移除", "Remove")}
                                              >
                                                ×
                                              </button>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setMaterialPreview({ open: true, slideTitle: slide.title, item: img })}
                                              className="mt-1 w-full truncate text-center text-xs text-foreground hover:text-blue-600"
                                              title={tr("点击查看素材", "Click to preview material")}
                                            >
                                              {img.name}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-border bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end gap-3">
                    <Button variant="outline" onClick={handleBackToInputFromOutline}>{tr("返回修改", "Back")}</Button>
                    <Button onClick={handleGenerateFullPpt} className="bg-blue-600 hover:bg-blue-700" disabled={localSlides.length === 0}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {tr("生成完整 PPT", "Generate full deck")}
                    </Button>
                </div>
                <Dialog
                  open={materialPreview.open}
                  onOpenChange={(open) => setMaterialPreview((prev) => ({ ...prev, open }))}
                >
                  <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
                    </DialogHeader>
                    {materialPreview.item && (
                      <div className="space-y-3">
                        <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                          <img
                            src={materialPreview.item.dataUrl}
                            alt={materialPreview.item.name}
                            className="block max-h-full max-w-full object-scale-down"
                          />
                        </div>
                        <div className="grid gap-1 text-xs text-muted-foreground">
                          <div>{tr("所在幻灯片", "Slide")}: {materialPreview.slideTitle || "-"}</div>
                          <div>{tr("素材编号", "Material label")}: {materialPreview.item.name}</div>
                          {materialPreview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materialPreview.item.refLabel}</div> : null}
                          {materialPreview.item.caption ? <div>{tr("简短说明", "Caption")}: {materialPreview.item.caption}</div> : null}
                          {materialPreview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materialPreview.item.sourceFileName}</div> : null}
                          {typeof materialPreview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materialPreview.item.sourcePage}</div> : null}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(materialPreview.item!.dataUrl, "_blank", "noopener,noreferrer")}
                          >
                            {tr("在新窗口查看原图", "Open full image in new tab")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </div>
        </div>
      );
  }

  // Render Progress
  if (creationStep === 'generating_content' || creationStep === 'generating_images') {
      const progressRatio = progress.total > 0 ? progress.current / progress.total : 0;
      const clampedRatio = Math.max(0, Math.min(1, progressRatio));
      const dash = clampedRatio * 251.2;
      const percent = Math.round(clampedRatio * 100);
      return (
        <div className="w-full h-full bg-zinc-50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-md bg-white dark:bg-zinc-800 p-8 rounded-xl shadow-lg text-center space-y-6">
                <div className="relative w-20 h-20 mx-auto">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle className="text-zinc-200 dark:text-zinc-700 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                        <circle className="text-blue-600 stroke-current transition-all duration-300 ease-in-out origin-center -rotate-90" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray={`${dash} 251.2`}></circle>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                        {percent}%
                    </div>
                </div>
                
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg">{tr("AI 正在创作中", "AI is creating")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {progress.message || tr("正在渲染图片…", "Rendering images...")}
                    </p>
                </div>
                
                <div className="flex justify-center gap-2 text-xs text-muted-foreground">
                   <div className={`flex items-center gap-1 ${creationStep === 'generating_images' ? 'text-blue-600' : 'text-green-600'}`}>
                        {creationStep === 'generating_images' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>{tr("渲染图片", "Render images")}</span>
                   </div>
                </div>
              </div>
            </div>
        </div>
      );
  }

  // Regular View (creationStep === 'done' or manually provided data)
  return (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col">
      {/* Toolbar */}
      <div className="h-14 px-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
            <h2 className="font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
            <div className="h-4 w-px bg-border"></div>
            <button
                onClick={handleBackToStart}
                title={tr("返回开始", "Back to start")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回开始", "Back")}</span>
            </button>
            <button
                onClick={openSlideshow}
                disabled={activeSlides.length === 0}
                title={tr("播放幻灯片", "Play slideshow")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <Play className="w-3.5 h-3.5" />
                <span>{tr("播放", "Play")}</span>
            </button>
            <div className="h-4 w-px bg-border"></div>
            <button 
                onClick={handleDownloadPpt}
                disabled={activeSlides.length === 0 || !!isExporting}
                title={tr("导出 PPTX", "Export PPTX")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pptx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pptx" ? tr("导出中…", "Exporting...") : tr("导出 PPTX", "Export PPTX")}</span>
            </button>
            <button 
                onClick={handleDownloadPdf}
                disabled={activeSlides.length === 0 || !!isExporting}
                title={tr("导出 PDF", "Export PDF")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pdf" ? tr("导出中…", "Exporting...") : tr("导出 PDF", "Export PDF")}</span>
            </button>
            {creationMode === "beautify" && (
              <button
                onClick={handleRetryFailedBeautify}
                disabled={failedBeautifyCount === 0 || Boolean(progress.message)}
                title={tr("重试失败页", "Retry failed slides")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tr("重试失败页", "Retry failed")}</span>
                {failedBeautifyCount > 0 ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{failedBeautifyCount}</span> : null}
              </button>
            )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {creationMode === "beautify" && failedBeautifyCount > 0 ? (
              <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                {tr(`失败 ${failedBeautifyCount} 页`, `${failedBeautifyCount} failed`)}
              </span>
            ) : null}
            {creationMode === "image_transform" && failedImageTransformCount > 0 ? (
              <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                {tr(`转化失败 ${failedImageTransformCount} 页`, `${failedImageTransformCount} failed`)}
              </span>
            ) : null}
            <span>{activeSlides.length > 0 ? tr(`第 ${currentSlideIndex + 1} / ${activeSlides.length} 页`, `Slide ${currentSlideIndex + 1} / ${activeSlides.length}`) : tr("空文档", "Empty")}</span>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-64 bg-zinc-50 dark:bg-zinc-900 border-r border-border overflow-y-auto p-4 space-y-4">
          {activeSlides.map((slide, index) => {
            const hasGeneratedImage = getSlideBackgroundUrl(slide.id);
            const hasTextLayer = (getSlideRenderLayer(slide.id)?.textBlocks || []).length > 0;
            const slideFailure = creationMode === "image_transform" ? imageTransformFailures[slide.id] : beautifyFailures[slide.id];
            return (
            <ContextMenu key={slide.id || index}>
                <ContextMenuTrigger asChild>
                    <div 
                    onClick={() => setCurrentSlideIndex(index)}
                    className={`cursor-pointer border-2 rounded-lg overflow-hidden relative aspect-[16/9] group transition-all duration-200 ${
                        currentSlideIndex === index 
                        ? 'border-blue-600 shadow-md scale-[1.02]' 
                        : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm'
                    }`}
                    >
                    {creationMode !== "image_transform" ? (
                      <div
                        className="absolute top-1 left-1 z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[10px] gap-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAddSlideToChat(slide)}
                        >
                          <Presentation className="w-3 h-3" />
                          {tr("加入对话", "Add to chat")}
                        </Button>
                      </div>
                    ) : null}
                    {/* Thumbnail Preview */}
                    {hasGeneratedImage ? (
                        renderScaledSlideScene(slide, false, 240, 135)
                    ) : (
                        <div className="w-full h-full p-2 flex flex-col bg-white overflow-hidden text-[6px]">
                            {templateImage && (
                                <img src={templateImage} className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" alt="" />
                            )}
                            <div className="font-bold mb-1 truncate z-10 relative">{slide.title}</div>
                            <div className="flex-1 space-y-0.5 z-10 relative">
                                {(slide.content || []).slice(0, 3).map((line, i) => (
                                    <div key={i} className="truncate text-zinc-500">• {line}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 rounded-sm backdrop-blur-sm">
                        {index + 1}
                    </div>
                    {slideFailure ? (
                      <div
                        className="absolute top-1 right-1 bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-sm max-w-[85%] truncate"
                        title={slideFailure}
                      >
                        {creationMode === "image_transform" ? tr("转化失败", "Transform failed") : tr("美化失败", "Beautify failed")}
                      </div>
                    ) : null}
                    </div>
                </ContextMenuTrigger>
                {creationMode !== "image_transform" ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleAddSlideToChat(slide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>{tr("把此页添加到对话", "Add this slide to chat")}</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          )})}
          
          {activeSlides.length === 0 && (
             <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                    <Presentation className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {uiLang === "zh" ? "在右侧对话框中输入需求" : "Describe your needs in the chat on the right"}
                  <br />
                  {uiLang === "zh" ? "让 AI 为您生成 PPT" : "Let AI generate your PPT"}
                </p>
             </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 p-4 flex items-center justify-center bg-zinc-200/50 dark:bg-zinc-950/50 overflow-auto relative">
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-white/80 dark:bg-zinc-900/70 backdrop-blur rounded-xl border border-border/50 px-3 py-2 shadow-sm">
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleGenerateAiImage}
              disabled={!currentSlide || isGeneratingImage}
            >
              {isGeneratingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {tr("重新渲染本页", "Regenerate this slide")}
            </Button>
            {currentSlide && getVisibleSlideVersions(currentSlide.id).length > 0 && (
              <select
                className="h-7 text-xs rounded-md border border-input bg-background px-2"
                value={
                  (() => {
                    const visibleVersions = getVisibleSlideVersions(currentSlide.id);
                    const currentVersionId = currentImageVersionId[currentSlide.id];
                    return visibleVersions.some((item) => item.id === currentVersionId)
                      ? currentVersionId
                      : visibleVersions[visibleVersions.length - 1]?.id || "";
                  })()
                }
                onChange={(e) => {
                  const slideId = currentSlide.id;
                  const versionId = e.target.value;
                  const versions = getVisibleSlideVersions(slideId);
                  const v = versions.find(x => x.id === versionId);
                  if (v) {
                    setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
                    setGeneratedImages(prev => ({ ...prev, [slideId]: v.url }));
                  }
                }}
              >
                {getVisibleSlideVersions(currentSlide.id).map((v, idx) => (
                  <option key={v.id} value={v.id}>
                    {formatImageVersionLabel(v, idx)} · {new Date(v.timestamp).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>
          {currentSlideFailure ? (
            <div className="absolute top-16 left-4 z-30 max-w-[520px] rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-xs text-red-700 shadow-sm">
              <span className="font-medium mr-1">{creationMode === "image_transform" ? tr("本页转化失败：", "Slide transform failed:") : tr("本页美化失败：", "Slide beautify failed:")}</span>
              <span>{currentSlideFailure}</span>
            </div>
          ) : null}
          {currentSlide ? (
             <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div 
                        ref={previewCanvasRef}
                        className="relative w-full max-w-[1100px] bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col transition-transform duration-300 outline-none"
                        style={{ aspectRatio: "16/9" }}
                    >
                        {/* Display either generated image or DOM layout */}
                        {currentSlideImage ? (
                            renderScaledSlideScene(currentSlide, true, previewCanvasSize.width, previewCanvasSize.height)
                        ) : (
                            <div className="w-full h-full p-12 flex flex-col relative">
                                {/* Background Template */}
                                {templateImage && (
                                    <img src={templateImage} className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" alt="Template" />
                                )}

                                {/* Slide Content */}
                                <div className="relative z-10 h-full flex flex-col">
                                    <h1 className="text-4xl font-bold mb-8 text-zinc-900 border-b-4 border-blue-600 pb-4 w-fit pr-12">
                                        {currentSlide.title}
                                    </h1>
                                    <div className="flex-1 space-y-6">
                                        {(currentSlide.content || []).map((point, i) => (
                                            <div key={i} className="flex gap-4 text-2xl text-zinc-700 leading-relaxed items-start">
                                                <span className="text-blue-600 mt-2">•</span>
                                                <span>{point}</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Footer/Note Placeholder */}
                                    <div className="mt-auto pt-8 flex justify-between text-sm text-zinc-400 border-t border-zinc-100">
                                        <span>Generated by Unified AI Workspace</span>
                                        <span>{currentSlideIndex + 1}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Overlay Label if Generated */}
                        {(isApplyingEdits || isGeneratingImage) && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
                                <div className="flex flex-col items-center gap-3 bg-white shadow-xl px-6 py-4 rounded-xl border border-blue-100">
                                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                                    <span className="text-sm font-medium text-zinc-700">{tr("幻灯片正在生成中...", "Generating slides...")}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </ContextMenuTrigger>
                {creationMode !== "image_transform" ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleAddSlideToChat(currentSlide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>把此页添加到对话</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>{tr("暂无幻灯片", "No slides yet")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={slideshowOpen} onOpenChange={(open) => (open ? setSlideshowOpen(true) : closeSlideshow())}>
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-black/95 border-none">
          <div ref={slideshowRootRef} className="w-full h-full flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between text-white/90 bg-black/50 backdrop-blur-sm z-50">
            <div className="text-sm font-medium">
              {activeSlides.length > 0 ? `${uiLang === "zh" ? "第" : "Slide "}${slideshowIndex + 1} / ${activeSlides.length}${uiLang === "zh" ? " 页" : ""}` : ""}
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                title={slideshowFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("进入全屏", "Enter fullscreen")}
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={() => {
                  if (slideshowFullscreen) {
                    void exitSlideshowFullscreen();
                  } else {
                    void enterSlideshowFullscreen();
                  }
                }}
              >
                {slideshowFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {slideshowFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("全屏", "Fullscreen")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={closeSlideshow}
              >
                <X className="w-4 h-4" />
                {tr("退出", "Close")}
              </Button>
            </div>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden bg-black/90">
            {activeSlides[slideshowIndex] ? (
              (() => {
                const slideDims = getSlideshowDimensions();
                const slideWidth = typeof slideDims.width === "number" ? slideDims.width : 1100;
                const slideHeight = typeof slideDims.height === "number" ? slideDims.height : 619;
                return (
              <div className="relative w-full h-full flex items-center justify-center">
                  <div 
                    className="relative bg-white shadow-2xl overflow-hidden rounded-lg mx-auto"
                    style={{
                      width: slideDims.width,
                      height: slideDims.height
                    }}
                  >
                  {getSlideBackgroundUrl(activeSlides[slideshowIndex].id) ? (
                    renderScaledSlideScene(activeSlides[slideshowIndex], false, slideWidth, slideHeight)
                  ) : (
                    <div className="w-full h-full p-16 flex flex-col">
                      <h1 className="text-5xl font-bold mb-12 text-zinc-900 border-b-4 border-blue-600 pb-6 w-fit pr-16">
                        {activeSlides[slideshowIndex].title}
                      </h1>
                      <div className="flex-1 space-y-8">
                        {(activeSlides[slideshowIndex].content || []).map((point, i) => (
                          <div key={i} className="flex gap-6 text-3xl text-zinc-700 leading-relaxed items-start">
                            <span className="text-blue-600 mt-2">•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-8 flex justify-between text-lg text-zinc-400 border-t border-zinc-100">
                        <span>Generated by Unified AI Workspace</span>
                        <span>{slideshowIndex + 1}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                );
              })()
            ) : null}
          </div>

          <div className="h-20 px-4 flex items-center justify-center gap-8 pb-4">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={() => setSlideshowIndex((v) => (v - 1 + activeSlides.length) % activeSlides.length)}
              disabled={activeSlides.length <= 1}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="text-white/50 text-sm font-medium">
                {slideshowIndex + 1} / {activeSlides.length}
            </div>
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={() => setSlideshowIndex((v) => (v + 1) % activeSlides.length)}
              disabled={activeSlides.length <= 1}
            >
              <ArrowRight className="w-6 h-6" />
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={backConfirmOpen} onOpenChange={setBackConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("确认返回开始", "Confirm restart")}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {tr(
              "返回开始将清空当前 PPT（建议先导出保存）。是否继续？",
              "Restart will clear the current deck (export first if needed). Continue?"
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackConfirmOpen(false)}>
              {tr("取消", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBackConfirmOpen(false);
                resetToStart();
              }}
            >
              {tr("确认返回", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={materialPreview.open}
        onOpenChange={(open) => setMaterialPreview((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
          </DialogHeader>
          {materialPreview.item && (
            <div className="space-y-3">
              <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                <img
                  src={materialPreview.item.dataUrl}
                  alt={materialPreview.item.name}
                  className="block max-h-full max-w-full object-scale-down"
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>{tr("所在幻灯片", "Slide")}: {materialPreview.slideTitle || "-"}</div>
                <div>{tr("素材编号", "Material label")}: {materialPreview.item.name}</div>
                {materialPreview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materialPreview.item.refLabel}</div> : null}
                {materialPreview.item.caption ? <div>{tr("简短说明", "Caption")}: {materialPreview.item.caption}</div> : null}
                {materialPreview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materialPreview.item.sourceFileName}</div> : null}
                {typeof materialPreview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materialPreview.item.sourcePage}</div> : null}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(materialPreview.item!.dataUrl, "_blank", "noopener,noreferrer")}
                >
                  {tr("在新窗口查看原图", "Open full image in new tab")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


