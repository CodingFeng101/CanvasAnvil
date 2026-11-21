import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WORKSPACES, type WorkspaceId } from "@/app/workspaces";
import { t, type UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { dayKey, dayRecords, lastDays, streaks, usesByCanvas, usesByMonth, usesByWeekday, type UsageStats } from "@/shared/usage-stats";

/*
 * Settings → Usage: a year heatmap of use, as on a GitHub profile, lines for
 * trends, columns for distributions and rings for shares. Everything is counted in
 * this browser.
 */

/** One colour per canvas, the same in every chart here (index.css, light and dark). */
export const CANVAS_COLOR: Record<WorkspaceId, string> = {
  diagram: "var(--viz-diagram)",
  cad: "var(--viz-cad)",
  ppt: "var(--viz-ppt)",
  canvas: "var(--viz-canvas)",
};
/** Single-series charts: the brand clay. */
const ONE = "hsl(var(--brand))";
/** Tokens: what was sent vs what came back. */
const TOKEN_COLOR = { input: "var(--viz-input)", output: "var(--viz-output)" };

const WEEKS = 53;

export const canvasName = (id: WorkspaceId, lang: UiLanguage) => t(lang, WORKSPACES.find((w) => w.id === id)!.labelKey);

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

export function formatDuration(ms: number, zh: boolean): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return zh ? `${s} 秒` : `${s}s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return zh ? `${m} 分${rest ? ` ${rest} 秒` : ""}` : `${m}m${rest ? ` ${rest}s` : ""}`;
}

const shortDate = (date: Date, zh: boolean) => (zh ? `${date.getMonth() + 1}月${date.getDate()}日` : date.toLocaleDateString("en", { month: "short", day: "numeric" }));
const monthName = (date: Date, zh: boolean) => (zh ? `${date.getMonth() + 1}月` : date.toLocaleString("en", { month: "short" }));
const sum = (values: Record<string, number> | number[]) => Object.values(values).reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ */
/* Hover tooltip shared by every chart                                 */
/* ------------------------------------------------------------------ */

type Tip = { x: number; y: number; content: ReactNode } | null;

/** A box that shows a tooltip near the pointer; `show` takes the event and what to say. */
function useTip() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (event: { clientX: number; clientY: number }, content: ReactNode) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, content });
  };
  const hide = () => setTip(null);
  const width = boxRef.current?.clientWidth ?? 0;
  const node = tip ? (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-[12px] leading-[1.45] text-popover-foreground shadow-md"
      style={{
        top: tip.y - 10,
        left: tip.x,
        transform: `translate(${tip.x > width * 0.65 ? "calc(-100% - 10px)" : "10px"}, -100%)`,
      }}
    >
      {tip.content}
    </div>
  ) : null;
  return { boxRef, show, hide, node };
}

function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 tabular-nums">{value}</span>
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** "No data yet", centred over a chart drawn empty (axes and all). */
const EmptyNote = ({ children }: { children?: ReactNode }) =>
  children ? (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <span className="aside-voice rounded-md bg-background/85 px-2 py-0.5 text-[13px] text-muted-foreground">{children}</span>
    </div>
  ) : null;

/** A top value whose half is a whole number, so the middle gridline reads cleanly. */
const niceMax = (values: number[]) => Math.max(2, Math.ceil(Math.max(0, ...values) / 2) * 2);

/* ------------------------------------------------------------------ */
/* Overview tiles                                                      */
/* ------------------------------------------------------------------ */

export function UsageSummary({ stats, lang }: { stats: UsageStats; lang: UiLanguage }) {
  const zh = lang === "zh";
  const total = sum(usesByCanvas(stats));
  const activeDays = Object.values(stats.days).filter((d) => sum(d) > 0).length;
  const { current, longest } = streaks(stats);
  const { best, average } = dayRecords(stats);
  const timed = Object.values(stats.durations).reduce((a, d) => ({ count: a.count + d.count, total: a.total + d.total }), { count: 0, total: 0 });
  const tokens = Object.values(stats.tokens).reduce((a, x) => a + x.input + x.output, 0);
  const items = [
    { label: zh ? "总次数" : "Uses", value: formatCount(total) },
    { label: zh ? "活跃天数" : "Active days", value: formatCount(activeDays) },
    { label: zh ? "连续天数" : "Streak", value: `${current}`, hint: zh ? `最长 ${longest} 天` : `Best ${longest}` },
    { label: zh ? "日均次数" : "Per active day", value: average ? average.toFixed(1) : "0" },
    {
      label: zh ? "最忙的一天" : "Busiest day",
      value: best ? formatCount(best.uses) : "—",
      hint: best ? shortDate(new Date(`${best.key}T00:00:00`), zh) : undefined,
    },
    { label: zh ? "平均生成耗时" : "Avg. generation", value: timed.count ? formatDuration(timed.total / timed.count, zh) : "—" },
    { label: zh ? "生成图片" : "Images", value: formatCount(sum(stats.images)) },
    { label: "Token", value: formatCount(tokens) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-foreground/[0.04] px-3 py-2.5">
          <div className="text-[12px] text-muted-foreground">{item.label}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-[20px] font-semibold tabular-nums text-foreground">{item.value}</span>
            {item.hint && <span className="truncate text-[11.5px] text-muted-foreground">{item.hint}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Year heatmap                                                        */
/* ------------------------------------------------------------------ */

/** The last 53 weeks, a column per week (Monday on top), stretched to fill the row. */
export function UsageHeatmap({ stats, lang }: { stats: UsageStats; lang: UiLanguage }) {
  const zh = lang === "zh";
  const { boxRef, show, hide, node } = useTip();
  const { weeks, months, max } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const first = new Date(monday);
    first.setDate(monday.getDate() - (WEEKS - 1) * 7);
    const weeks: { key: string; date: Date; total: number; split: [string, number][]; future: boolean }[][] = [];
    const months: { col: number; label: string }[] = [];
    let max = 0;
    for (let w = 0; w < WEEKS; w++) {
      const column = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(first);
        date.setDate(first.getDate() + w * 7 + d);
        const key = dayKey(date);
        const day = stats.days[key] ?? {};
        const total = sum(day);
        max = Math.max(max, total);
        column.push({ key, date, total, split: Object.entries(day).filter(([, n]) => n > 0), future: date > today });
        // A month is labelled on the week holding its 1st (none for a partial first column).
        if (date.getDate() === 1 && w > 0) months.push({ col: w, label: monthName(date, zh) });
      }
      weeks.push(column);
    }
    return { weeks, months, max };
  }, [stats, zh]);

  const level = (n: number) => (n === 0 ? 0 : max <= 1 ? 4 : Math.min(4, Math.ceil((n / max) * 4)));
  const fill = ["bg-foreground/[0.06]", "bg-brand/25", "bg-brand/45", "bg-brand/70", "bg-brand"];
  const weekday = zh ? ["一", "", "三", "", "五", "", ""] : ["Mon", "", "Wed", "", "Fri", "", ""];
  const columns = { gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` };

  return (
    <div ref={boxRef} className="relative" onMouseLeave={hide}>
      <div className="flex gap-1.5">
        <div className="flex w-6 shrink-0 flex-col pt-[18px] text-[10.5px] text-muted-foreground">
          <div className="grid flex-1 grid-rows-7 gap-[3px]">
            {weekday.map((label, i) => (
              <span key={i} className="flex items-center leading-none">
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative mb-1 grid h-[14px] text-[11px] leading-none text-muted-foreground" style={columns}>
            {months.map((m) => (
              <span key={m.col} className="whitespace-nowrap" style={{ gridColumnStart: m.col + 1, gridRowStart: 1 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={columns}>
            {weeks.flat().map((cell) => (
              <span
                key={cell.key}
                aria-label={cell.future ? undefined : `${shortDate(cell.date, zh)} ${cell.total}`}
                onMouseMove={(e) =>
                  !cell.future &&
                  show(
                    e,
                    <>
                      <div className="mb-0.5 font-medium">
                        {shortDate(cell.date, zh)} · {cell.total ? (zh ? `${cell.total} 次` : `${cell.total} uses`) : zh ? "没有使用" : "no use"}
                      </div>
                      {cell.split.map(([id, n]) => (
                        <TipRow key={id} color={CANVAS_COLOR[id as WorkspaceId]} label={canvasName(id as WorkspaceId, lang)} value={String(n)} />
                      ))}
                    </>,
                  )
                }
                className={cn("aspect-square rounded-[2px]", cell.future ? "bg-transparent" : fill[level(cell.total)])}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        {zh ? "少" : "Less"}
        {fill.map((c) => (
          <span key={c} className={cn("size-[11px] rounded-[2px]", c)} />
        ))}
        {zh ? "多" : "More"}
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bars                                                                */
/* ------------------------------------------------------------------ */

/** Vertical bars on one baseline; each bar is a stack of segments (2px apart). */
function Columns({
  data,
  height = 120,
  labelEvery = 1,
  tip,
  empty,
}: {
  data: { label: string; segments: { value: number; color: string }[] }[];
  height?: number;
  /** Show every n-th axis label (the rest stay blank). */
  labelEvery?: number;
  tip: (index: number) => ReactNode;
  /** Shown over the plot when every value is 0. */
  empty?: string;
}) {
  const { boxRef, show, hide, node } = useTip();
  const totals = data.map((d) => d.segments.reduce((a, s) => a + s.value, 0));
  const max = niceMax(totals);
  const blank = !totals.some((v) => v > 0);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div
      ref={boxRef}
      className="relative"
      onMouseLeave={() => {
        hide();
        setHover(null);
      }}
    >
      <div className="relative" style={{ height }}>
        {/* Recessive grid: the top value and the baseline. */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-foreground/10" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-foreground/[0.06]" />
        <span className="absolute right-0 top-0 -translate-y-full pb-0.5 text-[10.5px] tabular-nums text-muted-foreground">{formatCount(max)}</span>
        <div className="absolute inset-x-0 bottom-0 border-t border-foreground/20" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {data.map((d, i) => (
            <div
              key={i}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
              onMouseMove={(e) => {
                setHover(i);
                show(e, tip(i));
              }}
            >
              <div className={cn("flex flex-col-reverse gap-[2px] transition-opacity", hover !== null && hover !== i && "opacity-55")}>
                {d.segments
                  .filter((s) => s.value > 0)
                  .map((s, j, shown) => (
                    <div
                      key={j}
                      className={cn("mx-auto w-full max-w-[22px]", j === shown.length - 1 && "rounded-t-[4px]")}
                      style={{ height: Math.max(2, (s.value / max) * height - 2), background: s.color }}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
        {blank && <EmptyNote>{empty}</EmptyNote>}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[10.5px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      {node}
    </div>
  );
}

/** Uses by hour of the day. */
export function HourColumns({ stats, lang }: { stats: UsageStats; lang: UiLanguage }) {
  const zh = lang === "zh";
  return (
    <Columns
      height={112}
      labelEvery={6}
      empty={zh ? "还是一张白纸" : "Still a blank page"}
      data={stats.hours.map((n, h) => ({ label: `${h}:00`, segments: [{ value: n, color: ONE }] }))}
      tip={(h) => <TipRow label={`${h}:00–${h + 1}:00`} value={zh ? `${stats.hours[h]} 次` : `${stats.hours[h]}`} />}
    />
  );
}

/** The busiest hour ("15:00–16:00"), or null before any use. */
export function peakHour(stats: UsageStats): string | null {
  if (!sum(stats.hours)) return null;
  const h = stats.hours.indexOf(Math.max(...stats.hours));
  return `${h}:00–${h + 1}:00`;
}

/** The busiest weekday (0 = Monday), or null before any use. */
export function peakWeekday(stats: UsageStats): number | null {
  const counts = usesByWeekday(stats);
  return sum(counts) ? counts.indexOf(Math.max(...counts)) : null;
}

export const WEEKDAY_NAMES = { zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };

/** Uses by weekday, Monday first. */
export function WeekdayColumns({ stats, lang }: { stats: UsageStats; lang: UiLanguage }) {
  const zh = lang === "zh";
  const counts = usesByWeekday(stats);
  const names = WEEKDAY_NAMES[zh ? "zh" : "en"];
  return (
    <Columns
      height={112}
      empty={zh ? "还是一张白纸" : "Still a blank page"}
      data={counts.map((n, i) => ({ label: names[i], segments: [{ value: n, color: ONE }] }))}
      tip={(i) => <TipRow label={names[i]} value={zh ? `${counts[i]} 次` : `${counts[i]}`} />}
    />
  );
}

/** Horizontal bars, one per row, longest on top. */
export function BarList({
  rows,
  format,
  empty,
}: {
  rows: { key: string; label: string; value: number; color: string; detail?: string }[];
  format: (n: number) => string;
  empty: string;
}) {
  const shown = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  if (!shown.length) {
    // Drawn empty: the rows that could fill in (or four blank ones, as many as a canvas list), with empty tracks.
    const blank = rows.length ? rows.slice(0, 4) : [0, 1, 2, 3].map((i) => ({ key: String(i), label: "—" }));
    return (
      <div className="relative">
        <ul className="space-y-2">
          {blank.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-[13px]">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="h-2.5 rounded-r-[4px] bg-foreground/[0.06]" />
              <span className="tabular-nums text-muted-foreground">—</span>
            </li>
          ))}
        </ul>
        <EmptyNote>{empty.replace(/[。.]$/, "")}</EmptyNote>
      </div>
    );
  }
  const max = shown[0].value;
  return (
    <ul className="space-y-2">
      {shown.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 text-[13px]" title={r.detail}>
          <span className="truncate text-foreground/85">{r.label}</span>
          <span className="h-2.5 rounded-r-[4px] bg-foreground/[0.06]">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color }} />
          </span>
          <span className="tabular-nums text-muted-foreground">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** A bar split by canvas, with each canvas's share under it. */
export function CanvasBar({
  values,
  lang,
  format,
  empty,
}: {
  values: Partial<Record<WorkspaceId, number>>;
  lang: UiLanguage;
  format: (n: number) => string;
  empty: string;
}) {
  // Fixed canvas order, so a colour never moves with the ranking.
  const rows = WORKSPACES.map(({ id }) => ({ id, value: values[id] ?? 0 }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-foreground/[0.06]">
        {rows
          .filter((r) => r.value > 0)
          .map((r) => (
            <span key={r.id} style={{ width: `${(r.value / total) * 100}%`, background: CANVAS_COLOR[r.id] }} className="h-full" />
          ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-6 gap-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: CANVAS_COLOR[r.id] }} />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{canvasName(r.id, lang)}</span>
            <span className="tabular-nums text-muted-foreground">{format(r.value)}</span>
            <span className="w-10 text-right tabular-nums text-foreground/85">{total ? `${Math.round((r.value / total) * 100)}%` : "—"}</span>
          </li>
        ))}
      </ul>
      {!total && <p className="mt-2 text-[12px] text-muted-foreground">{empty}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lines                                                               */
/* ------------------------------------------------------------------ */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Lines over one shared y-axis, with a crosshair and tooltip on hover. */
function Lines({
  labels,
  series,
  height = 140,
  labelEvery = 1,
  tip,
  empty,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[]; area?: boolean }[];
  height?: number;
  labelEvery?: number;
  tip: (index: number) => ReactNode;
  /** Shown over the plot when every value is 0. */
  empty?: string;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const { boxRef, show, hide, node } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const left = 36;
  const right = 8;
  const top = 8;
  const bottom = 20;
  const n = labels.length;
  const all = series.flatMap((s) => s.values);
  const max = niceMax(all);
  const blank = !all.some((v) => v > 0);
  const plotW = Math.max(1, width - left - right);
  const plotH = height - top - bottom;
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];

  return (
    <div ref={boxRef} className="relative">
      <div ref={wrapRef}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="block overflow-visible"
            onMouseMove={(e) => {
              const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = e.clientX - box.left;
              const i = Math.max(0, Math.min(n - 1, Math.round(((px - left) / plotW) * (n - 1))));
              setHover(i);
              show(e, tip(i));
            }}
            onMouseLeave={() => {
              setHover(null);
              hide();
            }}
          >
            {ticks.map((v, i) => (
              <g key={i}>
                <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="currentColor" className={i === 0 ? "text-foreground/20" : "text-foreground/[0.08]"} strokeDasharray={i === 0 ? undefined : "3 3"} />
                <text x={left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10.5px] tabular-nums">
                  {formatCount(v)}
                </text>
              </g>
            ))}
            {labels.map((label, i) =>
              (i % labelEvery === 0 && n - 1 - i >= labelEvery) || i === n - 1 ? (
                <text key={i} x={x(i)} y={height - 4} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10.5px]">
                  {label}
                </text>
              ) : null,
            )}
            {series.map((s) => {
              const points = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
              return (
                <g key={s.name}>
                  {s.area && <polygon points={`${x(0)},${y(0)} ${points} ${x(n - 1)},${y(0)}`} fill={s.color} opacity={0.12} />}
                  <polyline points={points} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {n <= 12 && !blank && s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} stroke="hsl(var(--background))" strokeWidth={1.5} />)}
                </g>
              );
            })}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} stroke="currentColor" className="text-foreground/25" />
                {series.map((s) => (
                  <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke="hsl(var(--background))" strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {blank && <EmptyNote>{empty}</EmptyNote>}
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trends: one chart, over the last week, month or year                */
/* ------------------------------------------------------------------ */

export type TrendRange = "week" | "month" | "year";

type Bucket = { label: string; tipLabel: string; byCanvas: Record<string, number>; tokens: { input: number; output: number } };

/** Days for a week or month, months for a year; each with its uses per canvas and reported tokens. */
function trendBuckets(stats: UsageStats, range: TrendRange, zh: boolean): Bucket[] {
  if (range === "year") {
    return usesByMonth(stats).map((m) => {
      const byCanvas: Record<string, number> = {};
      for (const [k, d] of Object.entries(stats.days)) {
        if (!k.startsWith(m.key)) continue;
        for (const [id, n] of Object.entries(d)) byCanvas[id] = (byCanvas[id] ?? 0) + n;
      }
      const tokens = { input: 0, output: 0 };
      for (const [k, x] of Object.entries(stats.tokenDays)) {
        if (!k.startsWith(m.key)) continue;
        tokens.input += x.input;
        tokens.output += x.output;
      }
      return {
        label: monthName(m.date, zh),
        tipLabel: zh ? `${m.date.getFullYear()}年${m.date.getMonth() + 1}月` : m.date.toLocaleString("en", { month: "long", year: "numeric" }),
        byCanvas,
        tokens,
      };
    });
  }
  const weekdays = zh ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return lastDays(stats, range === "week" ? 7 : 30).map((d) => ({
    label: range === "week" ? weekdays[d.date.getDay()] : `${d.date.getMonth() + 1}/${d.date.getDate()}`,
    tipLabel: shortDate(d.date, zh),
    byCanvas: d.byCanvas,
    tokens: stats.tokenDays[d.key] ?? { input: 0, output: 0 },
  }));
}

const LABEL_EVERY: Record<TrendRange, number> = { week: 1, month: 7, year: 2 };

/** Uses over time (all canvases together; the tooltip splits them). */
export function UsageTrend({ stats, lang, range }: { stats: UsageStats; lang: UiLanguage; range: TrendRange }) {
  const zh = lang === "zh";
  const buckets = trendBuckets(stats, range, zh);
  return (
    <Lines
      empty={zh ? "这段日子，画布都还空着" : "The canvases sat quiet in this stretch"}
      labels={buckets.map((b) => b.label)}
      labelEvery={LABEL_EVERY[range]}
      series={[{ name: "uses", color: ONE, values: buckets.map((b) => sum(b.byCanvas)), area: true }]}
      tip={(i) => {
        const b = buckets[i];
        const total = sum(b.byCanvas);
        return (
          <>
            <div className="mb-0.5 font-medium">
              {b.tipLabel} · {zh ? `${total} 次` : `${total} uses`}
            </div>
            {WORKSPACES.filter(({ id }) => b.byCanvas[id]).map(({ id }) => (
              <TipRow key={id} color={CANVAS_COLOR[id]} label={canvasName(id, lang)} value={String(b.byCanvas[id])} />
            ))}
          </>
        );
      }}
    />
  );
}

/** Reported tokens over time: sent and received. */
export function TokenTrend({ stats, lang, range }: { stats: UsageStats; lang: UiLanguage; range: TrendRange }) {
  const zh = lang === "zh";
  const buckets = trendBuckets(stats, range, zh);
  const names = { input: zh ? "输入" : "Input", output: zh ? "输出" : "Output" };
  return (
    <div className="space-y-2.5">
      <Legend items={[{ color: TOKEN_COLOR.input, label: names.input }, { color: TOKEN_COLOR.output, label: names.output }]} />
      <Lines
        empty={zh ? "这段时间没有接口返回的用量" : "No reported usage in this period"}
        labels={buckets.map((b) => b.label)}
        labelEvery={LABEL_EVERY[range]}
        series={[
          { name: "input", color: TOKEN_COLOR.input, values: buckets.map((b) => b.tokens.input) },
          { name: "output", color: TOKEN_COLOR.output, values: buckets.map((b) => b.tokens.output) },
        ]}
        tip={(i) => (
          <>
            <div className="mb-0.5 font-medium">{buckets[i].tipLabel}</div>
            <TipRow color={TOKEN_COLOR.input} label={names.input} value={formatCount(buckets[i].tokens.input)} />
            <TipRow color={TOKEN_COLOR.output} label={names.output} value={formatCount(buckets[i].tokens.output)} />
          </>
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut: shares of a whole, per canvas                                */
/* ------------------------------------------------------------------ */

/** A ring split by canvas (fixed order, 2px gaps), the total in the middle, the shares beside it. */
export function CanvasDonut({
  values,
  lang,
  format,
  empty,
}: {
  values: Partial<Record<WorkspaceId, number>>;
  lang: UiLanguage;
  format: (n: number) => string;
  empty: string;
}) {
  const zh = lang === "zh";
  const { boxRef, show, hide, node } = useTip();
  const [hover, setHover] = useState<WorkspaceId | null>(null);
  const rows = WORKSPACES.map(({ id }) => ({ id, value: values[id] ?? 0 }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  const size = 120;
  const stroke = 16;
  const r = (size - stroke) / 2 - 3;
  const c = 2 * Math.PI * r;
  const shown = rows.filter((x) => x.value > 0);
  const gap = shown.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div ref={boxRef} className="relative flex items-center gap-5" onMouseLeave={() => (hide(), setHover(null))}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="currentColor" className="text-foreground/[0.06]" />
          {shown.map((x) => {
            const length = (x.value / total) * c;
            const dash = Math.max(0.5, length - gap);
            const el = (
              <circle
                key={x.id}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={CANVAS_COLOR[x.id]}
                strokeWidth={hover === x.id ? stroke + 4 : stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                className={cn("cursor-default transition-[opacity,stroke-width]", hover && hover !== x.id && "opacity-50")}
                onMouseMove={(e) => {
                  setHover(x.id);
                  show(
                    e,
                    <TipRow color={CANVAS_COLOR[x.id]} label={canvasName(x.id, lang)} value={`${format(x.value)} · ${Math.round((x.value / total) * 100)}%`} />,
                  );
                }}
              />
            );
            offset += length;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          {total ? (
            <div>
              <div className="text-[16px] font-semibold tabular-nums leading-tight text-foreground">{format(total)}</div>
              <div className="text-[11px] text-muted-foreground">{zh ? "合计" : "Total"}</div>
            </div>
          ) : (
            <div className="text-[11.5px] text-muted-foreground">{zh ? "还是一张白纸" : "Still a blank page"}</div>
          )}
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {rows.map((x) => (
          <li
            key={x.id}
            className={cn("flex items-center gap-2 text-[13px] transition-opacity", hover && hover !== x.id && "opacity-50")}
            onMouseEnter={() => x.value > 0 && setHover(x.id)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: CANVAS_COLOR[x.id] }} />
            <span className="min-w-0 flex-1 truncate text-foreground/85">{canvasName(x.id, lang)}</span>
            <span className="tabular-nums text-muted-foreground">{x.value ? format(x.value) : "—"}</span>
            <span className="w-9 text-right tabular-nums text-foreground/85">{total ? `${Math.round((x.value / total) * 100)}%` : ""}</span>
          </li>
        ))}
        {!total && <li className="pt-0.5 text-[12px] text-muted-foreground">{empty}</li>}
      </ul>
      {node}
    </div>
  );
}
