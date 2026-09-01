/**
 * Parses JSON out of a model reply.
 *
 * Models wrap their answer in prose or a ```json fence often enough that a
 * bare JSON.parse loses usable output, so this falls back to the fence and
 * then to the outermost bracket pair before giving up.
 */
export function parseJsonLoose(text: string): unknown {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // Not bare JSON; try the wrapped forms below.
  }

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Fence content was not valid either.
    }
  }

  const open = raw.indexOf("[");
  const close = raw.lastIndexOf("]");
  if (open >= 0 && close > open) {
    try {
      return JSON.parse(raw.slice(open, close + 1));
    } catch {
      // Fall through to null.
    }
  }

  return null;
}
