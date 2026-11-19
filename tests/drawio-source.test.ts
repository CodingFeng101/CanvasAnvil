import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DRAWIO_URL,
  MIRROR_DRAWIO_URL,
  drawioSettleDelay,
  drawioSources,
  nextDrawioSource,
} from "../client/workspaces/diagram/lib/drawio-source";

test("without a configured address the public embed is tried first, then the mirror", () => {
  assert.deepEqual(drawioSources(""), [DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]);
  assert.deepEqual(drawioSources("   "), [DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]);
  assert.deepEqual(drawioSources(undefined), [DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]);
});

test("a configured address is used alone", () => {
  assert.deepEqual(drawioSources(" http://drawio.lan:8080 "), ["http://drawio.lan:8080"]);
});

test("a timeout moves to the next address, and fails after the last", () => {
  const sources = drawioSources("");
  assert.deepEqual(nextDrawioSource(sources, 0), { kind: "next", index: 1 });
  assert.deepEqual(nextDrawioSource(sources, 1), { kind: "failed" });
  assert.deepEqual(nextDrawioSource(["own"], 0), { kind: "failed" });
});

test("only the mirror waits before a diagram is loaded into it", () => {
  assert.equal(drawioSettleDelay(DEFAULT_DRAWIO_URL), 0);
  assert.ok(drawioSettleDelay(MIRROR_DRAWIO_URL) > 0);
  assert.equal(drawioSettleDelay("http://drawio.lan:8080"), 0);
});
