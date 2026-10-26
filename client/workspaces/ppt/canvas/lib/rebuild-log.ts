/**
 * The rebuild's progress, in words.
 *
 * The pipeline reports what happened as structured events and says nothing
 * about how to word it, so the wording -- and its language -- lives here,
 * beside the screen that shows it.
 *
 * Every failure gets a line. A rebuild that produced nothing looks exactly
 * like one that was never asked for, and the only difference visible to
 * anyone is what this log said while it ran.
 */

import type { RebuildEvent } from "@/workspaces/ppt/vision/pipeline";

export type LogLevel = "info" | "warn" | "error";

export interface RebuildLogEntry {
  id: string;
  level: LogLevel;
  text: string;
}

/** Reasons the pipeline reports as codes rather than sentences. */
const REASONS: Record<string, { zh: string; en: string }> = {
  "no-background": {
    zh: "没有干净底图",
    en: "no clean background",
  },
};

const describeReason = (reason: string, lang: "zh" | "en") => {
  const known = REASONS[reason];
  if (known) return lang === "zh" ? known.zh : known.en;
  return reason;
};

/**
 * One event as a line of log, or null when it is not worth a line.
 *
 * Ids are supplied by the caller rather than generated here, so a rerun does
 * not reuse them and React does not reconcile two different runs' lines.
 */
export function describeRebuildEvent(
  event: RebuildEvent,
  lang: "zh" | "en",
): { level: LogLevel; text: string } | null {
  const zh = lang === "zh";

  switch (event.kind) {
    case "grouping":
      return {
        level: "info",
        text: zh ? `开始：共 ${event.slides} 页，正在判断哪些页可以共用底图` : `Starting: ${event.slides} pages, grouping backgrounds`,
      };
    case "grouped":
      return {
        level: "info",
        text: zh ? `分成 ${event.groups} 组底图，即将生成` : `${event.groups} background group(s) to draw`,
      };
    case "backgroundDone":
      return {
        level: "info",
        text: zh ? `底图 ${event.groupId} 已生成，覆盖 ${event.slides} 页` : `Background ${event.groupId} drawn for ${event.slides} page(s)`,
      };
    case "backgroundRetrying":
      return {
        level: "warn",
        text: zh
          ? `底图 ${event.groupId} 生成失败（${event.reason}），${Math.round(event.delayMs / 1000)} 秒后重试一次`
          : `Background ${event.groupId} failed (${event.reason}); retrying once in ${Math.round(event.delayMs / 1000)}s`,
      };
    case "backgroundFailed":
      return {
        level: "error",
        text: zh
          ? `底图 ${event.groupId} ${event.retried ? "重试后仍" : ""}生成失败：${event.reason}（这组页面按图片导出）`
          : `Background ${event.groupId} failed${event.retried ? " after a retry" : ""}: ${event.reason} (those pages export as images)`,
      };
    case "slideRetrying":
      return {
        level: "warn",
        text: zh
          ? `${event.slideId} 失败（${describeReason(event.reason, "zh")}），${Math.round(event.delayMs / 1000)} 秒后重试一次`
          : `${event.slideId} failed (${describeReason(event.reason, "en")}); retrying once in ${Math.round(event.delayMs / 1000)}s`,
      };
    case "slideStarted":
      return {
        level: "info",
        text: zh
          ? `第 ${event.index}/${event.total} 页（${event.slideId}）开始重建`
          : `Page ${event.index}/${event.total} (${event.slideId}) starting`,
      };
    case "textRead":
      return {
        level: event.blocks === 0 ? "warn" : "info",
        text: zh
          ? `${event.slideId}：识别出 ${event.blocks} 段文字`
          : `${event.slideId}: read ${event.blocks} text block(s)`,
      };
    case "elementsFound":
      return {
        level: "info",
        text: zh
          ? `${event.slideId}：识别出 ${event.native} 个可编辑形状、${event.drawings} 个图标`
          : `${event.slideId}: ${event.native} native shape(s), ${event.drawings} drawing(s)`,
      };
    case "shapesMeasured":
      return {
        level: "info",
        text: zh ? `${event.slideId}：量出 ${event.count} 个形状` : `${event.slideId}: measured ${event.count} shape(s)`,
      };
    case "iconsLifted": {
      if (event.count === 0 && event.sheets === 0) return null;
      const saved = event.keyedLocally > 0
        ? zh
          ? `，其中 ${event.keyedLocally} 个本地抠色未调用模型`
          : `, ${event.keyedLocally} keyed locally`
        : "";
      return {
        level: "info",
        text: zh
          ? `${event.slideId}：抠出 ${event.count} 个图标，用了 ${event.sheets} 张素材表${saved}`
          : `${event.slideId}: ${event.count} icon(s) from ${event.sheets} sheet(s)${saved}`,
      };
    }
    case "gapsChecked":
      if (event.added === 0) return null;
      return {
        level: "info",
        text: zh ? `${event.slideId}：查漏补回 ${event.added} 个元素` : `${event.slideId}: ${event.added} missed element(s) added`,
      };
    case "slideDone":
      return {
        level: "info",
        text: zh
          ? `${event.slideId} 完成：${event.textBlocks} 段文字 + ${event.elements} 个元素`
          : `${event.slideId} done: ${event.textBlocks} text block(s), ${event.elements} element(s)`,
      };
    case "slideFailed":
      return {
        level: "error",
        text: zh
          ? `${event.slideId} ${event.retried ? "重试后仍" : ""}失败：${describeReason(event.reason, "zh")}（这一页按图片导出）`
          : `${event.slideId} failed${event.retried ? " after a retry" : ""}: ${describeReason(event.reason, "en")} (exported as an image)`,
      };
    case "note":
      return { level: "warn", text: `${event.slideId}：${event.text}` };
    case "writing":
      return { level: "info", text: zh ? "正在写入 PPTX 文件…" : "Writing the PPTX..." };
    default:
      return null;
  }
}

/**
 * A one-line summary of how a run went.
 *
 * Shown collapsed, so the common case -- it worked -- costs no attention and
 * the uncommon one is impossible to miss.
 */
export function summariseRebuild(
  entries: RebuildLogEntry[],
  lang: "zh" | "en",
): { level: LogLevel; text: string } {
  const errors = entries.filter((entry) => entry.level === "error").length;
  const warnings = entries.filter((entry) => entry.level === "warn").length;
  const zh = lang === "zh";

  if (errors > 0) {
    return {
      level: "error",
      text: zh ? `${errors} 项失败，展开查看` : `${errors} failure(s) — expand for detail`,
    };
  }
  if (warnings > 0) {
    return {
      level: "warn",
      text: zh ? `${warnings} 条提示，展开查看` : `${warnings} note(s) — expand for detail`,
    };
  }
  return { level: "info", text: zh ? "全部完成" : "All done" };
}
