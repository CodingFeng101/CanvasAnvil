import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeGroups, onePerSlide } from "../client/workspaces/ppt/vision/base-groups";
import { filterGaps } from "../client/workspaces/ppt/vision/gap-check";
import type { ReportedElement } from "../client/workspaces/ppt/vision/identify";

/**
 * The two stages whose answers have to be repaired before they are used.
 *
 * Both fail in the same expensive direction. A page missing from the grouping
 * never gets a background and exports as the flat image it was; a gap
 * accepted twice paints a card on top of itself. So the grouping is patched
 * to cover everything and the gaps are filtered down to what is genuinely
 * absent.
 */

const groupOf = (id: string, slideIds: string[], representative?: string) => ({
  id,
  slideIds,
  ...(representative ? { representativeSlideId: representative } : {}),
});

test("a page left out of the grouping still gets a background of its own", () => {
  const groups = normalizeGroups([groupOf("g1", ["s1", "s2"])], ["s1", "s2", "s3"]);
  assert.equal(groups.length, 2);

  const covered = groups.flatMap((group) => group.slideIds).sort();
  assert.deepEqual(covered, ["s1", "s2", "s3"]);
  assert.ok(groups[1].reason.includes("not covered"));
});

test("a page claimed by two groups belongs to the first", () => {
  // Two backgrounds for one page is not a thing that can be rendered.
  const groups = normalizeGroups(
    [groupOf("g1", ["s1", "s2"]), groupOf("g2", ["s2", "s3"])],
    ["s1", "s2", "s3"],
  );
  assert.deepEqual(groups.map((group) => group.slideIds), [["s1", "s2"], ["s3"]]);
});

test("a representative that is not a member is replaced by one that is", () => {
  // The representative is the page that actually gets edited, so it has to be
  // a page in the group.
  const [group] = normalizeGroups([groupOf("g1", ["s1", "s2"], "s9")], ["s1", "s2"]);
  assert.equal(group.representativeSlideId, "s1");

  const [honoured] = normalizeGroups([groupOf("g1", ["s1", "s2"], "s2")], ["s1", "s2"]);
  assert.equal(honoured.representativeSlideId, "s2");
});

test("unknown page ids in the answer are ignored", () => {
  const groups = normalizeGroups([groupOf("g1", ["s1", "ghost"])], ["s1"]);
  assert.deepEqual(groups.map((group) => group.slideIds), [["s1"]]);
});

test("a malformed answer degrades to one background per page", () => {
  assert.deepEqual(
    normalizeGroups(null, ["s1", "s2"]).map((group) => group.slideIds),
    [["s1"], ["s2"]],
  );
  assert.deepEqual(
    normalizeGroups(["not an object", {}], ["s1"]).map((group) => group.slideIds),
    [["s1"]],
  );
  assert.equal(onePerSlide(["s1", "s2"]).length, 2);
});

const gapOf = (desc: string, box: { x: number; y: number; w: number; h: number }): ReportedElement => ({
  kind: "native",
  shape: "rect",
  desc,
  box,
  iconKey: "",
});

test("a gap that is already on the page is not added a second time", () => {
  // The model sees a card that came out a shade pale and calls it missing.
  // Drawing it again stacks two cards and darkens the edge.
  const existing = [{ x: 0.1, y: 0.1, w: 0.3, h: 0.3 }];
  const notes: string[] = [];

  const kept = filterGaps(
    [
      gapOf("the pale card", { x: 0.11, y: 0.11, w: 0.29, h: 0.29 }),
      gapOf("a genuinely missing divider", { x: 0.6, y: 0.7, w: 0.3, h: 0.005 }),
    ],
    existing,
    notes,
  );

  assert.equal(kept.length, 1);
  assert.equal(kept[0].desc, "a genuinely missing divider");
  assert.ok(notes.some((note) => note.includes("already on the page")));
});

test("a page's worth of gaps is capped at the largest handful", () => {
  // More than a handful means the model started listing differences rather
  // than absences, and every extra entry is a drawing invented onto a page
  // that was already right.
  const many = Array.from({ length: 20 }, (_, i) =>
    gapOf(`gap ${i}`, { x: 0.01 * i, y: 0.5, w: 0.01 * (i + 1), h: 0.02 }),
  );
  const notes: string[] = [];

  const kept = filterGaps(many, [], notes);
  assert.equal(kept.length, 12);
  // Largest first, so what survives the cap is what matters most.
  assert.equal(kept[0].desc, "gap 19");
  assert.ok(notes.some((note) => note.includes("20 gaps reported")));
});

test("nothing reported is nothing added", () => {
  assert.deepEqual(filterGaps([], [{ x: 0, y: 0, w: 1, h: 1 }]), []);
});
