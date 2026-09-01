import assert from "node:assert/strict";
import { test } from "node:test";
import { referenceImageUrls, routeNamesFor } from "../server/ai/image";
import type { ImageRequest } from "../contracts/ai";

/**
 * Which pictures reach the image model, and by which route.
 *
 * This is where a slide's material images used to vanish. The prompt names
 * every reference image and tells the model where to place it, so an image
 * that is described but never sent does not leave a gap -- the model invents
 * something to match the label, which reads as a wrong picture rather than a
 * missing one. That is why it went unnoticed, and why it is pinned here.
 */

const req = (over: Partial<ImageRequest> = {}): ImageRequest =>
  ({ prompt: "p", channel: { model: "gpt-image-1", apiKey: "k", baseUrl: "b" }, ...over }) as ImageRequest;

test("the template comes first, then the materials", () => {
  const urls = referenceImageUrls(
    req({ referenceImageUrl: "template.png", additionalReferenceImageUrls: ["mat-1.png", "mat-2.png"] }),
  );
  assert.deepEqual(urls, ["template.png", "mat-1.png", "mat-2.png"]);
});

test("materials are carried even with no template", () => {
  assert.deepEqual(referenceImageUrls(req({ additionalReferenceImageUrls: ["mat-1.png"] })), ["mat-1.png"]);
});

test("a request with no pictures carries none", () => {
  assert.deepEqual(referenceImageUrls(req()), []);
  assert.deepEqual(referenceImageUrls(req({ additionalReferenceImageUrls: [] })), []);
});

test("blank entries are dropped rather than sent as empty files", () => {
  assert.deepEqual(referenceImageUrls(req({ additionalReferenceImageUrls: ["", "mat-1.png"] })), ["mat-1.png"]);
});

test("materials without a template still take an image-carrying route", () => {
  // The regression: this used to pick the generations route, which sends the
  // prompt alone, so the user's picture never left the browser's request.
  assert.deepEqual(routeNamesFor(req({ additionalReferenceImageUrls: ["mat-1.png"] })), ["edit", "chat"]);
});

test("a template takes an image-carrying route", () => {
  assert.deepEqual(routeNamesFor(req({ referenceImageUrl: "template.png" })), ["edit", "chat"]);
});

test("only a prompt takes the generations route", () => {
  assert.deepEqual(routeNamesFor(req()), ["generation", "chat"]);
});

test("chat is always the fallback, because it can carry every picture", () => {
  for (const r of [req(), req({ referenceImageUrl: "t.png" }), req({ additionalReferenceImageUrls: ["m.png"] })]) {
    assert.equal(routeNamesFor(r).at(-1), "chat");
  }
});
