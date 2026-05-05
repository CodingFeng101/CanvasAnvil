import type { CSSProperties, ChangeEvent, ReactNode, TextareaHTMLAttributes } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FileImage,
  ImagePlus,
  Clock,
  History,
  Loader2,
  RotateCcw,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateImage } from "@/lib/ai-client";
import {
  clearPersistedCanvasWorkspaceItem,
  readPersistedCanvasWorkspaceItem,
  savePersistedCanvasWorkspaceItem,
} from "@/lib/canvas-persistence";
import { estimateTextBlockFontSize, type PptTextBlock } from "@/lib/ppt-service";
import { useUiLanguage } from "@/lib/use-ui-language";
import { ChatInput } from "@/workspaces/ppt/chat/ChatInput";
import { ChatMessageDisplay, type UIMessage } from "@/workspaces/ppt/chat/ChatMessageDisplay";
import { Button as PptButton } from "@/workspaces/ppt/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/workspaces/ppt/ui/dialog";
import { ResetWarningModal } from "@/workspaces/ppt/chat/reset-warning-modal";
import { ScrollArea } from "@/workspaces/ppt/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/workspaces/flow/next/components/ui/select";

export type CanvasStudioMode = "poster" | "infographic" | "product";

type SizePreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

type CanvasFormState = {
  sizePreset: string;
  customWidth: string;
  customHeight: string;
  dpi: "72" | "300";
  style: string;
  color: string;
  referenceImageUrl: string;
  theme: string;
  composition: string;
  focus: string;
  whitespace: string;
  sellingPointsText: string;
  bulletPointsText: string;
  dataText: string;
  chartType: string;
  orientation: string;
  productName: string;
  productImageUrl: string;
  backgroundType: string;
  lighting: string;
};

type PosterTextState = {
  title: string;
  subtitle: string;
  body: string;
  cta: string;
};

type ProductTextState = {
  headline: string;
  labels: string[];
};

type CanvasOverlayTextBlock = {
  id: string;
  role: PptTextBlock["role"];
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: PptTextBlock["style"];
};

type CanvasDraft = {
  form: CanvasFormState;
  posterText: PosterTextState;
  productText: ProductTextState;
  stage: "form" | "generated" | "edit";
  generatedImageUrl?: string;
  editableTextBlocks?: CanvasOverlayTextBlock[];
  interactionMessages?: UIMessage[];
  lastGeneratedPrompt?: string;
  versionHistory?: CanvasVersionItem[];
};

type CanvasVersionItem = {
  id: string;
  imageUrl: string;
  prompt?: string;
  createdAt: number;
};

const STYLE_OPTIONS = ["minimal", "tech", "chinese", "cartoon", "business", "fresh", "retro", "dark", "handdrawn"];
const COLOR_OPTIONS = ["blue", "red", "green", "orange", "blackGold", "cyan", "pink", "silver", "ivory", "purple"];
const COMPOSITION_OPTIONS = ["vertical", "horizontal", "centered", "diagonal", "fullBleed"];
const FOCUS_OPTIONS = ["top", "middle", "bottom", "sides"];
const WHITESPACE_OPTIONS = ["low", "medium", "high"];
const CHART_OPTIONS = ["auto", "bar", "pie", "donut", "timeline", "progress"];
const ORIENTATION_OPTIONS = ["portrait", "landscape"];
const BACKGROUND_OPTIONS = ["solid", "gradient", "minimalScene", "realScene", "transparent"];
const LIGHTING_OPTIONS = ["none", "soft", "strong", "side", "topLight"];

const OPTION_LABELS: Record<string, { zh: string; en: string }> = {
  minimal: { zh: "极简", en: "Minimal" },
  tech: { zh: "科技", en: "Tech" },
  chinese: { zh: "中式", en: "Chinese" },
  cartoon: { zh: "卡通", en: "Cartoon" },
  business: { zh: "商务", en: "Business" },
  fresh: { zh: "清新", en: "Fresh" },
  retro: { zh: "复古", en: "Retro" },
  dark: { zh: "暗色", en: "Dark" },
  handdrawn: { zh: "手绘", en: "Hand-drawn" },
  blue: { zh: "蓝色", en: "Blue" },
  red: { zh: "红色", en: "Red" },
  green: { zh: "绿色", en: "Green" },
  orange: { zh: "橙色", en: "Orange" },
  blackGold: { zh: "黑金", en: "Black Gold" },
  cyan: { zh: "青色", en: "Cyan" },
  pink: { zh: "粉色", en: "Pink" },
  silver: { zh: "银灰", en: "Silver Gray" },
  ivory: { zh: "象牙白", en: "Ivory" },
  purple: { zh: "紫色", en: "Purple" },
  vertical: { zh: "上中下", en: "Top / Middle / Bottom" },
  horizontal: { zh: "左中右", en: "Left / Center / Right" },
  centered: { zh: "中心对称", en: "Centered Symmetry" },
  diagonal: { zh: "对角线", en: "Diagonal" },
  fullBleed: { zh: "满版", en: "Full Bleed" },
  top: { zh: "顶部", en: "Top" },
  middle: { zh: "中部", en: "Middle" },
  bottom: { zh: "底部", en: "Bottom" },
  sides: { zh: "左右两侧", en: "Both Sides" },
  low: { zh: "低", en: "Low" },
  medium: { zh: "中", en: "Medium" },
  high: { zh: "高", en: "High" },
  auto: { zh: "自动", en: "Auto" },
  bar: { zh: "柱状图", en: "Bar Chart" },
  pie: { zh: "饼图", en: "Pie Chart" },
  donut: { zh: "环形图", en: "Donut Chart" },
  timeline: { zh: "时间线", en: "Timeline" },
  progress: { zh: "进度条", en: "Progress Bar" },
  portrait: { zh: "竖版", en: "Portrait" },
  landscape: { zh: "横版", en: "Landscape" },
  solid: { zh: "纯色", en: "Solid" },
  gradient: { zh: "渐变", en: "Gradient" },
  minimalScene: { zh: "极简场景", en: "Minimal Scene" },
  realScene: { zh: "真实场景", en: "Real Scene" },
  transparent: { zh: "透明", en: "Transparent" },
  none: { zh: "无", en: "None" },
  soft: { zh: "柔和", en: "Soft" },
  strong: { zh: "强烈", en: "Strong" },
  side: { zh: "侧光", en: "Side Light" },
};
OPTION_LABELS.topLight = { zh: "顶光", en: "Top Light" };

const optionText = (value: string, lang: "zh" | "en") => OPTION_LABELS[value]?.[lang] || value;
const localizeOptions = (options: string[], lang: "zh" | "en") =>
  options.map((value) => ({ value, label: optionText(value, lang) }));

const MODE_PRESETS: Record<CanvasStudioMode, SizePreset[]> = {
  poster: [
    { id: "poster-vertical", label: "1080×1920", width: 1080, height: 1920 },
    { id: "poster-horizontal", label: "1920×1080", width: 1920, height: 1080 },
    { id: "custom", label: "自定义", width: 1080, height: 1920 },
  ],
  infographic: [
    { id: "infographic-long", label: "1080×2000", width: 1080, height: 2000 },
    { id: "infographic-tall", label: "1080×3000", width: 1080, height: 3000 },
    { id: "custom", label: "自定义", width: 1080, height: 2000 },
  ],
  product: [
    { id: "product-square", label: "800×800", width: 800, height: 800 },
    { id: "product-horizontal", label: "1200×630", width: 1200, height: 630 },
    { id: "product-vertical", label: "1080×1440", width: 1080, height: 1440 },
    { id: "custom", label: "自定义", width: 800, height: 800 },
  ],
};

function getStorageKey(mode: CanvasStudioMode, kind: "draft" | "history") {
  return `CanvasAnvil-canvas-${mode}-${kind}-v2`;
}

function getDefaultForm(mode: CanvasStudioMode): CanvasFormState {
  const preset = MODE_PRESETS[mode][0];
  return {
    sizePreset: preset.id,
    customWidth: String(preset.width),
    customHeight: String(preset.height),
    dpi: "72",
    style: STYLE_OPTIONS[0],
    color: COLOR_OPTIONS[0],
    referenceImageUrl: "",
    theme: mode === "infographic" ? "年度业务增长报告" : "春季上新活动",
    composition: COMPOSITION_OPTIONS[0],
    focus: FOCUS_OPTIONS[1],
    whitespace: WHITESPACE_OPTIONS[1],
    sellingPointsText: mode === "product" ? "卖点一\n卖点二\n卖点三" : "高识别度视觉\n重点信息突出\n便于社媒传播",
    bulletPointsText: "市场规模增长\n用户活跃度提升\n转化效率提高",
    dataText: "销量: 32,45,67\n转化率: 12,18,25",
    chartType: CHART_OPTIONS[0],
    orientation: ORIENTATION_OPTIONS[0],
    productName: "旗舰新品",
    productImageUrl: "",
    backgroundType: BACKGROUND_OPTIONS[1],
    lighting: LIGHTING_OPTIONS[1],
  };
}

function getDefaultPosterText(form: CanvasFormState): PosterTextState {
  const points = form.sellingPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    title: form.theme || "品牌活动海报",
    subtitle: points[0] || "核心卖点一眼可见",
    body: points.slice(1).join(" · ") || "突出重点信息，适配社媒传播与线下展示。",
    cta: "立即了解",
  };
}

function getDefaultProductText(form: CanvasFormState): ProductTextState {
  const points = form.sellingPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  while (points.length < 4) points.push(`卖点 ${points.length + 1}`);
  return {
    headline: form.productName || "产品主标题",
    labels: points,
  };
}

function buildPrompt(mode: CanvasStudioMode, form: CanvasFormState) {
  const size = resolveCanvasSize(mode, form);
  const style = optionText(form.style, "zh");
  const color = optionText(form.color, "zh");
  const composition = optionText(form.composition, "zh");
  const focus = optionText(form.focus, "zh");
  const whitespace = optionText(form.whitespace, "zh");
  const chartType = optionText(form.chartType, "zh");
  const orientation = optionText(form.orientation, "zh");
  const backgroundType = optionText(form.backgroundType, "zh");
  const lighting = optionText(form.lighting, "zh");
  const sellingPoints = form.sellingPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const bulletPoints = form.bulletPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (mode === "poster") {
    return `生成一张${size.width}x${size.height}的中文海报，风格${style}，主色调${color}，主题“${form.theme}”，构图${composition}，视觉重点${focus}，留白${whitespace}，分辨率${form.dpi}DPI，卖点：${sellingPoints.join("、") || "无"}。画面需要高级、清晰、适合品牌传播。`;
  }
  if (mode === "infographic") {
    return `生成一张${size.width}x${size.height}的信息图，主题“${form.theme}”，主色调${color}，风格${style}，内容要点：${bulletPoints.join("、") || "无"}，数据：${form.dataText || "无"}，图表偏向${chartType}，排版${orientation}。要求结构清晰，信息层级明确。`;
  }
  return `生成一张${size.width}x${size.height}的产品介绍图，产品名“${form.productName}”，风格${style}，主色调${color}，背景${backgroundType}，光影${lighting}，卖点：${sellingPoints.join("、") || "无"}。画面要突出主体产品，适合电商宣传。`;
}

function resolveCanvasSize(mode: CanvasStudioMode, form: CanvasFormState) {
  const preset = MODE_PRESETS[mode].find((item) => item.id === form.sizePreset) || MODE_PRESETS[mode][0];
  if (form.sizePreset !== "custom") {
    return { width: preset.width, height: preset.height };
  }
  const width = Number(form.customWidth);
  const height = Number(form.customHeight);
  return {
    width: Number.isFinite(width) && width > 0 ? Math.min(width, 4000) : preset.width,
    height: Number.isFinite(height) && height > 0 ? Math.min(height, 4000) : preset.height,
  };
}

function formatPresetLabel(preset: SizePreset) {
  return preset.label;
}

function updatePosterTextBlocks(blocks: PptTextBlock[], text: PosterTextState) {
  return blocks.map((block, index) => {
    const nextText = index === 0 ? text.title : index === 1 ? text.subtitle : index === 2 ? text.body : text.cta;
    if (!nextText) return block;
    return { ...block, text: nextText };
  });
}

function updateProductTextBlocks(blocks: PptTextBlock[], text: ProductTextState) {
  return blocks.map((block, index) => {
    const nextText = index === 0 ? text.headline : text.labels[index - 1] || block.text;
    return { ...block, text: nextText };
  });
}

function buildGenerationContext(mode: CanvasStudioMode, form: CanvasFormState) {
  const size = resolveCanvasSize(mode, form);
  const style = optionText(form.style, "zh");
  const color = optionText(form.color, "zh");
  const composition = optionText(form.composition, "zh");
  const focus = optionText(form.focus, "zh");
  const whitespace = optionText(form.whitespace, "zh");
  const chartType = optionText(form.chartType, "zh");
  const orientation = optionText(form.orientation, "zh");
  const backgroundType = optionText(form.backgroundType, "zh");
  const lighting = optionText(form.lighting, "zh");
  const sellingPoints = form.sellingPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const bulletPoints = form.bulletPointsText
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (mode === "poster") {
    return [
      `当前画布参数：`,
      `- 尺寸：${size.width}x${size.height}`,
      `- 分辨率：${form.dpi} DPI`,
      `- 风格：${style}`,
      `- 主色调：${color}`,
      `- 构图：${composition}`,
      `- 视觉重点：${focus}`,
      `- 留白：${whitespace}`,
      `- 主题：${form.theme || "未填写"}`,
      `- 卖点：${sellingPoints.join("、") || "无"}`,
    ].join("\n");
  }

  if (mode === "infographic") {
    return [
      `当前画布参数：`,
      `- 尺寸：${size.width}x${size.height}`,
      `- 风格：${style}`,
      `- 主色调：${color}`,
      `- 构图：${composition}`,
      `- 视觉重点：${focus}`,
      `- 留白：${whitespace}`,
      `- 主题：${form.theme || "未填写"}`,
      `- 图表类型：${chartType}`,
      `- 排版方向：${orientation}`,
      `- 要点：${bulletPoints.join("、") || "无"}`,
      `- 数据：${form.dataText || "无"}`,
    ].join("\n");
  }

  return [
    `当前画布参数：`,
    `- 尺寸：${size.width}x${size.height}`,
    `- 风格：${style}`,
    `- 主色调：${color}`,
    `- 背景：${backgroundType}`,
    `- 光影：${lighting}`,
    `- 主题：${form.productName || "未填写"}`,
    `- 卖点：${sellingPoints.join("、") || "无"}`,
  ].join("\n");
}

async function loadImage(url: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  return image;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function exportCanvasImage({
  generatedImageUrl,
  editableTextBlocks,
  posterText,
  productText,
  mode,
  format,
  size,
}: {
  generatedImageUrl: string;
  editableTextBlocks: CanvasOverlayTextBlock[];
  posterText: PosterTextState;
  productText: ProductTextState;
  mode: CanvasStudioMode;
  format: "png" | "jpg";
  size: { width: number; height: number };
}) {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  const image = await loadImage(generatedImageUrl);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const textBlocks = editableTextBlocks.length
    ? editableTextBlocks
    : mode === "poster"
      ? [
          { id: "poster-title", role: "title" as const, text: posterText.title, x: 0.08, y: 0.1, w: 0.84, h: 0.14 },
          { id: "poster-subtitle", role: "summary" as const, text: posterText.subtitle, x: 0.08, y: 0.26, w: 0.84, h: 0.08 },
          { id: "poster-body", role: "bullet" as const, text: posterText.body, x: 0.08, y: 0.7, w: 0.84, h: 0.12 },
          { id: "poster-cta", role: "tag" as const, text: posterText.cta, x: 0.08, y: 0.84, w: 0.32, h: 0.07 },
        ]
      : mode === "product"
        ? [
            { id: "product-headline", role: "title" as const, text: productText.headline, x: 0.08, y: 0.08, w: 0.84, h: 0.12 },
            ...productText.labels.map((label, index) => ({
              id: `product-label-${index}`,
              role: "tag" as const,
              text: label,
              x: index % 2 === 0 ? 0.06 : 0.58,
              y: 0.28 + Math.floor(index / 2) * 0.24,
              w: 0.32,
              h: 0.1,
            })),
          ]
        : [];

  for (const block of textBlocks) {
    if (!block.text?.trim()) continue;
    const x = block.x * canvas.width;
    const y = block.y * canvas.height;
    const width = block.w * canvas.width;
    const height = block.h * canvas.height;
    const fontSize = estimateTextBlockFontSize(block, canvas.width, canvas.height);

    context.save();
    context.fillStyle = mode === "product" ? "rgba(15, 23, 42, 0.72)" : "rgba(255, 255, 255, 0.86)";
    context.strokeStyle = mode === "product" ? "rgba(255,255,255,0.18)" : "rgba(15, 23, 42, 0.08)";
    context.lineWidth = 1;
    const radius = Math.min(width, height) * 0.12;
    roundRect(context, x, y, width, height, radius);
    context.fill();
    context.stroke();
    context.fillStyle = mode === "product" ? "#ffffff" : "#0f172a";
    context.font = `${fontSize}px Inter, sans-serif`;
    context.textBaseline = "middle";
    context.fillText(block.text, x + 14, y + height / 2, width - 28);
    context.restore();
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export image"));
    }, format === "png" ? "image/png" : "image/jpeg", format === "png" ? 1 : 0.92);
  });
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function ControlField({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function fieldClassName() {
  return "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-blue-500/70 focus:ring-2 focus:ring-blue-500/15";
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${fieldClassName()} min-h-[92px] resize-y ${props.className || ""}`} />;
}

function StyledSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/20">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur">
        {options.map((option) => (
          <SelectItem
            key={typeof option === "string" ? option : option.value}
            value={typeof option === "string" ? option : option.value}
            className="rounded-lg py-2 text-sm data-[highlighted]:bg-muted data-[highlighted]:text-foreground"
          >
            {typeof option === "string" ? option : option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PanelCard({ title, icon: Icon, children }: { title: string; icon: typeof Sparkles; children: ReactNode }) {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-blue-600" />
        {title}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CanvasHistoryDialog({
  open,
  onOpenChange,
  history,
  onRestore,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: CanvasVersionItem[];
  onRestore: (item: CanvasVersionItem) => void;
  onClear: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              版本历史
            </DialogTitle>
            {history.length > 0 ? (
              <PptButton size="sm" variant="ghost" onClick={onClear} className="gap-1 text-xs">
                清空
              </PptButton>
            ) : null}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-hidden mt-2">
          {history.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Clock className="w-8 h-8 opacity-20" />
              <p>暂无历史记录</p>
            </div>
          ) : (
            <ScrollArea className="h-[420px] pr-4">
              <div className="space-y-3">
                {[...history].reverse().map((item, index) => (
                  <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3 group">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                      <img src={item.imageUrl} alt="" className="h-14 w-14 rounded-md object-cover border border-border/50 bg-white" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">版本 {history.length - index}</div>
                        <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <PptButton
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onRestore(item);
                        onOpenChange(false);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-xs"
                    >
                      <RotateCcw className="w-3 h-3" />
                      恢复
                    </PptButton>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CanvasStudioBase({ mode }: { mode: CanvasStudioMode }) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  const styleOptions = useMemo(() => localizeOptions(STYLE_OPTIONS, uiLang), [uiLang]);
  const colorOptions = useMemo(() => localizeOptions(COLOR_OPTIONS, uiLang), [uiLang]);
  const compositionOptions = useMemo(() => localizeOptions(COMPOSITION_OPTIONS, uiLang), [uiLang]);
  const focusOptions = useMemo(() => localizeOptions(FOCUS_OPTIONS, uiLang), [uiLang]);
  const whitespaceOptions = useMemo(() => localizeOptions(WHITESPACE_OPTIONS, uiLang), [uiLang]);
  const chartOptions = useMemo(() => localizeOptions(CHART_OPTIONS, uiLang), [uiLang]);
  const orientationOptions = useMemo(() => localizeOptions(ORIENTATION_OPTIONS, uiLang), [uiLang]);
  const backgroundOptions = useMemo(() => localizeOptions(BACKGROUND_OPTIONS, uiLang), [uiLang]);
  const lightingOptions = useMemo(() => localizeOptions(LIGHTING_OPTIONS, uiLang), [uiLang]);
  const draftStorageKey = getStorageKey(mode, "draft");
  const defaultForm = useMemo(() => {
    const base = getDefaultForm(mode);
    return {
      ...base,
      theme: "",
      sellingPointsText: "",
      bulletPointsText: "",
      dataText: "",
      productName: "",
    };
  }, [mode]);
  const hasHydratedDraftRef = useRef(false);
  const [form, setForm] = useState<CanvasFormState>(defaultForm);
  const [posterText, setPosterText] = useState<PosterTextState>(getDefaultPosterText(defaultForm));
  const [productText, setProductText] = useState<ProductTextState>(getDefaultProductText(defaultForm));
  const [stage, setStage] = useState<"form" | "edit">("form");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [editableTextBlocks, setEditableTextBlocks] = useState<CanvasOverlayTextBlock[]>([]);
  const [interactionMessages, setInteractionMessages] = useState<UIMessage[]>([]);
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState("");
  const [interactionInput, setInteractionInput] = useState("");
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState<"png" | "jpg" | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [versionHistory, setVersionHistory] = useState<CanvasVersionItem[]>([]);

  const size = resolveCanvasSize(mode, form);
  const isPortraitPreview = size.height >= size.width;
  const canGenerate = mode === "product"
    ? Boolean(form.productImageUrl.trim())
    : Boolean(form.theme.trim());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const draft = await readPersistedCanvasWorkspaceItem<CanvasDraft>(draftStorageKey);
        if (cancelled) return;

        if (draft) {
          const nextForm = draft.form || defaultForm;
          setForm(nextForm);
          setPosterText(draft.posterText || getDefaultPosterText(nextForm));
          setProductText(draft.productText || getDefaultProductText(nextForm));
          setStage(draft.stage === "edit" && draft.generatedImageUrl ? "edit" : "form");
          setGeneratedImageUrl(draft.generatedImageUrl || "");
          setEditableTextBlocks(Array.isArray(draft.editableTextBlocks) ? draft.editableTextBlocks : []);
          setInteractionMessages(Array.isArray(draft.interactionMessages) ? draft.interactionMessages : []);
          setLastGeneratedPrompt(draft.lastGeneratedPrompt || "");
          setVersionHistory(Array.isArray(draft.versionHistory) ? draft.versionHistory : []);
        } else {
          setForm(defaultForm);
          setPosterText(getDefaultPosterText(defaultForm));
          setProductText(getDefaultProductText(defaultForm));
          setStage("form");
          setGeneratedImageUrl("");
          setEditableTextBlocks([]);
          setInteractionMessages([]);
          setLastGeneratedPrompt("");
          setVersionHistory([]);
        }
      } catch (error) {
        console.error("Failed to load persisted canvas draft", error);
      } finally {
        if (!cancelled) {
          hasHydratedDraftRef.current = true;
          setIsDraftLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultForm, draftStorageKey]);

  useEffect(() => {
    if (!isDraftLoaded || !hasHydratedDraftRef.current) return;

    void savePersistedCanvasWorkspaceItem(draftStorageKey, {
      form,
      posterText,
      productText,
      stage,
      generatedImageUrl,
      editableTextBlocks,
      interactionMessages,
      lastGeneratedPrompt,
      versionHistory,
    } satisfies CanvasDraft).catch((error) => {
      console.error("Failed to persist canvas draft", error);
    });
  }, [draftStorageKey, editableTextBlocks, form, generatedImageUrl, interactionMessages, isDraftLoaded, lastGeneratedPrompt, posterText, productText, stage, versionHistory]);

  const updateForm = (patch: Partial<CanvasFormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (mode === "poster") {
        setPosterText((current) => ({
          ...current,
          title: patch.theme !== undefined ? patch.theme || current.title : current.title,
        }));
      }
      if (mode === "product") {
        setProductText((current) => ({
          ...current,
          headline: patch.productName !== undefined ? patch.productName || current.headline : current.headline,
        }));
      }
      return next;
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>, field: "productImageUrl" | "referenceImageUrl") => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateForm({ [field]: String(reader.result || "") } as Partial<CanvasFormState>);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const pushInteractionMessage = (role: "user" | "assistant", text: string) => {
    setInteractionMessages((prev) => [
      ...prev,
      {
        id: `${role}-${Date.now()}-${Math.random()}`,
        role,
        content: text,
        parts: [{ type: "text", text }],
      },
    ]);
  };

  const handleRestoreHistoryItem = (item: CanvasVersionItem) => {
    setGeneratedImageUrl(item.imageUrl);
    setLastGeneratedPrompt(item.prompt || "");
    setStage("edit");
    toast.success(tr("已恢复到该版本。", "Restored to this version."));
  };

  const handleGenerate = async () => {
    if (!canGenerate || isGenerating) return;
    setIsGenerating(true);
    try {
      const nextForm = { ...form };
      const prompt = buildPrompt(mode, nextForm);
      const url = await generateImage({
        prompt,
        referenceImageUrl: mode === "product" ? nextForm.productImageUrl || undefined : nextForm.referenceImageUrl || undefined,
        additionalReferenceImageUrls: mode === "product" && nextForm.referenceImageUrl ? [nextForm.referenceImageUrl] : undefined,
      });
      setGeneratedImageUrl(url);
      setLastGeneratedPrompt(prompt);
      setEditableTextBlocks([]);
      if (mode === "poster") setPosterText(getDefaultPosterText(nextForm));
      if (mode === "product") setProductText(getDefaultProductText(nextForm));
      setStage("edit");
      setInteractionMessages([]);
      setVersionHistory((prev) => (url ? [...prev, { id: `version-${Date.now()}-${Math.random()}`, imageUrl: url, prompt, createdAt: Date.now() }] : prev));
    } catch (error) {
      toast.error(tr("生成失败，请稍后重试", "Generation failed. Please try again."));
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const buildInteractionPrompt = (userRequest: string) => {
    const context = buildGenerationContext(mode, form);
    if (mode === "poster") {
      return [
        "Edit the provided poster image according to the user's request.",
        "Use the current generated image as the main reference.",
        "Keep the overall subject, composition, and canvas orientation unless the user explicitly asks to change them.",
        "Preserve the original aspect ratio and do not rotate the layout from landscape to portrait.",
        context,
        `User request: ${userRequest}`,
      ].join(" ");
    }
    if (mode === "infographic") {
      return [
        "Edit the provided infographic image according to the user's request.",
        "Use the current generated image as the main reference.",
        "Preserve the infographic style and layout logic unless the user explicitly asks to change them.",
        "Preserve the original aspect ratio and do not rotate the layout from landscape to portrait unless requested.",
        context,
        `User request: ${userRequest}`,
      ].join(" ");
    }
    return [
      "Edit the provided product showcase image according to the user's request.",
      "Use the current generated image as the main reference.",
      "Keep product identity stable. The uploaded product image is a hard reference constraint.",
      context,
      `User request: ${userRequest}`,
    ].join(" ");
  };

  const submitInteractionRequest = async (content: string) => {
    if (!content || isGenerating) return;
    pushInteractionMessage("user", content);
    setIsGenerating(true);

    try {
      const url = await generateImage({
        prompt: buildInteractionPrompt(content),
        referenceImageUrl: generatedImageUrl,
        additionalReferenceImageUrls:
          mode === "product"
            ? [form.productImageUrl, form.referenceImageUrl].filter(Boolean) as string[]
            : form.referenceImageUrl
              ? [form.referenceImageUrl]
              : undefined,
      });

      setGeneratedImageUrl(url);
      setLastGeneratedPrompt(buildInteractionPrompt(content));
      setEditableTextBlocks([]);
      pushInteractionMessage("assistant", tr("已根据当前图片和你的要求进行了修改。", "Updated based on the current image and your request."));
      setVersionHistory((prev) => [...prev, { id: `version-${Date.now()}-${Math.random()}`, imageUrl: url, prompt: buildInteractionPrompt(content), createdAt: Date.now() }]);
    } catch (error) {
      console.error(error);
      pushInteractionMessage("assistant", tr("修改生成失败，请稍后重试。", "Failed to update. Please try again."));
      toast.error(tr("修改生成失败", "Failed to regenerate."));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInteractionSubmit = async () => {
    const content = interactionInput.trim();
    if (!content || isGenerating) return;
    setInteractionInput("");
    await submitInteractionRequest(content);
  };

  const handleInteractionEdit = async (messageIndex: number, newText: string) => {
    const content = newText.trim();
    if (!content || isGenerating) return;
    setInteractionMessages((prev) => prev.slice(0, messageIndex));
    await submitInteractionRequest(content);
  };

  const handleExport = async (format: "png" | "jpg") => {
    if (!generatedImageUrl || isExporting) return;
    setIsExporting(format);
    try {
      const blob = await dataUrlToBlob(generatedImageUrl);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${mode}-${Date.now()}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(tr("导出失败", "Export failed."));
      console.error(error);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDeleteGeneratedContent = () => {
    setGeneratedImageUrl("");
    setEditableTextBlocks([]);
    setInteractionMessages([]);
    setInteractionInput("");
    setLastGeneratedPrompt("");
    setVersionHistory([]);
    setStage("form");
    setShowResetWarning(false);
    void clearPersistedCanvasWorkspaceItem(draftStorageKey).catch((error) => {
      console.error("Failed to clear persisted canvas draft", error);
    });
    toast.success(tr("已删除当前生成内容", "Current generated content deleted."));
  };

  const renderExtractedTextBlocks = () => {
    if (editableTextBlocks.length === 0) return null;
    return editableTextBlocks.map((block) => {
      const style: CSSProperties = {
        position: "absolute",
        left: `${block.x * 100}%`,
        top: `${block.y * 100}%`,
        width: `${block.w * 100}%`,
        height: `${block.h * 100}%`,
        padding: "0.5rem 0.75rem",
        display: "flex",
        alignItems: "center",
        borderRadius: "1rem",
        background: mode === "product" ? "rgba(15,23,42,0.65)" : "rgba(255,255,255,0.82)",
        color: mode === "product" ? "#fff" : "#0f172a",
        fontSize: `${Math.max(12, block.style?.fontSize || estimateTextBlockFontSize(block, size.width, size.height))}px`,
        boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
        overflow: "hidden",
      };
      return (
        <div key={block.id} style={style}>
          {block.text}
        </div>
      );
    });
  };

  const renderEditChatPanel = () => {
    return (
      <div className="flex h-full min-h-0 flex-col bg-card">
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatMessageDisplay
            messages={interactionMessages}
            setInput={setInteractionInput}
            onEditMessage={handleInteractionEdit}
            status={isGenerating ? "streaming" : "idle"}
          />
        </div>

        <div className="border-t border-border/50 bg-card/70 p-4">
          <ChatInput
            input={interactionInput}
            setInput={setInteractionInput}
            onSubmit={handleInteractionSubmit}
            isLoading={isGenerating}
            uploadMode="none"
            onClearChat={() => setShowResetWarning(true)}
            onToggleHistory={() => setShowHistory(true)}
            historyDisabled={versionHistory.length === 0}
            placeholder={
              mode === "poster"
                ? tr("例如：标题：春季上新海报", "For example: Title: Spring campaign poster")
                : mode === "infographic"
                  ? tr("例如：要点：增长趋势；品牌集中度", "For example: Points: growth trend; brand concentration")
                  : tr("例如：卖点1：快速升温", "For example: Point1: Fast heating")
            }
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="h-full overflow-hidden bg-background text-foreground">
        <div className="h-full p-4">
          <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_400px] gap-3">
            <div className="relative min-h-0 rounded-xl border border-border/30 bg-card shadow-soft">
              <div className="absolute right-4 top-4 z-20 flex gap-2">
                {generatedImageUrl ? (
                  <>
                    <Button variant="outline" onClick={() => void handleExport("png")} disabled={!!isExporting} className="h-8 rounded-md bg-background/92 px-3 text-xs backdrop-blur">
                      {isExporting === "png" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                      PNG
                    </Button>
                    <Button variant="outline" onClick={() => void handleExport("jpg")} disabled={!!isExporting} className="h-8 rounded-md bg-background/92 px-3 text-xs backdrop-blur">
                      {isExporting === "jpg" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                      JPG
                    </Button>
                  </>
                ) : null}
              </div>
              <div className="flex h-full items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.08),_transparent_34%),linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.9))] p-4">
                <div
                  className={`relative overflow-hidden rounded-xl border border-border bg-background shadow-lg ${
                    isPortraitPreview ? "h-full w-auto max-w-full" : "h-auto max-h-full w-full"
                  }`}
                  style={{
                    aspectRatio: `${size.width} / ${size.height}`,
                    maxWidth: isPortraitPreview ? (mode === "infographic" ? "420px" : undefined) : "980px",
                  }}
                >
                  {generatedImageUrl ? (
                    <>
                      <img
                        src={generatedImageUrl}
                        alt=""
                        className={`absolute inset-0 h-full w-full ${mode === "infographic" ? "object-contain bg-white" : "object-cover"}`}
                      />
                      {renderExtractedTextBlocks()}
                    </>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                      <div className="rounded-full border border-blue-200 bg-blue-50 p-4">
                        <FileImage className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 overflow-hidden rounded-xl border border-border/30 bg-card shadow-soft">
              {stage === "form" ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <PanelCard title={tr("生成参数", "Parameters")} icon={RefreshCcw}>
                      {mode === "infographic" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <ControlField label={tr("尺寸", "Size")}>
                            <Select value={form.sizePreset} onValueChange={(value) => updateForm({ sizePreset: value })}>
                              <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/20">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur">
                                {MODE_PRESETS[mode].map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id} className="rounded-lg py-2 text-sm data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                                    {formatPresetLabel(preset)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ControlField>
                          <ControlField label={tr("主色调", "Primary Color")}>
                            <StyledSelect value={form.color} onChange={(value) => updateForm({ color: value })} options={colorOptions} />
                          </ControlField>
                        </div>
                      ) : mode === "product" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <ControlField label={tr("尺寸", "Size")}>
                            <Select value={form.sizePreset} onValueChange={(value) => updateForm({ sizePreset: value })}>
                              <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/20">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur">
                                {MODE_PRESETS[mode].map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id} className="rounded-lg py-2 text-sm data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                                    {formatPresetLabel(preset)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ControlField>
                          <ControlField label={tr("主色调", "Primary Color")}>
                            <StyledSelect value={form.color} onChange={(value) => updateForm({ color: value })} options={colorOptions} />
                          </ControlField>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <ControlField label={tr("尺寸", "Size")}>
                            <Select value={form.sizePreset} onValueChange={(value) => updateForm({ sizePreset: value })}>
                              <SelectTrigger className="h-10 w-full rounded-xl border-border/70 bg-background shadow-sm transition-colors hover:border-border hover:bg-muted/20">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur">
                                {MODE_PRESETS[mode].map((preset) => (
                                  <SelectItem key={preset.id} value={preset.id} className="rounded-lg py-2 text-sm data-[highlighted]:bg-muted data-[highlighted]:text-foreground">
                                    {formatPresetLabel(preset)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </ControlField>
                          <ControlField label={tr("留白程度", "Whitespace")}>
                            <StyledSelect value={form.whitespace} onChange={(value) => updateForm({ whitespace: value })} options={whitespaceOptions} />
                          </ControlField>
                        </div>
                      )}

                      {form.sizePreset === "custom" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <ControlField label={tr("宽度", "Width")} hint="<= 4000">
                            <input className={fieldClassName()} value={form.customWidth} onChange={(event) => updateForm({ customWidth: event.target.value })} />
                          </ControlField>
                          <ControlField label={tr("高度", "Height")} hint="<= 4000">
                            <input className={fieldClassName()} value={form.customHeight} onChange={(event) => updateForm({ customHeight: event.target.value })} />
                          </ControlField>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 gap-3">
                        <ControlField label={tr("分辨率", "Resolution")}>
                          <StyledSelect value={form.dpi} onChange={(value) => updateForm({ dpi: value as "72" | "300" })} options={[{ value: "72", label: "72 DPI" }, { value: "300", label: "300 DPI" }]} />
                        </ControlField>
                        <ControlField label={tr("风格", "Style")}>
                          <StyledSelect value={form.style} onChange={(value) => updateForm({ style: value })} options={styleOptions} />
                        </ControlField>
                      </div>

                      {mode === "poster" ? (
                        <>
                          <ControlField label={tr("核心主题", "Theme")}>
                            <input className={fieldClassName()} value={form.theme} onChange={(event) => updateForm({ theme: event.target.value })} />
                          </ControlField>
                          <div className="grid grid-cols-2 gap-3">
                            <ControlField label={tr("构图", "Composition")}>
                              <StyledSelect value={form.composition} onChange={(value) => updateForm({ composition: value })} options={compositionOptions} />
                            </ControlField>
                            <ControlField label={tr("视觉重点", "Focus")}>
                              <StyledSelect value={form.focus} onChange={(value) => updateForm({ focus: value })} options={focusOptions} />
                            </ControlField>
                          </div>
                          <ControlField label={tr("卖点", "Selling Points")}>
                            <TextArea value={form.sellingPointsText} onChange={(event) => updateForm({ sellingPointsText: event.target.value })} placeholder={tr("每行一条，最多 3 条", "One per line, up to 3")} />
                          </ControlField>
                        </>
                      ) : null}

                      {mode === "infographic" ? (
                        <>
                          <ControlField label={tr("核心主题", "Theme")}>
                            <input className={fieldClassName()} value={form.theme} onChange={(event) => updateForm({ theme: event.target.value })} />
                          </ControlField>
                          <ControlField label={tr("内容要点", "Key Points")}>
                            <TextArea value={form.bulletPointsText} onChange={(event) => updateForm({ bulletPointsText: event.target.value })} placeholder={tr("每行一条，建议 2 到 8 条", "One per line, suggested 2 to 8")} />
                          </ControlField>
                          <ControlField label={tr("数据内容", "Data")}>
                            <TextArea value={form.dataText} onChange={(event) => updateForm({ dataText: event.target.value })} placeholder={tr("例如：销量 32,45,67", "e.g. Sales: 32,45,67")} />
                          </ControlField>
                          <div className="grid grid-cols-2 gap-3">
                            <ControlField label={tr("图表倾向", "Chart Type")}>
                              <StyledSelect value={form.chartType} onChange={(value) => updateForm({ chartType: value })} options={chartOptions} />
                            </ControlField>
                            <ControlField label={tr("排版方向", "Orientation")}>
                              <StyledSelect value={form.orientation} onChange={(value) => updateForm({ orientation: value })} options={orientationOptions} />
                            </ControlField>
                          </div>
                        </>
                      ) : null}

                      {mode === "product" ? (
                        <>
                          <ControlField label={tr("产品名称", "Product Name")}>
                            <input className={fieldClassName()} value={form.productName} onChange={(event) => updateForm({ productName: event.target.value })} />
                          </ControlField>
                          <ControlField label={tr("卖点", "Selling Points")}>
                            <TextArea value={form.sellingPointsText} onChange={(event) => updateForm({ sellingPointsText: event.target.value })} placeholder={tr("每行一条，最多 4 条", "One per line, up to 4")} />
                          </ControlField>
                          <div className="grid grid-cols-2 gap-3">
                            <ControlField label={tr("背景类型", "Background")}>
                              <StyledSelect value={form.backgroundType} onChange={(value) => updateForm({ backgroundType: value })} options={backgroundOptions} />
                            </ControlField>
                            <ControlField label={tr("光影效果", "Lighting")}>
                              <StyledSelect value={form.lighting} onChange={(value) => updateForm({ lighting: value })} options={lightingOptions} />
                            </ControlField>
                          </div>
                        </>
                      ) : null}

                      <ControlField label={mode === "product" ? tr("产品图", "Product Image") : tr("参考图", "Reference Image")}>
                        <div className="grid grid-cols-1 gap-3">
                          {mode === "product" ? (
                            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground hover:border-blue-300 hover:text-foreground">
                              <ImagePlus className="mr-2 h-4 w-4" />
                              {form.productImageUrl ? tr("替换产品图", "Replace product image") : tr("上传产品图", "Upload product image")}
                              <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleFileChange(event, "productImageUrl")} />
                            </label>
                          ) : null}
                          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground hover:border-blue-300 hover:text-foreground">
                            <ImagePlus className="mr-2 h-4 w-4" />
                            {form.referenceImageUrl ? tr("替换参考图", "Replace reference image") : tr("上传参考图", "Upload reference image")}
                            <input type="file" accept="image/*" className="hidden" onChange={(event) => void handleFileChange(event, "referenceImageUrl")} />
                          </label>
                        </div>
                      </ControlField>
                    </PanelCard>
                  </div>
                  <div className="border-t border-border/50 bg-card/50 p-4">
                    <Button onClick={handleGenerate} disabled={isGenerating || !canGenerate} className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                      {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {tr("生成", "Generate")}
                    </Button>
                  </div>
                </div>
              ) : (
                renderEditChatPanel()
              )}
            </div>
          </div>
        </div>
      </div>
      <ResetWarningModal open={showResetWarning} onOpenChange={setShowResetWarning} onClear={handleDeleteGeneratedContent} />
      <CanvasHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        history={versionHistory}
        onRestore={handleRestoreHistoryItem}
        onClear={() => setVersionHistory([])}
      />
    </>
  );
}
