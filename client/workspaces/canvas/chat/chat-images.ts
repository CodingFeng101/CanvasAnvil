import { CANVAS_CHAT_IMAGES_KEY, canvasStore } from "@/workspaces/canvas/storage";

/**
 * Pictures shown in the chat that have no canvas element to fall back on.
 *
 * Chat history goes to localStorage with its image data stripped (see
 * chat-storage.ts). A generated picture survives that because it is also on
 * the board and can be looked up there again; the annotation preview never
 * was, so after a reload it was left as a bare "[图片：标注]" line. These are
 * kept in the canvas's own IndexedDB instead, keyed by an id the message
 * carries (see canvas-image-ref.ts), and shrunk first -- the chat shows a
 * thumbnail, not the 2048px composite sent to the model.
 */

export type ChatImageMap = Record<string, string>;

const MAX_STORED_DIMENSION = 1024;
const JPEG_QUALITY = 0.85;

export async function loadChatImages(): Promise<ChatImageMap> {
  const stored = await canvasStore.read<ChatImageMap>(CANVAS_CHAT_IMAGES_KEY);
  return stored && typeof stored === "object" ? stored : {};
}

export async function saveChatImages(images: ChatImageMap): Promise<void> {
  await canvasStore.save(CANVAS_CHAT_IMAGES_KEY, images);
}

/** Only the entries some message still points at; the rest belong to history that has since been trimmed or cleared. */
export function pruneChatImages(images: ChatImageMap, referencedIds: Set<string>): ChatImageMap {
  return Object.fromEntries(Object.entries(images).filter(([id]) => referencedIds.has(id)));
}

/** Downscales to a chat-sized JPEG; hands the input back unchanged if it cannot be decoded. */
export function shrinkForChat(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.naturalWidth, img.naturalHeight);
      if (!longest) return resolve(dataUrl);
      const scale = Math.min(1, MAX_STORED_DIMENSION / longest);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      // JPEG has no alpha; anything transparent would otherwise come out black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
