import assert from "node:assert/strict";
import { test } from "node:test";
import { appendInbox, inboxForSlides, type SlideInboxEntry } from "../client/shared/references/inbox";
import { getImageLineage } from "../client/workspaces/canvas/canvas/lineage";

const entry = (slideId: string, createdAt: number): SlideInboxEntry => ({ slideId, dataUrl: `data:image/png;base64,${slideId}`, from: "白板", createdAt });

test("sent-back pictures pile up in the inbox, none replaced", () => {
  const once = appendInbox(null, entry("s1", 1));
  const twice = appendInbox(once, entry("s1", 2));
  assert.equal(twice.length, 2);
  assert.deepEqual(appendInbox("junk" as never, entry("s2", 3)).map((e) => e.slideId), ["s2"]);
});

test("the deck takes pictures for its slides, oldest first, and counts those for deleted slides", () => {
  const { apply, dropped } = inboxForSlides([entry("s2", 5), entry("gone", 1), entry("s1", 3), { bad: true } as never], ["s1", "s2"]);
  assert.deepEqual(apply.map((e) => e.slideId), ["s1", "s2"]);
  assert.equal(dropped, 1);
  assert.deepEqual(inboxForSlides(null, ["s1"]), { apply: [], dropped: 0 });
});

test("a picture brought from a slide remembers where it goes back", () => {
  const returnTo = { workId: "w1", slideId: "s1", slideLabel: "第 1 页", deckName: "汇报" };
  const element = { customData: { canvasAnvil: { lineageId: "L", createdAt: 1, returnTo } } } as never;
  assert.deepEqual(getImageLineage(element)?.returnTo, returnTo);
  const plain = { customData: { canvasAnvil: { lineageId: "L", createdAt: 1, returnTo: { workId: 3 } } } } as never;
  assert.equal(getImageLineage(plain)?.returnTo, undefined);
});
