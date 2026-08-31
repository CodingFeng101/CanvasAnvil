/**
 * Getting usable SVG out of a model reply.
 *
 * The CAD agent answers with SVG in several shapes -- a ```svg fence, bare
 * markup in prose, or the `full` field of a cad_patch payload -- and
 * sometimes with its angle brackets HTML-escaped. Everything that touches
 * that markup goes through here, so the workspace, the canvas and the chat
 * panel cannot disagree about what a given reply means.
 */

const ENTITIES: Array<[RegExp, string]> = [
  [/&lt;/gi, "<"],
  [/&gt;/gi, ">"],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
  // Ampersand last: decoding it first would corrupt the entities above.
  [/&amp;/gi, "&"],
];

export function decodeBasicHtmlEntities(text: string): string {
  return ENTITIES.reduce((out, [pattern, char]) => out.replace(pattern, char), String(text || ""));
}

/**
 * Trims a reply down to the SVG document inside it, or "" if there is none.
 *
 * Markup that arrived HTML-escaped is decoded first: a model that writes
 * `&lt;svg&gt;` means the same thing as one that writes `<svg>`, and treating
 * the escaped form as "no SVG here" silently drops the drawing.
 */
export function normalizeSvgMarkup(text: string): string {
  const original = String(text || "").trim();
  const raw =
    !/<svg[\s/>]/i.test(original) && /&lt;\s*svg[\s\S]*&gt;/i.test(original)
      ? decodeBasicHtmlEntities(original).trim()
      : original;
  if (!raw) return "";

  const start = raw.search(/<svg[\s/>]/i);
  if (start < 0) return "";

  const tail = raw.slice(start);
  const end = tail.toLowerCase().lastIndexOf("</svg>");
  // A stream cut off mid-document still gives the caller what arrived.
  return end >= 0 ? tail.slice(0, end + "</svg>".length).trim() : tail.trim();
}

/** The last ```svg fence in the reply, normalised. */
export function extractSvgFence(text: string): string {
  return lastMatch(String(text || ""), /```svg\s*([\s\S]*?)```/gi, (m) => m[1]);
}

/** The last bare `<svg>…</svg>` in the reply, normalised. */
export function extractRawSvg(text: string): string {
  return lastMatch(String(text || ""), /<svg[\s\S]*?<\/svg>/gi, (m) => m[0]);
}

function lastMatch(raw: string, pattern: RegExp, pick: (m: RegExpExecArray) => string): string {
  let last = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const candidate = normalizeSvgMarkup(pick(match) || "");
    if (candidate) last = candidate;
  }
  return last;
}

const isCadPatch = (value: unknown, mode?: string): boolean => {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== "object") return false;
  if (String(record.type || "").trim().toLowerCase() !== "cad_patch") return false;
  if (String(record.target || "").trim().toLowerCase() !== "2d_svg") return false;
  return mode ? String(record.mode || "").trim().toLowerCase() === mode : true;
};

/** The `full` SVG of a whole-document cad_patch, if the reply carries one. */
export function extractCadPatchFullSvg(text: string): string {
  for (const candidate of jsonCandidates(String(text || ""))) {
    if (!isCadPatch(candidate, "replace")) continue;
    const full = normalizeSvgMarkup(String((candidate as { full?: unknown }).full || ""));
    if (full) return full;
  }
  return "";
}

/** Whether the reply contains a cad_patch at all, in any of its shapes. */
export function hasCadPatchPayload(text: string): boolean {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  if (jsonCandidates(raw).some((value) => isCadPatch(value))) return true;

  // A payload split across a truncated stream still names itself.
  return /"type"\s*:\s*"cad_patch"/i.test(raw) && /"target"\s*:\s*"2d_svg"/i.test(raw);
}

/**
 * Every JSON value the reply might be hiding, in the order worth trying:
 * each ```json fence, then the whole reply, then the outermost brace pair.
 */
export function jsonCandidates(text: string): unknown[] {
  const raw = String(text || "");
  const out: unknown[] = [];

  const fence = /```json\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(raw))) {
    const parsed = tryParse(String(match[1] || "").trim());
    if (parsed !== undefined) out.push(parsed);
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = tryParse(trimmed);
    if (parsed !== undefined) out.push(parsed);
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = tryParse(raw.slice(start, end + 1));
    if (parsed !== undefined) out.push(parsed);
  }

  return out;
}

function tryParse(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON; the caller moves on to the next candidate.
    return undefined;
  }
}

/**
 * The newest drawing in a reply, preferring the most explicit form: a ```svg
 * fence, then a cad_patch's full document, then bare markup in prose.
 *
 * Scanning for bare markup has to come last. Inside a JSON payload the SVG
 * is a string, so a raw `<svg` match there returns it with the JSON escaping
 * still in it -- markup no parser will accept.
 */
export function extractLatestSvgFromText(text: string): string {
  return extractSvgFence(text) || extractCadPatchFullSvg(text) || extractRawSvg(text);
}

/**
 * Applies a patch's search/replace pairs in order.
 *
 * Every failure throws rather than skipping: a patch that half-applied would
 * leave a drawing neither the user nor the model can reason about.
 */
export function applyStringEdits(
  source: string,
  edits: { search: string; replace: string }[],
): string {
  if (!Array.isArray(edits) || edits.length === 0) throw new Error("Empty patch edits");

  let out = source;
  for (const edit of edits) {
    if (!edit || typeof edit.search !== "string" || typeof edit.replace !== "string") {
      throw new Error("Invalid patch edit item");
    }
    if (!edit.search) throw new Error("Empty search pattern in patch edit");
    if (!out.includes(edit.search)) throw new Error("Search pattern not found in current content");
    out = out.replace(edit.search, edit.replace);
  }
  return out;
}
