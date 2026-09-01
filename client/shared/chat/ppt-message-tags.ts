/**
 * The markers a PPT conversation carries inside otherwise plain message text.
 *
 * The chat input writes `[[PPT_SLIDE|n|title|kind]]` when the user attaches a
 * slide, and the assistant answers slide edits as a `ppt_edit` JSON payload.
 * The transcript has to pull both back out to render them as chips and diffs
 * rather than as raw text.
 */

export interface PptEditSlidePatch {
  id?: string;
  title?: string;
  content?: string[];
  description?: string;
  note?: string;
  layout?: string;
  [key: string]: unknown;
}

export interface PptToolPayload {
  type: "ppt_edit";
  slides: PptEditSlidePatch[];
}

export type PptSlideTag = { n: number; title?: string; kind?: "outline" | "slide_image" };
export type ImageTag = { name?: string; url: string };

export type InlinePptPart =
  | { type: "text"; text: string }
  | { type: "ppt"; n: number; title?: string; kind?: "outline" | "slide_image" };

/** Pulls out slide markers that sit alone on their own line. */
export function extractPptSlideTags(text: string): { tags: PptSlideTag[]; rest: string } {
  const tags: PptSlideTag[] = [];
  const restLines: string[] = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    const tagged = line.match(/^\[\[PPT_SLIDE\|(\d+)\|([^|]*)\|(outline|slide_image)\]\]$/);
    if (tagged) {
      const n = Number(tagged[1]);
      const title = String(tagged[2] || "").trim();
      if (!Number.isNaN(n)) {
        tags.push({ n, title: title || undefined, kind: tagged[3] as "outline" | "slide_image" });
      }
      continue;
    }

    // Markers written before `kind` existed default to a slide image.
    const legacy = line.match(/^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/);
    if (legacy) {
      const n = Number(legacy[1]);
      const title = String(legacy[2] || "").trim();
      if (!Number.isNaN(n)) tags.push({ n, title: title || undefined, kind: "slide_image" });
      continue;
    }

    restLines.push(line);
  }

  return { tags, rest: restLines.join("\n").replace(/^\s+|\s+$/g, "") };
}

const SAFE_IMAGE_PREFIXES = ["data:image", "blob:", "http://", "https://"];

/** Pulls out image markers, ignoring any whose URL is not one we will render. */
export function extractImageTags(text: string): { images: ImageTag[]; rest: string } {
  const images: ImageTag[] = [];
  const restLines: string[] = [];

  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\[\[IMAGE\|([^|]*)\|([\s\S]+)\]\]$/);
    if (match) {
      const name = String(match[1] || "").trim();
      const url = String(match[2] || "").trim();
      if (SAFE_IMAGE_PREFIXES.some((prefix) => url.startsWith(prefix))) {
        images.push({ name: name || undefined, url });
        continue;
      }
    }
    restLines.push(line);
  }

  return { images, rest: restLines.join("\n").replace(/^\s+|\s+$/g, "") };
}

/**
 * Splits a line into text and the slide markers embedded in it, so a slide
 * referenced mid-sentence renders as a chip in place.
 */
export function splitInlinePptTags(text: string): InlinePptPart[] {
  const raw = String(text || "");
  const out: InlinePptPart[] = [];
  const pattern = /\[\[PPT_SLIDE\|(\d+)\|([\s\S]*?)\]\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(raw))) {
    const before = raw.slice(lastIndex, match.index);
    if (before) out.push({ type: "text", text: before });

    const n = Number(match[1]);
    const title = String(match[2] || "").trim();
    if (Number.isNaN(n)) {
      // Not a real marker after all; keep it as the text it looked like.
      out.push({ type: "text", text: match[0] });
    } else {
      let kind: "outline" | "slide_image" = "slide_image";
      let normalizedTitle = title;
      // A title may itself contain "|", so only a trailing known kind counts.
      const parts = title.split("|");
      if (parts.length >= 2) {
        const maybeKind = parts[parts.length - 1].trim();
        if (maybeKind === "outline" || maybeKind === "slide_image") {
          kind = maybeKind;
          normalizedTitle = parts.slice(0, -1).join("|").trim();
        }
      }
      out.push({ type: "ppt", n, title: normalizedTitle || undefined, kind });
    }
    lastIndex = match.index + match[0].length;
  }

  const rest = raw.slice(lastIndex);
  if (rest) out.push({ type: "text", text: rest });
  if (out.length === 0) out.push({ type: "text", text: raw });
  return out;
}

/**
 * Reads a slide-edit payload out of an assistant reply, whether it arrived
 * fenced, bare, or as a naked array of slides.
 */
export function extractPptToolPayload(text: string): PptToolPayload | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  let parsed: unknown;
  try {
    parsed = JSON.parse((fenced?.[1] ?? raw).trim());
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return {
      type: "ppt_edit",
      slides: parsed.filter((s): s is PptEditSlidePatch => !!s && typeof s === "object"),
    };
  }
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const declaredType = String(record.type || "").trim().toLowerCase();
  if (declaredType && declaredType !== "ppt_edit") return null;

  const slides = Array.isArray(record.slides)
    ? record.slides.filter((s): s is PptEditSlidePatch => !!s && typeof s === "object")
    : [];
  return slides.length > 0 ? { type: "ppt_edit", slides } : null;
}

/** The slide's 1-based number, from its id where it has one. */
export function getSlideNumber(slide: PptEditSlidePatch, index: number): number {
  const match = String(slide?.id || "").match(/slide-(\d+)/i);
  if (match) {
    const n = Number(match[1]);
    if (!Number.isNaN(n)) return n;
  }
  return index + 1;
}

/** The fields shown first, in the order a reader expects them. */
const KNOWN_FIELDS = ["title", "description", "layout", "note", "content"];
const EMPTY_VALUE = "（空）";

/** Flattens a patch into displayable rows, keeping unknown fields rather than hiding them. */
export function slidePatchEntries(slide: PptEditSlidePatch): Array<{ key: string; value: string }> {
  const rows: Array<{ key: string; value: string }> = [];

  for (const key of KNOWN_FIELDS) {
    if (!(key in slide)) continue;
    const raw = slide[key];
    if (Array.isArray(raw)) {
      const text = raw.map((x) => String(x || "").trim()).filter(Boolean).join("；");
      rows.push({ key, value: text || EMPTY_VALUE });
    } else if (raw && typeof raw === "object") {
      rows.push({ key, value: JSON.stringify(raw) });
    } else {
      rows.push({ key, value: String(raw ?? "").trim() || EMPTY_VALUE });
    }
  }

  for (const [key, value] of Object.entries(slide)) {
    if (key === "id" || KNOWN_FIELDS.includes(key)) continue;
    if (value === undefined) continue;
    rows.push({ key, value: typeof value === "string" ? value : JSON.stringify(value) });
  }

  return rows;
}

const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  title: { zh: "标题", en: "Title" },
  description: { zh: "画面描述", en: "Description" },
  layout: { zh: "布局", en: "Layout" },
  note: { zh: "备注", en: "Note" },
  content: { zh: "内容", en: "Content" },
};

/** An unknown field falls back to its own key rather than disappearing. */
export function slideFieldLabel(key: string, uiLang: "zh" | "en"): string {
  const hit = FIELD_LABELS[key];
  return hit ? hit[uiLang] : key;
}
