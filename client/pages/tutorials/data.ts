import type { WorkspaceId } from "@/app/workspaces";

export type Tutorial = {
  workspace: WorkspaceId;
  /** Bilibili video id; the page embeds the player and links out by it. */
  bvid: string;
  /** The video's Bilibili cover, kept in public/ (Bilibili's CDN refuses foreign referrers). */
  cover: string;
  /** Length in seconds. */
  duration: number;
  zhTitle: string;
  enTitle: string;
};

export const tutorials: Tutorial[] = [
  {
    workspace: "diagram",
    bvid: "BV1wyxs66EEd",
    cover: "/tutorials/diagram.jpg",
    duration: 314,
    zhTitle: "一句话画出整张架构图，改图只动你说的地方",
    enTitle: "A whole architecture diagram from one sentence, and edits that touch only what you name",
  },
  {
    workspace: "cad",
    bvid: "BV1ryxs6zEtN",
    cover: "/tutorials/cad.jpg",
    duration: 363,
    zhTitle: "一句需求出整套装修图纸，还能 3D 漫游",
    enTitle: "A full set of renovation drawings from one request, plus a 3D walkthrough",
  },
  {
    workspace: "ppt",
    bvid: "BV1oGxs6hEf6",
    cover: "/tutorials/ppt.jpg",
    duration: 303,
    zhTitle: "一句话生成 8 页 PPT，200 多套模板随便挑",
    enTitle: "An 8-slide deck from one sentence, with 200+ templates to choose from",
  },
  {
    workspace: "canvas",
    bvid: "BV17Gxs6aETm",
    cover: "/tutorials/canvas.jpg",
    duration: 203,
    zhTitle: "圈哪里改哪里，AI 改图不动其他地方",
    enTitle: "Circle a spot and only that changes; the rest of the image stays put",
  },
];

export const bilibiliVideoUrl = (bvid: string) => `https://www.bilibili.com/video/${bvid}`;

/** Only loaded once the cover is clicked, so it can start playing straight away. */
export const bilibiliPlayerUrl = (bvid: string) =>
  `https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=1&high_quality=1`;
