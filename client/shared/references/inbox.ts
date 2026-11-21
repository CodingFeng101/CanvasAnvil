/**
 * Pictures sent back to a deck that is not open ("送回 PPT 第 N 页" on the free canvas). They wait
 * under the deck's own key until the deck opens, which adds each as a new version of its slide.
 */

export const PPT_INBOX_KEY = "inbox";

export interface SlideInboxEntry {
  slideId: string;
  dataUrl: string;
  /** What changed, for the version's label. */
  note?: string;
  /** Where it came from (the free-canvas work's name). */
  from: string;
  createdAt: number;
}

/** The inbox with one more picture; a newer picture for the same slide does not replace an older one. */
export function appendInbox(previous: SlideInboxEntry[] | null, entry: SlideInboxEntry): SlideInboxEntry[] {
  return [...(Array.isArray(previous) ? previous : []), entry];
}

/** The pictures for slides the deck still has, oldest first, and how many were for slides since deleted. */
export function inboxForSlides(entries: SlideInboxEntry[] | null, slideIds: string[]): { apply: SlideInboxEntry[]; dropped: number } {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e.slideId === "string" && typeof e.dataUrl === "string");
  const ids = new Set(slideIds);
  const apply = list.filter((e) => ids.has(e.slideId)).sort((a, b) => a.createdAt - b.createdAt);
  return { apply, dropped: list.length - apply.length };
}
