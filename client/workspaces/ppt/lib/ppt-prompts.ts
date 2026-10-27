
import { buildRisenPrompt } from "./risen-prompt";

const LANGUAGE_CONFIG: Record<string, { instruction: string; ppt_text: string }> = {
  zh: {
    instruction: '请使用全中文输出。',
    ppt_text: 'PPT文字请使用全中文。'
  },
  en: {
    instruction: 'Please output all in English.',
    ppt_text: 'Use English for PPT text.'
  }
};

function getPptLanguageInstruction(language: string = 'zh') {
  return LANGUAGE_CONFIG[language]?.ppt_text || '';
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
        ? `\n\nNote: In addition to the template reference image (for style and colour tone only, not layout), extra material images are provided. You may select and integrate suitable images/icons/charts/visual elements from them to enrich the slide, based on the content needs.`
        : `\n\n提示：除了模板参考图片（只用于参考风格与色调，不参考版式）外，还提供了额外的素材图片。这些素材图片是可供挑选和使用的元素，你可以从这些素材图片中选择合适的图片、图标、图表或其他视觉元素直接整合到生成的PPT页面中。请根据页面内容的需要，智能地选择和组合这些素材图片中的元素。`;
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
      steps: `1. Read the page description and outline context.\n2. Build the strongest slide composition for the content.\n3. Follow the template reference image's style and colour tone closely, but not its layout: arrange this slide from its own content.\n4. If material images are provided, integrate only the useful ones.`,
      endGoal: "Produce one sharp, presentation-ready 16:9 slide image that renders the described content accurately.",
      narrowing: "1. Keep text crisp and readable.\n2. Avoid markdown symbols unless strictly required.\n3. Use the template for style and colour tone only; do not copy its layout or its text.\n4. Fill empty regions with suitable decorative shapes or illustrations.",
    });
  }

  return buildRisenPrompt({
    role: "你是一名专家级 PPT 视觉设计智能体。",
    instructions: `生成一张完成度很高的 PPT 页面图。${getPptLanguageInstruction(language)}${materialImagesNote}${extraReqText}`.trim(),
    input: `页面描述：\n${pageDesc}\n\n整体大纲：\n${outlineText || "(none)"}\n\n当前章节：${currentSection || "(none)"}`,
    steps: `1. 阅读页面描述和整套 PPT 上下文。\n2. 自动组织最佳构图与视觉层级。\n3. 严格参考模板图片的风格与色调，版式不要参考模板，按本页内容重新排布。\n4. 如果提供了素材图，只在确实有帮助时整合进去。`,
    endGoal: "产出一张清晰、锐利、适合正式演示的 16:9 PPT 页面图。",
    narrowing: "1. 文字必须清晰可读。\n2. 非必要不要出现 markdown 符号。\n3. 只参考模板的风格与色调，不得照搬模板的版式，也不得复用模板中的文字。\n4. 用适量装饰图形或插画填补空缺区域。",
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
