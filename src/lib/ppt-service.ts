import PptxGenJS from "pptxgenjs"
import { PDFDocument, rgb } from "pdf-lib"
import { generateChatMessage, generateImage, generateVisionChatMessage } from "./ai-client"
import { buildRisenPrompt } from "./risen-prompt"
import pptOutlineSystem from "../../agent/ppt/outline.md?raw"
import pptSlidesGenerateSystem from "../../agent/ppt/slides-generate.md?raw"

export interface PptPage {
    title: string;
    content: string[];
    description?: string;
    note?: string;
    layout?: string;
    materialLabels?: string[];
    textBlocks?: PptTextBlock[];
    elements?: PptElement[];
    backgroundImageUrl?: string;
    status?: string;
    id?: string;
}

export interface PptTextStyle {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    fontStyle?: "normal" | "italic";
    color?: string;
    gradientFrom?: string;
    gradientTo?: string;
    strokeColor?: string;
    strokeWidth?: number;
    align?: "left" | "center" | "right";
    lineHeight?: number;
    letterSpacing?: number;
}

export interface PptTextBlock {
    id: string;
    role: "title" | "bullet" | "summary" | "tag";
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    style?: PptTextStyle;
}

export interface PptElementBase {
    id: string;
    type: "text" | "image" | "shape" | "table" | "chart" | "formula" | "video" | "audio";
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PptTextElement extends PptElementBase {
    type: "text";
    text: string;
    role: PptTextBlock["role"];
    style?: PptTextStyle;
}

export interface PptImageElement extends PptElementBase {
    type: "image";
    src: string;
    fit?: "cover" | "contain" | "stretch";
}

export interface PptShapeElement extends PptElementBase {
    type: "shape";
    shape: "rect" | "roundRect" | "triangle" | "parallelogram" | "trapezoid" | "hexagon" | "chevron" | "message" | "line";
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
}

export interface PptTableElement extends PptElementBase {
    type: "table";
    rows: string[][];
    headerRows?: number;
    fill?: string;
    stroke?: string;
    textColor?: string;
}

export interface PptChartDatum {
    label: string;
    value: number;
}

export interface PptChartElement extends PptElementBase {
    type: "chart";
    chartType: "bar" | "column" | "line" | "area" | "scatter" | "pie" | "ring" | "radar";
    title?: string;
    data: PptChartDatum[];
    color?: string;
}

export interface PptFormulaElement extends PptElementBase {
    type: "formula";
    latex: string;
    fontSize?: number;
    color?: string;
}

export interface PptVideoElement extends PptElementBase {
    type: "video";
    src: string;
    poster?: string;
    title?: string;
}

export interface PptAudioElement extends PptElementBase {
    type: "audio";
    src: string;
    title?: string;
}

export type PptElement =
    | PptTextElement
    | PptImageElement
    | PptShapeElement
    | PptTableElement
    | PptChartElement
    | PptFormulaElement
    | PptVideoElement
    | PptAudioElement;

export const resolveTextBlockFontSize = (
    block: PptTextBlock,
    canvasWidth: number,
    canvasHeight: number,
): number => {
    const hinted = Number(block.style?.fontSize || 0);
    if (Number.isFinite(hinted) && hinted > 0) return hinted;
    return estimateTextBlockFontSize(block, canvasWidth, canvasHeight);
};

export const textBlocksToPptElements = (textBlocks: PptTextBlock[] = []): PptElement[] =>
    textBlocks.map((block) => ({
        id: block.id,
        type: "text",
        text: block.text,
        role: block.role,
        x: block.x,
        y: block.y,
        w: block.w,
        h: block.h,
        style: {
            ...(block.style || {}),
            fontSize: resolveTextBlockFontSize(block, PPT_REFERENCE_SLIDE_WIDTH, PPT_REFERENCE_SLIDE_HEIGHT),
        },
    }));

export const pptElementsToTextBlocks = (elements: PptElement[] = []): PptTextBlock[] =>
    elements
        .filter((element): element is PptTextElement => element?.type === "text")
        .map((element) => ({
            id: element.id,
            role: element.role,
            text: element.text,
            x: element.x,
            y: element.y,
            w: element.w,
            h: element.h,
            style: element.style,
        }));

export const PPT_REFERENCE_SLIDE_WIDTH = 1600;
export const PPT_REFERENCE_SLIDE_HEIGHT = 900;

const countVisualLineUnits = (text: string) => {
    const line = String(text || "");
    let units = 0;
    for (const ch of line) {
        if (/\s/.test(ch)) {
            units += 0.35;
        } else if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch)) {
            units += 1;
        } else if (/[A-Z]/.test(ch)) {
            units += 0.72;
        } else if (/[a-z]/.test(ch)) {
            units += 0.58;
        } else if (/[0-9]/.test(ch)) {
            units += 0.56;
        } else {
            units += 0.62;
        }
    }
    return Math.max(units, 1);
};

export const estimateTextBlockFontSize = (
    block: PptTextBlock,
    canvasWidth: number,
    canvasHeight: number,
): number => {
    const style = block.style || {};
    const rawText = String(block.text || "");
    const isSingleLine = !rawText.includes("\n");
    const isPanelHeading =
        block.role === "bullet" &&
        isSingleLine &&
        rawText.trim().length <= 24 &&
        block.h <= 0.14;
    const lineHeightRatio = Number(
        style.lineHeight || (block.role === "title" ? 1.12 : block.role === "tag" ? 1.05 : isPanelHeading ? 1.18 : 1.35)
    );
    const paddingX = block.role === "title" ? 18 : block.role === "tag" ? 16 : isPanelHeading ? 16 : 24;
    const paddingY = block.role === "title" ? 12 : block.role === "tag" ? 10 : isPanelHeading ? 12 : 16;
    const availableWidth = Math.max(24, block.w * canvasWidth - paddingX);
    const availableHeight = Math.max(18, block.h * canvasHeight - paddingY);
    const lines = rawText.split(/\r?\n/).filter(Boolean);
    const lineCount = Math.max(lines.length, 1);
    const longestLineUnits = lines.length > 0
        ? Math.max(...lines.map((line) => countVisualLineUnits(line)))
        : countVisualLineUnits(rawText);
    const sizeByHeight = availableHeight / (lineCount * lineHeightRatio);
    const widthFactor =
        block.role === "title" ? 0.9 :
        block.role === "tag" ? 1.1 :
        isPanelHeading ? 1.06 :
        1.72;
    const sizeByWidth = availableWidth / (longestLineUnits * widthFactor);
    const baseFitted = Math.max(10, Math.min(sizeByHeight, sizeByWidth));
    const boosted =
        block.role === "title"
            ? Math.max(baseFitted, sizeByHeight * 0.78)
            : isPanelHeading
              ? Math.max(baseFitted, sizeByHeight * 0.54)
              : block.role === "tag"
                ? Math.max(baseFitted, sizeByHeight * 0.62)
                : baseFitted;
    const fitted = Math.max(10, boosted);
    const hinted = Number(style.fontSize || 0);
    if (!Number.isFinite(hinted) || hinted <= 0) {
        return Math.round(fitted);
    }
    const deltaRatio = Math.abs(hinted - fitted) / Math.max(fitted, 1);
    if (deltaRatio <= 0.18) return Math.round(hinted);
    const hintedWeight =
        block.role === "title" ? 0.34 :
        isPanelHeading ? 0.28 :
        block.role === "tag" ? 0.24 :
        0.18;
    return Math.round(fitted * (1 - hintedWeight) + hinted * hintedWeight);
};

export interface SlideEditRoutingItem {
    slideId: string;
    editType: "text_only" | "text_relayout" | "background_redraw";
    instruction: string;
    materialImageUrls?: string[];
    styleRefSlideIds?: string[];
    styleRefPolicy?: "style_only" | "style_and_layout";
    styleRefImageUrls?: string[];
}

const normalizeLayoutByLanguage = (layout: string, uiLanguage: "zh" | "en") => {
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
    };
    const hit = map[key];
    if (!hit) return raw;
    return uiLanguage === "zh" ? hit.zh : hit.en;
};

const normalizeSpeakerNote = (note: string, uiLanguage: "zh" | "en") => {
    const raw = String(note || "").trim();
    if (!raw) return raw;
    return raw
        .replace(/^[\s\-*•\d.]+/gm, "")
        .replace(/\n{2,}/g, "\n")
        .replace(/\n/g, uiLanguage === "zh" ? "，" : ", ")
        .replace(/\s{2,}/g, " ")
        .trim();
};

type ReferenceFileInput = { filename: string; content: string };
type ReferenceImageAssetInput = { label: string; caption: string; sourceFile: string; sourcePage?: number };

const PPT_OUTLINE_SYSTEM = String(pptOutlineSystem || "").trim() || buildRisenPrompt({
    role: "You are a PPT planning agent.",
    instructions: "Generate PPT plan JSON only.",
    input: "One idea prompt or one outline prompt, plus UI language and optional references.",
    steps: "1. Understand the planning mode.\n2. Build the slide sequence.\n3. Return complete slide plan JSON only.",
    endGoal: "Produce a machine-readable PPT plan for rendering.",
    narrowing: "1. No markdown wrapper.\n2. No extra explanation.\n3. JSON only.",
});

const PPT_SLIDES_GENERATE_SYSTEM = String(pptSlidesGenerateSystem || "").trim() || buildRisenPrompt({
    role: "You are a PPT slide refinement agent.",
    instructions: "Refine one or more slide records and return JSON only.",
    input: "Current slide JSON, topic context, language, and optional references.",
    steps: "1. Improve slide text and description.\n2. Keep ids stable.\n3. Return JSON only.",
    endGoal: "Produce render-ready slide JSON.",
    narrowing: "1. No markdown wrapper unless the caller explicitly allows it.\n2. No extra commentary.",
});

const PPT_TEXT_EXTRACTION_SYSTEM = buildRisenPrompt({
    role: "You extract editable slide-layer text from a rendered PPT slide.",
    instructions: "Return JSON only.",
    input: "One full rendered slide image plus expected slide text candidates.",
    steps: "1. Find only slide-layer text and ignore text inside material images.\n2. Determine geometry first: text, role, x, y, w, h relative to the full slide.\n3. Then estimate style: fontSize relative to the full slide, fontWeight, color, align, lineHeight, optional gradient and stroke.",
    endGoal: "Produce one machine-readable textBlocks array for editable slide text.",
    narrowing: "1. JSON only.\n2. Ignore text inside embedded material images.\n3. Keep coordinates relative to the full slide.",
});

const PPT_TEXT_REVIEW_SYSTEM = buildRisenPrompt({
    role: "You review a composed slide text layer against the original rendered slide.",
    instructions: "Return JSON only.",
    input: "Image 1: original rendered slide. Image 2: textless background plus current text layer composite. Current textBlocks JSON.",
    steps: "1. Compare image 2 against image 1 only for slide-layer text.\n2. Check missing text, wrong position, wrong relative size, and obvious style mismatch.\n3. Return one corrected full textBlocks array.",
    endGoal: "Produce a corrected textBlocks array that matches the original slide-layer text closely.",
    narrowing: "1. JSON only.\n2. Review only slide-layer text.\n3. Ignore text inside material images.",
});

const clamp01 = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
};

const normalizeTextAlign = (value: unknown): "left" | "center" | "right" => {
    if (value === "center" || value === "right") return value;
    return "left";
};

const normalizeTextBlocks = (value: any): PptTextBlock[] => {
    const asArray = Array.isArray(value) ? value : Array.isArray(value?.textBlocks) ? value.textBlocks : null;
    if (!asArray) return [];
    return asArray
        .map((item: any, idx: number) => {
            const text = typeof item?.text === "string" ? item.text.trim() : "";
            if (!text) return null;
            const role: PptTextBlock["role"] =
                item?.role === "title" || item?.role === "bullet" || item?.role === "summary" || item?.role === "tag"
                    ? item.role
                    : text.length <= 12 && Number(item?.w || 0) <= 0.2 && Number(item?.h || 0) <= 0.09
                      ? "tag"
                    : idx === 0
                      ? "title"
                      : "bullet";
            const style = item?.style && typeof item.style === "object"
                ? {
                    fontFamily: typeof item.style.fontFamily === "string" ? item.style.fontFamily : undefined,
                    fontSize: typeof item.style.fontSize === "number" && Number.isFinite(item.style.fontSize) ? item.style.fontSize : undefined,
                    fontWeight: typeof item.style.fontWeight === "number" && Number.isFinite(item.style.fontWeight) ? item.style.fontWeight : undefined,
                    fontStyle: item.style.fontStyle === "italic" ? "italic" : "normal",
                    color: typeof item.style.color === "string" ? item.style.color : undefined,
                    gradientFrom: typeof item.style.gradientFrom === "string" ? item.style.gradientFrom : undefined,
                    gradientTo: typeof item.style.gradientTo === "string" ? item.style.gradientTo : undefined,
                    strokeColor: typeof item.style.strokeColor === "string" ? item.style.strokeColor : undefined,
                    strokeWidth: typeof item.style.strokeWidth === "number" && Number.isFinite(item.style.strokeWidth) ? item.style.strokeWidth : undefined,
                    align: normalizeTextAlign(item.style.align),
                    lineHeight: typeof item.style.lineHeight === "number" && Number.isFinite(item.style.lineHeight) ? item.style.lineHeight : undefined,
                    letterSpacing: typeof item.style.letterSpacing === "number" && Number.isFinite(item.style.letterSpacing) ? item.style.letterSpacing : undefined,
                } satisfies PptTextStyle
                : undefined;
            return {
                id: typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `text-block-${idx + 1}`,
                role,
                text,
                x: clamp01(Number(item?.x)),
                y: clamp01(Number(item?.y)),
                w: clamp01(Number(item?.w || 0.1)),
                h: clamp01(Number(item?.h || 0.05)),
                style,
            } satisfies PptTextBlock;
        })
        .filter(Boolean) as PptTextBlock[];
};

const parseColorToRgb = (value?: string) => {
    const raw = String(value || "").trim();
    if (!raw) return rgb(0.07, 0.09, 0.13);
    const hex = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return rgb(r, g, b);
    }
    const rgbMatch = raw.match(/rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (rgbMatch) {
        return rgb(
            Math.max(0, Math.min(255, Number(rgbMatch[1]))) / 255,
            Math.max(0, Math.min(255, Number(rgbMatch[2]))) / 255,
            Math.max(0, Math.min(255, Number(rgbMatch[3]))) / 255,
        );
    }
    return rgb(0.07, 0.09, 0.13);
};

const toHexColor = (value?: string, fallback = "111827") => {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    const hex = raw.replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
    const rgbMatch = raw.match(/rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/i);
    if (rgbMatch) {
        const r = Math.max(0, Math.min(255, Number(rgbMatch[1]))).toString(16).padStart(2, "0");
        const g = Math.max(0, Math.min(255, Number(rgbMatch[2]))).toString(16).padStart(2, "0");
        const b = Math.max(0, Math.min(255, Number(rgbMatch[3]))).toString(16).padStart(2, "0");
        return `${r}${g}${b}`.toUpperCase();
    }
    return fallback;
};

const renderChartSvgDataUri = (element: PptChartElement, width = 600, height = 360) => {
    const data = Array.isArray(element.data) && element.data.length > 0
        ? element.data
        : [{ label: "Q1", value: 42 }, { label: "Q2", value: 76 }, { label: "Q3", value: 58 }];
    const maxValue = Math.max(...data.map((item) => Math.max(0, Number(item.value || 0))), 1);
    const color = element.color || "#2563eb";
    const paletteColor = (index: number) => {
        if (index === 0) return color;
        const palette = ["#06B6D4", "#8B5CF6", "#F59E0B", "#22C55E", "#EF4444", "#3B82F6"];
        return palette[(index - 1) % palette.length];
    };
    const points = data.map((item, index) => {
        const ratio = Math.max(0, Number(item.value || 0)) / maxValue;
        const x = data.length === 1 ? width / 2 : 64 + (index / Math.max(data.length - 1, 1)) * (width - 148);
        const y = height - 68 - ratio * (height - 148);
        return { item, index, ratio, x, y, fill: paletteColor(index) };
    });
    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
    const areaPath = `${linePath} L ${width - 42} ${height - 54} L 48 ${height - 54} Z`;
    const slices = data.reduce<{ start: number; item: PptChartDatum; index: number }[]>((acc, item, index) => {
        const previous = acc[acc.length - 1];
        const start = previous ? previous.start + Math.max(0, Number(previous.item.value || 0)) : 0;
        acc.push({ start, item, index });
        return acc;
    }, []);
    const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0) || 1;
    const piePaths = (element.chartType === "pie" || element.chartType === "ring")
        ? slices.map(({ start, item, index }) => {
            const begin = (start / total) * Math.PI * 2 - Math.PI / 2;
            const end = ((start + Math.max(0, Number(item.value || 0))) / total) * Math.PI * 2 - Math.PI / 2;
            const radius = Math.min(width, height) * 0.26;
            const cx = width / 2;
            const cy = height / 2 + 6;
            const x1 = cx + Math.cos(begin) * radius;
            const y1 = cy + Math.sin(begin) * radius;
            const x2 = cx + Math.cos(end) * radius;
            const y2 = cy + Math.sin(end) * radius;
            const largeArc = end - begin > Math.PI ? 1 : 0;
            const fill = paletteColor(index);
            return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z" fill="${fill}" opacity="0.92" />`;
        }).join("")
        : "";
    const ringMask = element.chartType === "ring"
        ? `<circle cx="${width / 2}" cy="${height / 2 + 6}" r="${Math.min(width, height) * 0.13}" fill="#ffffff" />`
        : "";
    const radarCenterX = width / 2;
    const radarCenterY = height / 2 + 4;
    const radarRadius = Math.min(width, height) * 0.2;
    const radarAxes = data.map((_, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
        return {
            x: radarCenterX + Math.cos(angle) * radarRadius,
            y: radarCenterY + Math.sin(angle) * radarRadius,
            labelX: radarCenterX + Math.cos(angle) * (radarRadius + 24),
            labelY: radarCenterY + Math.sin(angle) * (radarRadius + 24),
        };
    });
    const radarGrid = [1, 0.75, 0.5, 0.25].map((ratio) =>
        `<polygon points="${data.map((_, index) => {
            const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
            return `${radarCenterX + Math.cos(angle) * radarRadius * ratio},${radarCenterY + Math.sin(angle) * radarRadius * ratio}`;
        }).join(" ")}" fill="none" stroke="#E2E8F0" stroke-width="1" />`
    ).join("");
    const radarPolygon = points.map((point, index) => {
        const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
        return `${radarCenterX + Math.cos(angle) * radarRadius * point.ratio},${radarCenterY + Math.sin(angle) * radarRadius * point.ratio}`;
    }).join(" ");
    const chartBadge = `<g><rect x="${width - 122}" y="20" width="92" height="28" rx="14" fill="#F8FAFC" stroke="#E2E8F0" /><text x="${width - 76}" y="38" font-size="12" font-family="Arial" text-anchor="middle" fill="#64748B">${String(element.chartType).toUpperCase()}</text></g>`;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <rect width="${width}" height="${height}" rx="28" fill="#ffffff" />
            <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="28" fill="none" stroke="#E2E8F0" />
            ${element.title ? `<text x="30" y="38" font-size="18" font-family="Arial" fill="#64748B">${element.title}</text>` : ""}
            ${chartBadge}
            ${element.chartType === "pie" || element.chartType === "ring"
                ? `${piePaths}${ringMask}`
                : element.chartType === "radar"
                    ? `
                        ${radarGrid}
                        ${radarAxes.map((axis, index) => `<line x1="${radarCenterX}" y1="${radarCenterY}" x2="${axis.x}" y2="${axis.y}" stroke="#E2E8F0" stroke-width="1" /><text x="${axis.labelX}" y="${axis.labelY}" font-size="12" text-anchor="middle" fill="#64748B">${data[index]?.label || ""}</text>`).join("")}
                        <polygon points="${radarPolygon}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="4" />
                        ${points.map((point, index) => {
                            const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
                            const px = radarCenterX + Math.cos(angle) * radarRadius * point.ratio;
                            const py = radarCenterY + Math.sin(angle) * radarRadius * point.ratio;
                            return `<circle cx="${px}" cy="${py}" r="5" fill="${paletteColor(index)}" />`;
                        }).join("")}
                    `
                : `
                    <line x1="40" y1="${height - 54}" x2="${width - 30}" y2="${height - 54}" stroke="#CBD5E1" stroke-width="2" />
                    <line x1="48" y1="56" x2="48" y2="${height - 48}" stroke="#E2E8F0" stroke-width="2" />
                    ${element.chartType === "area" ? `<path d="${areaPath}" fill="${color}" fill-opacity="0.18" />` : ""}
                    ${element.chartType === "line" || element.chartType === "area" ? `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />` : ""}
                    ${element.chartType === "bar"
                        ? points.map((point, index) => {
                            const barWidth = Math.max(90, width - 220);
                            const barHeight = 18;
                            const y = 80 + index * 52;
                            return `<g><text x="38" y="${y + 13}" font-size="13" text-anchor="start" fill="#64748B">${point.item.label}</text><rect x="118" y="${y}" width="${barWidth}" height="${barHeight}" rx="9" fill="#F1F5F9" /><rect x="118" y="${y}" width="${Math.max(18, point.ratio * barWidth)}" height="${barHeight}" rx="9" fill="${paletteColor(index)}" /><text x="${118 + barWidth + 8}" y="${y + 13}" font-size="13" fill="#64748B">${Math.round(Number(point.item.value || 0))}</text></g>`;
                        }).join("")
                        : points.map((point, index) => {
                            const columnWidth = Math.max(32, (width - 184) / Math.max(data.length, 1) - 16);
                            const x = 68 + index * Math.max(72, (width - 156) / Math.max(data.length, 1));
                            const barHeight = Math.max(12, point.ratio * (height - 138));
                            const y = height - 62 - barHeight;
                            if (element.chartType === "scatter") {
                                return `<g><circle cx="${point.x}" cy="${point.y}" r="8" fill="${paletteColor(index)}" /><text x="${point.x}" y="${point.y - 18}" font-size="14" text-anchor="middle" fill="#64748B">${Math.round(Number(point.item.value || 0))}</text><text x="${point.x}" y="${height - 28}" font-size="13" text-anchor="middle" fill="#64748B">${point.item.label}</text></g>`;
                            }
                            if (element.chartType === "line" || element.chartType === "area") {
                                return `<g><circle cx="${point.x}" cy="${point.y}" r="8" fill="${paletteColor(index)}" /><text x="${point.x}" y="${point.y - 18}" font-size="14" text-anchor="middle" fill="#64748B">${Math.round(Number(point.item.value || 0))}</text><text x="${point.x}" y="${height - 28}" font-size="13" text-anchor="middle" fill="#64748B">${point.item.label}</text></g>`;
                            }
                            return `<g><rect x="${x}" y="${y}" width="${columnWidth}" height="${barHeight}" rx="12" fill="${paletteColor(index)}" /><text x="${x + columnWidth / 2}" y="${y - 10}" font-size="14" text-anchor="middle" fill="#64748B">${Math.round(Number(point.item.value || 0))}</text><text x="${x + columnWidth / 2}" y="${height - 28}" font-size="13" text-anchor="middle" fill="#64748B">${point.item.label}</text></g>`;
                        }).join("")}
                `}
        </svg>
    `.trim();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

const renderMediaPlaceholderSvgDataUri = (
    kind: "video" | "audio",
    title: string,
    width = 640,
    height = 360,
) => {
    const icon = kind === "video"
        ? `<polygon points="286,136 286,224 362,180" fill="#ffffff" opacity="0.96" />`
        : `<path d="M288 140 L324 140 L356 112 L356 248 L324 220 L288 220 Z" fill="#ffffff" opacity="0.96" /><path d="M392 142 C414 160 414 200 392 218" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.92" />`;
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#0f172a" />
                    <stop offset="100%" stop-color="#1e293b" />
                </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" rx="26" fill="url(#bg)" />
            <circle cx="${width / 2}" cy="${height / 2 - 18}" r="72" fill="#ffffff" opacity="0.12" />
            ${icon}
            <text x="${width / 2}" y="${height - 42}" font-size="28" font-family="Arial" text-anchor="middle" fill="#ffffff">${title}</text>
        </svg>
    `.trim();
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
};

const loadImageElement = async (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image for PDF export"));
        img.src = src;
    });

const drawRoundedRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
) => {
    const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
};

const drawGenericShapePath = (
    ctx: CanvasRenderingContext2D,
    shape: PptShapeElement["shape"],
    x: number,
    y: number,
    w: number,
    h: number,
) => {
    const radius = Math.min(w, h) * 0.16;
    const dx = w * 0.18;
    const inset = w * 0.16;
    ctx.beginPath();
    switch (shape) {
        case "roundRect":
            drawRoundedRect(ctx, x, y, w, h, radius);
            return;
        case "triangle":
            ctx.moveTo(x + w / 2, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            break;
        case "parallelogram":
            ctx.moveTo(x + dx, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w - dx, y + h);
            ctx.lineTo(x, y + h);
            break;
        case "trapezoid":
            ctx.moveTo(x + inset, y);
            ctx.lineTo(x + w - inset, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            break;
        case "hexagon":
            ctx.moveTo(x + inset, y);
            ctx.lineTo(x + w - inset, y);
            ctx.lineTo(x + w, y + h / 2);
            ctx.lineTo(x + w - inset, y + h);
            ctx.lineTo(x + inset, y + h);
            ctx.lineTo(x, y + h / 2);
            break;
        case "chevron": {
            const arrowInset = w * 0.22;
            ctx.moveTo(x, y);
            ctx.lineTo(x + w - arrowInset, y);
            ctx.lineTo(x + w, y + h / 2);
            ctx.lineTo(x + w - arrowInset, y + h);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + arrowInset, y + h / 2);
            break;
        }
        case "message": {
            const tailH = h * 0.18;
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - tailH - radius);
            ctx.quadraticCurveTo(x + w, y + h - tailH, x + w - radius, y + h - tailH);
            ctx.lineTo(x + w * 0.52, y + h - tailH);
            ctx.lineTo(x + w * 0.38, y + h);
            ctx.lineTo(x + w * 0.36, y + h - tailH);
            ctx.lineTo(x + radius, y + h - tailH);
            ctx.quadraticCurveTo(x, y + h - tailH, x, y + h - tailH - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            break;
        }
        case "rect":
        default:
            ctx.rect(x, y, w, h);
            break;
    }
    ctx.closePath();
};

const normalizeImageToPngDataUri = async (imageUrl: string) => {
    const dataUri = await urlToDataUri(imageUrl);
    const img = await loadImageElement(dataUri);
    const width = Number(img.naturalWidth || img.width || PPT_REFERENCE_SLIDE_WIDTH);
    const height = Number(img.naturalHeight || img.height || PPT_REFERENCE_SLIDE_HEIGHT);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable for image normalization");
    ctx.drawImage(img, 0, 0, width, height);
    return {
        dataUrl: canvas.toDataURL("image/png"),
        width,
        height,
    };
};

const clampCanvasRect = (x: number, y: number, w: number, h: number, canvasWidth: number, canvasHeight: number) => {
    const clampedX = Math.max(0, Math.min(canvasWidth, x));
    const clampedY = Math.max(0, Math.min(canvasHeight, y));
    const maxW = Math.max(0, canvasWidth - clampedX);
    const maxH = Math.max(0, canvasHeight - clampedY);
    return {
        x: clampedX,
        y: clampedY,
        w: Math.max(1, Math.min(maxW, w)),
        h: Math.max(1, Math.min(maxH, h)),
    };
};

const sampleAverageColor = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
) => {
    const rect = clampCanvasRect(x, y, w, h, ctx.canvas.width, ctx.canvas.height);
    const imageData = ctx.getImageData(rect.x, rect.y, rect.w, rect.h).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let index = 0; index < imageData.length; index += 4) {
        const alpha = imageData[index + 3];
        if (alpha <= 8) continue;
        r += imageData[index];
        g += imageData[index + 1];
        b += imageData[index + 2];
        count += 1;
    }
    if (count === 0) return { r: 255, g: 255, b: 255 };
    return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
    };
};

const rgbToCss = (color: { r: number; g: number; b: number }) => `rgb(${color.r}, ${color.g}, ${color.b})`;
const rgbToHex = (color: { r: number; g: number; b: number }) =>
    `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
const rgbDistance = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) =>
    Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

const buildTextReferenceDataUri = async (
    imageUrl: string,
    textBlocks: PptTextBlock[],
) => {
    const normalized = await normalizeImageToPngDataUri(imageUrl);
    const seededCanvas = document.createElement("canvas");
    seededCanvas.width = normalized.width;
    seededCanvas.height = normalized.height;
    const seededCtx = seededCanvas.getContext("2d");
    if (!seededCtx) throw new Error("Canvas context unavailable for seeded background generation");
    const sourceImage = await loadImageElement(normalized.dataUrl);
    seededCtx.drawImage(sourceImage, 0, 0, seededCanvas.width, seededCanvas.height);

    const backgroundHints: string[] = [];

    for (const block of textBlocks) {
        const x = block.x * seededCanvas.width;
        const y = block.y * seededCanvas.height;
        const w = block.w * seededCanvas.width;
        const h = block.h * seededCanvas.height;
        const inferredFontSize = estimateTextBlockFontSize(block, seededCanvas.width, seededCanvas.height);
        const padding = Math.max(10, Math.round(inferredFontSize * 0.42));
        const radius = Math.max(10, Math.round(Math.min(w, h) * 0.12));
        const maskX = Math.max(0, x - padding);
        const maskY = Math.max(0, y - padding);
        const maskW = Math.min(seededCanvas.width - maskX, w + padding * 2);
        const maskH = Math.min(seededCanvas.height - maskY, h + padding * 2);
        const samplePadding = Math.max(16, Math.round(padding * 1.2));
        const topColor = sampleAverageColor(seededCtx, maskX, Math.max(0, maskY - samplePadding), maskW, samplePadding);
        const bottomColor = sampleAverageColor(seededCtx, maskX, Math.min(seededCanvas.height - samplePadding, maskY + maskH), maskW, samplePadding);
        const leftColor = sampleAverageColor(seededCtx, Math.max(0, maskX - samplePadding), maskY, samplePadding, maskH);
        const rightColor = sampleAverageColor(seededCtx, Math.min(seededCanvas.width - samplePadding, maskX + maskW), maskY, samplePadding, maskH);
        const useVerticalGradient = rgbDistance(topColor, bottomColor) >= rgbDistance(leftColor, rightColor);

        const fillGradient = useVerticalGradient
            ? seededCtx.createLinearGradient(maskX, maskY, maskX, maskY + maskH)
            : seededCtx.createLinearGradient(maskX, maskY, maskX + maskW, maskY);
        if (useVerticalGradient) {
            fillGradient.addColorStop(0, rgbToCss(topColor));
            fillGradient.addColorStop(1, rgbToCss(bottomColor));
        } else {
            fillGradient.addColorStop(0, rgbToCss(leftColor));
            fillGradient.addColorStop(1, rgbToCss(rightColor));
        }
        seededCtx.save();
        seededCtx.fillStyle = fillGradient;
        drawRoundedRect(seededCtx, maskX, maskY, maskW, maskH, radius);
        seededCtx.fill();
        seededCtx.restore();

        backgroundHints.push(
            `${backgroundHints.length + 1}. role=${block.role}; text=${block.text}; box=(x=${block.x.toFixed(3)}, y=${block.y.toFixed(3)}, w=${block.w.toFixed(3)}, h=${block.h.toFixed(3)}); top=${rgbToHex(topColor)}; bottom=${rgbToHex(bottomColor)}; left=${rgbToHex(leftColor)}; right=${rgbToHex(rightColor)}`
        );
    }

    return {
        referenceImageUrl: seededCanvas.toDataURL("image/png"),
        backgroundHints,
    };
};

const renderPageToDataUri = async (
    page: PptPage,
    imageUrl?: string,
    width = PPT_REFERENCE_SLIDE_WIDTH,
    height = PPT_REFERENCE_SLIDE_HEIGHT,
): Promise<string> => {
    const pageElements = Array.isArray(page.elements) ? page.elements : [];
    const pageTextBlocks =
        Array.isArray(page.textBlocks) && page.textBlocks.length > 0
            ? page.textBlocks
            : pptElementsToTextBlocks(page.elements || []);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable for PDF export");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    if (imageUrl) {
        const dataUri = await urlToDataUri(imageUrl);
        const img = await loadImageElement(dataUri);
        ctx.drawImage(img, 0, 0, width, height);
    }

    for (const element of pageElements) {
        if (element.type === "text") continue;
        const x = element.x * width;
        const y = element.y * height;
        const w = element.w * width;
        const h = element.h * height;

        if (element.type === "image") {
            const dataUri = await urlToDataUri(element.src);
            const img = await loadImageElement(dataUri);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.drawImage(img, x, y, w, h);
            ctx.restore();
            continue;
        }

        if (element.type === "shape") {
            ctx.save();
            if (element.shape === "line") {
                ctx.strokeStyle = element.stroke || "rgba(255,255,255,0.72)";
                ctx.lineWidth = Math.max(1, element.strokeWidth || 2);
                ctx.beginPath();
                ctx.moveTo(x, y + h / 2);
                ctx.lineTo(x + w, y + h / 2);
                ctx.stroke();
            } else {
                drawGenericShapePath(ctx, element.shape, x, y, w, h);
                ctx.fillStyle = element.fill || "rgba(255,255,255,0.16)";
                ctx.fill();
                if (element.stroke) {
                    ctx.strokeStyle = element.stroke;
                    ctx.lineWidth = Math.max(1, element.strokeWidth || 1.5);
                    ctx.stroke();
                }
            }
            ctx.restore();
            continue;
        }

        if (element.type === "table") {
            const rows = Array.isArray(element.rows) && element.rows.length > 0 ? element.rows : [["A", "B"], ["1", "2"]];
            const rowHeight = h / Math.max(rows.length, 1);
            const columnCount = Math.max(...rows.map((row) => row.length), 1);
            const cellWidth = w / columnCount;
            const headerRows = Math.max(0, Number(element.headerRows || 0));
            ctx.save();
            ctx.fillStyle = element.fill || "rgba(255,255,255,0.95)";
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = element.stroke || "rgba(148,163,184,0.6)";
            ctx.lineWidth = 1;
            ctx.font = `${Math.max(12, Math.min(18, rowHeight * 0.32))}px "Microsoft YaHei"`;
            ctx.textBaseline = "middle";
            rows.forEach((row, rowIndex) => {
                row.forEach((cell, cellIndex) => {
                    const cellX = x + cellIndex * cellWidth;
                    const cellY = y + rowIndex * rowHeight;
                    if (rowIndex < headerRows) {
                        ctx.fillStyle = "rgba(226,232,240,0.95)";
                        ctx.fillRect(cellX, cellY, cellWidth, rowHeight);
                    }
                    ctx.strokeRect(cellX, cellY, cellWidth, rowHeight);
                    ctx.fillStyle = element.textColor || "#0f172a";
                    ctx.fillText(String(cell || ""), cellX + 10, cellY + rowHeight / 2, Math.max(0, cellWidth - 20));
                });
            });
            ctx.restore();
            continue;
        }

        if (element.type === "chart") {
            const chartDataUri = renderChartSvgDataUri(element);
            const img = await loadImageElement(chartDataUri);
            ctx.drawImage(img, x, y, w, h);
            continue;
        }

        if (element.type === "formula") {
            ctx.save();
            drawRoundedRect(ctx, x, y, w, h, Math.min(w, h) * 0.18);
            ctx.fillStyle = "rgba(255,255,255,0.92)";
            ctx.fill();
            ctx.strokeStyle = "rgba(226,232,240,0.92)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = element.color || "#0f172a";
            ctx.font = `${Math.max(14, Number(element.fontSize || 20))}px "Cambria Math","Times New Roman","Microsoft YaHei"`;
            ctx.textBaseline = "middle";
            ctx.fillText(element.latex || "E = mc^2", x + 16, y + h / 2, Math.max(0, w - 32));
            ctx.restore();
            continue;
        }

        if (element.type === "video" || element.type === "audio") {
            const placeholderUri = renderMediaPlaceholderSvgDataUri(
                element.type,
                element.title || (element.type === "video" ? "Video" : "Audio"),
            );
            const img = await loadImageElement(placeholderUri);
            ctx.drawImage(img, x, y, w, h);
        }
    }

    if (pageTextBlocks.length > 0) {
        for (const block of pageTextBlocks) {
            const style = block.style || {};
            const fontSize = resolveTextBlockFontSize(block, width, height);
            const x = block.x * width;
            const y = block.y * height;
            const w = block.w * width;
            const h = block.h * height;
            const lineHeight = fontSize * Number(style.lineHeight || (block.role === "title" ? 1.12 : block.role === "tag" ? 1.05 : 1.35));
            const lines = String(block.text || "").split(/\r?\n/).filter(Boolean);
            const fontWeight = Number(style.fontWeight || (block.role === "title" ? 900 : block.role === "tag" ? 800 : 500));
            const fontStyle = style.fontStyle === "italic" ? "italic " : "";
            const fontFamily = style.fontFamily || "Microsoft YaHei";
            const paddingX = block.role === "title" ? 18 : block.role === "tag" ? 16 : 24;
            const paddingY = block.role === "title" ? 12 : block.role === "tag" ? 10 : 16;
            const isTag = block.role === "tag";

            if (isTag) {
                ctx.save();
                ctx.fillStyle = "rgba(26,89,160,0.55)";
                ctx.strokeStyle = "rgba(116,217,255,0.55)";
                ctx.lineWidth = 2;
                const radius = Math.min(h / 2, 18);
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + w - radius, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
                ctx.lineTo(x + w, y + h - radius);
                ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
                ctx.lineTo(x + radius, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.font = `${fontStyle}${fontWeight} ${fontSize}px "${fontFamily}"`;
            ctx.textBaseline = "top";
            ctx.shadowColor = block.role === "title" ? "rgba(15,23,42,0.55)" : "rgba(15,23,42,0.18)";
            ctx.shadowBlur = block.role === "title" ? 10 : 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 1;
            ctx.lineJoin = "round";
            if (style.strokeColor) {
                ctx.strokeStyle = style.strokeColor;
                ctx.lineWidth = Number(style.strokeWidth || 1.2);
            }
            if (style.gradientFrom && style.gradientTo) {
                const gradient = ctx.createLinearGradient(x, y, x + w, y);
                gradient.addColorStop(0, style.gradientFrom);
                gradient.addColorStop(1, style.gradientTo);
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = style.color || (block.role === "title" ? "#ffffff" : block.role === "tag" ? "#ffd66b" : "#ffffff");
            }

            lines.forEach((line, idx) => {
                const metrics = ctx.measureText(line);
                let drawX = x + paddingX / 2;
                if (style.align === "center") {
                    drawX = x + w / 2 - metrics.width / 2;
                } else if (style.align === "right") {
                    drawX = x + w - metrics.width - paddingX / 2;
                }
                const drawY = y + paddingY / 2 + idx * lineHeight;
                if (style.strokeColor) ctx.strokeText(line, drawX, drawY);
                ctx.fillText(line, drawX, drawY);
            });
            ctx.restore();
        }
    }

    return canvas.toDataURL("image/png");
};

const formatReferenceFiles = (referenceFiles?: ReferenceFileInput[]) => {
    if (!Array.isArray(referenceFiles) || referenceFiles.length === 0) return "";
    return referenceFiles
        .slice(0, 5)
        .map((f, i) => `Reference ${i + 1}: ${f.filename}\n${String(f.content || "").slice(0, 4000)}`)
        .join("\n\n");
};

const formatReferenceImageAssets = (assets?: ReferenceImageAssetInput[]) => {
    if (!Array.isArray(assets) || assets.length === 0) return "";
    return assets
        .slice(0, 30)
        .map((a) => {
            const pageText = typeof a.sourcePage === "number" ? `, page=${a.sourcePage}` : "";
            return `- ${a.label}: ${a.caption} (source=${a.sourceFile}${pageText})`;
        })
        .join("\n");
};

const parseJsonLoose = (text: string) => {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Empty AI response");

    const tryParse = (s: string) => {
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    };

    const direct = tryParse(raw);
    if (direct) return direct;

    const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
        const inner = String(jsonBlock[1]).trim();
        const parsed = tryParse(inner);
        if (parsed) return parsed;
    }

    const findBalanced = (openChar: "[" | "{", closeChar: "]" | "}") => {
        const start = raw.indexOf(openChar);
        if (start < 0) return null;
        let depth = 0;
        for (let i = start; i < raw.length; i += 1) {
            const ch = raw[i];
            if (ch === openChar) depth += 1;
            if (ch === closeChar) depth -= 1;
            if (depth === 0) {
                const candidate = raw.slice(start, i + 1);
                const parsed = tryParse(candidate);
                if (parsed) return parsed;
                return null;
            }
        }
        return null;
    };

    const arr = findBalanced("[", "]");
    if (arr) return arr;
    const obj = findBalanced("{", "}");
    if (obj) return obj;

    throw new Error("Failed to parse AI JSON");
};

const normalizePages = (value: any): PptPage[] => {
    const asArray = Array.isArray(value) ? value : Array.isArray(value?.slides) ? value.slides : null;
    if (!asArray) return [];
    return asArray
        .map((p: any) => ({
            title: typeof p?.title === "string" ? p.title : "",
            content: Array.isArray(p?.content) ? p.content.map((x: any) => String(x)) : Array.isArray(p?.bullets) ? p.bullets.map((x: any) => String(x)) : [],
            description: typeof p?.description === "string" ? p.description : "",
            note: typeof p?.note === "string" ? p.note : undefined,
            layout: typeof p?.layout === "string" ? p.layout : undefined,
            materialLabels: Array.isArray(p?.materialLabels)
                ? p.materialLabels.map((x: any) => String(x)).filter(Boolean)
                : Array.isArray(p?.material_labels)
                    ? p.material_labels.map((x: any) => String(x)).filter(Boolean)
                    : [],
        }))
        .filter((p: PptPage) => p.title.trim().length > 0);
};

const urlToDataUri = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.startsWith("data:")) return url;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/png";
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return `data:${contentType};base64,${base64}`;
};

const downloadBlob = (data: Uint8Array | ArrayBuffer, mime: string, filename: string) => {
    const blob = new Blob([data], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
};

export const pptService = {
    // A1. PlanFromIdeaAgent
    generateOutline: async (
        topic: string,
        uiLanguage: "zh" | "en" = "zh",
        referenceFiles?: ReferenceFileInput[],
        referenceImageAssets?: ReferenceImageAssetInput[]
    ): Promise<PptPage[]> => {
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = buildRisenPrompt({
            role: "You are PlanFromIdeaAgent for PPT planning.",
            instructions: "Generate a complete PptPlan from the idea prompt and return JSON only.",
            input: `idea_prompt: ${topic}\nui_language: ${uiLanguage}\n\nreference_files_content:\n${refText || "(none)"}\n\nreference_image_assets:\n${imageAssetText || "(none)"}`,
            steps: "1. Convert the idea into a coherent slide sequence.\n2. Write 4-6 specific bullets per slide.\n3. Write a concrete visual description for each slide.\n4. Write a coherent speaker note paragraph for each slide.\n5. Assign materialLabels only when truly relevant.",
            endGoal: "Produce a complete render-ready PptPlan with stable slide ids and usable materialLabels.",
            narrowing: "1. Return JSON only; markdown JSON block is allowed.\n2. Every slide must include id, title, content, description, layout, note, materialLabels.\n3. materialLabels must come only from reference_image_assets and can be [].\n4. All fields must follow ui_language; zh means Simplified Chinese.",
        });

        const response = await generateChatMessage([
            { role: "system", content: PPT_OUTLINE_SYSTEM },
            { role: "user", content: prompt }
        ], undefined, { timeoutMs: 120000 });

        try {
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed).map((p, i) => ({
                ...p,
                id: p.id || `slide-${i + 1}`,
                note: typeof p.note === "string" ? normalizeSpeakerNote(p.note, uiLanguage) : "",
                layout: typeof p.layout === "string" ? normalizeLayoutByLanguage(p.layout, uiLanguage) : "",
                description: typeof p.description === "string" ? p.description : "",
            }));
            if (pages.length === 0) throw new Error("No outline parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse outline", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
    },

    // B1. PlanFromOutlineAgent
    generatePlanFromOutline: async (
        outlineText: string,
        uiLanguage: "zh" | "en" = "zh",
        referenceFiles?: ReferenceFileInput[],
        referenceImageAssets?: ReferenceImageAssetInput[]
    ): Promise<PptPage[]> => {
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = buildRisenPrompt({
            role: "You are PlanFromOutlineAgent for PPT planning.",
            instructions: "Generate a complete PptPlan from the outline and return JSON only.",
            input: `outline_text:\n${outlineText}\n\nui_language: ${uiLanguage}\n\nreference_files_content:\n${refText || "(none)"}\n\nreference_image_assets:\n${imageAssetText || "(none)"}`,
            steps: "1. Expand the outline into a coherent slide sequence.\n2. Write 4-6 specific bullets per slide.\n3. Write a concrete visual description for each slide.\n4. Write a coherent speaker note paragraph for each slide.\n5. Assign materialLabels only when truly relevant.",
            endGoal: "Produce a complete render-ready PptPlan derived from the outline.",
            narrowing: "1. Return JSON only; markdown JSON block is allowed.\n2. Every slide must include id, title, content, description, layout, note, materialLabels.\n3. materialLabels must come only from reference_image_assets and can be [].\n4. All fields must follow ui_language; zh means Simplified Chinese.",
        });
        const response = await generateChatMessage([
            { role: "system", content: PPT_OUTLINE_SYSTEM },
            { role: "user", content: prompt }
        ], undefined, { timeoutMs: 120000 });
        try {
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed).map((p, i) => ({
                ...p,
                id: p.id || `slide-${i + 1}`,
                note: typeof p.note === "string" ? normalizeSpeakerNote(p.note, uiLanguage) : "",
                layout: typeof p.layout === "string" ? normalizeLayoutByLanguage(p.layout, uiLanguage) : "",
                description: typeof p.description === "string" ? p.description : "",
            }));
            if (pages.length === 0) throw new Error("No plan parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse plan from outline", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
    },

    // Backward-compatible alias used by legacy workspace path.
    generateSlidesFromDescription: async (description: string): Promise<PptPage[]> => {
        return await pptService.generateOutline(description, "zh");
    },

    // 2. Generate Description (Refinement)
    generatePageDescription: async (pages: PptPage[], index: number, topic: string, referenceFiles: any[]): Promise<PptPage> => {
        const page = pages[index];
        const refText = Array.isArray(referenceFiles) && referenceFiles.length > 0
            ? referenceFiles
                .slice(0, 3)
                .map((f: any) => `- ${f.filename || f.name || "ref"}:\n${String(f.content || "").slice(0, 2000)}`)
                .join("\n\n")
            : "";

        const currentSlideJson = JSON.stringify(
            {
                id: page.id || `slide-${index + 1}`,
                title: page.title,
                content: page.content,
                description: page.description || "",
                note: page.note || "",
                layout: page.layout || "",
            },
            null,
            2
        );

        const prompt = buildRisenPrompt({
            role: "You are a single-slide PPT refinement agent.",
            instructions: "Improve one slide record and return JSON only.",
            input: `Topic: ${topic}\nSlide index: ${index + 1}\n\nCurrent slide:\n${currentSlideJson}${refText ? `\n\nReference:\n${refText}` : ""}`,
            steps: "1. Improve bullets to be concise and presentation-friendly, with at most 12 words each.\n2. Refine the image description.\n3. Add or improve speaker note and layout hint only when helpful.\n4. Keep the slide id stable.",
            endGoal: "Produce one improved slide JSON record that is ready for image generation.",
            narrowing: "1. Return JSON only.\n2. If note exists, write it as a coherent spoken script of 3-6 connected sentences.\n3. No extra text outside the JSON payload.",
        });

        const response = await generateChatMessage(
            [
                { role: "system", content: PPT_SLIDES_GENERATE_SYSTEM },
                { role: "user", content: prompt },
            ],
            undefined,
            { timeoutMs: 120000 }
        );

        try {
            const parsed = parseJsonLoose(response);
            const asSlides = Array.isArray(parsed?.slides) ? parsed.slides : Array.isArray(parsed) ? parsed : null;
            const first = Array.isArray(asSlides) && asSlides.length > 0 ? asSlides[0] : null;
            if (!first || typeof first !== "object") return page;
            return {
                ...page,
                title: typeof first.title === "string" ? first.title : page.title,
                content: Array.isArray(first.content) ? first.content.map((x: any) => String(x)) : page.content,
                description: typeof first.description === "string" ? first.description : page.description,
                note: typeof first.note === "string" ? normalizeSpeakerNote(first.note, "zh") : page.note,
                layout: typeof first.layout === "string" ? normalizeLayoutByLanguage(first.layout, "zh") : page.layout,
            };
        } catch {
            return page;
        }
    },

    // 3. Generate Image
    generatePageImage: async (
        page: PptPage,
        uiLanguageOrAllPages: "zh" | "en" | PptPage[],
        templateImageUrl?: string,
        additionalImagesOrMaterialUrls?: Array<{ url: string; label?: string }> | string[],
        extraRequirements?: string,
    ): Promise<string> => {
        const uiLanguage: "zh" | "en" = Array.isArray(uiLanguageOrAllPages) ? "zh" : uiLanguageOrAllPages;
        const normalizedAdditional: Array<{ url: string; label?: string }> = Array.isArray(additionalImagesOrMaterialUrls)
            ? (additionalImagesOrMaterialUrls as any[]).map((x, i) =>
                typeof x === "string" ? { url: x, label: `MATERIAL_${i + 1}` } : { url: String(x?.url || ""), label: x?.label }
            ).filter((x) => x.url)
            : [];
        const additionalLabelText = normalizedAdditional.length > 0
            ? normalizedAdditional
                .map((x, i) => `${i + 1}. ${x.label || `MATERIAL_${i + 1}`}`)
                .join("\n")
            : "(none)";
        const prompt = buildRisenPrompt({
            role: "You are a PPT slide image generation agent.",
            instructions: "Generate one modern, professional slide image in 16:9.",
            input: `Title: ${page.title}\nBullets: ${(page.content || []).join(" | ")}\nLanguage: ${uiLanguage}\nScene/subject: ${page.description || page.title}\nTemplate style reference: ${templateImageUrl ? "provided" : "not provided"}\nUploaded material labels:\n${additionalLabelText}${extraRequirements ? `\n\nExtra requirements:\n${extraRequirements}` : ""}`,
            steps: "1. Design the slide composition from the title, bullets, and description.\n2. Follow the template reference style consistently.\n3. Use referenced material images only when required or clearly helpful.\n4. Preserve the identity and aspect ratio of referenced material images.",
            endGoal: "Produce one sharp, readable, presentation-ready slide image with accurate content coverage.",
            narrowing: "1. Avoid large paragraphs of text.\n2. Prefer diagrammatic or illustrative composition that matches the bullets.\n3. If the description contains {{image:Name}}, you must use the material image whose label is Name.\n4. Do not redraw, restyle, recolor, or replace referenced material images.\n5. Do not add watermarks.",
        });
        const additionalReferenceImageUrls = Array.isArray(normalizedAdditional)
            ? normalizedAdditional.map((x) => String(x?.url || "")).filter(Boolean)
            : [];

        return await generateImage({
            prompt,
            referenceImageUrl: templateImageUrl,
            additionalReferenceImageUrls,
        });
    },

    extractSlideTextBlocks: async (
        page: PptPage,
        slideImageUrl: string,
        uiLanguage: "zh" | "en" = "zh",
    ): Promise<PptTextBlock[]> => {
        const expectedTexts = [
            page.title ? `TITLE: ${page.title}` : "",
            ...(Array.isArray(page.content) ? page.content.map((item, idx) => `BULLET ${idx + 1}: ${item}`) : []),
        ].filter(Boolean);

        const prompt = buildRisenPrompt({
            role: "You are a slide-layer text extraction agent for rendered PPT slides.",
            instructions: "Extract editable slide-layer text blocks and return JSON only.",
            input: `language: ${uiLanguage}\nexpected text candidates:\n${expectedTexts.length > 0 ? expectedTexts.join("\n") : "(none)"}`,
            steps: "1. Extract only slide-layer text.\n2. Determine geometry first: text, role, x, y, w, h relative to the full slide.\n3. Then estimate style, especially relative font size.\n4. Keep meaningful short labels, including chip or pill labels.",
            endGoal: "Produce one complete textBlocks array that can drive editable slide text rendering.",
            narrowing: "1. Ignore text inside photos, screenshots, charts, tables, diagrams, devices, logos, and scanned materials.\n2. Prefer expected text candidates when they match visible text.\n3. Merge wrapped lines from one text box with \\n.\n4. Use role=title, bullet, summary, or tag.\n5. Use tight text boxes and preserve visible alignment and line breaks.\n6. Include dominant color, fontWeight, lineHeight, and optional gradient or stroke when visible.",
            outputFormat: `{"textBlocks":[{"id":"title-1","role":"title","text":"Example","x":0.1,"y":0.08,"w":0.6,"h":0.12,"style":{"fontFamily":"Microsoft YaHei","fontSize":30,"fontWeight":700,"fontStyle":"normal","color":"#ffffff","gradientFrom":"#ffffff","gradientTo":"#22d3ee","strokeColor":"rgba(8,15,36,0.35)","strokeWidth":1.2,"align":"left","lineHeight":1.2,"letterSpacing":0}}]}`,
        });

        const response = await generateVisionChatMessage(
            PPT_TEXT_EXTRACTION_SYSTEM,
            prompt,
            [slideImageUrl],
            undefined,
        );

        try {
            return normalizeTextBlocks(parseJsonLoose(response));
        } catch (error) {
            console.error("Failed to parse extracted PPT text blocks", error);
            return [];
        }
    },

    generateTextlessPageImage: async (
        page: PptPage,
        slideImageUrl: string,
        textBlocks: PptTextBlock[],
        uiLanguage: "zh" | "en" = "zh",
    ): Promise<string> => {
        if (!Array.isArray(textBlocks) || textBlocks.length === 0) {
            return slideImageUrl;
        }
        const textList = textBlocks.length > 0
            ? textBlocks.map((block, idx) => `${idx + 1}. ${block.role}: ${block.text}`).join("\n")
            : [page.title, ...(page.content || [])].filter(Boolean).map((text, idx) => `${idx + 1}. ${text}`).join("\n");
        const textRegions = textBlocks.length > 0
            ? textBlocks
                .map((block, idx) =>
                    `${idx + 1}. role=${block.role}; text=${block.text}; box=(x=${block.x.toFixed(3)}, y=${block.y.toFixed(3)}, w=${block.w.toFixed(3)}, h=${block.h.toFixed(3)})`
                )
                .join("\n")
            : "(none)";

        const backgroundHints = textBlocks.map((block, idx) =>
            `${idx + 1}. keep edits strictly inside box=(x=${block.x.toFixed(3)}, y=${block.y.toFixed(3)}, w=${block.w.toFixed(3)}, h=${block.h.toFixed(3)}) and do not modify any pixel outside this box`
        );
        const prompt = uiLanguage === "zh"
            ? `基于原图生成同一页 PPT 的无字底图。只移除下面这些文本框内的文字本身，且只允许修改已给出文本框范围内、被文字笔画实际占据的像素；如果某个文本框里没有文字，就不要做任何修改。文本框外任何像素都绝对不能改动。不要改版式、不要改图片、不要改图标、不要改图表、不要改装饰、不要扩大修改范围。禁止生成任何矩形补丁、纯色块、模糊块、修复块、遮罩边界、文本框痕迹或重新设计的背景。处理后的区域必须与周围原始背景连续一致，看起来像原图里从来没有放过文字。\n\n要删除的文字：\n${textList || "(none)"}\n\n文字位置：\n${textRegions}\n\n严格边界要求：\n${backgroundHints.join("\n") || "(none)"}`
            : `Create a textless background for this same slide. Remove only the text inside the listed text boxes, and modify only the pixels actually occupied by text glyphs inside those boxes. If a listed text box contains no text, do not change anything in that box. Absolutely do not modify any pixel outside the listed text boxes. Do not alter layout, images, icons, charts, decorations, or the surrounding background. Do not expand the edited area. Do not create any rectangular patch, flat color block, blur patch, inpaint patch, mask edge, textbox residue, or redesigned background. The cleaned area must blend seamlessly with the original nearby background so it looks like the text was never placed there.\n\nText to remove:\n${textList || "(none)"}\n\nText regions:\n${textRegions}\n\nHard boundaries:\n${backgroundHints.join("\n") || "(none)"}`;

        return await generateImage({
            prompt,
            referenceImageUrl: slideImageUrl,
        });
    },

    reviewSlideTextBlocks: async (
        page: PptPage,
        originalSlideImageUrl: string,
        textlessBackgroundImageUrl: string,
        textBlocks: PptTextBlock[],
        uiLanguage: "zh" | "en" = "zh",
    ): Promise<PptTextBlock[]> => {
        if (!Array.isArray(textBlocks) || textBlocks.length === 0) return textBlocks;
        try {
            const composedDataUri = await renderPageToDataUri(
                { ...page, textBlocks, backgroundImageUrl: textlessBackgroundImageUrl },
                textlessBackgroundImageUrl,
                PPT_REFERENCE_SLIDE_WIDTH,
                PPT_REFERENCE_SLIDE_HEIGHT,
            );
            const currentJson = JSON.stringify({ textBlocks }, null, 2);
            const prompt = buildRisenPrompt({
                role: "You are a slide text review and correction agent.",
                instructions: "Review the current text layer against the original slide and return corrected JSON only.",
                input: `language: ${uiLanguage}\nimage 1: original rendered slide\nimage 2: textless background + current text layer\ncurrent textBlocks JSON:\n${currentJson}`,
                steps: "1. Compare image 2 with image 1 only for slide-layer text.\n2. Check missing text, wrong relative size, wrong position, and obvious style mismatch.\n3. Return one corrected full textBlocks array.",
                endGoal: "Produce a corrected textBlocks array that matches the original slide-layer text closely.",
                narrowing: "1. Ignore text inside material images.\n2. Keep geometry relative to the full slide.\n3. Correct only slide-layer text.\n4. Return JSON only.",
                outputFormat: `{"textBlocks":[...]}`,
            });
            const response = await generateVisionChatMessage(
                PPT_TEXT_REVIEW_SYSTEM,
                prompt,
                [originalSlideImageUrl, composedDataUri],
                undefined,
            );
            const reviewed = normalizeTextBlocks(parseJsonLoose(response));
            return reviewed.length > 0 ? reviewed : textBlocks;
        } catch (error) {
            console.error("Failed to review PPT text blocks", error);
            return textBlocks;
        }
    },

    rewriteSlideTextBlocks: async (
        page: PptPage,
        currentTextBlocks: PptTextBlock[],
        mode: "text_only" | "text_relayout",
        uiLanguage: "zh" | "en" = "zh",
    ): Promise<PptTextBlock[]> => {
        if (!Array.isArray(currentTextBlocks) || currentTextBlocks.length === 0) return currentTextBlocks;
        const pageJson = JSON.stringify({
            id: page.id,
            title: page.title,
            content: page.content || [],
            description: page.description || "",
            note: page.note || "",
            layout: page.layout || "",
        }, null, 2);
        const blocksJson = JSON.stringify({ textBlocks: currentTextBlocks }, null, 2);
        const prompt = buildRisenPrompt({
            role: "You are an editable PPT textBlocks rewrite agent.",
            instructions: "Update existing textBlocks to match the target slide content and return JSON only.",
            input: `language: ${uiLanguage}\nmode: ${mode}\ntarget slide content:\n${pageJson}\n\ncurrent textBlocks JSON:\n${blocksJson}`,
            steps: "1. Make textBlocks match the target slide content.\n2. If mode=text_only, keep geometry and style as unchanged as possible.\n3. If mode=text_relayout, you may adjust geometry and font size to fit the new content while keeping the overall layout close.\n4. Keep slide-layer labels or tags only if they still make sense.",
            endGoal: "Produce one full corrected textBlocks array for the updated slide.",
            narrowing: "1. Return the full corrected textBlocks array.\n2. Do not invent content outside the target slide content.\n3. Keep coordinates relative to the full slide.\n4. Return JSON only.",
            outputFormat: `{"textBlocks":[...]}`,
        });
        try {
            const response = await generateChatMessage([
                { role: "system", content: PPT_TEXT_EXTRACTION_SYSTEM },
                { role: "user", content: prompt }
            ]);
            const nextBlocks = normalizeTextBlocks(parseJsonLoose(response));
            return nextBlocks.length > 0 ? nextBlocks : currentTextBlocks;
        } catch (error) {
            console.error("Failed to rewrite PPT text blocks", error);
            return currentTextBlocks;
        }
    },

    editPageImage: async (page: PptPage, instruction: string, referenceImageUrl?: string, templateImageUrl?: string, additionalImages?: string[]) => {
        const prompt = buildRisenPrompt({
            role: "You are a slide image editing agent.",
            instructions: "Edit the current slide image as the base image rather than regenerating from scratch.",
            input: `Slide title: ${page.title}\nBullets: ${(page.content || []).join(" | ")}\nOriginal visual description: ${page.description || ""}\nInstruction: ${instruction}\nTemplate/style reference: ${templateImageUrl ? "provided" : "not provided"}\nAdditional references: ${Array.isArray(additionalImages) && additionalImages.length > 0 ? "provided" : "none"}`,
            steps: "1. Start from the current slide image.\n2. Apply the requested visual edit.\n3. Keep the overall visual style consistent with the template and references.\n4. Preserve readability.",
            endGoal: "Produce one edited 16:9 slide image that reflects the instruction while staying visually consistent.",
            narrowing: "1. Treat the current slide image as the base image.\n2. Keep layout readable.\n3. Do not add a watermark.",
        });

        const ref = referenceImageUrl || templateImageUrl;
        const additionalReferenceImageUrls = Array.isArray(additionalImages)
            ? Array.from(new Set(additionalImages.map((x) => String(x || "").trim()).filter(Boolean))).slice(0, 2)
            : [];
        if (referenceImageUrl && templateImageUrl && templateImageUrl !== referenceImageUrl) {
            additionalReferenceImageUrls.push(templateImageUrl);
        }
        try {
            return await generateImage({
                prompt,
                referenceImageUrl: ref,
                additionalReferenceImageUrls
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || "");
            const shouldRetryWithoutExtras =
                additionalReferenceImageUrls.length > 0 &&
                /(status 4\d\d|status 500|too large|payload|image|context|token)/i.test(message);
            if (!shouldRetryWithoutExtras) throw error;
            console.warn("Retrying slide image edit without additional reference images", error);
            return await generateImage({
                prompt,
                referenceImageUrl: ref,
            });
        }
    },

    routeSlideEdits: async (slides: Array<{ id: string; title: string; bullets: string[]; description?: string; layout?: string; note?: string }>, feedback: string): Promise<SlideEditRoutingItem[]> => {
        const slideList = slides
            .map((s, i) => `${i + 1}. id=${s.id}; title=${s.title}; bullets=${(s.bullets || []).join(" | ")}; description=${s.description || ""}; layout=${s.layout || ""}; note=${s.note || ""}`)
            .join("\n");

        const prompt = buildRisenPrompt({
            role: "You are a routing agent for slide edits.",
            instructions: "Map user feedback to per-slide edit actions and return JSON only.",
            input: `Slides:\n${slideList}\n\nUser feedback:\n${feedback}`,
            steps: "1. Find the target slides.\n2. Split multi-slide feedback into separate items.\n3. Assign editType for each target slide.\n4. Write concise executable instructions.",
            endGoal: "Produce a routing JSON array that tells the system how to process each slide edit.",
            narrowing: "1. Return JSON array only.\n2. If unsure, assign the edit to the most relevant slide.\n3. Do not invent new slides.\n4. Use text_only for simple wording-only changes.\n5. Use text_relayout when text changes need reflow but not a new background.\n6. Use background_redraw when visuals, composition, or material usage must change.",
            outputFormat: `[{"slideId":"slide-2","editType":"text_only|text_relayout|background_redraw","instruction":"...","materialImageUrls":[],"styleRefSlideIds":[],"styleRefPolicy":"style_only|style_and_layout","styleRefImageUrls":[]}]`,
        });

        const response = await generateChatMessage([
            { role: "system", content: PPT_SLIDES_GENERATE_SYSTEM },
            { role: "user", content: prompt }
        ]);
        const match = response.match(/\[[\s\S]*\]/);
        if (!match) return [];
        try {
            const parsed = JSON.parse(match[0]);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((it: any): SlideEditRoutingItem => ({
                    slideId: String(it.slideId || ""),
                    editType:
                        it.editType === "text_only" || it.editType === "text_relayout" || it.editType === "background_redraw"
                            ? it.editType
                            : it.kind === "content"
                              ? "text_relayout"
                              : "background_redraw",
                    instruction: String(it.instruction || ""),
                    materialImageUrls: Array.isArray(it.materialImageUrls) ? it.materialImageUrls.map((x: any) => String(x || "").trim()).filter(Boolean) : undefined,
                    styleRefSlideIds: Array.isArray(it.styleRefSlideIds) ? it.styleRefSlideIds.map((x: any) => String(x || "").trim()).filter(Boolean) : undefined,
                    styleRefPolicy: (it.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only") as SlideEditRoutingItem["styleRefPolicy"],
                    styleRefImageUrls: Array.isArray(it.styleRefImageUrls) ? it.styleRefImageUrls.map((x: any) => String(x || "").trim()).filter(Boolean) : undefined,
                }))
                .filter((it) => it.slideId.trim().length > 0 && it.instruction.trim().length > 0);
        } catch {
            return [];
        }
    },

    exportPptx: async (pages: PptPage[], images: Record<string, string>, filename: string) => {
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";

        const slideW = 13.33;
        const slideH = 7.5;

        for (const page of pages) {
            const slide = pptx.addSlide();
            const pageElements = Array.isArray(page.elements) ? page.elements : [];
            const pageTextBlocks =
                Array.isArray(page.textBlocks) && page.textBlocks.length > 0
                    ? page.textBlocks
                    : pptElementsToTextBlocks(pageElements);
            const hasTextLayer = pageTextBlocks.length > 0;
            const editableBackground = page.backgroundImageUrl;
            const fallbackImage = page.id ? images[page.id] : undefined;
            const img = hasTextLayer ? editableBackground : (editableBackground || fallbackImage);

            if (img) {
                const dataUri = await urlToDataUri(img);
                slide.addImage({
                    data: dataUri,
                    x: 0,
                    y: 0,
                    w: slideW,
                    h: slideH,
                });
            }

            for (const element of pageElements) {
                if (element.type === "image") {
                    const dataUri = await urlToDataUri(element.src);
                    slide.addImage({
                        data: dataUri,
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                        sizing: {
                            type: element.fit === "contain" ? "contain" : element.fit === "stretch" ? "crop" : "cover",
                            x: element.x * slideW,
                            y: element.y * slideH,
                            w: element.w * slideW,
                            h: element.h * slideH,
                        },
                    });
                }

                if (element.type === "shape") {
                    if (element.shape === "line") {
                        slide.addShape(pptx.ShapeType.line, {
                            x: element.x * slideW,
                            y: element.y * slideH + (element.h * slideH) / 2,
                            w: element.w * slideW,
                            h: 0,
                            line: {
                                color: String(element.stroke || "FFFFFF").replace(/^#/, ""),
                                width: element.strokeWidth || 1.5,
                            },
                        });
                        continue;
                    }

                    const pptxShapeType =
                        element.shape === "roundRect"
                            ? pptx.ShapeType.roundRect
                            : element.shape === "triangle"
                                ? ((pptx.ShapeType as any).triangle || (pptx.ShapeType as any).rtTriangle || pptx.ShapeType.rect)
                                : element.shape === "parallelogram"
                                    ? ((pptx.ShapeType as any).parallelogram || pptx.ShapeType.rect)
                                    : element.shape === "trapezoid"
                                        ? ((pptx.ShapeType as any).trapezoid || pptx.ShapeType.rect)
                                        : element.shape === "hexagon"
                                            ? ((pptx.ShapeType as any).hexagon || pptx.ShapeType.rect)
                                            : element.shape === "chevron"
                                                ? ((pptx.ShapeType as any).chevron || pptx.ShapeType.rect)
                                                : element.shape === "message"
                                                    ? ((pptx.ShapeType as any).wedgeRoundRectCallout || (pptx.ShapeType as any).wedgeRectCallout || pptx.ShapeType.roundRect)
                                                    : pptx.ShapeType.rect;

                    slide.addShape(
                        pptxShapeType,
                        {
                            x: element.x * slideW,
                            y: element.y * slideH,
                            w: element.w * slideW,
                            h: element.h * slideH,
                            fill: element.fill
                                ? { color: String(element.fill).replace(/^#/, ""), transparency: 0 }
                                : { color: "FFFFFF", transparency: 100 },
                            line: {
                                color: String(element.stroke || "FFFFFF").replace(/^#/, ""),
                                transparency: element.stroke ? 0 : 100,
                                width: element.strokeWidth || 1,
                            },
                        }
                    );
                }

                if (element.type === "table") {
                    slide.addTable(
                        element.rows.map((row) => row.map((cell) => ({ text: String(cell || "") }))),
                        {
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                        border: {
                            type: "solid",
                            color: toHexColor(element.stroke, "94A3B8"),
                            pt: 1,
                        },
                        fill: { color: element.fill ? toHexColor(element.fill, "FFFFFF") : "FFFFFF" },
                        color: toHexColor(element.textColor, "111827"),
                        margin: 0.06,
                        fontFace: "Aptos",
                        fontSize: 10,
                        bold: false,
                        rowH: Math.max(0.22, (element.h * slideH) / Math.max(element.rows.length || 1, 1)),
                        }
                    );
                    continue;
                }

                if (element.type === "chart") {
                    const chartDataUri = renderChartSvgDataUri(element);
                    slide.addImage({
                        data: chartDataUri,
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                    });
                    continue;
                }

                if (element.type === "formula") {
                    slide.addText(element.latex || "", {
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                        fontFace: "Cambria Math",
                        fontSize: element.fontSize || 18,
                        color: toHexColor(element.color, "111827"),
                        margin: 0.06,
                        fit: "shrink",
                        breakLine: false,
                        valign: "middle",
                    });
                    continue;
                }

                if (element.type === "video" || element.type === "audio") {
                    const mediaTitle = element.title || (element.type === "video" ? "Video" : "Audio");
                    const placeholderUri = renderMediaPlaceholderSvgDataUri(element.type, mediaTitle);
                    slide.addImage({
                        data: placeholderUri,
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                    });
                    slide.addNotes(`[${element.type}] ${mediaTitle}: ${element.src}`);
                    continue;
                }
            }

            if (hasTextLayer) {
                for (const block of pageTextBlocks) {
                    const style = block.style || {};
                    const fontSize = resolveTextBlockFontSize(block, PPT_REFERENCE_SLIDE_WIDTH, PPT_REFERENCE_SLIDE_HEIGHT);
                    slide.addText(block.text, {
                        x: block.x * slideW,
                        y: block.y * slideH,
                        w: block.w * slideW,
                        h: block.h * slideH,
                        fontFace: style.fontFamily || "Aptos",
                        fontSize,
                        bold: Number(style.fontWeight || (block.role === "title" ? 900 : block.role === "tag" ? 800 : 500)) >= 600,
                        italic: style.fontStyle === "italic",
                        color: String(style.color || (block.role === "title" ? "FFFFFF" : block.role === "tag" ? "FFD66B" : "FFFFFF")).replace(/^#/, ""),
                        align: style.align || "left",
                        margin: 0,
                        fit: "shrink",
                        breakLine: false,
                        valign: "middle",
                    });
                }
            } else if (!img) {
                slide.addText(page.title || "", {
                    x: 0.6,
                    y: 0.6,
                    w: slideW - 1.2,
                    h: 1.0,
                    fontSize: 28,
                    bold: true,
                    color: "111827",
                });
            }
        }

        await pptx.writeFile({ fileName: `${filename}.pptx` });
    },

    exportPdf: async (pages: PptPage[], images: Record<string, string>, filename: string) => {
        const pdfDoc = await PDFDocument.create();
        const pageWidth = 960;
        const pageHeight = 540;

        for (const page of pages) {
            const img = page.backgroundImageUrl || (page.id ? images[page.id] : undefined);
            const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

            const composedDataUri = await renderPageToDataUri(page, img, pageWidth * 2, pageHeight * 2);
            const base64 = composedDataUri.split(",")[1] || "";
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const embedded = await pdfDoc.embedPng(bytes);
            pdfPage.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        }

        const pdfBytes = await pdfDoc.save();
        downloadBlob(pdfBytes, "application/pdf", `${filename}.pdf`);
    }
};



