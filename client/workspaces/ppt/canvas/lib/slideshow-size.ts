/** The largest 16:9 box that fits the window with room to spare around it. */
export function getSlideshowDimensions(
  window: { width: number; height: number },
): { width: number | string; height: number | string } {
  // Before the first measurement, fall back to viewport units.
  if (!window.width) return { width: "90vw", height: "50.625vw" };

  const maxWidth = window.width * 0.9;
  const maxHeight = window.height * 0.85;

  let width = maxWidth;
  let height = (width * 9) / 16;
  if (height > maxHeight) {
    height = maxHeight;
    width = (height * 16) / 9;
  }
  return { width, height };
}
