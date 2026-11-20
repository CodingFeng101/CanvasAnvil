/**
 * The works index: what "My works" lists for one canvas.
 *
 * Plain functions over plain values, so the rules (what a draft is, how a work
 * is named, the order of the list) are tested without IndexedDB.
 *
 * A canvas always has exactly one current work. Until it has content it is a
 * draft: kept across reloads, but not listed. Once the user puts something in
 * it, it is named on its own (from the content, else "未命名作品 N") and
 * listed, as claude.ai lists a chat. The canvas always works on a live copy
 * that is written as it changes, so there is no Save: what is on screen is
 * what is kept.
 */

export interface WorkMeta {
  id: string;
  name: string;
  /** False while the work is the canvas's unsaved draft. */
  saved: boolean;
  /** Small preview for the list (longest side ~320px); absent → placeholder. */
  thumb?: string;
  /** A name taken from the content (deck title, first request) for the Save dialog. */
  nameHint?: string;
  /** True once the draft has any content worth asking about before it is dropped. */
  touched?: boolean;
  /** Legacy (the Save era): a saved work whose live copy had unsaved changes. Ignored now. */
  dirty?: boolean;
  /** Pinned to the top of the sidebar's list. */
  pinned?: boolean;
  /** The latest request in the chat, for the sidebar's hover preview. */
  lastPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export function makeWorkId(now = Date.now(), random = Math.random): string {
  return `w${now.toString(36)}${random().toString(36).slice(2, 8)}`;
}

export function newDraft(now = Date.now(), id = makeWorkId(now)): WorkMeta {
  return { id, name: "", saved: false, createdAt: now, updatedAt: now };
}

/** Keeps only well-formed entries; the stored index may come from an older or broken release. */
export function normalizeIndex(value: unknown): WorkMeta[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: WorkMeta[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id || seen.has(e.id)) continue;
    seen.add(e.id);
    const createdAt = typeof e.createdAt === "number" ? e.createdAt : 0;
    out.push({
      id: e.id,
      name: typeof e.name === "string" ? e.name : "",
      saved: e.saved === true,
      thumb: typeof e.thumb === "string" ? e.thumb : undefined,
      nameHint: typeof e.nameHint === "string" ? e.nameHint : undefined,
      lastPrompt: typeof e.lastPrompt === "string" ? e.lastPrompt : undefined,
      touched: e.touched === true ? true : undefined,
      dirty: e.dirty === true ? true : undefined,
      pinned: e.pinned === true ? true : undefined,
      createdAt,
      updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : createdAt,
    });
  }
  return out;
}

export function upsertWork(index: WorkMeta[], work: WorkMeta): WorkMeta[] {
  const at = index.findIndex((w) => w.id === work.id);
  if (at < 0) return [...index, work];
  const next = index.slice();
  next[at] = work;
  return next;
}

export function patchWork(index: WorkMeta[], id: string, patch: Partial<Omit<WorkMeta, "id">>): WorkMeta[] {
  return index.map((w) => (w.id === id ? { ...w, ...patch } : w));
}

export function removeWork(index: WorkMeta[], id: string): WorkMeta[] {
  return index.filter((w) => w.id !== id);
}

/** The list "My works" shows: saved works, most recently changed first. */
export function listedWorks(index: WorkMeta[]): WorkMeta[] {
  return index.filter((w) => w.saved).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Drafts other than the current work; there should be none, and any found are cleaned up. */
export function strayDrafts(index: WorkMeta[], currentId: string | null): WorkMeta[] {
  return index.filter((w) => !w.saved && w.id !== currentId);
}

const NAME_LIMIT = 24;

/** A short name from free text: first line, whitespace collapsed, cut at ~24 characters. */
export function nameFromText(text: string | null | undefined): string {
  const firstLine = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  const collapsed = firstLine.replace(/\s+/g, " ");
  const chars = Array.from(collapsed);
  return chars.length > NAME_LIMIT ? `${chars.slice(0, NAME_LIMIT).join("")}…` : collapsed;
}

/** True for a name `defaultWorkName` hands out, which the content may replace. */
export function isDefaultWorkName(name: string): boolean {
  return /^(未命名作品|Untitled) \d+$/.test(name);
}

/** "未命名作品 3" / "Untitled 3": the first number not already taken in this canvas. */
export function defaultWorkName(index: WorkMeta[], lang: "zh" | "en"): string {
  const base = lang === "zh" ? "未命名作品" : "Untitled";
  const taken = new Set(index.filter((w) => w.saved).map((w) => w.name));
  for (let n = 1; ; n++) {
    const name = `${base} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/** The name a copy gets: "名称 副本" / "Name copy", numbered when that is taken too. */
export function copyName(index: WorkMeta[], name: string, lang: "zh" | "en"): string {
  const suffix = lang === "zh" ? "副本" : "copy";
  const taken = new Set(index.map((w) => w.name));
  const first = `${name} ${suffix}`;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n++) {
    const candidate = `${name} ${suffix} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
