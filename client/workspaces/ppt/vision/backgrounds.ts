/**
 * Turning a finished page back into the bare page it was drawn on.
 *
 * This is the one step that everything else depends on. Real text boxes,
 * editable shapes and cut-out icons all need somewhere to sit, and that
 * somewhere has to have none of them already in it -- otherwise every card is
 * painted twice, once into the "background" and once on top of it.
 *
 * Which is also why a failure here is not papered over with the original
 * page. A page whose background could not be produced is reported as failed
 * and exported as the flat image it already was.
 */

import backgroundPrompt from "@prompts/ppt/background.md?raw";
import cleanSheetPrompt from "@prompts/ppt/clean-sheet.md?raw";
import { generateImage } from "@/ai/client";

/**
 * A clean background for one page.
 *
 * The representative page of a group is the one edited, and the result is
 * shared by every page in it.
 */
export async function generateCleanBackground(slideImageUrl: string): Promise<string> {
  const url = await generateImage({ prompt: backgroundPrompt, referenceImageUrl: slideImageUrl });
  if (!url) throw new Error("Background generation returned no image.");
  return url;
}

export interface SheetItem {
  desc: string;
}

/**
 * One sheet of icons, cleaned.
 *
 * The descriptions are passed through so the model can recognise what it is
 * retouching. They are explicitly not a licence to redraw: the prompt says
 * the pixels are the truth and the words are only there to stop one shape
 * being mistaken for another.
 */
export async function cleanIconSheet(
  montageUrl: string,
  items: SheetItem[],
  keyColour: string,
): Promise<string> {
  const listing = items
    .map((item, index) => `${index + 1}. ${item.desc || "an icon"}`)
    .join("\n");

  const prompt = cleanSheetPrompt
    .replace(/\{\{COUNT\}\}/g, String(items.length))
    .replace(/\{\{KEY_COLOR\}\}/g, keyColour)
    .replace(/\{\{ITEMS\}\}/g, listing || "1. an icon");

  const url = await generateImage({ prompt, referenceImageUrl: montageUrl });
  if (!url) throw new Error("Sheet cleaning returned no image.");
  return url;
}
