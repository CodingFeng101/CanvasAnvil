/**
 * The four OpenCV operations the text measurement chain is built on.
 *
 * Each one follows OpenCV's own definition rather than the textbook one,
 * because the thresholds downstream were tuned against OpenCV's output:
 *
 *   * `distanceTransform` is the 3x3 chamfer approximation of the Euclidean
 *     distance, with OpenCV's weights -- not the exact Euclidean distance.
 *   * Pixels beyond the edge of a mask are *not* treated as background, so a
 *     stroke touching the border reads as thicker than one in the middle.
 *     Cropping a glyph tightly and cropping it loosely give different stroke
 *     widths, and the callers here crop tightly on purpose.
 */

export interface Mask {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface ComponentStats {
  left: number;
  top: number;
  width: number;
  height: number;
  area: number;
}

export function createMask(width: number, height: number): Mask {
  return { data: new Uint8Array(Math.max(0, width * height)), width, height };
}

/**
 * Per-pixel component labels, 8-connected, background = 0.
 *
 * Two-pass union-find. Label numbering does not match OpenCV's and nothing
 * depends on it: callers either aggregate per label or sort the results
 * themselves.
 */
export function labelComponents(mask: Mask): { labels: Int32Array; roots: number[] } {
  const { data, width, height } = mask;
  if (width <= 0 || height <= 0) return { labels: new Int32Array(0), roots: [] };

  const labels = new Int32Array(width * height);
  const parent: number[] = [0];

  const find = (node: number): number => {
    let root = node;
    while (parent[root] !== root) root = parent[root];
    // Path compression, so the second pass stays linear on long thin strokes.
    let cursor = node;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  const union = (a: number, b: number) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!data[index]) continue;

      // The four already-visited neighbours under 8-connectivity.
      let smallest = 0;
      const neighbours: number[] = [];
      for (const [dx, dy] of [[-1, 0], [-1, -1], [0, -1], [1, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const label = labels[ny * width + nx];
        if (!label) continue;
        neighbours.push(label);
        if (!smallest || label < smallest) smallest = label;
      }

      if (!smallest) {
        const fresh = parent.length;
        parent.push(fresh);
        labels[index] = fresh;
        continue;
      }

      labels[index] = smallest;
      for (const label of neighbours) union(smallest, label);
    }
  }

  // Collapse every pixel onto its component's root, so callers can group by
  // label without carrying the union-find around.
  const roots = new Set<number>();
  for (let i = 0; i < labels.length; i += 1) {
    if (!labels[i]) continue;
    labels[i] = find(labels[i]);
    roots.add(labels[i]);
  }

  return { labels, roots: Array.from(roots) };
}

/** `cv2.connectedComponentsWithStats`: the bounding box and pixel count of each blob. */
export function connectedComponentsWithStats(mask: Mask): ComponentStats[] {
  const { width, height } = mask;
  const { labels } = labelComponents(mask);

  const boxes = new Map<number, ComponentStats>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const root = labels[y * width + x];
      if (!root) continue;
      const box = boxes.get(root);
      if (!box) {
        boxes.set(root, { left: x, top: y, width: 1, height: 1, area: 1 });
        continue;
      }
      const right = Math.max(box.left + box.width, x + 1);
      const bottom = Math.max(box.top + box.height, y + 1);
      box.left = Math.min(box.left, x);
      box.top = Math.min(box.top, y);
      box.width = right - box.left;
      box.height = bottom - box.top;
      box.area += 1;
    }
  }

  return Array.from(boxes.values());
}

/** `cv2.erode` with a 3x3 rectangular kernel, one iteration. */
export function erode3x3(mask: Mask): Mask {
  const { data, width, height } = mask;
  const out = createMask(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let survives = 1;
      for (let dy = -1; dy <= 1 && survives; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          // OpenCV replicates the border for erosion, so an edge pixel is not
          // eroded away merely for sitting at the edge.
          const cx = nx < 0 ? 0 : nx >= width ? width - 1 : nx;
          const cy = ny < 0 ? 0 : ny >= height ? height - 1 : ny;
          if (!data[cy * width + cx]) {
            survives = 0;
            break;
          }
        }
      }
      out.data[y * width + x] = survives;
    }
  }

  return out;
}

/**
 * Erode or dilate with a square kernel of any size.
 *
 * Done as two one-dimensional passes, which a square structuring element
 * allows and which turns the cost from the kernel's area into its side. The
 * sheet-cutting pass closes with a kernel tens of pixels across, and the
 * square version of that is slow enough to be felt.
 */
function sweepSquare(mask: Mask, size: number, keep: (a: number, b: number) => number): Mask {
  const radius = Math.max(0, Math.floor(size / 2));
  if (radius === 0) return { data: mask.data.slice(), width: mask.width, height: mask.height };

  const { width, height } = mask;
  const horizontal = createMask(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = mask.data[y * width + Math.min(width - 1, Math.max(0, x))];
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sx = x + offset;
        // Outside the image contributes nothing, so a shape is neither eaten
        // nor grown merely for sitting against an edge.
        if (sx < 0 || sx >= width) continue;
        value = keep(value, mask.data[y * width + sx]);
      }
      horizontal.data[y * width + x] = value;
    }
  }

  const out = createMask(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = horizontal.data[y * width + x];
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sy = y + offset;
        if (sy < 0 || sy >= height) continue;
        value = keep(value, horizontal.data[sy * width + x]);
      }
      out.data[y * width + x] = value;
    }
  }

  return out;
}

export const dilateSquare = (mask: Mask, size: number) =>
  sweepSquare(mask, size, (a, b) => (a > b ? a : b));

export const erodeSquare = (mask: Mask, size: number) =>
  sweepSquare(mask, size, (a, b) => (a < b ? a : b));

/**
 * `cv2.MORPH_CLOSE`: dilate, then erode.
 *
 * Joins the parts of one drawing that are not connected pixels -- a badge
 * ring and the glyph inside it -- without growing the drawing overall.
 */
export const closeSquare = (mask: Mask, size: number) =>
  erodeSquare(dilateSquare(mask, size), size);

// OpenCV's chamfer weights for DIST_L2 with a 3x3 mask: the orthogonal and
// diagonal step costs that best approximate Euclidean distance.
const CHAMFER_ORTHOGONAL = 0.955;
const CHAMFER_DIAGONAL = 1.3693;

/**
 * `cv2.distanceTransform(mask, DIST_L2, 3)`: for each non-zero pixel, the
 * distance to the nearest zero pixel.
 *
 * On a glyph mask this reports stroke half-width, which is what separates a
 * simple bold character from a stroke-dense regular one. Ink coverage cannot:
 * both fill a similar share of their box.
 */
export function distanceTransformL2(mask: Mask): Float32Array {
  const { data, width, height } = mask;
  const distance = new Float32Array(width * height);
  if (width <= 0 || height <= 0) return distance;

  // Anything off the edge counts as "far", never as background. See the note
  // at the top of this file.
  const FAR = 1e10;
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? FAR : distance[y * width + x];

  for (let i = 0; i < distance.length; i += 1) distance[i] = data[i] ? FAR : 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      distance[index] = Math.min(
        distance[index],
        at(x - 1, y - 1) + CHAMFER_DIAGONAL,
        at(x, y - 1) + CHAMFER_ORTHOGONAL,
        at(x + 1, y - 1) + CHAMFER_DIAGONAL,
        at(x - 1, y) + CHAMFER_ORTHOGONAL,
      );
    }
  }

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (distance[index] === 0) continue;
      distance[index] = Math.min(
        distance[index],
        at(x + 1, y + 1) + CHAMFER_DIAGONAL,
        at(x, y + 1) + CHAMFER_ORTHOGONAL,
        at(x - 1, y + 1) + CHAMFER_DIAGONAL,
        at(x + 1, y) + CHAMFER_ORTHOGONAL,
      );
    }
  }

  for (let i = 0; i < distance.length; i += 1) {
    if (distance[i] >= FAR) distance[i] = 0;
  }
  return distance;
}

/**
 * A horizontal shear, as `cv2.warpAffine` with `INTER_NEAREST` performs it.
 *
 * The matrix is `[[1, angle, -angle * h / 2], [0, 1, 0]]`, which leans the
 * mask about its vertical centre. OpenCV inverts the matrix before sampling,
 * so this reads each destination pixel back from the source.
 */
export function shearNearest(mask: Mask, angle: number): Mask {
  const { data, width, height } = mask;
  const out = createMask(width, height);
  const shift = (angle * height) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.round(x - angle * y + shift);
      if (sourceX < 0 || sourceX >= width) continue;
      out.data[y * width + x] = data[y * width + sourceX];
    }
  }

  return out;
}

/** The tight box around every set pixel, or null when the mask is empty. */
export function inkBounds(
  mask: Mask,
): { left: number; top: number; right: number; bottom: number } | null {
  const { data, width, height } = mask;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!data[y * width + x]) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < 0) return null;
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

/** A rectangular view of `mask`, copied out as its own mask. */
export function cropMask(mask: Mask, left: number, top: number, right: number, bottom: number): Mask {
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const out = createMask(width, height);

  for (let y = 0; y < height; y += 1) {
    const sourceRow = (top + y) * mask.width;
    for (let x = 0; x < width; x += 1) {
      out.data[y * width + x] = mask.data[sourceRow + left + x] || 0;
    }
  }

  return out;
}

/**
 * Sobel gradient magnitudes over a greyscale image, one array per axis.
 *
 * Used to find where a card's edge really is. The greyscale weights are
 * OpenCV's, because the edge that shows up strongest depends on them: a blue
 * card on a white page has almost no gradient in the blue channel and plenty
 * in the green one.
 */
export function sobelMagnitudes(
  image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
): { x: Float32Array; y: Float32Array } {
  const { data, width, height } = image;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) {
    const at = i * 4;
    grey[i] = 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2];
  }

  const gradientX = new Float32Array(width * height);
  const gradientY = new Float32Array(width * height);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return grey[cy * width + cx];
  };

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

      const index = y * width + x;
      gradientX[index] = Math.abs(
        -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight,
      );
      gradientY[index] = Math.abs(
        -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight,
      );
    }
  }

  return { x: gradientX, y: gradientY };
}

/** How many pixels are set. */
export function maskSum(mask: Mask): number {
  let total = 0;
  for (let i = 0; i < mask.data.length; i += 1) total += mask.data[i] ? 1 : 0;
  return total;
}
