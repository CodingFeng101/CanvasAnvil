import { SYNTHETIC_PRIMARY_VERSION_PREFIX } from "@/workspaces/ppt/canvas/lib/constants";
import type { SlideImageVersion } from "@/workspaces/ppt/canvas/types";

/**
 * Which rendered image a slide is currently showing.
 *
 * A slide accumulates versions as the user regenerates and edits it, plus
 * derived textless backgrounds the editable-export path produces. Resolving
 * the wrong one shows the user a slide they thought they had replaced, or the
 * background with its text stripped out.
 */

export interface VersionState {
  /** Every version recorded for a slide, oldest first. */
  imageVersions: Record<string, SlideImageVersion[]>;
  /** The version the user picked, per slide, if any. */
  currentImageVersionId: Record<string, string>;
  /** The flat image map decks generated before versioning existed. */
  generatedImages: Record<string, string>;
}

export interface ResolvedVersion {
  versionId: string;
  version: SlideImageVersion | undefined;
  imageUrl: string;
}

/**
 * The versions worth offering for a slide.
 *
 * A deck generated before versioning, or one restored from an older
 * snapshot, has an image but no version recording it. A synthetic entry
 * stands in for it so the version picker is not empty and the textless
 * background has something to derive from.
 */
export function getVisibleSlideVersions(
  slideId: string,
  state: VersionState,
  originalVersionLabel: string,
): SlideImageVersion[] {
  const versions = state.imageVersions[slideId] || [];
  const hasPrimary = versions.some((version) => version.type !== "derived_textless");
  if (hasPrimary || !state.generatedImages[slideId]) return versions;

  return [
    {
      id: `${SYNTHETIC_PRIMARY_VERSION_PREFIX}${slideId}`,
      url: state.generatedImages[slideId],
      timestamp: Date.now(),
      type: "generated" as const,
      instruction: originalVersionLabel,
    },
    ...versions,
  ];
}

/**
 * Resolves the slide's current version, falling back in this order: the one
 * the user picked if it still exists, else the newest non-textless version,
 * else the newest of any kind. A textless background is never chosen as the
 * default -- it is a derived asset, not something the user asked to see.
 */
export function resolveSlideVersion(
  slideId: string,
  state: VersionState,
  originalVersionLabel: string,
): ResolvedVersion {
  const visible = getVisibleSlideVersions(slideId, state, originalVersionLabel);
  const versions = state.imageVersions[slideId] || [];
  const requestedVersionId = state.currentImageVersionId[slideId] || "";

  const preferredDefault =
    [...visible].reverse().find((item) => item.type !== "derived_textless") ||
    visible[visible.length - 1];

  const versionId =
    (requestedVersionId && visible.some((item) => item.id === requestedVersionId)
      ? requestedVersionId
      : preferredDefault?.id) ||
    requestedVersionId ||
    versions[versions.length - 1]?.id ||
    "";

  const version = versionId ? visible.find((item) => item.id === versionId) : undefined;
  return {
    versionId,
    version,
    imageUrl: version?.url || state.generatedImages[slideId] || "",
  };
}

/** The version a slide started from, before any edits derived from it. */
export function getOriginalSlideVersion(
  slideId: string,
  state: VersionState,
): SlideImageVersion | undefined {
  const versions = state.imageVersions[slideId] || [];
  return versions.find((version) => !version.sourceVersionId) || versions[0];
}

/** The text-stripped background the editable export derives, if one exists yet. */
export function getTextlessBackgroundVersion(
  slideId: string,
  state: VersionState,
): SlideImageVersion | undefined {
  return (state.imageVersions[slideId] || []).find((v) => v.type === "derived_textless");
}
