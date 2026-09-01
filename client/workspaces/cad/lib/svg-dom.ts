import { normalizeSvgMarkup } from "@/workspaces/cad/lib/svg-markup";

/**
 * The two questions that need a real parser: is this SVG the browser will
 * accept, and does it draw anything?
 *
 * Both degrade to a cheap check where there is no DOMParser, so the same
 * code runs during a server render. They are exercised in the browser rather
 * than by the test runner for that reason.
 */

function parse(markup: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    return doc.querySelector("parsererror") ? null : doc;
  } catch {
    // A parser that throws is the same answer as one that reports an error.
    return null;
  }
}

export function isValidSvgMarkup(text: string): boolean {
  const normalized = normalizeSvgMarkup(text);
  if (!normalized) return false;
  if (typeof DOMParser === "undefined") return /^<svg[\s/>]/i.test(normalized);

  const doc = parse(normalized);
  return String(doc?.documentElement?.nodeName || "").toLowerCase() === "svg";
}

/** Elements that put something on screen; a document of only defs draws nothing. */
const DRAWABLE = "path,rect,circle,ellipse,line,polyline,polygon,text,image,use,foreignObject";

export function hasDrawableSvgContent(text: string): boolean {
  const normalized = normalizeSvgMarkup(text);
  if (!normalized) return false;
  if (typeof DOMParser === "undefined") return true;

  const doc = parse(normalized);
  const root = doc?.documentElement;
  if (!root || String(root.nodeName || "").toLowerCase() !== "svg") return false;
  return !!root.querySelector(DRAWABLE);
}
