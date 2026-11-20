import { useSyncExternalStore } from "react";
import { onImageMade, onModelCall, onUsage } from "@/ai/usage";

/**
 * Settings → Usage: how much each canvas is used, kept in this browser only.
 *
 *   uses    one per generation the AI starts (the works shell sees a canvas
 *           go busy), per day and canvas
 *   tokens  what the provider reported, per canvas (never estimated)
 *   images  pictures that came back from the image model, per canvas
 *   hours   uses by hour of the day (local time), 24 slots
 *   tokenDays  reported tokens per day
 *   durations  how long generations took, per canvas
 *   models  calls answered, per model name
 *
 * Counts are attributed to the canvas on screen.
 */

export interface UsageStats {
  /** "YYYY-MM-DD" → canvas → uses. */
  days: Record<string, Record<string, number>>;
  tokens: Record<string, { input: number; output: number }>;
  images: Record<string, number>;
  /** Uses by local hour, 0–23. */
  hours: number[];
  /** "YYYY-MM-DD" → reported tokens. */
  tokenDays: Record<string, { input: number; output: number }>;
  /** Per canvas: generations timed, their total and longest duration (ms). */
  durations: Record<string, { count: number; total: number; longest: number }>;
  /** Model name → calls answered. */
  models: Record<string, number>;
  /** When counting began (ms). */
  since: number;
}

const KEY = "CanvasAnvil-usage-stats-v1";
/** Days older than this are dropped: the heatmap shows a year. */
const KEEP_DAYS = 400;
const listeners = new Set<() => void>();
let cache: UsageStats | null = null;
let current = "diagram";

const empty = (): UsageStats => ({ days: {}, tokens: {}, images: {}, hours: Array(24).fill(0), tokenDays: {}, durations: {}, models: {}, since: Date.now() });

export function dayKey(time: number | Date = Date.now()): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readStats(): UsageStats {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<UsageStats>) : null;
    cache = parsed && typeof parsed === "object" ? { ...empty(), ...parsed } : empty();
    if (!Array.isArray(cache.hours) || cache.hours.length !== 24) cache.hours = Array(24).fill(0);
  } catch {
    cache = empty();
  }
  return cache;
}

function write(next: UsageStats) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* full or blocked storage: the counts stay for this session */
  }
  for (const listener of listeners) listener();
}

function prune(days: Record<string, unknown>) {
  const cutoff = dayKey(Date.now() - KEEP_DAYS * 86400000);
  for (const key of Object.keys(days)) if (key < cutoff) delete days[key];
}

/** The canvas on screen, so tokens and images count for it. */
export function setStatsCanvas(canvas: string) {
  current = canvas;
}

export function recordUse(canvas: string = current, time = Date.now()) {
  const stats = readStats();
  const days = { ...stats.days };
  const key = dayKey(time);
  days[key] = { ...days[key], [canvas]: (days[key]?.[canvas] ?? 0) + 1 };
  prune(days);
  const hours = [...stats.hours];
  hours[new Date(time).getHours()] += 1;
  write({ ...stats, days, hours });
}

/** A generation on this canvas finished after `ms`. */
export function recordDuration(canvas: string, ms: number) {
  if (!(ms > 0) || ms > 6 * 3600000) return;
  const stats = readStats();
  const was = stats.durations[canvas] ?? { count: 0, total: 0, longest: 0 };
  write({ ...stats, durations: { ...stats.durations, [canvas]: { count: was.count + 1, total: was.total + ms, longest: Math.max(was.longest, ms) } } });
}

function recordTokens(input = 0, output = 0) {
  const stats = readStats();
  const was = stats.tokens[current] ?? { input: 0, output: 0 };
  const key = dayKey();
  const day = stats.tokenDays[key] ?? { input: 0, output: 0 };
  const tokenDays = { ...stats.tokenDays, [key]: { input: day.input + input, output: day.output + output } };
  prune(tokenDays);
  write({ ...stats, tokenDays, tokens: { ...stats.tokens, [current]: { input: was.input + input, output: was.output + output } } });
}

function recordModel(model: string) {
  const stats = readStats();
  write({ ...stats, models: { ...stats.models, [model]: (stats.models[model] ?? 0) + 1 } });
}

function recordImage() {
  const stats = readStats();
  write({ ...stats, images: { ...stats.images, [current]: (stats.images[current] ?? 0) + 1 } });
}

export function clearStats() {
  write(empty());
}

let started = false;
/** Starts counting tokens and images (once, from the app shell). */
export function startUsageStats() {
  if (started) return;
  started = true;
  onUsage((usage) => recordTokens(usage.input, usage.output));
  onImageMade(recordImage);
  onModelCall(recordModel);
}

export function useUsageStats(): UsageStats {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readStats,
    readStats,
  );
}

/** Uses per canvas over every kept day. */
export function usesByCanvas(stats: UsageStats): Record<string, number> {
  const out: Record<string, number> = {};
  for (const day of Object.values(stats.days)) for (const [canvas, n] of Object.entries(day)) out[canvas] = (out[canvas] ?? 0) + n;
  return out;
}

/** The longest run of consecutive days with any use, and the run ending today (or yesterday). */
export function streaks(stats: UsageStats, today = new Date()): { longest: number; current: number } {
  const active = new Set(Object.entries(stats.days).filter(([, d]) => Object.values(d).some((n) => n > 0)).map(([k]) => k));
  let longest = 0;
  let run = 0;
  const keys = [...active].sort();
  let prev: number | null = null;
  for (const key of keys) {
    const t = new Date(`${key}T00:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  let current = 0;
  const cursor = new Date(today);
  if (!active.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (active.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { longest, current };
}

const total = (day: Record<string, number> | undefined) => Object.values(day ?? {}).reduce((a, b) => a + b, 0);

/** The last `n` days, oldest first, each with its uses per canvas. */
export function lastDays(stats: UsageStats, n: number, today = new Date()): { key: string; date: Date; byCanvas: Record<string, number> }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(date);
    out.push({ key, date, byCanvas: stats.days[key] ?? {} });
  }
  return out;
}

/** Uses by weekday, Monday first. */
export function usesByWeekday(stats: UsageStats): number[] {
  const out = Array(7).fill(0);
  for (const [key, day] of Object.entries(stats.days)) out[(new Date(`${key}T00:00:00`).getDay() + 6) % 7] += total(day);
  return out;
}

/** Uses per month for the last 12 months, oldest first ("YYYY-MM"). */
export function usesByMonth(stats: UsageStats, today = new Date()): { key: string; date: Date; uses: number }[] {
  const out = [];
  for (let i = 11; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const uses = Object.entries(stats.days).filter(([k]) => k.startsWith(key)).reduce((a, [, d]) => a + total(d), 0);
    out.push({ key, date, uses });
  }
  return out;
}

/** The busiest day so far, and the average over days with any use. */
export function dayRecords(stats: UsageStats): { best: { key: string; uses: number } | null; average: number } {
  let best: { key: string; uses: number } | null = null;
  let sum = 0;
  let active = 0;
  for (const [key, day] of Object.entries(stats.days)) {
    const uses = total(day);
    if (!uses) continue;
    sum += uses;
    active += 1;
    if (!best || uses > best.uses) best = { key, uses };
  }
  return { best, average: active ? sum / active : 0 };
}
