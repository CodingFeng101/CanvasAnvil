/**
 * The handful of NumPy reductions the text measurement chain relies on.
 *
 * These exist as their own module because the measurement thresholds were
 * tuned against NumPy's exact definitions, and two of them are easy to get
 * subtly wrong: `percentile` interpolates between neighbours rather than
 * rounding to one, and `standardDeviation` is the population form (ddof=0),
 * not the sample form most libraries default to. A percentile that rounds
 * instead of interpolating shifts every measured font size by up to a whole
 * pixel, which is enough to move a heading into the wrong size bucket.
 */

/** NumPy's default `linear` interpolation, matching `np.percentile`. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const count = values.length;
  if (count === 0) return 0;
  if (count === 1) return values[0];

  const sorted = Array.from(values).sort((a, b) => a - b);
  const position = ((count - 1) * p) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** `np.median`: the midpoint, averaging the two central values on even counts. */
export function median(values: ArrayLike<number>): number {
  return percentile(values, 50);
}

export function mean(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < values.length; i += 1) total += values[i];
  return total / values.length;
}

/** `np.var`: the population variance. */
export function variance(values: ArrayLike<number>): number {
  if (values.length === 0) return 0;
  const centre = mean(values);
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    const delta = values[i] - centre;
    total += delta * delta;
  }
  return total / values.length;
}

/** `np.std`: the population standard deviation. */
export function standardDeviation(values: ArrayLike<number>): number {
  return Math.sqrt(variance(values));
}

/**
 * `np.polyfit(x, y, 1)`: the least-squares line through the points.
 *
 * Used to regress stroke ratio against font size, so that a glyph's weight is
 * judged against what a glyph of its size normally measures rather than
 * against a fixed number.
 */
export function linearFit(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): { slope: number; intercept: number } {
  const count = Math.min(xs.length, ys.length);
  if (count === 0) return { slope: 0, intercept: 0 };

  const meanX = mean(Array.from({ length: count }, (_, i) => xs[i]));
  const meanY = mean(Array.from({ length: count }, (_, i) => ys[i]));

  let covariance = 0;
  let spread = 0;
  for (let i = 0; i < count; i += 1) {
    const deltaX = xs[i] - meanX;
    covariance += deltaX * (ys[i] - meanY);
    spread += deltaX * deltaX;
  }

  // Every x identical: no line to fit, so the flat one through the mean.
  if (spread === 0) return { slope: 0, intercept: meanY };

  const slope = covariance / spread;
  return { slope, intercept: meanY - slope * meanX };
}

/**
 * The per-channel median of a run of RGB pixels.
 *
 * Channels are taken independently, as `np.median(pixels, axis=0)` does, so
 * the result is not necessarily a colour that appears in the input. That is
 * intended: it is the centre of the distribution, not a representative pixel.
 */
export function medianColor(pixels: ArrayLike<number>, channels = 3): number[] {
  const count = Math.floor(pixels.length / channels);
  if (count === 0) return new Array(channels).fill(0);

  const out: number[] = [];
  const lane = new Float64Array(count);
  for (let c = 0; c < channels; c += 1) {
    for (let i = 0; i < count; i += 1) lane[i] = pixels[i * channels + c];
    out.push(median(lane));
  }
  return out;
}
