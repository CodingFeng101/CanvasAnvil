
import { buildRisenPrompt } from "./risen-prompt";

export interface ProjectContext {
  idea_prompt?: string;
  outline_text?: string;
  description_text?: string;
  creation_type?: 'idea' | 'outline' | 'descriptions';
  reference_files_content?: Array<{filename: string; content: string}>;
}

export interface OutlineItem {
  title: string;
  points: string[];
  part?: string;
  pages?: OutlineItem[]; // For part-based structure in raw json
}

export const LANGUAGE_CONFIG: Record<string, { instruction: string; ppt_text: string }> = {
  zh: {
    instruction: '请使用全中文输出。',
    ppt_text: 'PPT文字请使用全中文。'
  },
  en: {
    instruction: 'Please output all in English.',
    ppt_text: 'Use English for PPT text.'
  }
};

function getLanguageInstruction(language: string = 'zh') {
  return LANGUAGE_CONFIG[language]?.instruction || '';
}

function getPptLanguageInstruction(language: string = 'zh') {
  return LANGUAGE_CONFIG[language]?.ppt_text || '';
}

function formatReferenceFilesXml(files?: Array<{filename: string; content: string}>) {
  if (!files || files.length === 0) return "";
  
  let xml = "<uploaded_files>\n";
  for (const file of files) {
    xml += `  <file name="${file.filename}">\n`;
    xml += `    <content>\n${file.content}\n    </content>\n`;
    xml += `  </file>\n`;
  }
  xml += "</uploaded_files>\n\n";
  return xml;
}

export function getOutlineGenerationPrompt(projectContext: ProjectContext, language: string = 'zh') {
  const filesXml = formatReferenceFilesXml(projectContext.reference_files_content);
  const ideaPrompt = projectContext.idea_prompt || "";

  return `${filesXml}${buildRisenPrompt({
    role: "You are an outline planning agent for PPT generation.",
    instructions: `Generate an outline as valid JSON only. Choose the format that best fits the content: simple page list for short decks, or part-based outline when the deck has major sections. ${getLanguageInstruction(language)}`.trim(),
    input: `User request:\n${ideaPrompt || "(none)"}`,
    steps: `1. Understand the requested topic and audience.\n2. Choose simple format or part-based format.\n3. Keep page titles concise and points presentation-friendly.\n4. Use parts only when there are clear major sections.`,
    endGoal: "Produce a complete outline that is directly usable for downstream PPT page planning.",
    narrowing: `1. Return valid JSON only.\n2. Do not wrap the JSON in markdown code fences.\n3. Do not include any explanation outside the JSON payload.`,
    outputFormat: `Simple format:\n[{"title":"title1","points":["point1","point2"]}]\n\nPart-based format:\n[{"part":"Part 1","pages":[{"title":"Welcome","points":["point1","point2"]}]}]`,
  })}`;
}

export function getPageDescriptionPrompt(
  projectContext: ProjectContext, 
  outline: any[], 
  pageOutline: any, 
  pageIndex: number, 
  partInfo: string = "", 
  language: string = 'zh'
) {
  const filesXml = formatReferenceFilesXml(projectContext.reference_files_content);
  const originalInput = projectContext.idea_prompt || "";

  if (language === "en") {
    return `${filesXml}${buildRisenPrompt({
      role: "You are a per-slide PPT content description agent.",
      instructions: `Generate one slide description in English. The 'Slide text' will be rendered directly onto the slide, so it must stay concise and highly readable. ${getLanguageInstruction(language)}`.trim(),
      input: `Original request:\n${originalInput}\n\nFull outline:\n${JSON.stringify(outline)}\n${partInfo}\nTarget slide ${pageIndex}:\n${JSON.stringify(pageOutline)}`,
      steps: `1. Read the full outline and the target slide context.\n2. Write a concise slide title.\n3. Write slide text as clear bullets, about 8-16 words each.\n4. Add other slide materials only when helpful, including markdown image links when reference files include local image URLs.`,
      endGoal: "Produce one slide description that can be rendered directly into a readable presentation slide.",
      narrowing: "1. Avoid long sentences.\n2. Do not add commentary outside the requested sections.\n3. Keep content optimized for live presentation.",
      outputFormat: `Slide title: Human societies: living with nature\n\nSlide text:\n- Hunter-gatherer societies: limited impact due to small scale\n- High dependence: life relies on direct natural supply\n\nOther slide materials`,
    })}`;
  }

  return `${filesXml}${buildRisenPrompt({
    role: "你是一名逐页 PPT 内容描述生成智能体。",
    instructions: `请为单页 PPT 生成内容描述。“页面文字”会直接渲染到幻灯片上，因此必须简洁、清晰、适合演示。${getLanguageInstruction(language)}`.trim(),
    input: `原始需求：\n${originalInput}\n\n完整大纲：\n${JSON.stringify(outline)}\n${partInfo}\n目标页（第 ${pageIndex} 页）：\n${JSON.stringify(pageOutline)}`,
    steps: `1. 阅读完整大纲和目标页上下文。\n2. 生成一个简洁的页面标题。\n3. 生成页面文字，每条控制在 15-25 字左右。\n4. 如有帮助，可补充其他页面素材，包括 markdown 图片链接、公式或表格。`,
    endGoal: "输出一页可直接用于渲染 PPT 的内容描述。",
    narrowing: "1. 避免冗长句子和复杂表述。\n2. 不要输出额外说明或注释。\n3. 如果参考文件里有 /files/ 开头的本地图片 URL，可以用 markdown 图片格式输出。",
    outputFormat: `页面标题：原始社会：与自然共生\n\n页面文字：\n- 狩猎采集文明：人类活动规模小，对环境影响有限\n- 依赖性强：生活完全依赖自然资源的直接供给\n\n其他页面素材`,
  })}`;
}

export function getImageGenerationPrompt(
  pageDesc: string, 
  outlineText: string, 
  currentSection: string, 
  hasMaterialImages: boolean = false,
  extraRequirements: string = "",
  language: string = 'zh'
) {
  let materialImagesNote = "";
  if (hasMaterialImages) {
    materialImagesNote =
      language === "en"
        ? `\n\nNote: In addition to the template reference image (for style), extra material images are provided. You may select and integrate suitable images/icons/charts/visual elements from them to enrich the slide, based on the content needs.`
        : `\n\n提示：除了模板参考图片（用于风格参考）外，还提供了额外的素材图片。这些素材图片是可供挑选和使用的元素，你可以从这些素材图片中选择合适的图片、图标、图表或其他视觉元素直接整合到生成的PPT页面中。请根据页面内容的需要，智能地选择和组合这些素材图片中的元素。`;
  }

  const extraReqText = extraRequirements
    ? language === "en"
      ? `\n\nExtra requirements (must follow):\n${extraRequirements}\n`
      : `\n\n额外要求（请务必遵循）：\n${extraRequirements}\n`
    : "";

  if (language === "en") {
    return buildRisenPrompt({
      role: "You are an expert PPT visual design agent.",
      instructions: `Generate one polished PPT slide image. ${getPptLanguageInstruction(language)}${materialImagesNote}${extraReqText}`.trim(),
      input: `Page description:\n${pageDesc}\n\nOverall outline:\n${outlineText || "(none)"}\n\nCurrent section: ${currentSection || "(none)"}`,
      steps: `1. Read the page description and outline context.\n2. Build the strongest slide composition for the content.\n3. Follow the template reference image style closely.\n4. If material images are provided, integrate only the useful ones.`,
      endGoal: "Produce one sharp, presentation-ready 16:9 slide image that renders the described content accurately.",
      narrowing: "1. Keep text crisp and readable.\n2. Avoid markdown symbols unless strictly required.\n3. Use the template for style only; do not copy template text.\n4. Fill empty regions with suitable decorative shapes or illustrations.",
    });
  }

  return buildRisenPrompt({
    role: "你是一名专家级 PPT 视觉设计智能体。",
    instructions: `生成一张完成度很高的 PPT 页面图。${getPptLanguageInstruction(language)}${materialImagesNote}${extraReqText}`.trim(),
    input: `页面描述：\n${pageDesc}\n\n整体大纲：\n${outlineText || "(none)"}\n\n当前章节：${currentSection || "(none)"}`,
    steps: `1. 阅读页面描述和整套 PPT 上下文。\n2. 自动组织最佳构图与视觉层级。\n3. 严格参考模板图片的风格与设计语言。\n4. 如果提供了素材图，只在确实有帮助时整合进去。`,
    endGoal: "产出一张清晰、锐利、适合正式演示的 16:9 PPT 页面图。",
    narrowing: "1. 文字必须清晰可读。\n2. 非必要不要出现 markdown 符号。\n3. 只参考模板风格，不得复用模板中的文字。\n4. 用适量装饰图形或插画填补空缺区域。",
  });
}

export function getTemplateGenerationPrompt(args: { requirements: string; language?: string }) {
  const language = args.language || "zh";
  const requirements = String(args.requirements || "").trim();
  const pageDesc =
    language === "en"
      ? buildRisenPrompt({
          role: "You are a PPT template background design agent.",
          instructions: "Generate one blank slide background image that will be used as a style reference later.",
          input: `User requirements:\n${requirements || "(none)"}`,
          steps: "1. Interpret the requested visual direction.\n2. Design a clean background for a 16:9 slide.\n3. Keep it reusable as a template reference.",
          endGoal: "Produce one text-free PPT template background image.",
          narrowing: "1. Do not include text, letters, or watermarks.\n2. Keep the slide clean and reusable.",
        })
      : buildRisenPrompt({
          role: "你是一名 PPT 模板背景设计智能体。",
          instructions: "生成一张空白幻灯片背景图，供后续整套 PPT 作为风格参考使用。",
          input: `用户需求：\n${requirements || "(none)"}`,
          steps: "1. 理解用户需要的视觉方向。\n2. 设计一张 16:9 比例的干净模板背景图。\n3. 保持它适合作为后续模板参考。",
          endGoal: "产出一张不含文字的 PPT 模板背景图。",
          narrowing: "1. 禁止出现任何文字、字母或水印。\n2. 保持页面干净、可复用。",
        });

  return getImageGenerationPrompt(pageDesc, "", "", false, "", language);
}
