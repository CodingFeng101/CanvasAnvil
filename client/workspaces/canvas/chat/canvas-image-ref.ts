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
 *
 * A picture that never went onto the canvas (the annotation preview) carries
 * a chat-image id instead, resolved from chat-images.ts's store.
 */

const REF_MARKER = "::canvasElement:";
const CHAT_IMAGE_MARKER = "::chatImage:";

/**
 * The label is cut from the user's own prompt, but the tag is parsed one line
 * at a time and split on `|` (see extractImageTags), so a prompt typed with
 * Shift+Enter or containing a `|` or `]` broke the tag apart -- the message
 * then rendered the whole base64 payload as text instead of the picture.
 */
function sanitizeLabel(label: string): string {
  return label.replace(/[\r\n|\]]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function withCanvasImageRef(label: string, elementId?: string | null): string {
  const safe = sanitizeLabel(label);
  return elementId ? `${safe}${REF_MARKER}${elementId}` : safe;
}

export function withChatImageRef(label: string, chatImageId: string): string {
  return `${sanitizeLabel(label)}${CHAT_IMAGE_MARKER}${chatImageId}`;
}

export function parseCanvasImageRef(rawLabel: string): { label: string; elementId?: string; chatImageId?: string } {
  const chatIdx = rawLabel.indexOf(CHAT_IMAGE_MARKER);
  if (chatIdx !== -1) {
    return {
      label: rawLabel.slice(0, chatIdx),
      chatImageId: rawLabel.slice(chatIdx + CHAT_IMAGE_MARKER.length) || undefined,
    };
  }
  const idx = rawLabel.indexOf(REF_MARKER);
  if (idx === -1) return { label: rawLabel };
  return { label: rawLabel.slice(0, idx), elementId: rawLabel.slice(idx + REF_MARKER.length) || undefined };
}

/** Every chat-image id the given messages still point at. */
export function referencedChatImageIds(contents: string[]): Set<string> {
  const ids = new Set<string>();
  const pattern = /::chatImage:([^|\]\s]+)/g;
  for (const content of contents) {
    for (const match of content.matchAll(pattern)) ids.add(match[1]);
  }
  return ids;
}
