
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

  return `${filesXml}You are a helpful assistant that generates an outline for a ppt.

You can organize the content in two ways:

1. Simple format (for short PPTs without major sections):
[{"title": "title1", "points": ["point1", "point2"]}, {"title": "title2", "points": ["point1", "point2"]}]

2. Part-based format (for longer PPTs with major sections):
[
    {
    "part": "Part 1: Introduction",
    "pages": [
        {"title": "Welcome", "points": ["point1", "point2"]},
        {"title": "Overview", "points": ["point1", "point2"]}
    ]
    },
    {
    "part": "Part 2: Main Content",
    "pages": [
        {"title": "Topic 1", "points": ["point1", "point2"]},
        {"title": "Topic 2", "points": ["point1", "point2"]}
    ]
    }
]

Choose the format that best fits the content. Use parts when the PPT has clear major sections.

The user's request: ${ideaPrompt}. Now generate the outline as valid JSON only. Do not wrap in markdown code blocks. Do not include any other text.
${getLanguageInstruction(language)}
`;
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

  return `${filesXml}我们正在为PPT的每一页生成内容描述。
用户的原始需求是：\n${originalInput}\n
我们已经有了完整的大纲：\n${JSON.stringify(outline)}\n${partInfo}
现在请为第 ${pageIndex} 页生成描述：
${JSON.stringify(pageOutline)}

【重要提示】生成的"页面文字"部分会直接渲染到PPT页面上，因此请务必注意：
1. 文字内容要简洁精炼，每条要点控制在15-25字以内
2. 条理清晰，使用列表形式组织内容
3. 避免冗长的句子和复杂的表述
4. 确保内容可读性强，适合在演示时展示
5. 不要包含任何额外的说明性文字或注释

输出格式示例：
页面标题：原始社会：与自然共生

页面文字：
- 狩猎采集文明：人类活动规模小，对环境影响有限
- 依赖性强：生活完全依赖自然资源的直接供给
- 适应而非改造：通过观察学习自然，发展生存技能
- 影响特点：局部、短期、低强度，生态可自我恢复

其他页面素材（如果有请积极添加，包括markdown图片链接、公式、表格等）

【关于图片】如果参考文件中包含以 /files/ 开头的本地文件URL图片（例如 /files/mineru/xxx/image.png），请将这些图片以markdown格式输出，例如：![图片描述](/files/mineru/xxx/image.png)。这些图片会被包含在PPT页面中。

${getLanguageInstruction(language)}
`;
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
    materialImagesNote = `\n\n提示：除了模板参考图片（用于风格参考）外，还提供了额外的素材图片。这些素材图片是可供挑选和使用的元素，你可以从这些素材图片中选择合适的图片、图标、图表或其他视觉元素直接整合到生成的PPT页面中。请根据页面内容的需要，智能地选择和组合这些素材图片中的元素。`;
  }

  const extraReqText = extraRequirements ? `\n\n额外要求（请务必遵循）：\n${extraRequirements}\n` : "";

  return `你是一位专家级UI UX演示设计师，专注于生成设计良好的PPT页面。
当前PPT页面的页面描述如下:
<page_description>
${pageDesc}
</page_description>

<reference_information>
整个PPT的大纲为：
${outlineText}

当前位于章节：${currentSection}
</reference_information>


<design_guidelines>
- 要求文字清晰锐利, 画面为4K分辨率，16:9比例。
- 配色和设计语言和模板图片严格相似。
- 根据内容自动设计最完美的构图，不重不漏地渲染"页面描述"中的文本。
- 如非必要，禁止出现 markdown 格式符号（如 # 和 * 等）。
- 只参考风格设计，禁止出现模板中的文字。
- 使用大小恰当的装饰性图形或插画对空缺位置进行填补。
</design_guidelines>
${getPptLanguageInstruction(language)}
${materialImagesNote}${extraReqText}
`;
}
