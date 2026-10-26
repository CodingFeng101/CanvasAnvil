/**
 * Getting pixels into the shape the OCR models expect.
 *
 * Both models were trained on a specific preparation and are sensitive to it:
 * the detector wants ImageNet normalisation at a size that is a multiple of
 * 32, and the recogniser wants a fixed-height strip scaled to [-1, 1]. Feeding
 * either one differently does not fail, it just reads worse, which is the
 * hardest kind of mistake to notice.
 */

import type { Point, Quad } from "@/workspaces/ppt/vision/geometry";
import type { RgbaImage } from "@/workspaces/ppt/vision/types";

/** ImageNet statistics, in RGB order, as the detector was trained with. */
const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

/** The detector works at a size that is a multiple of this. */
const SIZE_STEP = 32;

const clamp = (value: number, low: number, high: number) =>
  value < low ? low : value > high ? high : value;

/**
 * Bilinear resampling, mapping destination centres back to source centres the
 * way OpenCV's `INTER_LINEAR` does. Sampling from the corner instead shifts
 * the whole image half a pixel, which moves every box by the same amount.
 */
export function resizeBilinear(image: RgbaImage, width: number, height: number): RgbaImage {
  const out = new Uint8ClampedArray(width * height * 4);
  const scaleX = image.width / width;
  const scaleY = image.height / height;

  for (let y = 0; y < height; y += 1) {
    const sourceY = clamp((y + 0.5) * scaleY - 0.5, 0, image.height - 1);
    const topRow = Math.floor(sourceY);
    const bottomRow = Math.min(topRow + 1, image.height - 1);
    const downWeight = sourceY - topRow;

    for (let x = 0; x < width; x += 1) {
      const sourceX = clamp((x + 0.5) * scaleX - 0.5, 0, image.width - 1);
      const leftColumn = Math.floor(sourceX);
      const rightColumn = Math.min(leftColumn + 1, image.width - 1);
      const rightWeight = sourceX - leftColumn;

      const topLeft = (topRow * image.width + leftColumn) * 4;
      const topRight = (topRow * image.width + rightColumn) * 4;
      const bottomLeft = (bottomRow * image.width + leftColumn) * 4;
      const bottomRight = (bottomRow * image.width + rightColumn) * 4;
      const target = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          image.data[topLeft + channel] * (1 - rightWeight) +
          image.data[topRight + channel] * rightWeight;
        const bottom =
          image.data[bottomLeft + channel] * (1 - rightWeight) +
          image.data[bottomRight + channel] * rightWeight;
        out[target + channel] = top * (1 - downWeight) + bottom * downWeight;
      }
    }
  }

  return { data: out, width, height };
}

/** The size the detector will actually run at, for a page of this shape. */
export function detectionSize(
  width: number,
  height: number,
  limitSideLength: number,
): { width: number; height: number } {
  // "min" limiting: small pages are scaled up so the detector sees enough
  // detail, large ones are left alone.
  const ratio = Math.min(width, height) < limitSideLength
    ? limitSideLength / Math.min(width, height)
    : 1;

  const round32 = (value: number) => Math.max(Math.round(value / SIZE_STEP) * SIZE_STEP, SIZE_STEP);
  return {
    width: round32(Math.trunc(width * ratio)),
    height: round32(Math.trunc(height * ratio)),
  };
}

/**
 * A page as the detector's input tensor, plus how to get its answers back.
 *
 * The tensor is CHW float; the scale is what carries a box measured on the
 * resized page onto the original one.
 */
export function detectionInput(
  image: RgbaImage,
  limitSideLength = 736,
): { tensor: Float32Array; width: number; height: number } {
  const size = detectionSize(image.width, image.height, limitSideLength);
  const resized = resizeBilinear(image, size.width, size.height);

  const pixels = size.width * size.height;
  const tensor = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      tensor[channel * pixels + i] =
        (resized.data[i * 4 + channel] / 255 - DET_MEAN[channel]) / DET_STD[channel];
    }
  }

  return { tensor, width: size.width, height: size.height };
}

/**
 * The pixels inside a quad, straightened into an upright strip.
 *
 * A perspective sample rather than an upright crop: a line that leans even
 * slightly puts background in the corners of its bounding box, and the
 * recogniser reads that background as strokes.
 */
export function cropQuad(image: RgbaImage, quad: Quad): RgbaImage {
  const [topLeft, topRight, bottomRight, bottomLeft] = quad;
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  const width = Math.max(
    1,
    Math.round(Math.max(distance(topLeft, topRight), distance(bottomLeft, bottomRight))),
  );
  const height = Math.max(
    1,
    Math.round(Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight))),
  );

  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const down = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const along = width === 1 ? 0 : x / (width - 1);

      // Bilinear interpolation across the quad's own corners.
      const top = {
        x: topLeft.x + (topRight.x - topLeft.x) * along,
        y: topLeft.y + (topRight.y - topLeft.y) * along,
      };
      const bottom = {
        x: bottomLeft.x + (bottomRight.x - bottomLeft.x) * along,
        y: bottomLeft.y + (bottomRight.y - bottomLeft.y) * along,
      };
      const sourceX = clamp(top.x + (bottom.x - top.x) * down, 0, image.width - 1);
      const sourceY = clamp(top.y + (bottom.y - top.y) * down, 0, image.height - 1);

      const leftColumn = Math.floor(sourceX);
      const rightColumn = Math.min(leftColumn + 1, image.width - 1);
      const topRow = Math.floor(sourceY);
      const bottomRow = Math.min(topRow + 1, image.height - 1);
      const rightWeight = sourceX - leftColumn;
      const downWeight = sourceY - topRow;
      const target = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const upper =
          image.data[(topRow * image.width + leftColumn) * 4 + channel] * (1 - rightWeight) +
          image.data[(topRow * image.width + rightColumn) * 4 + channel] * rightWeight;
        const lower =
          image.data[(bottomRow * image.width + leftColumn) * 4 + channel] * (1 - rightWeight) +
          image.data[(bottomRow * image.width + rightColumn) * 4 + channel] * rightWeight;
        out[target + channel] = upper * (1 - downWeight) + lower * downWeight;
      }
    }
  }

  return { data: out, width, height };
}

/**
 * One crop as the recogniser's input tensor.
 *
 * Height is fixed and width follows the aspect ratio, padded with zeros up to
 * the batch width. Stretching a short word to the full width instead would
 * change the letter shapes the model is matching against.
 */
export function recognitionInput(
  crop: RgbaImage,
  targetHeight = 48,
  targetWidth = 320,
): { tensor: Float32Array; width: number; height: number } {
  const scaled = Math.ceil((targetHeight * crop.width) / Math.max(1, crop.height));
  const width = Math.max(1, Math.min(targetWidth, scaled));
  const resized = resizeBilinear(crop, width, targetHeight);

  const pixels = targetWidth * targetHeight;
  const tensor = new Float32Array(3 * pixels);
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = y * targetWidth + x;
      for (let channel = 0; channel < 3; channel += 1) {
        tensor[channel * pixels + target] = (resized.data[source + channel] / 255 - 0.5) / 0.5;
      }
    }
  }

  return { tensor, width: targetWidth, height: targetHeight };
}

/** The widest crop in a batch, rounded so every strip pads to one width. */
export function batchWidth(crops: RgbaImage[], targetHeight = 48, maximum = 320): number {
  let widest = 16;
  for (const crop of crops) {
    widest = Math.max(widest, Math.ceil((targetHeight * crop.width) / Math.max(1, crop.height)));
  }
  return Math.min(maximum, widest);
}
