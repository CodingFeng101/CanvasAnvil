/**
 * Moving between the browser's images and raw pixels.
 *
 * Everything else in this folder works on plain RGBA arrays, so the encode
 * and decode live here rather than being repeated at each edge.
 */

import type { RgbaImage } from "@/workspaces/ppt/vision/types";

const canvasOf = (width: number, height: number) =>
  typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(width, height)
    : Object.assign(document.createElement("canvas"), { width, height });

/** Decode an image URL -- including a data URL -- into raw pixels. */
export async function loadRgbaImage(url: string): Promise<RgbaImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the image (${response.status}).`);

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = canvasOf(bitmap.width, bitmap.height);
    const context = (canvas as HTMLCanvasElement).getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Could not open a 2D context to read the image.");

    context.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    const { data, width, height } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data, width, height };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Raw pixels as a PNG data URL.
 *
 * PNG rather than JPEG throughout: these carry transparency, and a lossy
 * round trip would put back exactly the compression speckle the cleaning
 * stage exists to remove.
 */
export async function toDataUrl(image: RgbaImage): Promise<string> {
  const canvas = canvasOf(image.width, image.height);
  const context = (canvas as HTMLCanvasElement).getContext("2d");
  if (!context) throw new Error("Could not open a 2D context to write the image.");

  const pixels = new ImageData(
    image.data instanceof Uint8ClampedArray ? image.data : new Uint8ClampedArray(image.data),
    image.width,
    image.height,
  );
  context.putImageData(pixels, 0, 0);

  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  return (canvas as HTMLCanvasElement).toDataURL("image/png");
}
