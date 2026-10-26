/**
 * One look at the rebuild, to catch what the first pass did not see.
 *
 * The first pass is asked what is on a page, in the abstract. This one is
 * asked a far easier question: here is the page, here is what we built from
 * it, what is missing? A gap is visible in a way that an omission from a list
 * never is, and the model does not have to hold the whole page in its head to
 * answer.
 *
 * Deliberately narrow. It reports absences and nothing else -- not colours,
 * not positions, not sizes, and never text -- because the cost of a false
 * alarm here is a drawing invented and pasted onto a page that was already
 * right.
 *
 * Runs once per page. A second look at a page that has just been patched
 * invites the model to keep finding things.
 */

import gapCheckPrompt from "@prompts/ppt/gap-check.md?raw";
import { generateVisionChatMessage } from "@/ai/client";
import { parseJsonLoose } from "@/workspaces/ppt/canvas/lib/parse-json";
import { iou, readElements, type Box, type ReportedElement } from "@/workspaces/ppt/vision/identify";

/**
 * Overlapping something already on the page by this much means it *is* that
 * thing, reported as missing because it came out pale or the wrong colour.
 * Those are not gaps.
 */
const ALREADY_THERE = 0.45;

/**
 * A page has a handful of gaps, not a page's worth. More than this and the
 * model has started listing differences instead of absences.
 */
const MAX_GAPS = 12;

/**
 * The reported gaps that are genuinely absent from the rebuild.
 *
 * The model sees a card that came out a shade too pale and calls it missing;
 * drawing it a second time stacks two cards and darkens the edge, which is a
 * worse outcome than the pale card it was trying to fix.
 */
export function filterGaps(
  reported: ReportedElement[],
  existing: Box[],
  notes: string[] = [],
): ReportedElement[] {
  const missing = reported.filter((entry) => {
    const twin = existing.find((box) => iou(entry.box, box) >= ALREADY_THERE);
    if (!twin) return true;
    notes.push(`"${entry.desc.slice(0, 24) || entry.shape}" is already on the page; not adding it again`);
    return false;
  });

  if (missing.length <= MAX_GAPS) return missing;

  notes.push(`${missing.length} gaps reported; taking the largest ${MAX_GAPS}`);
  return [...missing]
    .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)
    .slice(0, MAX_GAPS);
}

/**
 * Compare the rebuild with the original and report whatever is missing.
 *
 * The caller measures the results, exactly as it measures the first pass:
 * this stage only decides what to look at.
 */
export async function checkGaps(
  slideId: string,
  originalImageUrl: string,
  rebuiltImageUrl: string,
  existing: Box[],
  notes: string[] = [],
): Promise<ReportedElement[]> {
  try {
    const response = await generateVisionChatMessage(
      gapCheckPrompt,
      `Image 1 is page ${slideId}. Image 2 is what was rebuilt from it. ` +
        "List only what is in image 1 and missing from image 2.",
      [originalImageUrl, rebuiltImageUrl],
    );
    return filterGaps(readElements(parseJsonLoose(response), `${slideId}gap`, notes), existing, notes);
  } catch (error) {
    // A page that was already right stays right. Failing here costs the
    // patch, not the page.
    console.error(`Gap check failed for ${slideId}`, error);
    notes.push("the gap check did not run");
    return [];
  }
}
