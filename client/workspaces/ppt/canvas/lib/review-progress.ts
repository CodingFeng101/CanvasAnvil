import type { EditableExtractionStatus } from "@/workspaces/ppt/canvas/types";

/**
 * How far a deck is through export review.
 *
 * Review runs in two passes over every slide: first each slide's text-box
 * layer is prepared, then the text inside those boxes is extracted. The
 * sidebar reports whichever pass is running, so the two counts must not be
 * confused for one another.
 */

/** A layer that failed still counts as prepared -- it will not be retried. */
export type LayerStatus = "pending" | "ready" | "failed" | undefined;

export interface ReviewProgress {
  /** Text extraction is running on at least one slide. */
  isExtracting: boolean;
  /** Every slide has a text-box layer, successful or not. */
  allLayersPrepared: boolean;
  /** Every slide's text has been extracted. */
  allExtractionsDone: boolean;
  doneCount: number;
  failedCount: number;
  preparedCount: number;
  /** Which pass the sidebar should present. */
  phase: "boxes" | "text";
}

const isPrepared = (status: LayerStatus) => status === "ready" || status === "failed";

export function summariseReviewProgress(
  extractionStatuses: EditableExtractionStatus[],
  layerStatuses: LayerStatus[],
): ReviewProgress {
  const total = extractionStatuses.length;
  const isExtracting = extractionStatuses.some((s) => s === "extracting");
  const preparedCount = layerStatuses.filter(isPrepared).length;

  return {
    isExtracting,
    // An empty deck is not "all prepared"; there is nothing to review.
    allLayersPrepared: total > 0 && preparedCount === layerStatuses.length && layerStatuses.length > 0,
    allExtractionsDone: total > 0 && extractionStatuses.every((s) => s === "done"),
    doneCount: extractionStatuses.filter((s) => s === "done").length,
    failedCount: extractionStatuses.filter((s) => s === "failed").length,
    preparedCount,
    phase: isExtracting ? "text" : "boxes",
  };
}

/** The one line the review sidebar shows about overall progress. */
export function reviewProgressSummary(
  progress: ReviewProgress,
  total: number,
  lang: "zh" | "en",
): string {
  const { isExtracting, allLayersPrepared, doneCount, failedCount, preparedCount } = progress;

  if (isExtracting) {
    return lang === "zh"
      ? `文本提取中 ${doneCount}/${total} 页`
      : `${doneCount}/${total} slides text extracted`;
  }

  if (allLayersPrepared) {
    const failed =
      failedCount > 0 ? (lang === "zh" ? `，失败 ${failedCount} 页` : `, ${failedCount} failed`) : "";
    return lang === "zh"
      ? `文本提取完成 ${doneCount}/${total} 页${failed}`
      : `${doneCount}/${total} slides text extracted${failed}`;
  }

  return lang === "zh"
    ? `文本框准备中 ${preparedCount}/${total} 页`
    : `${preparedCount}/${total} text-box layers prepared`;
}
