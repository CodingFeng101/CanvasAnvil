import { createTranslator, type Dict } from "@/shared/i18n/translator";

/** Strings for the app shell and the CAD / PPT workspaces. */
const messages = {
  "app.refresh": { zh: "刷新页面", en: "Refresh" },
  "app.tryContinue": { zh: "尝试继续", en: "Try to continue" },

  "chat.newChat": { zh: "你好！新对话已开始。请告诉我你的需求。", en: "Hi! New chat started. Tell me what you need." },

  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.save": { zh: "保存", en: "Save" },
  "common.clear": { zh: "清空", en: "Clear" },

  "settings.title": { zh: "配置设置", en: "Settings" },
  "settings.subtitle": { zh: "配置 AI 模型参数与 API 密钥", en: "Configure model parameters and API keys" },
  "settings.language": { zh: "界面语言", en: "Language" },
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "英文", en: "English" },
  "settings.buttonTitle": { zh: "设置", en: "Settings" },

  "reset.title": { zh: "清空对话", en: "Clear Chat" },
  "reset.desc": {
    zh: "清空对话将同时清空当前工作台内容。此操作无法撤销。PPT 工作台会回到开始页面。",
    en: "Clearing chat will also clear the current workspace content. This action cannot be undone. The PPT workspace will return to the start page.",
  },

  "workspace.cad.title": { zh: "CAD 助手", en: "CAD Assistant" },
  "workspace.cad.placeholder": { zh: "描述 CAD…", en: "Describe the CAD…" },
  "workspace.ppt.title": { zh: "PPT 助手", en: "PPT Assistant" },
  "workspace.ppt.placeholder": { zh: "描述 PPT…", en: "Describe the PPT…" },
  "workspace.default.title": { zh: "AI 助手", en: "AI Assistant" },

  "chat.stop": { zh: "暂停", en: "Pause" },
  "chat.send": { zh: "发送", en: "Send" },
  "chat.uploadFile": { zh: "上传文件", en: "Upload file" },
  "chat.uploadImage": { zh: "上传图片", en: "Upload image" },
  "chat.expand": { zh: "展开聊天", en: "Expand chat" },
  "chat.historyTitle": { zh: "版本历史", en: "History" },
  "chat.clearChatTitle": { zh: "清空对话", en: "Clear chat" },
  "chat.collapseLocked": { zh: "PPT 生成完成前不能收起聊天", en: "Chat cannot be collapsed while PPT is generating" },
  "chat.collapse": { zh: "收起聊天", en: "Collapse chat" },

  "nav.flow": { zh: "流程绘制", en: "Flow" },
  "nav.cad": { zh: "室内设计", en: "CAD" },
  "nav.ppt": { zh: "PPT演示", en: "PPT" },


  "history.title": { zh: "版本历史", en: "Version History" },
  "history.clear": { zh: "清空", en: "Clear" },
  "history.empty": { zh: "暂无历史记录", en: "No history yet" },
  "history.restore": { zh: "恢复", en: "Restore" },
  "history.chars": { zh: "{{n}} 字符", en: "{{n}} chars" },

  "constraints.title": { zh: "全局规则约束", en: "Global Constraints" },
  "constraints.desc": { zh: "设置适用于当前工作区的全局系统提示词。", en: "Set global system instructions for the current workspace." },
  "constraints.placeholder": { zh: "例如：始终使用中文回答，代码注释必须详细...", en: "e.g. Always respond in English. Code comments must be detailed..." },


  "error.missingApiKey": { zh: "请先在设置中配置 API Key", en: "Please configure an API key in Settings first." },
} satisfies Dict;

export const { t, translate: tAuto, useT } = createTranslator(messages);
