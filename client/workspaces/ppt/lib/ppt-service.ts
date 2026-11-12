import { generateChatMessage, generateImage, generateVisionChatMessage } from "@/ai/client"
import { FREEFORM, PPTX_SHAPE, type ShapeName } from "@/workspaces/ppt/lib/shapes"
import { buildRisenPrompt } from "./risen-prompt"
import { buildEditPagePrompt, buildPageImagePrompt, buildPlanPrompt } from "./slide-prompts"
import pptOutlineSystem from "@prompts/ppt/outline.md?raw"

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
    shape: ShapeName;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    /** For `polygon`: the traced outline, in fractions of the shape's own box. */
    points?: Array<readonly [number, number]>;
    /**
     * For a ring: how much of its radius is hole, measured rather than
     * assumed. Zero means it was found to be solid.
     */
    innerRatio?: number;
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

/**
 * A whole-deck plan is one long JSON answer (every slide's bullets, notes and
 * image description), sent with the template image when there is one; slower
 * models need well over two minutes for an eight-slide deck.
 */
export const PLAN_TIMEOUT_MS = 300_000;

/**
 * Image gateways sometimes accept a request and never answer. Without a limit
 * that slide spins forever and so does the whole deck's progress bar; with one
 * it gets one more try and then fails, where "re-render this slide" can pick
 * it up.
 */
export const SLIDE_IMAGE_TIMEOUT_MS = 240_000;
const SLIDE_IMAGE_ATTEMPTS = 2;

export const pptService = {
    // A1. PlanFromIdeaAgent

    generateOutline: async (
        topic: string,
        uiLanguage: "zh" | "en" = "zh",
        referenceFiles?: ReferenceFileInput[],
        referenceImageAssets?: ReferenceImageAssetInput[],
        templateImageUrl?: string,
    ): Promise<PptPage[]> => {
        const templateImage = String(templateImageUrl || "").trim();
        const hasTemplate = Boolean(templateImage);
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = buildPlanPrompt({ mode: "idea", input: topic, uiLanguage, referenceText: refText, imageAssetText, hasTemplate });

        const response = hasTemplate
            ? await generateVisionChatMessage(PPT_OUTLINE_SYSTEM, prompt, [templateImage], undefined, {
                  timeoutMs: PLAN_TIMEOUT_MS,
              })
            : await generateChatMessage(
                  [
                      { role: "system", content: PPT_OUTLINE_SYSTEM },
                      { role: "user", content: prompt },
                  ],
                  undefined,
                  { timeoutMs: PLAN_TIMEOUT_MS },
              );

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
        referenceImageAssets?: ReferenceImageAssetInput[],
        templateImageUrl?: string,
    ): Promise<PptPage[]> => {
        const templateImage = String(templateImageUrl || "").trim();
        const hasTemplate = Boolean(templateImage);
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = buildPlanPrompt({ mode: "outline", input: outlineText, uiLanguage, referenceText: refText, imageAssetText, hasTemplate });
        const response = hasTemplate
            ? await generateVisionChatMessage(PPT_OUTLINE_SYSTEM, prompt, [templateImage], undefined, {
                  timeoutMs: PLAN_TIMEOUT_MS,
              })
            : await generateChatMessage(
                  [
                      { role: "system", content: PPT_OUTLINE_SYSTEM },
                      { role: "user", content: prompt },
                  ],
                  undefined,
                  { timeoutMs: PLAN_TIMEOUT_MS },
              );
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
        const prompt = buildPageImagePrompt({
            page,
            uiLanguage,
            hasTemplate: Boolean(templateImageUrl),
            materialLabels: normalizedAdditional.map((x, i) => x.label || `MATERIAL_${i + 1}`),
            extraRequirements,
        });
        const additionalReferenceImageUrls = Array.isArray(normalizedAdditional)
            ? normalizedAdditional.map((x) => String(x?.url || "")).filter(Boolean)
            : [];

        let lastError: unknown;
        for (let attempt = 1; attempt <= SLIDE_IMAGE_ATTEMPTS; attempt++) {
            try {
                const imageUrl = await generateImage(
                    {
                        prompt,
                        referenceImageUrl: templateImageUrl || undefined,
                        additionalReferenceImageUrls,
                    },
                    AbortSignal.timeout(SLIDE_IMAGE_TIMEOUT_MS),
                );
                if (!imageUrl) throw new Error("Slide image generation returned no image.");
                return imageUrl;
            } catch (error) {
                lastError = error;
                // Only a stalled request is worth repeating; a rejected one would fail the same way again.
                const name = (error as { name?: string })?.name;
                if (name !== "TimeoutError" && name !== "AbortError") break;
            }
        }
        throw lastError;
    },

    editPageImage: async (page: PptPage, instruction: string, referenceImageUrl?: string, templateImageUrl?: string, additionalImages?: string[]) => {
        const prompt = buildEditPagePrompt({
            page,
            instruction,
            hasTemplate: Boolean(templateImageUrl),
            hasAdditional: Array.isArray(additionalImages) && additionalImages.length > 0,
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

    exportPptx: async (pages: PptPage[], images: Record<string, string>, filename: string) => {
        const { default: PptxGenJS } = await import("pptxgenjs");
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

                    const paint = {
                        fill: element.fill
                            ? { color: String(element.fill).replace(/^#/, ""), transparency: 0 }
                            : { color: "FFFFFF", transparency: 100 },
                        line: {
                            color: String(element.stroke || "FFFFFF").replace(/^#/, ""),
                            transparency: element.stroke ? 0 : 100,
                            width: element.strokeWidth || 1,
                        },
                    };

                    // A traced outline has no preset to stand for it, so it
                    // goes out as custom geometry built from its own points.
                    // `custGeom` is what the writer checks for, even though
                    // the published ShapeType enum does not list it.
                    if (element.shape === FREEFORM) {
                        const traced = Array.isArray(element.points) ? element.points : [];
                        if (traced.length >= 3) {
                            slide.addShape("custGeom" as any, {
                                ...paint,
                                x: element.x * slideW,
                                y: element.y * slideH,
                                w: element.w * slideW,
                                h: element.h * slideH,
                                points: [
                                    ...traced.map(([px, py], index) => ({
                                        x: px * element.w * slideW,
                                        y: py * element.h * slideH,
                                        ...(index === 0 ? { moveTo: true } : {}),
                                    })),
                                    { close: true },
                                ],
                            } as any);
                            continue;
                        }
                    }

                    const preset = PPTX_SHAPE[element.shape as Exclude<ShapeName, "polygon">];
                    const pptxShapeType = (pptx.ShapeType as any)[preset] || pptx.ShapeType.rect;

                    // A measured `innerRatio` does not survive this step. The
                    // hole belongs in the preset's OOXML adjustment handle, so
                    // that resizing the ring by hand keeps it a ring, and the
                    // writer exposes no way to set one -- only `rectRadius`,
                    // which is a rounded rectangle's corner and not a hole.
                    // Rings therefore export at PowerPoint's default aperture;
                    // the preview draws the measured one.
                    slide.addShape(pptxShapeType, {
                        ...paint,
                        x: element.x * slideW,
                        y: element.y * slideH,
                        w: element.w * slideW,
                        h: element.h * slideH,
                    });
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
        const { PDFDocument } = await import("pdf-lib");
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



