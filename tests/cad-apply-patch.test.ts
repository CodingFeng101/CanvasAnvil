import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCadPatchFromReply,
  type CodeActionResult,
} from "../client/workspaces/cad/lib/apply-cad-patch";

/**
 * Applying whatever a CAD agent's reply is carrying.
 *
 * The agent is asked for a cad_patch payload and does not reliably send one,
 * so this walks a ladder of shapes. What matters is that a drawing is never
 * applied twice, that a reply carrying nothing usable changes nothing, and
 * that non-patch payloads in the same reply still reach the canvas.
 */

const SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

/** Records every payload handed to the canvas and answers as told. */
function fakeCanvas(answer: (payload: string) => CodeActionResult = () => ({ ok: true })) {
  const calls: string[] = [];
  const run = async (payload: string) => {
    calls.push(payload);
    return answer(payload);
  };
  return { calls, run: run as (p: string, w: "cad") => Promise<CodeActionResult> };
}

const patch = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "cad_patch", target: "2d_svg", mode: "patch", edits: [], ...over });

test("a fenced patch is applied and reported", async () => {
  const canvas = fakeCanvas(() => ({ ok: true, svg: SVG }));
  const out = await applyCadPatchFromReply("```json\n" + patch() + "\n```", canvas.run);

  assert.equal(out.patchFound, true);
  assert.equal(out.producedSvg, true);
  assert.equal(out.appliedSvg, SVG);
  assert.equal(out.retryError, null);
  assert.equal(canvas.calls.length, 1);
});

test("a reply that is bare JSON is applied too", async () => {
  const canvas = fakeCanvas(() => ({ ok: true, svg: SVG }));
  const out = await applyCadPatchFromReply(patch(), canvas.run);
  assert.equal(out.patchFound, true);
  assert.equal(out.appliedSvg, SVG);
});

test("a patch buried in prose is still found", async () => {
  const canvas = fakeCanvas(() => ({ ok: true, svg: SVG }));
  const out = await applyCadPatchFromReply(`Sure. ${patch()} Done.`, canvas.run);
  assert.equal(out.patchFound, true);
  assert.equal(canvas.calls.length, 1);
});

test("a payload that is not a patch still reaches the canvas", async () => {
  // The canvas dispatches on payload type, so a plan sent in the same reply
  // has to be applied by the same call.
  const canvas = fakeCanvas();
  const plan = JSON.stringify({ type: "cad_plan", plan: { rooms: [] } });
  const out = await applyCadPatchFromReply("```json\n" + plan + "\n```", canvas.run);

  assert.equal(canvas.calls.length, 1, "the plan was handed over");
  assert.equal(out.patchFound, false, "but it is not a drawing");
  assert.equal(out.producedSvg, false);
});

test("a plan and a patch in one reply are both applied", async () => {
  const canvas = fakeCanvas(() => ({ ok: true, svg: SVG }));
  const plan = JSON.stringify({ type: "cad_plan", plan: {} });
  const reply = ["```json", plan, "```", "```json", patch(), "```"].join("\n");
  const out = await applyCadPatchFromReply(reply, canvas.run);

  assert.equal(canvas.calls.length, 2);
  assert.equal(out.patchFound, true);
  assert.equal(out.producedSvg, true);
});

test("bare SVG is applied when no patch was declared", async () => {
  const canvas = fakeCanvas(() => ({ ok: true }));
  const out = await applyCadPatchFromReply(`here it is:\n${SVG}`, canvas.run);

  assert.equal(out.patchFound, false);
  assert.equal(out.producedSvg, true);
  assert.equal(out.appliedSvg, SVG, "the canvas returned no svg, so the sent one stands");
  assert.equal(canvas.calls.length, 1);
});

test("a drawing sent both ways is applied once", async () => {
  const canvas = fakeCanvas(() => ({ ok: true, svg: SVG }));
  const reply = ["```json", patch({ mode: "replace", full: SVG }), "```", SVG].join("\n");
  const out = await applyCadPatchFromReply(reply, canvas.run);

  assert.equal(canvas.calls.length, 1, "the declared patch wins; the bare copy is not re-applied");
  assert.equal(out.patchFound, true);
});

test("a reply with nothing usable changes nothing", async () => {
  const canvas = fakeCanvas();
  const out = await applyCadPatchFromReply("I could not draw that, sorry.", canvas.run);

  assert.deepEqual(out, { patchFound: false, producedSvg: false, appliedSvg: "", retryError: null });
  assert.equal(canvas.calls.length, 0, "nothing was handed to the canvas");
});

test("an empty reply is a no-op", async () => {
  const canvas = fakeCanvas();
  assert.equal((await applyCadPatchFromReply("", canvas.run)).patchFound, false);
  assert.equal(canvas.calls.length, 0);
});

test("a retryable failure is reported for the model to redo", async () => {
  const canvas = fakeCanvas(() => ({ ok: false, retry: true, error: "Search pattern not found" }));
  const out = await applyCadPatchFromReply("```json\n" + patch() + "\n```", canvas.run);

  assert.equal(out.patchFound, true, "the patch was recognised");
  assert.equal(out.producedSvg, false, "but nothing was drawn");
  assert.equal(out.retryError, "Search pattern not found");
});

test("a failure the model cannot fix is not offered for retry", async () => {
  const canvas = fakeCanvas(() => ({ ok: false, retry: false, error: "SVG has no drawable content" }));
  const out = await applyCadPatchFromReply("```json\n" + patch() + "\n```", canvas.run);

  assert.equal(out.patchFound, true);
  assert.equal(out.retryError, null, "retry is the canvas's call, not ours");
});

test("a failed retry still names an error when the canvas gives none", async () => {
  const canvas = fakeCanvas(() => ({ ok: false, retry: true }));
  const out = await applyCadPatchFromReply("```json\n" + patch() + "\n```", canvas.run);
  assert.equal(out.retryError, "Unknown error");
});

test("the last of several patches is the one left on the canvas", async () => {
  const first = '<svg id="first"/>';
  const second = '<svg id="second"/>';
  const canvas = fakeCanvas((payload) => ({ ok: true, svg: payload.includes("one") ? first : second }));
  const reply = [
    "```json",
    patch({ note: "one" }),
    "```",
    "```json",
    patch({ note: "two" }),
    "```",
  ].join("\n");

  const out = await applyCadPatchFromReply(reply, canvas.run);
  assert.equal(canvas.calls.length, 2);
  assert.equal(out.appliedSvg, second);
});
