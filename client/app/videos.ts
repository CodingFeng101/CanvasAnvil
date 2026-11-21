import type { WorkspaceId } from "@/app/workspaces";

/**
 * Every video Settings → Videos lists, by kind. A video is either on Bilibili
 * (embedded by its id) or a file the site serves itself.
 */

export type VideoKind = "promo" | "tutorial" | "release" | "practice";

export type VideoSource = { type: "bilibili"; bvid: string } | { type: "file"; src: string };

export type Video = {
  id: string;
  kind: VideoKind;
  source: VideoSource;
  /** Kept in public/ (Bilibili's CDN refuses foreign referrers). */
  cover: string;
  /** Length in seconds; omitted when unknown. */
  duration?: number;
  workspace?: WorkspaceId;
  zhTitle: string;
  enTitle: string;
};

export const VIDEO_KINDS: { kind: VideoKind; zh: string; en: string; zhDesc: string; enDesc: string }[] = [
  { kind: "promo", zh: "宣传片", en: "Overview", zhDesc: "一两分钟看懂 CanvasAnvil 能做什么。", enDesc: "What CanvasAnvil does, in a minute or two." },
  { kind: "tutorial", zh: "上手教程", en: "Tutorials", zhDesc: "每个画布一段完整演示，从一句话到改图、导出。", enDesc: "One full walkthrough per canvas, from the first sentence to edits and export." },
  { kind: "release", zh: "版本更新", en: "What's new", zhDesc: "每次大版本更新的新功能演示。", enDesc: "New features from each major release." },
  { kind: "practice", zh: "最佳实践", en: "Best practices", zhDesc: "真实场景里怎么用得更顺手。", enDesc: "Getting the most out of it on real work." },
];

export const videos: Video[] = [
  {
    id: "tutorial-diagram",
    kind: "tutorial",
    source: { type: "bilibili", bvid: "BV1wyxs66EEd" },
    cover: "/tutorials/diagram.jpg",
    duration: 314,
    workspace: "diagram",
    zhTitle: "一句话画出整张架构图，改图只动你说的地方",
    enTitle: "A whole architecture diagram from one sentence, and edits that touch only what you name",
  },
  {
    id: "tutorial-cad",
    kind: "tutorial",
    source: { type: "bilibili", bvid: "BV1ryxs6zEtN" },
    cover: "/tutorials/cad.jpg",
    duration: 363,
    workspace: "cad",
    zhTitle: "一句需求出整套装修图纸，还能 3D 漫游",
    enTitle: "A full set of renovation drawings from one request, plus a 3D walkthrough",
  },
  {
    id: "tutorial-ppt",
    kind: "tutorial",
    source: { type: "bilibili", bvid: "BV1oGxs6hEf6" },
    cover: "/tutorials/ppt.jpg",
    duration: 303,
    workspace: "ppt",
    zhTitle: "一句话生成 8 页 PPT，200 多套模板随便挑",
    enTitle: "An 8-slide deck from one sentence, with 200+ templates to choose from",
  },
  {
    id: "tutorial-canvas",
    kind: "tutorial",
    source: { type: "bilibili", bvid: "BV17Gxs6aETm" },
    cover: "/tutorials/canvas.jpg",
    duration: 203,
    workspace: "canvas",
    zhTitle: "圈哪里改哪里，AI 改图不动其他地方",
    enTitle: "Circle a spot and only that changes; the rest of the image stays put",
  },
  {
    id: "release-2026-11",
    kind: "release",
    source: { type: "file", src: "/examples/portal/intro.mp4" },
    cover: "/examples/portal/intro-poster.webp",
    zhTitle: "11 月更新：AI 做出来的，现在都能接着改",
    enTitle: "November update: whatever AI makes, you can now keep editing",
  },
];

export const bilibiliVideoUrl = (bvid: string) => `https://www.bilibili.com/video/${bvid}`;

/** Only loaded once a video is opened, so it can start playing straight away. */
export const bilibiliPlayerUrl = (bvid: string) => `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1&high_quality=1`;
