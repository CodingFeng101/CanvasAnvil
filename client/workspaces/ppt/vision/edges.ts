/**
 * Canny edge detection, as OpenCV performs it.
 *
 * Used to ask how much detail is inside a shape: a flat card has almost none,
 * a drawing of a database has a great deal. That distinction is what a
 * gradient magnitude alone cannot give -- every soft edge and every gradient
 * registers -- and it is why the thinning and the hysteresis are both here
 * rather than a threshold on Sobel.
 *
 * Matches `cv2.Canny(grey, low, high)` with its defaults: a 3x3 Sobel
 * aperture and the L1 gradient, not the Euclidean one.
 */

import type { RgbaImage } from "@/workspaces/ppt/vision/types";
import { createMask, type Mask } from "@/workspaces/ppt/vision/morphology";

/** OpenCV's BGR2GRAY weights, applied to RGB. */
export function toGreyscale(image: RgbaImage): Float32Array {
  const grey = new Float32Array(image.width * image.height);
  for (let i = 0; i < grey.length; i += 1) {
    const at = i * 4;
    grey[i] = 0.299 * image.data[at] + 0.587 * image.data[at + 1] + 0.114 * image.data[at + 2];
  }
  return grey;
}

/**
 * Edge pixels, as a mask.
 *
 * `low` and `high` are the hysteresis thresholds: anything above `high`
 * starts an edge, anything above `low` continues one, and a weak pixel with
 * no strong pixel connected to it is noise.
 */
export function canny(image: RgbaImage, low = 60, high = 160): Mask {
  const { width, height } = image;
  const out = createMask(width, height);
  if (width < 3 || height < 3) return out;

  const grey = toGreyscale(image);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return grey[cy * width + cx];
  };

  const magnitude = new Float32Array(width * height);
  const direction = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const topLeft = at(x - 1, y - 1);
      const top = at(x, y - 1);
      const topRight = at(x + 1, y - 1);
      const left = at(x - 1, y);
      const right = at(x + 1, y);
      const bottomLeft = at(x - 1, y + 1);
      const bottom = at(x, y + 1);
      const bottomRight = at(x + 1, y + 1);

      const dx = -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const dy = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;

      const index = y * width + x;
      // L1, which is what OpenCV uses unless asked for L2gradient.
      magnitude[index] = Math.abs(dx) + Math.abs(dy);

      // Quantised to the four directions a pixel grid actually has.
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const wrapped = angle < 0 ? angle + 180 : angle;
      direction[index] =
        wrapped < 22.5 || wrapped >= 157.5 ? 0 : wrapped < 67.5 ? 1 : wrapped < 112.5 ? 2 : 3;
    }
  }

  // Thin each ridge to its crest: without this every edge comes out several
  // pixels wide and the density says more about blur than about detail.
  const thinned = new Float32Array(width * height);
  const OFFSETS: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 1], [0, 1], [-1, 1]];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const [dx, dy] = OFFSETS[direction[index]];
      const ahead = magnitude[(y + dy) * width + x + dx];
      const behind = magnitude[(y - dy) * width + x - dx];
      thinned[index] = magnitude[index] >= ahead && magnitude[index] >= behind ? magnitude[index] : 0;
    }
  }

  // Hysteresis: strong pixels seed the edges, weak ones only survive by
  // touching one.
  const stack: number[] = [];
  for (let i = 0; i < thinned.length; i += 1) {
    if (thinned[i] >= high) {
      out.data[i] = 1;
      stack.push(i);
    }
  }

  while (stack.length > 0) {
    const index = stack.pop()!;
    const x = index % width;
    const y = (index - x) / width;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (out.data[neighbour] || thinned[neighbour] < low) continue;
        out.data[neighbour] = 1;
        stack.push(neighbour);
      }
    }
  }

  return out;
}
