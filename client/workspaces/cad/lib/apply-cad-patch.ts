import {
  extractCadPatchFullSvg,
  extractRawSvg,
  extractSvgFence,
  normalizeSvgMarkup,
} from "@/workspaces/cad/lib/svg-markup";

/** What running one payload through the canvas reported back. */
export interface CodeActionResult {
  ok: boolean;
  retry?: boolean;
  error?: string;
  svg?: string;
}

export type RunCodeAction = (payload: string, workspace: "cad") => Promise<CodeActionResult>;

export interface AppliedPatch {
  /** A cad_patch payload was recognised, whether or not it applied cleanly. */
  patchFound: boolean;
  /** The canvas now holds new SVG. */
  producedSvg: boolean;
  /** The markup the canvas ended up with, normalised. */
  appliedSvg: string;
  /** Set when the patch failed in a way worth asking the model to redo. */
  retryError: string | null;
}

const isCadPatch = (value: unknown): boolean => {
  const record = value as Record<string, unknown> | null;
  return (
    !!record &&
    typeof record === "object" &&
    String(record.type || "").trim().toLowerCase() === "cad_patch" &&
    String(record.target || "").trim().toLowerCase() === "2d_svg"
  );
};

const tryParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON; the caller decides what to do with the text anyway.
    return null;
  }
};

/**
 * Applies whatever a CAD agent's reply is carrying.
 *
 * The agent is asked for a cad_patch payload but does not reliably send one,
 * so each shape below is a form real replies arrive in, tried in descending
 * order of confidence: a fenced payload, a reply that is bare JSON, the
 * outermost brace pair, then plain SVG, then a last sweep.
 *
 * Every fenced payload is run, not only the patches: the canvas dispatches on
 * payload type, so a cad_plan or a bill of materials sent in the same reply is
 * applied by the same call. Only cad_patch results count towards the drawing.
 */
export async function applyCadPatchFromReply(
  reply: string,
  runCodeAction: RunCodeAction,
): Promise<AppliedPatch> {
  const raw = String(reply || "");
  let patchFound = false;
  let producedSvg = false;
  let appliedSvg = "";
  let retryError: string | null = null;

  const record = (result: CodeActionResult, fallbackSvg?: string) => {
    if (result.ok) {
      producedSvg = true;
      const normalized = normalizeSvgMarkup(result.svg || "");
      appliedSvg = normalized || fallbackSvg || appliedSvg;
    }
    if (!result.ok && result.retry) retryError = result.error || "Unknown error";
  };

  const fence = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(raw))) {
    const text = String(match[1] || "").trim();
    if (!text) continue;
    const isPatch = isCadPatch(tryParse(text));
    if (isPatch) patchFound = true;
    const result = await runCodeAction(text, "cad");
    if (isPatch) record(result);
  }

  /** Runs a candidate only if it declares itself a patch. */
  const tryPatchCandidate = async (text: string) => {
    if (patchFound || !text) return;
    if (!isCadPatch(tryParse(text))) return;
    patchFound = true;
    record(await runCodeAction(text, "cad"));
  };

  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) await tryPatchCandidate(trimmed);

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) await tryPatchCandidate(raw.slice(start, end + 1).trim());

  // No patch declared, but a drawing was sent anyway.
  if (!patchFound) {
    const svg = extractSvgFence(raw) || extractRawSvg(raw);
    if (svg) record(await runCodeAction(svg, "cad"), svg);
  }

  // Nothing applied at all: one last sweep, including a patch's own document.
  if (!producedSvg && !patchFound) {
    const svg = extractCadPatchFullSvg(raw) || extractSvgFence(raw) || extractRawSvg(raw);
    if (svg) record(await runCodeAction(svg, "cad"), svg);
  }

  return { patchFound, producedSvg, appliedSvg, retryError };
}
