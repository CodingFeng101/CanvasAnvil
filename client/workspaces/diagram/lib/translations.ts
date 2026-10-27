import { createTranslator, type Dict } from "@/shared/i18n/translator";

/** Strings owned by the Diagram workspace. */
const messages = {
  // ChatPanel
  "chat.panel.show": { zh: "展开交互区 (Ctrl+B)", en: "Show chat panel (Ctrl+B)" },
  "chat.panel.hide": { zh: "收起交互区 (Ctrl+B)", en: "Hide chat panel (Ctrl+B)" },
  // Matches "CAD 助手" and "PPT 助手" in the shell dictionary, so the
  // three panels are named the same way.
  "chat.panel.title": { zh: "图表助手", en: "Diagram Assistant" },

  // ChatInput
  "input.placeholder": { zh: "描述你想画的图表，或上传图片、文档…", en: "Describe the diagram you want, or upload an image or document…" },
  "input.clear": { zh: "清空对话", en: "Clear conversation" },
  "input.upload_image": { zh: "上传图片", en: "Upload image" },
  "input.upload_file_types": { zh: "上传文件（.pdf、.docx、.txt）", en: "Upload file (.pdf, .docx, .txt)" },
  "input.send": { zh: "发送消息", en: "Send message" },
  "input.stop": { zh: "停止生成", en: "Stop generation" },
  "input.deep_thinking": { zh: "深度思考", en: "Deep Think" },
  "input.aria": { zh: "聊天输入", en: "Chat input" },
  "input.sending": { zh: "发送中...", en: "Sending..." },

  // File checks on upload
  "files.too_many": { zh: "最多只能上传 {{max}} 个文件", en: "You can attach at most {{max}} files" },
  "files.slots_left": { zh: "还可再上传 {{n}} 个文件", en: "Only {{n}} more file(s) can be attached" },
  "files.unsupported": { zh: "“{{name}}”不是支持的文件类型", en: "\"{{name}}\" is not a supported file type" },
  "files.too_large": { zh: "“{{name}}”大小为 {{size}}（超过 {{max}}MB）", en: "\"{{name}}\" is {{size}}, over the {{max}}MB limit" },
  "files.failed_count": { zh: "{{n}} 个文件未能添加：", en: "{{n}} files could not be attached:" },
  "files.and_more": { zh: "……以及另外 {{n}} 个", en: "…and {{n}} more" },

  // Errors raised while sending
  "error.unknown": { zh: "未知错误", en: "Unknown error" },
  "error.send_failed": { zh: "发送失败：{{detail}}", en: "Could not send: {{detail}}" },
  "error.retry_limit": { zh: "自动重试已达到上限（{{n}} 次），请手动重试。", en: "Automatic retries reached the limit ({{n}}). Please try again manually." },
  "error.chat_init": { zh: "内部错误：聊天初始化失败，请刷新页面后重试。", en: "Internal error: the chat failed to start. Refresh the page and try again." },
  "error.no_model": { zh: "未配置模型。请在顶部设置里填写模型，或在服务端配置 AI_MODEL。", en: "No model is configured. Set one in Settings at the top, or configure AI_MODEL on the server." },

  // ChatMessageDisplay
  "message.parsing_files": { zh: "正在解析文件...", en: "Parsing files..." },
  // Kept identical to the CAD and PPT panels so the three read as one product.
  "message.thinking": { zh: "思考中...", en: "Thinking..." },
  "chat.drop_to_attach": { zh: "松开以添加文件", en: "Drop to attach" },
  "message.copy": { zh: "复制消息", en: "Copy message" },
  "message.copied": { zh: "已复制", en: "Copied!" },
  "message.copy.failed": { zh: "复制失败", en: "Failed to copy" },
  "message.regenerate": { zh: "重新生成", en: "Regenerate response" },
  "message.edit": { zh: "编辑消息", en: "Edit message" },
  "message.edit.cancel": { zh: "取消", en: "Cancel" },
  "message.edit.save": { zh: "保存并提交", en: "Save & Submit" },

  // QuotaLimitToast
  "quota.limit.reached": { zh: "已达到当日额度", en: "Daily limit reached" },
  "quota.limit.desc": { zh: "你今天已达到 {limit} 次请求上限。", en: "You have reached your daily limit of {limit} requests." },
  "quota.limit.tip": { zh: "提示：你可以使用自己的 API Key（点击设置图标）或自托管项目来绕过限制。", en: "Tip: You can use your own API key (click the Settings icon) or self-host the project to bypass these limits." },
  "quota.limit.reset": { zh: "额度将在明天重置，感谢理解！", en: "Your limit resets tomorrow. Thanks for understanding!" },
  "quota.sponsor": { zh: "赞助", en: "Sponsor" },

  // ResetWarningModal
  "reset.title": { zh: "确认清空？", en: "Clear Everything?" },
  "reset.desc": { zh: "这会清空当前对话并重置图表，且无法撤销。", en: "This will clear the current conversation and reset the diagram. This action cannot be undone." },
  "reset.confirm": { zh: "确认清空", en: "Clear Everything" },
  "reset.cancel": { zh: "取消", en: "Cancel" },

  // SaveDialog
  "save.title": { zh: "保存图表", en: "Save Diagram" },
  "save.format": { zh: "格式", en: "Format" },
  "save.filename": { zh: "文件名", en: "Filename" },
  "save.filename.placeholder": { zh: "diagram", en: "diagram" },
  "save.download": { zh: "下载", en: "Download" },

  // Toolbar tooltips
  "tooltip.history": { zh: "图表历史", en: "Diagram history" },
  "tooltip.deep_thinking": { zh: "深度思考", en: "Deep Think" },

  // HistoryDialog
  "history.title": { zh: "图表历史记录", en: "Diagram History" },
  "history.empty": { zh: "暂无历史记录，发送消息后会生成历史版本。", en: "No history available yet. Send messages to create diagram history." },
  "history.version": { zh: "版本", en: "Version" },
  "history.restore": { zh: "恢复到版本", en: "Restore to Version" },
  "history.confirm": { zh: "确认", en: "Confirm" },
  "history.cancel": { zh: "取消", en: "Cancel" },
  "history.close": { zh: "关闭", en: "Close" },

  // GlobalConstraintsDialog
  "tooltip.global_constraints": { zh: "全局约束", en: "Global Constraints" },

  // Tool call cards. These were the last hardcoded English in the panel: the
  // card sat directly above a fully translated code block.
  "tool.display_diagram": { zh: "生成图表", en: "Generate Diagram" },
  "tool.edit_diagram": { zh: "编辑图表", en: "Edit Diagram" },
  "tool.append_diagram": { zh: "追加图表", en: "Append Diagram" },
  "tool.get_shape_library": { zh: "读取图形库", en: "Get Shape Library" },
  "tool.status.complete": { zh: "完成", en: "Complete" },
  "tool.status.truncated": { zh: "已截断", en: "Truncated" },
  "tool.status.error": { zh: "错误", en: "Error" },

  // Common
  "common.save": { zh: "保存", en: "Save" },
  "common.regenerate_error": { zh: "重新生成失败：缺少历史状态", en: "Failed to regenerate: missing history state" },
  "common.busy": { zh: "系统忙碌中，请稍后...", en: "System is busy, please wait..." },
} satisfies Dict;

export const { t, translate: translateDiagram, useT: useDiagramT } = createTranslator(messages);
