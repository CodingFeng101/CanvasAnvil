import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPENAI_DEFAULT_BASE_URL,
  resolveImageRoute,
} from "../skill/cad-skill/scripts/lib/image-route.mjs";
import * as pptRoute from "../skill/ppt-skill/scripts/lib/image-route.mjs";

/**
 * How the skills reach an image model.
 *
 * Only OpenAI-compatible endpoints are supported, so nothing here reads a
 * vendor: the endpoint follows from the model's own name. The skills used to
 * carry a nine-vendor registry that decided this from configuration, and
 * eight of those entries had no base URL to reach in the first place.
 */

test("gpt-image and dall-e go to the images endpoint", () => {
  for (const model of ["gpt-image-1", "gpt-image-2", "dall-e-3", "DALL-E-2"]) {
    assert.equal(resolveImageRoute({ model }).protocol, "openai-images", model);
  }
});

test("any other model returns its image through chat", () => {
  for (const model of ["gpt-5.5", "gpt-4o", "some-vision-model"]) {
    assert.equal(resolveImageRoute({ model }).protocol, "openai-chat-image", model);
  }
});

test("a missing model does not throw, it just takes the chat route", () => {
  // Config validation is the caller's job; routing must not be where it fails.
  assert.equal(resolveImageRoute({}).protocol, "openai-chat-image");
  assert.equal(resolveImageRoute({ model: "" }).protocol, "openai-chat-image");
  assert.equal(resolveImageRoute(undefined).protocol, "openai-chat-image");
});

test("the route is decided by the model alone, never by a vendor field", () => {
  // A leftover `provider` in someone's config file must change nothing.
  const withVendor = resolveImageRoute({ model: "gpt-image-1", provider: "aliyun" });
  assert.equal(withVendor.protocol, "openai-images");
  assert.deepEqual(Object.keys(withVendor), ["protocol"]);
});

test("the default base URL is OpenAI's", () => {
  assert.equal(OPENAI_DEFAULT_BASE_URL, "https://api.openai.com/v1");
});

test("both skills route identically", () => {
  // They are separate packages, so the rule exists twice and can drift.
  assert.equal(pptRoute.OPENAI_DEFAULT_BASE_URL, OPENAI_DEFAULT_BASE_URL);
  for (const model of ["gpt-image-1", "dall-e-3", "gpt-5.5", ""]) {
    assert.equal(
      pptRoute.resolveImageRoute({ model }).protocol,
      resolveImageRoute({ model }).protocol,
      model,
    );
  }
});
