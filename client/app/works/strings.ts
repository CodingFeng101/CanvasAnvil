import { createTranslator } from "@/shared/i18n/translator";

/** Strings of My works and the Save button. */
export const { t: tWorks, useT: useWorksT } = createTranslator({
  "works.open": { zh: "我的作品", en: "My works" },
  "works.title": { zh: "我的作品", en: "My works" },
  "works.desc": { zh: "保存过的作品都在这里，按画布分类。", en: "Everything you have saved, by canvas." },
  "works.all": { zh: "全部", en: "All" },
  "works.new": { zh: "新建", en: "New" },
  "works.newIn": { zh: "新建{{canvas}}", en: "New {{canvas}}" },
  "works.empty": { zh: "还没有保存的作品。在画布里点「保存」，作品就会出现在这里。", en: "Nothing saved yet. Press Save in a canvas and the work appears here." },
  "works.current": { zh: "当前", en: "Open" },
  "works.rename": { zh: "改名", en: "Rename" },
  "works.duplicate": { zh: "复制", en: "Duplicate" },
  "works.delete": { zh: "删除", en: "Delete" },
  "works.deleteConfirm": { zh: "删除「{{name}}」？删除后无法恢复。", en: "Delete \"{{name}}\"? This cannot be undone." },
  "works.updated": { zh: "修改于 {{time}}", en: "Edited {{time}}" },
  "works.loading": { zh: "正在读取…", en: "Loading…" },
  "works.unavailable": { zh: "当前浏览器无法保存作品（可能是隐私模式），刷新后内容不会保留。", en: "This browser cannot keep your works (private mode?); they will not survive a reload." },

  "save.title": { zh: "保存作品", en: "Save work" },
  "save.renameTitle": { zh: "作品改名", en: "Rename work" },
  "save.desc": { zh: "保存后会出现在「我的作品」里，之后的修改会自动保存。", en: "It will be listed in My works, and later edits save on their own." },
  "save.name": { zh: "名称", en: "Name" },
  "save.confirm": { zh: "保存", en: "Save" },
  "save.cancel": { zh: "取消", en: "Cancel" },
  "save.done": { zh: "已保存到「我的作品」", en: "Saved to My works" },

  "leave.title": { zh: "当前内容还没保存", en: "This work is not saved" },
  "leave.desc": { zh: "「{{canvas}}」里正在做的内容还没保存。不保存的话，离开后就找不回来了。", en: "What you are making in {{canvas}} is not saved. If you leave without saving, it is gone." },
  "leave.save": { zh: "保存", en: "Save" },
  "leave.discard": { zh: "不保存", en: "Don't save" },
  "leave.cancel": { zh: "取消", en: "Cancel" },

  "busy.switch": { zh: "正在生成，完成或停止后才能切换作品", en: "Generating. Switch works once it finishes or is stopped." },
});
