import { createTranslator } from "@/shared/i18n/translator";

/** Strings of My works and the Save button. */
export const { t: tWorks, useT: useWorksT } = createTranslator({
  "works.open": { zh: "我的作品", en: "My works" },
  "works.title": { zh: "我的作品", en: "My works" },
  "works.desc": { zh: "做过的作品都在这里，按画布分类。", en: "Everything you have made, by canvas." },
  "works.all": { zh: "全部", en: "All" },
  "works.new": { zh: "新建", en: "New" },
  "works.newIn": { zh: "新建{{canvas}}", en: "New {{canvas}}" },
  "works.emptyTitle": { zh: "一张白纸，还在等第一笔。", en: "A blank page, still waiting for its first line." },
  "works.empty": { zh: "在任何一张画布上动笔，作品会自己来到这里，不必保存。", en: "Begin on any canvas and the work finds its way here on its own. There is nothing to save." },
  "works.current": { zh: "当前", en: "Open" },
  "works.rename": { zh: "改名", en: "Rename" },
  "works.duplicate": { zh: "复制", en: "Duplicate" },
  "works.delete": { zh: "删除", en: "Delete" },
  "works.deleteConfirm": { zh: "删除「{{name}}」？删除后无法恢复。", en: "Delete \"{{name}}\"? This cannot be undone." },
  "works.updated": { zh: "保存于 {{time}}", en: "Saved {{time}}" },
  "works.loading": { zh: "正在读取…", en: "Loading…" },
  "works.unavailable": { zh: "当前浏览器无法保存作品（可能是隐私模式），刷新后内容不会保留。", en: "This browser cannot keep your works (private mode?); they will not survive a reload." },

  "save.title": { zh: "保存作品", en: "Save work" },
  "save.renameTitle": { zh: "作品改名", en: "Rename work" },
  "save.desc": { zh: "保存后会出现在「我的作品」里。之后再修改，点保存才会更新。", en: "It will be listed in My works. After further edits, press Save again to update it." },
  "save.name": { zh: "名称", en: "Name" },
  "save.confirm": { zh: "保存", en: "Save" },
  "save.cancel": { zh: "取消", en: "Cancel" },
  "save.done": { zh: "已保存到「我的作品」", en: "Saved to My works" },
  "save.updated": { zh: "已保存", en: "Saved" },

  "leave.title": { zh: "当前内容还没保存", en: "This work is not saved" },
  "leave.desc": { zh: "「{{canvas}}」里正在做的内容还没保存。不保存的话，离开后就找不回来了。", en: "What you are making in {{canvas}} is not saved. If you leave without saving, it is gone." },
  "leave.changesTitle": { zh: "有修改还没保存", en: "Unsaved changes" },
  "leave.changesDesc": { zh: "「{{name}}」有修改还没保存。不保存的话，会回到上次保存时的样子。", en: "\"{{name}}\" has changes that are not saved. If you don't save, it goes back to how it was last saved." },
  "leave.save": { zh: "保存", en: "Save" },
  "leave.discard": { zh: "不保存", en: "Don't save" },
  "leave.cancel": { zh: "取消", en: "Cancel" },

  "busy.switch": { zh: "正在生成，完成或停止后才能切换作品", en: "Generating. Switch works once it finishes or is stopped." },
});
