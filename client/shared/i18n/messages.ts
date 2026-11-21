import { createTranslator, type Dict } from "@/shared/i18n/translator";

/** Strings for the app shell and the CAD / PPT workspaces. */
const messages = {
  "app.refresh": { zh: "刷新页面", en: "Refresh" },
  "app.tryContinue": { zh: "尝试继续", en: "Try to continue" },

  "chat.newChat": { zh: "你好！新对话已开始。请告诉我你的需求。", en: "Hi! New chat started. Tell me what you need." },

  "common.cancel": { zh: "取消", en: "Cancel" },
  "common.save": { zh: "保存", en: "Save" },
  "common.clear": { zh: "清空", en: "Clear" },

  "settings.title": { zh: "设置", en: "Settings" },
  "settings.subtitle": { zh: "配置 AI 模型参数与 API 密钥", en: "Configure model parameters and API keys" },
  "settings.language.zh": { zh: "中文", en: "Chinese" },
  "settings.language.en": { zh: "英文", en: "English" },
  "settings.buttonTitle": { zh: "设置", en: "Settings" },

  "reset.title": { zh: "清空对话", en: "Clear Chat" },
  "reset.descSaved": {
    zh: "这件作品会原样留在左侧「最近」里，随时可以回来。清空后，画布换成一张新的空白作品。",
    en: "This work stays in Recents on the left, just as it is. Clearing opens a fresh, blank one.",
  },
  "reset.desc": {
    zh: "清空对话将同时清空当前工作台内容。此操作无法撤销。PPT 工作台会回到开始页面。",
    en: "Clearing chat will also clear the current workspace content. This action cannot be undone. The PPT workspace will return to the start page.",
  },

  "workspace.cad.title": { zh: "设计助手", en: "Design Assistant" },
  "workspace.cad.placeholder": {
    zh: "说说户型、面积，和你想过的日子…",
    en: "The rooms, the size, the life you want there…",
  },
  "workspace.ppt.title": { zh: "PPT 助手", en: "PPT Assistant" },
  "workspace.ppt.placeholder": {
    zh: "哪里想改，直接告诉我…",
    en: "Tell me what to change…",
  },
  "workspace.canvas.title": { zh: "画布助手", en: "Canvas Assistant" },
  "workspace.canvas.placeholder": {
    zh: "写下你想看见的画面…",
    en: "Write the picture you'd like to see…",
  },
  "workspace.canvas.annotateEdit": { zh: "按标注编辑选中的图片", en: "Edit selected image using annotations" },
  "workspace.canvas.annotateEditHint": {
    zh: "选中图片，或选中虚线框内的标注，两种都行",
    en: "Select the image, or an annotation inside its dashed box — either works",
  },
  "workspace.default.title": { zh: "AI 助手", en: "AI Assistant" },

  // What each chat panel shows before its first message.
  "empty.examplesLabel": {
    zh: "不妨从这里开始",
    en: "A place to begin",
  },
  "empty.diagram.title": {
    zh: "今天想理清哪件事？",
    en: "What shall we untangle today?",
  },
  "empty.diagram.desc": {
    zh: "说说有哪些环节、彼此怎样相连，我把它画成一张能继续修改的图；也可以递给我一张图片或一份文档，照着重新画。",
    en: "Tell me the steps and how they connect, and I'll draw a diagram you can keep editing. Or hand me an image or a document to redraw.",
  },
  "empty.diagram.ex1": { zh: "画一张开题报告的研究框架图：研究背景、研究问题、研究目标汇入研究方法（文献分析→理论建模→实验设计→结果评估），旁边接数据来源，最后落到关键发现、理论贡献和应用价值", en: "Draw a research framework for a thesis proposal: background, questions and aims feed the method (literature review → modelling → experiment design → evaluation), with data sources beside it, ending in key findings, contribution and applications" },
  "empty.diagram.ex2": { zh: "画一张智能问答系统架构图：用户终端（Web 端、移动端）、应用层（用户管理、问答服务、检索模块、日志监控）、模型与数据层（向量检索、知识库、大模型、数据库），外接外部数据源", en: "Draw the architecture of a Q&A system: clients (web, mobile), an app layer (users, Q&A service, retrieval, logging), a model and data layer (vector search, knowledge base, LLM, database), and an external data source" },
  "empty.diagram.ex3": { zh: "画一张项目实施路线图，分四个阶段：需求调研、方案设计、原型开发、内部评审、系统联调、试点运行、优化迭代、正式上线", en: "Draw a project roadmap in four phases: research, design, prototype, internal review, integration, pilot, iteration and launch" },
  "empty.cad.title": {
    zh: "想住进一个怎样的家？",
    en: "What kind of home would you like?",
  },
  "empty.cad.desc": {
    zh: "说说户型、面积、风格和预算。我先写一份设计方案，你点头之后，再生成可编辑的户型、施工图和报价。",
    en: "Tell me the rooms, the size, the style and the budget. I'll write a design plan first; once you agree, an editable floorplan, drawings and a quote follow.",
  },
  "empty.cad.ex1": { zh: "110㎡ 三室两厅，现代原木风：玄关、开放式厨房、客餐厅一体，主卧带衣帽间", en: "110㎡, three bedrooms, warm modern wood: an entry hall, open kitchen, living and dining in one, a walk-in closet off the main bedroom" },
  "empty.cad.ex2": { zh: "75㎡ 两室一厅，小两口居家办公，书房放两张书桌", en: "75㎡, two bedrooms, a couple working from home, two desks in the study" },
  "empty.cad.ex3": { zh: "130㎡ 四室两厅，三代同堂，带老人房和儿童房", en: "130㎡, four bedrooms for three generations, with a grandparents' room and a child's room" },
  "empty.ppt.title": {
    zh: "哪一页还想再改改？",
    en: "Which slide needs another pass?",
  },
  "empty.ppt.desc": {
    zh: "直接告诉我怎么改；也可以先在右边把某一页加进对话，再说你的想法。",
    en: "Tell me what to change, or add a slide from the right to the chat first and then say what you have in mind.",
  },
  "empty.ppt.ex1": { zh: "生成一份《2026 年 AI 智能体行业发展报告》演讲 PPT，共 8 页：封面、行业概况、技术演进、市场规模与增长、典型应用场景、主要玩家格局、挑战与风险、未来趋势与总结。面向行业从业者，数据清晰、观点明确。", en: "Make an 8-slide talk, \"2026 AI Agents Industry Report\": cover, overview, how the technology evolved, market size and growth, typical uses, main players, challenges and risks, trends and summary. For people in the industry; clear data, clear views." },
  "empty.ppt.ex2": { zh: "生成一份《绿色低碳转型与智慧园区建设》汇报 PPT，共 9 页：目录、背景与趋势、当前痛点、建设方案框架、核心能力、典型场景、业务价值、总结与展望，绿色清新风格", en: "Make a 9-slide report, \"Green transition and a smart campus\": contents, background and trends, pain points, the plan, core capabilities, typical scenes, business value, summary and outlook; fresh green style" },
  "empty.ppt.ex3": { zh: "生成一份《智能协作驱动未来增长》PPT：背景与机会、当前挑战、解决方案框架、核心能力模块、典型应用场景、应用价值、总结与展望，深色科技风", en: "Make a deck, \"Smart collaboration drives growth\": background and opportunity, challenges, the solution, core modules, typical uses, value, summary and outlook; dark tech style" },
  "empty.canvas.title": {
    zh: "想看见一幅怎样的画面？",
    en: "What would you like to see?",
  },
  "empty.canvas.desc": {
    zh: "先用一句话写下画面；画好后在图上圈一圈、写几个字，再点魔棒，它会照你的标注画出新的一版。",
    en: "Write the picture in a sentence. Once it's on the board, circle it, jot a few words, and press the wand for a new version drawn from your marks.",
  },
  "empty.canvas.ex1": { zh: "一张温暖治愈的水彩插画：午后的阳光洒进窗边，木质书桌上放着一杯冒着热气的咖啡、一本摊开的书和一盆绿植，色调柔和明亮。", en: "A warm, soothing watercolour: afternoon sun through the window onto a wooden desk with a steaming coffee, an open book and a potted plant; soft, bright colours." },
  "empty.canvas.ex2": { zh: "一只橘猫趴在窗台上晒太阳，日系插画", en: "A ginger cat sunning itself on a windowsill, Japanese illustration style" },
  "empty.canvas.ex3": { zh: "雨后的江南小巷，青石板路，油画质感", en: "A Jiangnan lane after rain, flagstone paving, in oil paint" },

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

  "sidebar.new": { zh: "新建作品", en: "New work" },
  "sidebar.recent": { zh: "最近", en: "Recents" },
  "sidebar.allWorks": { zh: "全部作品", en: "All works" },
  "sidebar.noRecent": { zh: "动笔之后，每一件作品都会自己留在这里。", en: "Once you begin, every work will keep itself here." },
  "sidebar.pinned": { zh: "已置顶", en: "Pinned" },
  "sidebar.more": { zh: "更多操作", en: "More options" },
  "sidebar.pin": { zh: "置顶", en: "Pin" },
  "sidebar.unpin": { zh: "取消置顶", en: "Unpin" },
  "sidebar.rename": { zh: "重命名", en: "Rename" },
  "sidebar.delete": { zh: "删除", en: "Delete" },
  "sidebar.deleteTitle": { zh: "删除这件作品？", en: "Delete this work?" },
  "sidebar.deleteDesc": { zh: "「{{name}}」会被永久删除，无法找回。", en: "“{{name}}” will be deleted for good. This cannot be undone." },
  "sidebar.collapse": { zh: "收起侧栏", en: "Close sidebar" },
  "sidebar.expand": { zh: "展开侧栏", en: "Open sidebar" },
  "sidebar.home": { zh: "回到首页", en: "Back to home" },
  "sidebar.search": { zh: "搜索", en: "Search" },
  "sidebar.canvases": { zh: "画布", en: "Canvases" },


  "history.title": { zh: "版本历史", en: "Version History" },
  "history.clear": { zh: "清空", en: "Clear" },
  "history.empty": { zh: "暂无历史记录", en: "No history yet" },
  "history.restore": { zh: "恢复", en: "Restore" },
  "history.chars": { zh: "{{n}} 字符", en: "{{n}} chars" },

  "constraints.title": { zh: "记忆", en: "Memory" },
  "constraints.desc": { zh: "AI 在这个画布里一直记住的事，每次请求都会带上。", en: "What the AI always remembers on this canvas; sent with every request." },
  "constraints.placeholder": { zh: "例如：始终使用中文回答，代码注释必须详细...", en: "e.g. Always respond in English. Code comments must be detailed..." },


  "error.missingApiKey": { zh: "请先在设置中配置 API Key", en: "Please configure an API key in Settings first." },
} satisfies Dict;

/** Every key the app-shell dictionary defines. */
export type MessageKey = keyof typeof messages;

export const { t, translate: tAuto, useT } = createTranslator(messages);
