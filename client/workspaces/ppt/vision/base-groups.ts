/**
 * Deciding which pages share a background.
 *
 * This is where the run's cost is set. A twenty page deck that groups into
 * three backgrounds pays for three image edits instead of twenty, and the
 * pages within a group end up identical behind their content, which reads
 * better than twenty separately cleaned pages ever would.
 */

import groupBasesPrompt from "@prompts/ppt/group-bases.md?raw";
import { generateVisionChatMessage } from "@/ai/client";
import { parseJsonLoose } from "@/workspaces/ppt/canvas/lib/parse-json";

export interface BaseGroup {
  id: string;
  slideIds: string[];
  /**
   * The page whose background is least obstructed, because that is the page
   * that actually gets edited into the shared background.
   */
  representativeSlideId: string;
  reason: string;
}

/** Correct, just expensive. Used when grouping fails outright. */
export function onePerSlide(slideIds: string[]): BaseGroup[] {
  return slideIds.map((slideId) => ({
    id: `base_${slideId}`,
    slideIds: [slideId],
    representativeSlideId: slideId,
    reason: "fallback: ungrouped",
  }));
}

/**
 * Repair the answer: every page in exactly one group, every group with a
 * representative that is actually a member.
 *
 * A page silently missing from the grouping would never get a background and
 * would export as its original image, so anything left over is given a group
 * of its own rather than dropped.
 */
export function normalizeGroups(raw: unknown, slideIds: string[]): BaseGroup[] {
  const known = new Set(slideIds);
  const claimed = new Set<string>();
  const groups: BaseGroup[] = [];

  const items = Array.isArray(raw) ? raw : [];
  items.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const entry = item as Record<string, unknown>;

    const proposedIds = entry.slideIds ?? entry.slide_ids;
    const members = (Array.isArray(proposedIds) ? proposedIds : [])
      .map((id) => String(id))
      // A page claimed twice belongs to whichever group claimed it first;
      // being in two groups would mean two backgrounds for one page.
      .filter((id) => known.has(id) && !claimed.has(id));
    if (members.length === 0) return;

    members.forEach((id) => claimed.add(id));
    const proposed = String(entry.representativeSlideId ?? entry.representative_slide_id ?? "");

    groups.push({
      id: String(entry.id || `base_${index + 1}`),
      slideIds: members,
      representativeSlideId: members.includes(proposed) ? proposed : members[0],
      reason: String(entry.reason || ""),
    });
  });

  for (const slideId of slideIds) {
    if (claimed.has(slideId)) continue;
    groups.push({
      id: `base_${slideId}`,
      slideIds: [slideId],
      representativeSlideId: slideId,
      reason: "not covered by the proposed grouping",
    });
  }

  return groups;
}

/**
 * Ask which pages can share a background.
 *
 * A failure here costs money rather than correctness: every page gets its own
 * background, which is what would have happened without this stage at all.
 */
export async function groupBases(
  slides: Array<{ id: string; imageUrl: string }>,
): Promise<BaseGroup[]> {
  if (slides.length === 0) return [];
  if (slides.length === 1) {
    return [{
      id: "base_1",
      slideIds: [slides[0].id],
      representativeSlideId: slides[0].id,
      reason: "single page",
    }];
  }

  const roster = slides.map((slide, index) => `page ${index + 1}: id=${slide.id}`).join("\n");
  try {
    const response = await generateVisionChatMessage(
      groupBasesPrompt,
      `The images are the deck pages in order.\n\n${roster}\n\nReturn the grouping JSON.`,
      slides.map((slide) => slide.imageUrl),
    );
    const answer = parseJsonLoose(response) as { groups?: unknown } | null;
    return normalizeGroups(answer?.groups, slides.map((slide) => slide.id));
  } catch (error) {
    console.error("Background grouping failed; giving every page its own.", error);
    return onePerSlide(slides.map((slide) => slide.id));
  }
}
