import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getOriginalSlideVersion,
  getTextlessBackgroundVersion,
  getVisibleSlideVersions,
  resolveSlideVersion,
  type VersionState,
} from "../client/workspaces/ppt/canvas/lib/slide-versions";
import { SYNTHETIC_PRIMARY_VERSION_PREFIX } from "../client/workspaces/ppt/canvas/constants";
import type { SlideImageVersion } from "../client/workspaces/ppt/canvas/types";

/**
 * Which rendered image a slide shows. Resolving the wrong version shows the
 * user a slide they thought they had replaced, or -- worse -- the background
 * with all its text stripped out, which is a derived asset nobody asked to
 * look at.
 */

const LABEL = "Original version";

const version = (
  id: string,
  type: SlideImageVersion["type"] = "generated",
  extra: Partial<SlideImageVersion> = {},
): SlideImageVersion =>
  ({ id, url: `${id}.png`, timestamp: 1, type, ...extra }) as SlideImageVersion;

const state = (over: Partial<VersionState> = {}): VersionState => ({
  imageVersions: {},
  currentImageVersionId: {},
  generatedImages: {},
  ...over,
});

test("a slide with nothing at all resolves to nothing, not a crash", () => {
  const resolved = resolveSlideVersion("slide-1", state(), LABEL);
  assert.deepEqual(resolved, { versionId: "", version: undefined, imageUrl: "" });
});

test("the newest version wins when the user has not picked one", () => {
  const resolved = resolveSlideVersion(
    "slide-1",
    state({ imageVersions: { "slide-1": [version("v1"), version("v2"), version("v3")] } }),
    LABEL,
  );
  assert.equal(resolved.versionId, "v3");
  assert.equal(resolved.imageUrl, "v3.png");
});

test("the version the user picked wins over the newest", () => {
  const resolved = resolveSlideVersion(
    "slide-1",
    state({
      imageVersions: { "slide-1": [version("v1"), version("v2")] },
      currentImageVersionId: { "slide-1": "v1" },
    }),
    LABEL,
  );
  assert.equal(resolved.versionId, "v1");
});

test("a picked version that no longer exists falls back to the newest", () => {
  const resolved = resolveSlideVersion(
    "slide-1",
    state({
      imageVersions: { "slide-1": [version("v1")] },
      currentImageVersionId: { "slide-1": "deleted" },
    }),
    LABEL,
  );
  assert.equal(resolved.versionId, "v1", "not left pointing at a version that is gone");
});

test("a textless background is never the default", () => {
  // It is derived for the editable export; showing it would look like the
  // slide lost all its text.
  const resolved = resolveSlideVersion(
    "slide-1",
    state({
      imageVersions: {
        "slide-1": [version("v1"), version("v2"), version("bg", "derived_textless")],
      },
    }),
    LABEL,
  );
  assert.equal(resolved.versionId, "v2", "the newest real version, not the textless one");
});

test("a textless background is still shown when explicitly picked", () => {
  const resolved = resolveSlideVersion(
    "slide-1",
    state({
      imageVersions: { "slide-1": [version("v1"), version("bg", "derived_textless")] },
      currentImageVersionId: { "slide-1": "bg" },
    }),
    LABEL,
  );
  assert.equal(resolved.versionId, "bg");
});

test("a deck from before versioning gets a synthetic version for its image", () => {
  // Otherwise the version picker is empty and there is nothing to derive a
  // textless background from.
  const st = state({ generatedImages: { "slide-1": "legacy.png" } });
  const visible = getVisibleSlideVersions("slide-1", st, LABEL);
  assert.equal(visible.length, 1);
  assert.ok(visible[0].id.startsWith(SYNTHETIC_PRIMARY_VERSION_PREFIX));
  assert.equal(visible[0].url, "legacy.png");
  assert.equal(visible[0].instruction, LABEL, "labelled in the caller's language");

  const resolved = resolveSlideVersion("slide-1", st, LABEL);
  assert.equal(resolved.imageUrl, "legacy.png");
});

test("the synthetic version is not invented when a real one exists", () => {
  const visible = getVisibleSlideVersions(
    "slide-1",
    state({
      imageVersions: { "slide-1": [version("v1")] },
      generatedImages: { "slide-1": "legacy.png" },
    }),
    LABEL,
  );
  assert.deepEqual(
    visible.map((v) => v.id),
    ["v1"],
  );
});

test("a lone textless background still gets a synthetic primary alongside it", () => {
  // Only a textless version exists, so there is no real primary to show.
  const visible = getVisibleSlideVersions(
    "slide-1",
    state({
      imageVersions: { "slide-1": [version("bg", "derived_textless")] },
      generatedImages: { "slide-1": "legacy.png" },
    }),
    LABEL,
  );
  assert.equal(visible.length, 2);
  assert.ok(visible[0].id.startsWith(SYNTHETIC_PRIMARY_VERSION_PREFIX));
  assert.equal(visible[1].id, "bg");
});

test("the flat image map is the last resort for the url", () => {
  // A picked id that matches nothing leaves no version, but the legacy image
  // is still better than a blank slide.
  const resolved = resolveSlideVersion(
    "slide-1",
    state({
      imageVersions: { "slide-1": [] },
      currentImageVersionId: { "slide-1": "ghost" },
      generatedImages: { "slide-1": "legacy.png" },
    }),
    LABEL,
  );
  assert.equal(resolved.imageUrl, "legacy.png");
});

test("the original version is the one nothing was derived from", () => {
  const st = state({
    imageVersions: {
      "slide-1": [
        version("v1"),
        version("v2", "edited", { sourceVersionId: "v1" }),
        version("v3", "edited", { sourceVersionId: "v2" }),
      ],
    },
  });
  assert.equal(getOriginalSlideVersion("slide-1", st)?.id, "v1");
});

test("the original falls back to the first when every version has a source", () => {
  const st = state({
    imageVersions: {
      "slide-1": [
        version("v2", "edited", { sourceVersionId: "gone" }),
        version("v3", "edited", { sourceVersionId: "v2" }),
      ],
    },
  });
  assert.equal(getOriginalSlideVersion("slide-1", st)?.id, "v2");
  assert.equal(getOriginalSlideVersion("missing", st), undefined);
});

test("the textless background is found by type", () => {
  const st = state({
    imageVersions: { "slide-1": [version("v1"), version("bg", "derived_textless")] },
  });
  assert.equal(getTextlessBackgroundVersion("slide-1", st)?.id, "bg");
  assert.equal(getTextlessBackgroundVersion("slide-2", st), undefined);
});
