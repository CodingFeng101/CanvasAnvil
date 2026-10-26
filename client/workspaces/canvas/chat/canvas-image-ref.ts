/**
 * Chat messages reference the canvas element that holds a generated picture
 * (encoded into the `[[IMAGE|label|...]]` tag's label) rather than relying
 * solely on the embedded data URL.
 *
 * `chat-storage.ts` strips large data URLs out of persisted history for
 * localStorage quota safety, so after a reload a plain data-URL tag has
 * nothing left to render even though the picture is still sitting right there
 * on the canvas (which has its own, much larger, storage). Carrying the
 * element id through lets the chat resolve the *current* picture from the
 * canvas at render time instead of showing a text stand-in.
 */

const REF_MARKER = "::canvasElement:";

export function withCanvasImageRef(label: string, elementId?: string | null): string {
  return elementId ? `${label}${REF_MARKER}${elementId}` : label;
}

export function parseCanvasImageRef(rawLabel: string): { label: string; elementId?: string } {
  const idx = rawLabel.indexOf(REF_MARKER);
  if (idx === -1) return { label: rawLabel };
  return { label: rawLabel.slice(0, idx), elementId: rawLabel.slice(idx + REF_MARKER.length) || undefined };
}
