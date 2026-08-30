/**
 * Turning an uploaded file into the page images the beautify and
 * image-transform flows work on.
 */

/** Both source flows accept PDFs only; the name check covers browsers that send an empty type. */
export function isPdfFile(file: File): boolean {
  return file?.type === "application/pdf" || String(file?.name || "").toLowerCase().endsWith(".pdf");
}

/**
 * Renders every page of a PDF to a PNG data URL.
 *
 * `onProgress` is called with pages completed and the total, including a
 * final call at completion, so the caller owns the wording of the message.
 */
export async function extractPdfPagesAsImages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const { getPdfDocumentFromUrl, renderPdfPageToCanvas } = await import("@/shared/files");
  const objectUrl = URL.createObjectURL(file);

  try {
    const pdf = await getPdfDocumentFromUrl(objectUrl);
    const pageCount: number = (pdf as { numPages?: number })?.numPages ?? 0;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      onProgress?.(pageNumber - 1, pageCount);
      const canvas = document.createElement("canvas");
      await renderPdfPageToCanvas({ pdf, pageNumber, canvas, targetWidth: 1280 });
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.startsWith("data:image")) pages.push(dataUrl);
    }

    onProgress?.(pageCount, pageCount);
    return pages;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
