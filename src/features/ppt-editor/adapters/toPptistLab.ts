import type { PptPage, PptTextBlock } from "@/lib/ppt-service";

export const PPTIST_BOOTSTRAP_STORAGE_KEY = "canvasanvil-pptist-bootstrap";

export interface PptistLabTextElement {
  id: string;
  type: "text";
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  content: string;
  defaultFontName: string;
  defaultColor: string;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  wordSpace?: number;
  opacity?: number;
  paragraphSpace?: number;
  vertical?: boolean;
  textType?: "title" | "subtitle" | "content" | "item" | "itemTitle" | "notes" | "header" | "footer" | "partNumber" | "itemNumber";
}

export interface PptistLabImageElement {
  id: string;
  type: "image";
  left: number;
  top: number;
  width: number;
  height: number;
  rotate: number;
  fixedRatio: boolean;
  src: string;
  lock?: boolean;
  imageType?: "background";
}

export interface PptistLabSlide {
  id: string;
  elements: Array<PptistLabTextElement | PptistLabImageElement>;
}

export interface PptistLabBootstrapPayload {
  source: "canvasanvil";
  version: 1;
  createdAt: string;
  slides: PptistLabSlide[];
}

export const CANVASANVIL_PPTIST_MESSAGE_TYPE = "canvasanvil:pptist-bootstrap";

const clamp01 = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
};

const normalizeDimension = (value: number, fallback: number) => {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(1, value);
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const preserveHtmlSpaces = (value: string) => value.replace(/ /g, "&nbsp;");

const escapeStyleValue = (value: string) => String(value || "").replace(/["<>]/g, "");

const buildSpanStyle = (block: PptTextBlock) => {
  const style = block.style || {};
  const declarations: string[] = [];
  if (style.fontSize) declarations.push(`font-size:${Math.max(8, Number(style.fontSize))}px`);
  if (style.fontFamily) declarations.push(`font-family:${escapeStyleValue(style.fontFamily)}`);
  if (style.color) declarations.push(`color:${escapeStyleValue(style.color)}`);
  if (style.fontWeight) declarations.push(`font-weight:${Number(style.fontWeight)}`);
  if (style.letterSpacing) declarations.push(`letter-spacing:${Number(style.letterSpacing)}px`);
  return declarations.join(";");
};

const buildParagraphStyle = (block: PptTextBlock) => {
  const style = block.style || {};
  const declarations: string[] = [];
  if (style.align) declarations.push(`text-align:${escapeStyleValue(style.align)}`);
  if (style.lineHeight) declarations.push(`line-height:${Number(style.lineHeight)}`);
  declarations.push("margin:0");
  return declarations.join(";");
};

const textToPptistContent = (block: PptTextBlock) => {
  const normalized = String(block.text || "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length === 0) return "<p></p>";
  const paragraphStyle = buildParagraphStyle(block);
  const spanStyle = buildSpanStyle(block);
  return lines
    .map((line) => `<p style="${paragraphStyle}"><span style="${spanStyle}">${preserveHtmlSpaces(escapeHtml(line))}</span></p>`)
    .join("");
};

const textRoleToType = (role: PptTextBlock["role"]) => {
  if (role === "title") return "title" as const;
  if (role === "summary") return "subtitle" as const;
  if (role === "bullet") return "content" as const;
  return "itemTitle" as const;
};

const normalizeTextAlign = (align?: string): "left" | "center" | "right" | "justify" => {
  if (align === "center" || align === "right" || align === "justify") return align;
  return "left";
};

const textBlockToElement = (block: PptTextBlock): PptistLabTextElement => ({
  id: block.id,
  type: "text",
  left: clamp01(block.x),
  top: clamp01(block.y),
  width: normalizeDimension(block.w, 0.2),
  height: normalizeDimension(block.h, 0.08),
  rotate: 0,
  content: textToPptistContent(block),
  defaultFontName: block.style?.fontFamily || "Microsoft YaHei",
  defaultColor: block.style?.color || "#111111",
  fontWeight: Number(block.style?.fontWeight || 400),
  textAlign: normalizeTextAlign(block.style?.align),
  lineHeight: block.style?.lineHeight || 1.3,
  wordSpace: block.style?.letterSpacing || 0,
  opacity: 1,
  paragraphSpace: 0,
  vertical: false,
  textType: textRoleToType(block.role),
});

const backgroundToElement = (slideId: string, backgroundImageUrl: string): PptistLabImageElement => ({
  id: `${slideId}__background`,
  type: "image",
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  rotate: 0,
  fixedRatio: false,
  src: backgroundImageUrl,
  lock: true,
  imageType: "background",
});

export const pptPageToPptistSlide = (page: PptPage, index: number): PptistLabSlide => {
  const slideId = page.id || `canvasanvil-slide-${index + 1}`;
  const elements: Array<PptistLabTextElement | PptistLabImageElement> = [];

  if (page.backgroundImageUrl) {
    elements.push(backgroundToElement(slideId, page.backgroundImageUrl));
  }

  const textBlocks = Array.isArray(page.textBlocks) ? page.textBlocks : [];
  for (const block of textBlocks) {
    elements.push(textBlockToElement(block));
  }

  return {
    id: slideId,
    elements,
  };
};

export const buildPptistBootstrapPayload = (pages: PptPage[]): PptistLabBootstrapPayload => ({
  source: "canvasanvil",
  version: 1,
  createdAt: new Date().toISOString(),
  slides: pages.map((page, index) => pptPageToPptistSlide(page, index)),
});

export const persistPptistBootstrapPayload = (payload: PptistLabBootstrapPayload) => {
  window.localStorage.setItem(PPTIST_BOOTSTRAP_STORAGE_KEY, JSON.stringify(payload));
};

export const readPptistBootstrapPayload = (): PptistLabBootstrapPayload | null => {
  const raw = window.localStorage.getItem(PPTIST_BOOTSTRAP_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PptistLabBootstrapPayload;
    if (!parsed || parsed.source !== "canvasanvil" || !Array.isArray(parsed.slides)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearPptistBootstrapPayload = () => {
  window.localStorage.removeItem(PPTIST_BOOTSTRAP_STORAGE_KEY);
};
