import type React from "react";
import { AudioLines, PlayCircle, Sigma } from "lucide-react";
import { PPT_REFERENCE_SLIDE_HEIGHT, PPT_REFERENCE_SLIDE_WIDTH } from "@/lib/ppt-service";
import { cn } from "@/lib/utils";
import { buildEditorShapePath } from "@/features/ppt-editor/shape-config";
import type {
  EditorAudioElement,
  EditorChartElement,
  EditorChartType,
  EditorFormulaElement,
  EditorImageElement,
  EditorShapeElement,
  EditorSlide,
  EditorTableElement,
  EditorTextElement,
  EditorVideoElement,
} from "@/features/ppt-editor/types";

const PPT_POINT_TO_CSS_PX = 96 / 72;

const resolveEditorTextAlign = (element: EditorTextElement) => {
  if (element.style?.align) return element.style.align;
  if (element.role === "title") return "left";
  if (element.role === "tag") return "center";
  return "left";
};

const resolveEditorTextWeight = (element: EditorTextElement) => {
  const hinted = Number(element.style?.fontWeight || 0);
  if (Number.isFinite(hinted) && hinted > 0) return hinted;
  if (element.role === "title") return 900;
  if (element.role === "tag") return 800;
  return 500;
};

const safeChartColor = (color?: string) => color || "#2563eb";
const chartPaletteColor = (baseColor: string, index: number) => {
  if (index === 0) return baseColor;
  const palette = ["#06B6D4", "#8B5CF6", "#F59E0B", "#22C55E", "#EF4444", "#3B82F6"];
  return palette[(index - 1) % palette.length];
};

const chartPoints = (data: EditorChartElement["data"], maxValue: number, width: number, height: number) =>
  data.map((item, index) => {
    const ratio = Math.max(0, Number(item.value || 0)) / maxValue;
    const x = data.length === 1 ? width / 2 : (index / Math.max(data.length - 1, 1)) * width;
    const y = height - ratio * height;
    return { x, y, ratio, item, index };
  });

const chartTypeLabel = (chartType: EditorChartType) => {
  switch (chartType) {
    case "column":
      return "Column";
    case "area":
      return "Area";
    case "scatter":
      return "Scatter";
    case "ring":
      return "Ring";
    case "radar":
      return "Radar";
    default:
      return chartType.charAt(0).toUpperCase() + chartType.slice(1);
  }
};

const toMediaTitle = (src: string, fallback: string) => {
  const raw = String(src || "").trim();
  if (!raw) return fallback;
  const pieces = raw.split(/[\\/]/);
  return pieces[pieces.length - 1] || fallback;
};

function PptEditorTextNode(props: { element: EditorTextElement; scale: number }) {
  const { element, scale } = props;
  const fontSizePt = Number(element.style?.fontSize || (element.role === "title" ? 28 : element.role === "tag" ? 18 : 16));
  const lineHeightRatio = Number(element.style?.lineHeight || (element.role === "title" ? 1.12 : element.role === "tag" ? 1.04 : 1.35));
  const paddingX = element.role === "title" ? 18 : element.role === "tag" ? 12 : 14;
  const paddingY = element.role === "title" ? 12 : element.role === "tag" ? 8 : 10;
  const useGradient = Boolean(element.style?.gradientFrom && element.style?.gradientTo);
  const strokeWidth = Number(element.style?.strokeWidth || 0);

  return (
    <div
      className="absolute overflow-hidden whitespace-pre-wrap break-words"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        padding: `${paddingY * scale}px ${paddingX * scale}px`,
        fontFamily: element.style?.fontFamily || "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: `${Math.max(10, fontSizePt * PPT_POINT_TO_CSS_PX * scale)}px`,
        fontWeight: resolveEditorTextWeight(element),
        fontStyle: element.style?.fontStyle === "italic" ? "italic" : "normal",
        lineHeight: lineHeightRatio,
        textAlign: resolveEditorTextAlign(element),
        letterSpacing: element.style?.letterSpacing ? `${Number(element.style.letterSpacing) * scale}px` : undefined,
        color: useGradient ? "transparent" : element.style?.color || (element.role === "title" ? "#FFFFFF" : element.role === "tag" ? "#FDE68A" : "#FFFFFF"),
        backgroundImage: useGradient ? `linear-gradient(90deg, ${element.style?.gradientFrom}, ${element.style?.gradientTo})` : undefined,
        backgroundClip: useGradient ? "text" : undefined,
        WebkitBackgroundClip: useGradient ? "text" : undefined,
        WebkitTextFillColor: useGradient ? "transparent" : undefined,
        WebkitTextStroke: strokeWidth > 0 ? `${Math.max(0.5, strokeWidth * scale)}px ${element.style?.strokeColor || "rgba(15,23,42,0.45)"}` : undefined,
      }}
    >
      {element.text}
    </div>
  );
}

function PptEditorImageNode(props: { element: EditorImageElement }) {
  const { element } = props;
  const objectFit = element.fit === "contain" ? "contain" : element.fit === "stretch" ? "fill" : "cover";
  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
      }}
    >
      <img src={element.src} alt="" className="h-full w-full" style={{ objectFit }} draggable={false} />
    </div>
  );
}

function PptEditorShapeNode(props: { element: EditorShapeElement; scale: number }) {
  const { element, scale } = props;
  const isLine = element.shape === "line";
  const strokeWidth = Math.max(1, (element.strokeWidth || 1.5) * scale);
  return (
    <div
      className="absolute"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        pointerEvents: "none",
      }}
    >
      {isLine ? (
        <div
          className="absolute left-0 top-1/2 w-full -translate-y-1/2"
          style={{
            height: `${Math.max(1, (element.strokeWidth || 2) * scale)}px`,
            background: element.stroke || "rgba(255,255,255,0.72)",
          }}
        />
      ) : element.shape === "rect" ? (
        <div
          className="absolute inset-0"
          style={{
            border: `${strokeWidth}px solid ${element.stroke || "rgba(255,255,255,0.6)"}`,
            background: element.fill || "rgba(255,255,255,0.16)",
          }}
        />
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <path
            d={buildEditorShapePath(element.shape, 100, 100)}
            fill={element.fill || "rgba(255,255,255,0.16)"}
            stroke={element.stroke || "rgba(255,255,255,0.6)"}
            strokeWidth={Math.max(1, (element.strokeWidth || 1.5) * 1.5)}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}

function PptEditorTableNode(props: { element: EditorTableElement; scale: number }) {
  const { element, scale } = props;
  const rows = Array.isArray(element.rows) && element.rows.length > 0 ? element.rows : [["A", "B"], ["1", "2"]];
  const headerRows = Math.max(0, Number(element.headerRows || 0));
  return (
    <div
      className="absolute overflow-hidden rounded-xl border bg-white/96 shadow-sm"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        borderColor: element.stroke || "rgba(148,163,184,0.65)",
        background: element.fill || "rgba(255,255,255,0.96)",
      }}
    >
      <table className="h-full w-full border-collapse text-left" style={{ color: element.textColor || "#111827", fontSize: `${Math.max(10, 12 * scale)}px` }}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`cell-${rowIndex}-${cellIndex}`}
                  className="border px-2 py-1 align-top"
                  style={{
                    borderColor: element.stroke || "rgba(148,163,184,0.45)",
                    background: rowIndex < headerRows ? "rgba(226,232,240,0.9)" : "transparent",
                    fontWeight: rowIndex < headerRows ? 700 : 500,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PptEditorChartNode(props: { element: EditorChartElement; scale: number }) {
  const { element, scale } = props;
  const data = Array.isArray(element.data) && element.data.length > 0 ? element.data : [{ label: "Q1", value: 42 }, { label: "Q2", value: 76 }, { label: "Q3", value: 58 }];
  const maxValue = Math.max(...data.map((item) => Math.max(0, Number(item.value || 0))), 1);
  const chartColor = safeChartColor(element.color);
  const points = chartPoints(data, maxValue, 100, 72);
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L 100 72 L 0 72 Z`;
  const radarCenter = { x: 50, y: 38 };
  const radarRadius = 28;
  const radarPoints = data.map((item, index) => {
    const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
    const ratio = Math.max(0, Number(item.value || 0)) / maxValue;
    const radius = radarRadius * ratio;
    return {
      x: radarCenter.x + Math.cos(angle) * radius,
      y: radarCenter.y + Math.sin(angle) * radius,
      labelX: radarCenter.x + Math.cos(angle) * (radarRadius + 10),
      labelY: radarCenter.y + Math.sin(angle) * (radarRadius + 10),
      item,
      index,
    };
  });
  const radarPolygon = radarPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div
      className="absolute overflow-hidden rounded-2xl border bg-white/96 shadow-sm"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        borderColor: "rgba(226,232,240,0.9)",
      }}
    >
      <div className="flex h-full w-full flex-col p-3" style={{ gap: `${Math.max(6, 10 * scale)}px` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {element.title ? <div className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{element.title}</div> : null}
          </div>
          <div className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{chartTypeLabel(element.chartType)}</div>
        </div>
        {element.chartType === "pie" || element.chartType === "ring" ? (
          <div className="relative flex-1">
            <svg viewBox="0 0 100 100" className="h-full w-full">
              {(() => {
                const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.value || 0)), 0) || 1;
                let start = 0;
                return data.map((item, index) => {
                  const portion = Math.max(0, Number(item.value || 0)) / total;
                  const angle = portion * Math.PI * 2;
                  const end = start + angle;
                  const x1 = 50 + Math.cos(start - Math.PI / 2) * 36;
                  const y1 = 50 + Math.sin(start - Math.PI / 2) * 36;
                  const x2 = 50 + Math.cos(end - Math.PI / 2) * 36;
                  const y2 = 50 + Math.sin(end - Math.PI / 2) * 36;
                  const largeArc = angle > Math.PI ? 1 : 0;
                  const fill = chartPaletteColor(chartColor, index);
                  const path = `M 50 50 L ${x1} ${y1} A 36 36 0 ${largeArc} 1 ${x2} ${y2} Z`;
                  start = end;
                  return <path key={`${item.label}-${index}`} d={path} fill={fill} opacity="0.92" />;
                });
              })()}
              {element.chartType === "ring" ? <circle cx="50" cy="50" r="18" fill="white" /> : null}
            </svg>
          </div>
        ) : element.chartType === "radar" ? (
          <div className="relative flex-1">
            <svg viewBox="0 0 100 80" className="h-full w-full overflow-visible">
              {[1, 0.75, 0.5, 0.25].map((ratio) => (
                <polygon
                  key={ratio}
                  points={data
                    .map((_, index) => {
                      const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
                      return `${radarCenter.x + Math.cos(angle) * radarRadius * ratio},${radarCenter.y + Math.sin(angle) * radarRadius * ratio}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth="1"
                />
              ))}
              {data.map((_, index) => {
                const angle = -Math.PI / 2 + (index / Math.max(data.length, 1)) * Math.PI * 2;
                return (
                  <line
                    key={`axis-${index}`}
                    x1={radarCenter.x}
                    y1={radarCenter.y}
                    x2={radarCenter.x + Math.cos(angle) * radarRadius}
                    y2={radarCenter.y + Math.sin(angle) * radarRadius}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                );
              })}
              <polygon points={radarPolygon} fill={chartColor} fillOpacity="0.18" stroke={chartColor} strokeWidth="2" />
              {radarPoints.map((point, index) => (
                <g key={`radar-point-${index}`}>
                  <circle cx={point.x} cy={point.y} r="2.8" fill={chartPaletteColor(chartColor, index)} />
                  <text x={point.labelX} y={point.labelY} fontSize="4" textAnchor="middle" fill="#64748B">
                    {point.item.label}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <div className="flex h-full items-end gap-2">
            {element.chartType === "bar" ? (
              <div className="flex h-full w-full flex-col gap-2">
                {data.map((item, index) => {
                  const ratio = Math.max(0, Number(item.value || 0)) / maxValue;
                  const fill = chartPaletteColor(chartColor, index);
                  return (
                    <div key={`${item.label}-${index}`} className="grid grid-cols-[52px_1fr_34px] items-center gap-2">
                      <div className="truncate text-[10px] text-zinc-500">{item.label}</div>
                      <div className="h-3 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(10, ratio * 100)}%`, background: fill }} />
                      </div>
                      <div className="text-right text-[10px] text-zinc-400">{Math.round(Number(item.value || 0))}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <svg viewBox="0 0 100 80" className="h-full w-full overflow-visible">
                <line x1="6" y1="72" x2="96" y2="72" stroke="#CBD5E1" strokeWidth="1.5" />
                <line x1="8" y1="8" x2="8" y2="72" stroke="#E2E8F0" strokeWidth="1.5" />
                {element.chartType === "area" ? <path d={areaPath} fill={chartColor} fillOpacity="0.18" /> : null}
                {element.chartType === "line" || element.chartType === "area" ? (
                  <path d={linePath} fill="none" stroke={chartColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                ) : null}
                {points.map((point, index) => {
                  const fill = chartPaletteColor(chartColor, index);
                  if (element.chartType === "scatter") {
                    return <circle key={`scatter-${index}`} cx={point.x} cy={point.y} r="4" fill={fill} />;
                  }
                  if (element.chartType === "line" || element.chartType === "area") {
                    return (
                      <g key={`line-${index}`}>
                        <circle cx={point.x} cy={point.y} r="3.4" fill={fill} />
                        <text x={point.x} y={point.y - 6} fontSize="4" textAnchor="middle" fill="#64748B">
                          {Math.round(Number(point.item.value || 0))}
                        </text>
                        <text x={point.x} y="78" fontSize="4" textAnchor="middle" fill="#64748B">
                          {point.item.label}
                        </text>
                      </g>
                    );
                  }
                  const columnWidth = Math.max(8, 68 / Math.max(data.length, 1));
                  const x = 12 + index * ((80 - columnWidth) / Math.max(data.length - 1, 1));
                  const height = Math.max(8, point.ratio * 56);
                  return (
                    <g key={`column-${index}`}>
                      <rect x={x} y={72 - height} width={columnWidth} height={height} rx="3" fill={fill} />
                      <text x={x + columnWidth / 2} y={72 - height - 4} fontSize="4" textAnchor="middle" fill="#64748B">
                        {Math.round(Number(point.item.value || 0))}
                      </text>
                      <text x={x + columnWidth / 2} y="78" fontSize="4" textAnchor="middle" fill="#64748B">
                        {point.item.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PptEditorFormulaNode(props: { element: EditorFormulaElement; scale: number }) {
  const { element, scale } = props;
  return (
    <div
      className="absolute flex items-center rounded-2xl border bg-white/90 px-4 py-2 shadow-sm"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        borderColor: "rgba(226,232,240,0.9)",
        color: element.color || "#0f172a",
        fontSize: `${Math.max(12, (element.fontSize || 18) * scale)}px`,
      }}
    >
      <Sigma className="mr-2 h-4 w-4 shrink-0 text-zinc-400" />
      <div className="truncate font-medium">{element.latex}</div>
    </div>
  );
}

function PptEditorVideoNode(props: { element: EditorVideoElement }) {
  const { element } = props;
  const title = element.title || toMediaTitle(element.src, "Video");
  return (
    <div
      className="absolute overflow-hidden rounded-2xl border bg-zinc-950 shadow-xl"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      {element.src ? (
        <video src={element.src} poster={element.poster} className="h-full w-full object-cover" controls={false} muted preload="metadata" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-300">
          <PlayCircle className="h-10 w-10" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 py-3 text-xs text-white">
        <PlayCircle className="h-4 w-4 shrink-0" />
        <span className="truncate">{title}</span>
      </div>
    </div>
  );
}

function PptEditorAudioNode(props: { element: EditorAudioElement }) {
  const { element } = props;
  const title = element.title || toMediaTitle(element.src, "Audio clip");
  return (
    <div
      className="absolute overflow-hidden rounded-2xl border bg-white/96 shadow-sm"
      style={{
        left: `${element.x * 100}%`,
        top: `${element.y * 100}%`,
        width: `${element.w * 100}%`,
        height: `${element.h * 100}%`,
        borderColor: "rgba(226,232,240,0.9)",
      }}
    >
      <div className="flex h-full items-center gap-3 px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-950 text-white">
          <AudioLines className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">{title}</div>
          <div className="truncate text-[11px] text-zinc-500">{element.src || "Set an audio URL or upload a clip"}</div>
        </div>
      </div>
    </div>
  );
}

export function PptEditorBridge(props: {
  slide: EditorSlide | null;
  canvasWidth: number;
  canvasHeight: number;
  showElements?: boolean;
  showTextElements?: boolean;
  showImageElements?: boolean;
  showShapeElements?: boolean;
  showTableElements?: boolean;
  showChartElements?: boolean;
  showFormulaElements?: boolean;
  showVideoElements?: boolean;
  showAudioElements?: boolean;
  className?: string;
  emptyState?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const {
    slide,
    canvasWidth,
    canvasHeight,
    showElements = false,
    showTextElements = true,
    showImageElements = true,
    showShapeElements = true,
    showTableElements = true,
    showChartElements = true,
    showFormulaElements = true,
    showVideoElements = true,
    showAudioElements = true,
    className,
    emptyState,
    children,
  } = props;

  if (!slide) return <>{emptyState || null}</>;

  const backgroundUrl = slide.backgroundImageUrl;
  const scale = Math.min(canvasWidth / PPT_REFERENCE_SLIDE_WIDTH, canvasHeight / PPT_REFERENCE_SLIDE_HEIGHT) || 1;
  const textElements = slide.elements.filter((element): element is EditorTextElement => element.type === "text");
  const imageElements = slide.elements.filter((element): element is EditorImageElement => element.type === "image");
  const shapeElements = slide.elements.filter((element): element is EditorShapeElement => element.type === "shape");
  const tableElements = slide.elements.filter((element): element is EditorTableElement => element.type === "table");
  const chartElements = slide.elements.filter((element): element is EditorChartElement => element.type === "chart");
  const formulaElements = slide.elements.filter((element): element is EditorFormulaElement => element.type === "formula");
  const videoElements = slide.elements.filter((element): element is EditorVideoElement => element.type === "video");
  const audioElements = slide.elements.filter((element): element is EditorAudioElement => element.type === "audio");

  if (!backgroundUrl) return <>{emptyState || null}</>;

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute left-0 top-0"
        style={{
          width: `${PPT_REFERENCE_SLIDE_WIDTH}px`,
          height: `${PPT_REFERENCE_SLIDE_HEIGHT}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <img src={backgroundUrl} className="absolute inset-0 h-full w-full bg-white object-cover" alt={slide.title || slide.id} draggable={false} />
        {showElements ? (
          <div className="absolute inset-0 pointer-events-none">
            {showShapeElements ? shapeElements.map((element) => <PptEditorShapeNode key={element.id} element={element} scale={scale} />) : null}
            {showImageElements ? imageElements.map((element) => <PptEditorImageNode key={element.id} element={element} />) : null}
            {showTableElements ? tableElements.map((element) => <PptEditorTableNode key={element.id} element={element} scale={scale} />) : null}
            {showChartElements ? chartElements.map((element) => <PptEditorChartNode key={element.id} element={element} scale={scale} />) : null}
            {showFormulaElements ? formulaElements.map((element) => <PptEditorFormulaNode key={element.id} element={element} scale={scale} />) : null}
            {showVideoElements ? videoElements.map((element) => <PptEditorVideoNode key={element.id} element={element} />) : null}
            {showAudioElements ? audioElements.map((element) => <PptEditorAudioNode key={element.id} element={element} />) : null}
            {showTextElements ? textElements.map((element) => <PptEditorTextNode key={element.id} element={element} scale={scale} />) : null}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
