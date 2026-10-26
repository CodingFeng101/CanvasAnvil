import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeRebuildEvent,
  summariseRebuild,
  type RebuildLogEntry,
} from "../client/workspaces/ppt/canvas/lib/rebuild-log";

/**
 * The rebuild's log, in words.
 *
 * This is the only place a failure is visible. A page that could not be
 * rebuilt exports as the picture it already was, which looks exactly like the
 * button having done nothing -- so every failure has to produce a line, and
 * the summary has to surface it without being expanded.
 */

const entryOf = (level: RebuildLogEntry["level"], text = "x"): RebuildLogEntry => ({
  id: `${level}-${text}`,
  level,
  text,
});

test("every failure produces an error line, in the reader's language", () => {
  const zh = describeRebuildEvent({ kind: "slideFailed", slideId: "s1", reason: "boom", retried: false }, "zh");
  assert.equal(zh?.level, "error");
  assert.ok(zh!.text.includes("s1"));
  assert.ok(zh!.text.includes("boom"));
  assert.ok(zh!.text.includes("按图片导出"), "it has to say what happened to the page");

  const en = describeRebuildEvent({ kind: "slideFailed", slideId: "s1", reason: "boom", retried: false }, "en");
  assert.ok(en!.text.includes("exported as an image"));
});

test("the reason the pipeline reports as a code is spelled out", () => {
  // The pipeline says "no-background" because it does not know the reader's
  // language. Showing that verbatim would be useless.
  const zh = describeRebuildEvent(
    { kind: "slideFailed", slideId: "s2", reason: "no-background", retried: false },
    "zh",
  );
  assert.ok(zh!.text.includes("没有干净底图"));
  assert.ok(!zh!.text.includes("no-background"));

  const en = describeRebuildEvent(
    { kind: "slideFailed", slideId: "s2", reason: "no-background", retried: false },
    "en",
  );
  assert.ok(en!.text.includes("no clean background"));
});

test("a background that could not be drawn is an error, not a note", () => {
  // Every page in that group is about to fail, so this is the first place the
  // run goes wrong and has to read that way.
  const event = describeRebuildEvent(
    { kind: "backgroundFailed", groupId: "base_1", reason: "429", retried: true },
    "zh",
  );
  assert.equal(event?.level, "error");
  assert.ok(event!.text.includes("base_1") && event!.text.includes("429"));
  assert.ok(event!.text.includes("重试后仍"), "it has to say the retry already happened");
});

test("a retry is announced as a warning, with its reason and its wait", () => {
  // A retry is not a failure yet -- the page may still come back -- so it
  // must not count towards the summary's failures.
  const slide = describeRebuildEvent(
    { kind: "slideRetrying", slideId: "s3", reason: "Session already started", delayMs: 3000 },
    "zh",
  );
  assert.equal(slide?.level, "warn");
  assert.ok(slide!.text.includes("Session already started"));
  assert.ok(slide!.text.includes("3 秒后重试一次"));

  const background = describeRebuildEvent(
    { kind: "backgroundRetrying", groupId: "base_1", reason: "HTTP 429", delayMs: 3000 },
    "zh",
  );
  assert.equal(background?.level, "warn");
  assert.ok(background!.text.includes("重试一次"));
});

test("a failure after a retry says so, and one that was never retried does not", () => {
  const retried = describeRebuildEvent({ kind: "slideFailed", slideId: "s1", reason: "boom", retried: true }, "zh");
  const direct = describeRebuildEvent({ kind: "slideFailed", slideId: "s1", reason: "boom", retried: false }, "zh");
  assert.ok(retried!.text.includes("重试后仍失败"));
  assert.ok(!direct!.text.includes("重试"));
});

test("a page that read no text is flagged rather than passed over", () => {
  // Zero text blocks on a slide almost always means the reader never ran.
  assert.equal(describeRebuildEvent({ kind: "textRead", slideId: "s1", blocks: 0 }, "zh")?.level, "warn");
  assert.equal(describeRebuildEvent({ kind: "textRead", slideId: "s1", blocks: 12 }, "zh")?.level, "info");
});

test("counts that carry no information produce no line", () => {
  // A log nobody reads is as useless as no log, so a page with no icons and
  // no gaps says nothing about either.
  assert.equal(
    describeRebuildEvent({ kind: "iconsLifted", slideId: "s1", count: 0, keyedLocally: 0, sheets: 0 }, "zh"),
    null,
  );
  assert.equal(describeRebuildEvent({ kind: "gapsChecked", slideId: "s1", added: 0 }, "zh"), null);
});

test("locally keyed icons are reported, because they are the money saved", () => {
  const event = describeRebuildEvent(
    { kind: "iconsLifted", slideId: "s1", count: 6, keyedLocally: 4, sheets: 1 },
    "zh",
  );
  assert.ok(event!.text.includes("6"));
  assert.ok(event!.text.includes("本地抠色"));
});

test("progress lines carry the page and the position in the deck", () => {
  const event = describeRebuildEvent({ kind: "slideStarted", slideId: "s3", index: 3, total: 10 }, "zh");
  assert.ok(event!.text.includes("3/10"));
  assert.ok(event!.text.includes("s3"));
});

test("a note from the pipeline is a warning attached to its page", () => {
  const event = describeRebuildEvent({ kind: "note", slideId: "s1", text: "轮廓描不出来" }, "zh");
  assert.equal(event?.level, "warn");
  assert.ok(event!.text.startsWith("s1："));
});

test("the collapsed summary leads with whatever went wrong", () => {
  assert.equal(summariseRebuild([entryOf("info"), entryOf("info")], "zh").level, "info");

  const warned = summariseRebuild([entryOf("info"), entryOf("warn")], "zh");
  assert.equal(warned.level, "warn");
  assert.ok(warned.text.includes("1"));

  // An error outranks any number of warnings: it is the one that changed the
  // deck that came out.
  const failed = summariseRebuild([entryOf("warn"), entryOf("warn"), entryOf("error")], "zh");
  assert.equal(failed.level, "error");
  assert.ok(failed.text.includes("失败"));
});

test("an empty run summarises as done rather than as nothing", () => {
  assert.equal(summariseRebuild([], "zh").level, "info");
  assert.equal(summariseRebuild([], "en").text, "All done");
});
