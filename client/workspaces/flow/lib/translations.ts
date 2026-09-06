import { createTranslator, type Dict } from "@/shared/i18n/translator";

/** Strings owned by the Flow workspace. */
const messages = {
  // ChatPanel
  "app.title": { zh: "图表助手", en: "Next AI Drawio" },
  "welcome.title": { zh: "用 AI 创建图表", en: "Create diagrams with AI" },
  "welcome.desc": { zh: "描述你想创建的内容，或上传图片进行复刻", en: "Describe what you want to create or upload an image to replicate" },
  "app.about": { zh: "关于", en: "About" },
  "chat.panel.show": { zh: "展开交互区 (Ctrl+B)", en: "Show chat panel (Ctrl+B)" },
  "chat.panel.hide": { zh: "收起交互区 (Ctrl+B)", en: "Hide chat panel (Ctrl+B)" },
  "chat.panel.title": { zh: "图表交互区", en: "Flowchart Assistant" },
  "chat.settings": { zh: "设置", en: "Settings" },
  "chat.vertical.title": { zh: "AI 对话", en: "AI Chat" },

  // ChatInput
  "input.placeholder": { zh: "描述你的图表需求，或上传文件...", en: "Describe your diagram or upload a file..." },
  "input.clear": { zh: "清空对话", en: "Clear conversation" },
  "input.upload": { zh: "上传文件（图片、PDF、文本）", en: "Upload file (image, PDF, text)" },
  "input.upload_image": { zh: "上传图片", en: "Upload image" },
  "input.upload_file": { zh: "上传文件", en: "Upload file" },
  "input.upload_file_types": { zh: "上传文件（.pdf、.docx、.txt）", en: "Upload file (.pdf, .docx, .txt)" },
  "input.send": { zh: "发送消息", en: "Send message" },
  "input.stop": { zh: "停止生成", en: "Stop generation" },
  "input.history": { zh: "历史记录", en: "History" },
  "input.history.toggle": { zh: "切换历史记录", en: "Toggle history" },
  "input.deep_thinking": { zh: "深度思考", en: "Deep Think" },

  // ChatMessageDisplay
  "message.sending": { zh: "正在发送消息...", en: "Sending message..." },
  "message.parsing_files": { zh: "正在解析文件...", en: "Parsing files..." },
  // Kept identical to the CAD and PPT panels so the three read as one product.
  "message.thinking": { zh: "思考中...", en: "Thinking..." },
  "chat.drop_to_attach": { zh: "松开以添加文件", en: "Drop to attach" },
  "message.copy": { zh: "复制消息", en: "Copy message" },
  "message.copied": { zh: "已复制", en: "Copied!" },
  "message.copy.failed": { zh: "复制失败", en: "Failed to copy" },
  "message.regenerate": { zh: "重新生成", en: "Regenerate response" },
  "message.edit": { zh: "编辑消息", en: "Edit message" },
  "message.good": { zh: "回答有帮助", en: "Good response" },
  "message.bad": { zh: "回答不理想", en: "Bad response" },
  "message.edit.cancel": { zh: "取消", en: "Cancel" },
  "message.edit.save": { zh: "保存并提交", en: "Save & Submit" },

  // SettingsDialog
  "settings.title": { zh: "设置", en: "Settings" },
  "settings.language": { zh: "语言", en: "Language" },
  "settings.theme": { zh: "主题", en: "Theme" },
  "settings.provider": { zh: "AI 服务商", en: "AI Provider" },
  "settings.model": { zh: "模型 ID", en: "Model ID" },
  "settings.image_model": { zh: "绘图模型", en: "Image Model" },
  "settings.api_key": { zh: "API Key", en: "API Key" },
  "settings.base_url": { zh: "Base URL（可选）", en: "Base URL (optional)" },
  "settings.access_code": { zh: "访问码（可选）", en: "Access Code (optional)" },
  "settings.close": { zh: "关闭", en: "Close" },
  "settings.save": { zh: "保存", en: "Save" },
  "settings.general": { zh: "通用设置", en: "General" },
  "settings.theme.desc": { zh: "界面和 DrawIO 画布的深色/浅色模式。", en: "Dark/Light mode for interface and DrawIO canvas." },
  "settings.close_protection": { zh: "防误关闭", en: "Prevent accidental close" },
  "settings.close_protection.desc": { zh: "离开页面时弹出确认提示。", en: "Show confirmation when leaving the page." },
  "settings.ai_config": { zh: "AI 配置", en: "AI Configuration" },
  "settings.ai_provider.desc": { zh: "使用你自己的 API Key 可绕过默认额度限制。密钥仅保存在浏览器本地，不会存到服务端。", en: "Use your own API key to bypass usage limits. Your key is stored locally in your browser and is never stored on the server." },
  "settings.provider.placeholder": { zh: "选择服务商", en: "Select provider" },
  "settings.provider.default": { zh: "默认（服务端）", en: "Default (Server)" },
  "settings.api_key.placeholder": { zh: "sk-...", en: "sk-..." },
  "settings.api_key.desc": { zh: "留空则使用默认密钥", en: "Leave empty to use default key" },
  "settings.base_url.placeholder": { zh: "https://api.openai.com/v1", en: "https://api.openai.com/v1" },
  "settings.drawio_style": { zh: "DrawIO 风格", en: "DrawIO Style" },
  "settings.drawio_style.desc": { zh: "画布风格：", en: "Canvas style: " },
  "settings.drawio_style.minimal": { zh: "简洁", en: "Minimal" },
  "settings.drawio_style.sketch": { zh: "手绘", en: "Sketch" },
  "settings.drawio_style.switch": { zh: "切换为 ", en: "Switch to " },
  "settings.clear": { zh: "清空设置", en: "Clear Settings" },

  // QuotaLimitToast
  "quota.limit.reached": { zh: "已达到当日额度", en: "Daily limit reached" },
  "quota.limit.desc": { zh: "你今天已达到 {limit} 次请求上限。", en: "You have reached your daily limit of {limit} requests." },
  "quota.limit.tip": { zh: "提示：你可以使用自己的 API Key（点击设置图标）或自托管项目来绕过限制。", en: "Tip: You can use your own API key (click the Settings icon) or self-host the project to bypass these limits." },
  "quota.limit.reset": { zh: "额度将在明天重置，感谢理解！", en: "Your limit resets tomorrow. Thanks for understanding!" },
  "quota.sponsor": { zh: "赞助", en: "Sponsor" },
  "quota.learn_more": { zh: "了解更多 ->", en: "Learn more ->" },

  // ResetWarningModal
  "reset.title": { zh: "确认清空？", en: "Clear Everything?" },
  "reset.desc": { zh: "这会清空当前对话并重置图表，且无法撤销。", en: "This will clear the current conversation and reset the diagram. This action cannot be undone." },
  "reset.confirm": { zh: "确认清空", en: "Clear Everything" },
  "reset.cancel": { zh: "取消", en: "Cancel" },

  // SaveDialog
  "save.title": { zh: "保存图表", en: "Save Diagram" },
  "save.desc": { zh: "选择保存格式。", en: "Choose a format to save your diagram." },
  "save.format": { zh: "格式", en: "Format" },
  "save.filename": { zh: "文件名", en: "Filename" },
  "save.filename.placeholder": { zh: "diagram", en: "diagram" },
  "save.download": { zh: "下载", en: "Download" },

  // ExamplePanel
  "example.aws.title": { zh: "AWS 架构图", en: "AWS Architecture" },
  "example.aws.desc": { zh: "用 AWS 图标生成云架构图", en: "Create a cloud architecture diagram with AWS icons" },
  "example.flowchart.title": { zh: "复刻图表", en: "Replicate Flowchart" },
  "example.flowchart.desc": { zh: "上传并复刻已有图表", en: "Upload and replicate an existing flowchart" },
  "example.creative.title": { zh: "创意绘图", en: "Creative Drawing" },
  "example.creative.desc": { zh: "生成有趣的创意图形", en: "Draw something fun and creative" },
  "example.cached": { zh: "示例已缓存，可快速响应", en: "Examples are cached for instant response" },
  "example.new": { zh: "新", en: "NEW" },
  "examples.title": { zh: "快速示例", en: "Quick Examples" },
  "examples.paper.title": { zh: "论文转图表", en: "Paper to Diagram" },
  "examples.paper.desc": { zh: "支持上传 .pdf、.txt、.md、.json、.csv、.py、.js、.ts 等文件", en: "Upload .pdf, .txt, .md, .json, .csv, .py, .js, .ts and more" },
  "examples.animated.title": { zh: "动画图表", en: "Animated Diagram" },
  "examples.animated.desc": { zh: "绘制带动画连线的 Transformer 架构图", en: "Draw a transformer architecture with animated connectors" },
  "tooltip.history": { zh: "图表历史", en: "Diagram history" },
  "tooltip.save": { zh: "保存图表", en: "Save diagram" },
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
  "global_constraints.title": { zh: "全局约束", en: "Global Constraints" },
  "global_constraints.description": { zh: "填写会应用到每次 AI 回复的约束指令。", en: "Enter instructions that will be applied to every AI response." },
  "global_constraints.placeholder": { zh: "例如：决策节点统一使用蓝色...", en: "e.g., Always use blue for decision nodes..." },
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
  "common.error": { zh: "错误", en: "Error" },
  "common.loading": { zh: "加载中...", en: "Loading..." },
  "common.save": { zh: "保存", en: "Save" },
  "common.saved": { zh: "保存成功", en: "Saved successfully" },
  "common.regenerate_error": { zh: "重新生成失败：缺少历史状态", en: "Failed to regenerate: missing history state" },
  "common.busy": { zh: "系统忙碌中，请稍后...", en: "System is busy, please wait..." },
} satisfies Dict;

export const { t, useT: useFlowT } = createTranslator(messages);
