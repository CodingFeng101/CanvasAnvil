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
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "英文", en: "English" },
  "settings.buttonTitle": { zh: "设置", en: "Settings" },

  "reset.title": { zh: "清空对话", en: "Clear Chat" },
  "reset.desc": {
    zh: "清空对话将同时清空当前工作台内容。此操作无法撤销。PPT 工作台会回到开始页面。",
    en: "Clearing chat will also clear the current workspace content. This action cannot be undone. The PPT workspace will return to the start page.",
  },

  "workspace.cad.title": { zh: "设计助手", en: "Design Assistant" },
  "workspace.cad.placeholder": { zh: "描述户型、面积和想要的风格…", en: "Describe the layout, size and style you want…" },
  "workspace.ppt.title": { zh: "PPT 助手", en: "PPT Assistant" },
  "workspace.ppt.placeholder": { zh: "说说要怎么修改大纲或页面…", en: "Say how to change the outline or slides…" },
  "workspace.canvas.title": { zh: "画布助手", en: "Canvas Assistant" },
  "workspace.canvas.placeholder": { zh: "描述想生成的画面…", en: "Describe the picture you want…" },
  "workspace.canvas.annotateEdit": { zh: "按标注编辑选中的图片", en: "Edit selected image using annotations" },
  "workspace.canvas.annotateEditHint": {
    zh: "选中图片，或选中虚线框内的标注，两种都行",
    en: "Select the image, or an annotation inside its dashed box — either works",
  },
  "workspace.default.title": { zh: "AI 助手", en: "AI Assistant" },

  // What each chat panel shows before its first message.
  "empty.examplesLabel": { zh: "试试这样说", en: "Try asking" },
  "empty.diagram.title": { zh: "描述你想画的图表", en: "Describe the diagram you want" },
  "empty.diagram.desc": {
    zh: "说清楚有哪些环节、它们怎么连接，助手会画成可以继续编辑的 draw.io 图表；也可以上传图片或文档让它复刻、整理。",
    en: "Say what the steps are and how they connect, and the assistant draws an editable draw.io diagram. You can also upload an image or a document to redraw.",
  },
  "empty.diagram.ex1": { zh: "画一个用户登录注册的流程图，包含验证码校验和失败重试", en: "Draw a sign-up and login flowchart with captcha checks and retry on failure" },
  "empty.diagram.ex2": { zh: "生成电商系统的微服务架构图：网关、订单、支付、库存和消息队列", en: "Make a microservice architecture diagram for an online store: gateway, orders, payments, inventory and a message queue" },
  "empty.diagram.ex3": { zh: "把 RAG 检索增强生成的流程画成从左到右的步骤图", en: "Draw the RAG (retrieval-augmented generation) pipeline as left-to-right steps" },
  "empty.cad.title": { zh: "从一句需求开始做方案", en: "Start a design from one sentence" },
  "empty.cad.desc": {
    zh: "告诉助手户型、面积、风格和预算，它会生成分析图、二维图纸、效果图和物料清单。",
    en: "Tell the assistant the layout, size, style and budget, and it produces analysis boards, 2D drawings, renders and a material list.",
  },
  "empty.cad.ex1": { zh: "两室一厅 89㎡，现代简约风，预算 15 万，帮我出一套方案", en: "Two bedrooms, 89㎡, modern minimal, ¥150k budget — draft a full scheme" },
  "empty.cad.ex2": { zh: "一间 30㎡ 的开放式办公室，需要 6 个工位和一个洽谈区", en: "A 30㎡ open office with six desks and a small meeting corner" },
  "empty.cad.ex3": { zh: "老房翻新：三室两厅，北欧风，重点解决收纳", en: "Renovate an older three-bedroom flat in Nordic style, focused on storage" },
  "empty.ppt.title": { zh: "说说要改哪里", en: "Tell it what to change" },
  "empty.ppt.desc": {
    zh: "直接描述要怎么改；也可以先在左侧把某一页添加到对话里，再说要改什么。",
    en: "Describe the change directly, or add a slide from the left to the chat first and then say what to change.",
  },
  "empty.ppt.ex1": { zh: "把第 2 页的标题改得更有吸引力", en: "Make the title on slide 2 more compelling" },
  "empty.ppt.ex2": { zh: "整体语气更正式一些，适合向领导汇报", en: "Make the whole deck more formal, for a report to management" },
  "empty.ppt.ex3": { zh: "在最后加一页「总结与下一步计划」", en: "Add a final slide: summary and next steps" },
  "empty.canvas.title": { zh: "一句话生成，圈出来就能改", en: "Describe it, then circle what to change" },
  "empty.canvas.desc": {
    zh: "先描述想要的画面；生成后在图上画圈、写字标注，再点魔棒，按标注修改出新版本。",
    en: "Describe a picture first. Once it is on the board, circle or write on it, then press the wand to make a new version from your marks.",
  },
  "empty.canvas.ex1": { zh: "一张极简风格的产品海报，主体是一杯冒着热气的咖啡，暖色调", en: "A minimal product poster of a steaming cup of coffee, warm tones" },
  "empty.canvas.ex2": { zh: "赛博朋克风格的城市夜景，霓虹灯映在雨后的街道上", en: "A cyberpunk city at night, neon reflected on rain-soaked streets" },
  "empty.canvas.ex3": { zh: "扁平插画：一个团队围着白板讨论方案", en: "Flat illustration: a team discussing ideas around a whiteboard" },

  "chat.stop": { zh: "暂停", en: "Pause" },
  "chat.send": { zh: "发送", en: "Send" },
  "chat.uploadFile": { zh: "上传文件", en: "Upload file" },
  "chat.uploadImage": { zh: "上传图片", en: "Upload image" },
  "chat.expand": { zh: "展开聊天", en: "Expand chat" },
  "chat.historyTitle": { zh: "版本历史", en: "History" },
  "chat.clearChatTitle": { zh: "清空对话", en: "Clear chat" },
  "chat.collapseLocked": { zh: "PPT 生成完成前不能收起聊天", en: "Chat cannot be collapsed while PPT is generating" },
  "chat.collapse": { zh: "收起聊天", en: "Collapse chat" },

  "nav.diagram": { zh: "图表绘制", en: "Diagram" },
  "nav.cad": { zh: "室内设计", en: "Interior" },
  "nav.ppt": { zh: "PPT 演示", en: "PPT" },
  "nav.canvas": { zh: "自由画布", en: "Canvas" },


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

/** Every key the app-shell dictionary defines. */
export type MessageKey = keyof typeof messages;

export const { t, translate: tAuto, useT } = createTranslator(messages);
