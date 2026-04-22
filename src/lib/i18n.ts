import { getUiLanguage, type UiLanguage } from "@/lib/ui-language";

type Dict = Record<string, { zh: string; en: string }>;

const dict: Dict = {
  "app.refresh": { zh: "刷新页面", en: "Refresh" },
  "app.tryContinue": { zh: "尝试继续", en: "Try to continue" },

  "chat.hello": { zh: "你好！我是你的 AI 助手。请告诉我你的需求。", en: "Hi! I'm your AI assistant. Tell me what you need." },
  "chat.newChat": { zh: "你好！新对话已开始。请告诉我你的需求。", en: "Hi! New chat started. Tell me what you need." },
  "chat.cleared": { zh: "你好！对话记录已清空。", en: "Hi! Chat history has been cleared." },

  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.save": { zh: "保存", en: "Save" },
  "common.clear": { zh: "清空", en: "Clear" },

  "settings.title": { zh: "配置设置", en: "Settings" },
  "settings.subtitle": { zh: "配置 AI 模型参数与 API 密钥", en: "Configure model parameters and API keys" },
  "settings.language": { zh: "界面语言", en: "Language" },
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "英文", en: "English" },
  "settings.buttonTitle": { zh: "设置", en: "Settings" },
  "settings.chatModel": { zh: "对话模型 (Chat Model)", en: "Chat Model" },
  "settings.imageModel": { zh: "绘图模型 (Image Model)", en: "Image Model" },

  "reset.title": { zh: "清空对话", en: "Clear Chat" },
  "reset.desc": {
    zh: "清空对话将同时清空当前工作台内容。此操作无法撤销。PPT 工作台会回到开始页面。",
    en: "Clearing chat will also clear the current workspace content. This action cannot be undone. The PPT workspace will return to the start page.",
  },

  "workspace.flow.title": { zh: "流程图助手", en: "Flow Assistant" },
  "workspace.flow.placeholder": { zh: "描述流程…", en: "Describe the flow…" },
  "workspace.cad.title": { zh: "CAD 助手", en: "CAD Assistant" },
  "workspace.cad.placeholder": { zh: "描述 CAD…", en: "Describe the CAD…" },
  "workspace.ppt.title": { zh: "PPT 助手", en: "PPT Assistant" },
  "workspace.ppt.placeholder": { zh: "描述 PPT…", en: "Describe the PPT…" },
  "workspace.default.title": { zh: "AI 助手", en: "AI Assistant" },

  "chat.stop": { zh: "暂停", en: "Pause" },
  "chat.send": { zh: "发送", en: "Send" },
  "chat.uploadFile": { zh: "上传文件", en: "Upload file" },
  "chat.uploadImage": { zh: "上传图片", en: "Upload image" },
  "chat.rules": { zh: "规则", en: "Rules" },
  "chat.expand": { zh: "展开聊天", en: "Expand chat" },
  "chat.globalConstraints": { zh: "全局约束", en: "Global constraints" },
  "chat.newChatTitle": { zh: "新开对话", en: "New chat" },
  "chat.historyTitle": { zh: "版本历史", en: "History" },
  "chat.clearChatTitle": { zh: "清空对话", en: "Clear chat" },
  "chat.collapseLocked": { zh: "PPT 生成完成前不能收起聊天", en: "Chat cannot be collapsed while PPT is generating" },
  "chat.collapse": { zh: "收起聊天", en: "Collapse chat" },

  "nav.flow": { zh: "流程绘制", en: "Flow" },
  "nav.cad": { zh: "室内设计", en: "CAD" },
  "nav.ppt": { zh: "PPT演示", en: "PPT" },
  "nav.poster": { zh: "海报", en: "Poster" },
  "nav.infographic": { zh: "信息图", en: "Infographic" },
  "nav.product": { zh: "产品介绍", en: "Product" },

  "flow.addToChat": { zh: "添加到对话", en: "Add to chat" },
  "flow.addToChat.tooltip": { zh: "将当前图表添加到对话", en: "Add current diagram to chat" },
  "flow.saving": { zh: "保存中...", en: "Saving..." },
  "flow.updatingChat": { zh: "更新对话中...", en: "Updating chat..." },
  "flow.editorTitle": { zh: "流程图编辑器", en: "Flowchart Editor" },

  "history.title": { zh: "版本历史", en: "Version History" },
  "history.clear": { zh: "清空", en: "Clear" },
  "history.empty": { zh: "暂无历史记录", en: "No history yet" },
  "history.restore": { zh: "恢复", en: "Restore" },
  "history.chars": { zh: "{{n}} 字符", en: "{{n}} chars" },

  "constraints.title": { zh: "全局规则约束", en: "Global Constraints" },
  "constraints.desc": { zh: "设置适用于当前工作区的全局系统提示词。", en: "Set global system instructions for the current workspace." },
  "constraints.placeholder": { zh: "例如：始终使用中文回答，代码注释必须详细...", en: "e.g. Always respond in English. Code comments must be detailed..." },

  "saveDialog.title": { zh: "保存图表", en: "Save Diagram" },
  "saveDialog.filename": { zh: "文件名", en: "Filename" },
  "saveDialog.format": { zh: "格式", en: "Format" },
  "saveDialog.chooseFormat": { zh: "选择格式", en: "Choose format" },

  "error.missingApiKey": { zh: "请先在设置中配置 API Key", en: "Please configure an API key in Settings first." },
};

export function t(lang: UiLanguage, key: string, vars?: Record<string, string | number>) {
  const entry = dict[key];
  const template = entry ? entry[lang] : key;
  if (!vars) return template;
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

export function tAuto(key: string, vars?: Record<string, string | number>) {
  return t(getUiLanguage(), key, vars);
}
