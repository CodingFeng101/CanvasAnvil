import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_DRAWIO_URL,
  MIRROR_DRAWIO_URL,
  drawioSettleDelay,
  drawioSources,
  findLocalDrawio,
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

test("a local copy goes first, but never in front of a configured address", () => {
  const local = "http://localhost:8001/drawio/index.html";
  assert.deepEqual(drawioSources("", local), [local, DEFAULT_DRAWIO_URL, MIRROR_DRAWIO_URL]);
  assert.deepEqual(drawioSources("http://drawio.lan:8080", local), ["http://drawio.lan:8080"]);
});

test("the local copy is found by its marker, not by the page answering", async () => {
  const answer = (status: number, body: string) => async () => new Response(body, { status });
  const base = "http://localhost:8001/";
  assert.equal(
    await findLocalDrawio(base, answer(200, '{"version":"32.6.9"}') as typeof fetch),
    "http://localhost:8001/drawio/index.html",
  );
  // The SPA fallback answers a missing file with the app's index.html.
  assert.equal(await findLocalDrawio(base, answer(200, "<!doctype html><html></html>") as typeof fetch), null);
  assert.equal(await findLocalDrawio(base, answer(404, "") as typeof fetch), null);
  assert.equal(
    await findLocalDrawio(base, (async () => { throw new Error("offline"); }) as typeof fetch),
    null,
  );
  assert.equal(
    await findLocalDrawio("http://host/app/", answer(200, '{"version":"1"}') as typeof fetch),
    "http://host/app/drawio/index.html",
  );
});
