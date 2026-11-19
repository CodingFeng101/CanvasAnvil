/**
 * Shrinks an image to a list preview: longest side 320px, JPEG.
 * Resolves to null when the image cannot be drawn (cross-origin, broken, no DOM);
 * a missing preview never stops a save.
 */
export async function makeThumbnail(src: string, maxSide = 320): Promise<string | null> {
  if (!src || typeof document === "undefined") return null;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("thumbnail image failed to load"));
      image.src = src;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const width = Math.max(1, Math.round((image.naturalWidth || maxSide) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || maxSide) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}
