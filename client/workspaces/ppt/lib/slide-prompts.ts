import { buildRisenPrompt } from "./risen-prompt";

/**
 * The prompts that plan a deck and draw or edit one slide image.
 *
 * Kept free of the app (no network, no state) so the PPT skill bundles this
 * same file: a deck planned and drawn by the skill gets the website's wording,
 * and a change here reaches both after `node scripts/sync-ppt-skill.mjs`.
 */

export type SlidePromptPage = {
    id?: string;
    title: string;
    content?: string[];
    description?: string;
    note?: string;
    layout?: string;
};

export type PlanMode = "idea" | "outline";

/**
 * What the planner is told about the deck's template.
 *
 * The template is the only picture of the finished deck that exists at
 * planning time, and the plan's per-slide `description` is what drives image
 * generation later. Without seeing it the planner invents a look of its own --
 * "white minimal background", "flat vector" -- and that concrete prose then
 * outweighs the template reference at render time, so the deck ignores the
 * template it was built on. Handed the image, it describes scenes that
 * already belong to it.
 *
 * Style and colour tone only, though: a planner told to "match" the template
 * also copies its arrangement into every description, and the deck comes out
 * as one layout repeated. Each slide's layout is the planner's own call.
 */
const planTemplateStep = (hasTemplate: boolean) =>
    hasTemplate
        ? "3. Write a concrete visual description for each slide. The attached image is the deck's template, a style and colour-tone reference only: match its palette, colour tone, lighting, materials and art style so every slide looks like part of that deck, but design each slide's layout from its own content rather than copying the template's arrangement."
        : "3. Write a concrete visual description for each slide.";

const planTemplateRule = (hasTemplate: boolean) =>
    hasTemplate
        ? "\n5. description must stay inside the template image's colour scheme and art style, and must never describe a look that contradicts it.\n6. description must not reproduce the template's layout -- where its title, text blocks, cards or pictures sit; vary the layout to fit each slide's content."
        : "";

/** The user message that turns an idea (A1) or an outline (B1) into a whole-deck plan. */
export function buildPlanPrompt(args: {
    mode: PlanMode;
    input: string;
    uiLanguage: "zh" | "en";
    referenceText?: string;
    imageAssetText?: string;
    hasTemplate: boolean;
}): string {
    const { mode, input, uiLanguage, hasTemplate } = args;
    const refs = `reference_files_content:\n${args.referenceText || "(none)"}\n\nreference_image_assets:\n${args.imageAssetText || "(none)"}`;
    const bullets = "\n2. Write 4-6 specific bullets per slide.\n" + planTemplateStep(hasTemplate) + "\n4. Write a coherent speaker note paragraph for each slide.\n5. Assign materialLabels only when truly relevant.";
    const narrowing = "1. Return JSON only; markdown JSON block is allowed.\n2. Every slide must include id, title, content, description, layout, note, materialLabels.\n3. materialLabels must come only from reference_image_assets and can be [].\n4. All fields must follow ui_language; zh means Simplified Chinese." + planTemplateRule(hasTemplate);
    return mode === "idea"
        ? buildRisenPrompt({
            role: "You are PlanFromIdeaAgent for PPT planning.",
            instructions: "Generate a complete PptPlan from the idea prompt and return JSON only.",
            input: `idea_prompt: ${input}\nui_language: ${uiLanguage}\n\n${refs}`,
            steps: "1. Convert the idea into a coherent slide sequence." + bullets,
            endGoal: "Produce a complete render-ready PptPlan with stable slide ids and usable materialLabels.",
            narrowing,
        })
        : buildRisenPrompt({
            role: "You are PlanFromOutlineAgent for PPT planning.",
            instructions: "Generate a complete PptPlan from the outline and return JSON only.",
            input: `outline_text:\n${input}\n\nui_language: ${uiLanguage}\n\n${refs}`,
            steps: "1. Expand the outline into a coherent slide sequence." + bullets,
            endGoal: "Produce a complete render-ready PptPlan derived from the outline.",
            narrowing,
        });
}

/** The prompt that draws one slide from its plan entry, with the template and labelled materials as reference images. */
export function buildPageImagePrompt(args: {
    page: SlidePromptPage;
    uiLanguage: "zh" | "en";
    hasTemplate: boolean;
    materialLabels?: string[];
    extraRequirements?: string;
}): string {
    const { page, uiLanguage, hasTemplate, extraRequirements } = args;
    const labels = (args.materialLabels || []).filter(Boolean);
    const additionalLabelText = labels.length > 0 ? labels.map((label, i) => `${i + 1}. ${label}`).join("\n") : "(none)";
    return buildRisenPrompt({
        role: "You are a PPT slide image generation agent.",
        instructions: "Generate one modern, professional slide image in 16:9.",
        input: `Title: ${page.title}\nBullets: ${(page.content || []).join(" | ")}\nLanguage: ${uiLanguage}\nScene/subject: ${page.description || page.title}\nTemplate style reference: ${hasTemplate ? "provided as a reference image -- a STYLE and COLOUR-TONE reference only: it decides palette, colour tone, typography feel and mood, but NOT the layout" : "not provided -- take the style from the scene description"}\nUploaded material labels:\n${additionalLabelText}${extraRequirements ? `\n\nExtra requirements:\n${extraRequirements}` : ""}`,
        steps: "1. Design the slide composition from the title, bullets, and description -- the layout is decided by this slide's own content.\n2. Take palette, colour tone, typography feel, lighting, textures and decorative motifs from the template reference image, not from the scene description.\n3. Do not take the layout from the template: where its title sits, how its text blocks, cards, columns or pictures are arranged, and how many there are all stay with the template. Lay this slide out fresh.\n4. Use referenced material images only when required or clearly helpful.\n5. Preserve the identity and aspect ratio of referenced material images.",
        endGoal: "Produce one sharp, readable, presentation-ready slide image with accurate content coverage.",
        narrowing: "1. Avoid large paragraphs of text.\n2. Prefer diagrammatic or illustrative composition that matches the bullets.\n3. When a template is provided and the scene description names a colour, background or art style that disagrees with it, follow the template and keep only the description's subject and composition.\n4. When a template is provided, the slide must not reproduce the template's layout, element placement or text; only its style and colour tone carry over.\n5. If the description contains {{image:Name}}, you must use the material image whose label is Name.\n6. Do not redraw, restyle, recolor, or replace referenced material images.\n7. Do not add watermarks.",
    });
}

/** The prompt that edits a slide image in place, the current image being the base. */
export function buildEditPagePrompt(args: {
    page: SlidePromptPage;
    instruction: string;
    hasTemplate: boolean;
    hasAdditional: boolean;
}): string {
    const { page, instruction, hasTemplate, hasAdditional } = args;
    return buildRisenPrompt({
        role: "You are a slide image editing agent.",
        instructions: "Edit the current slide image as the base image rather than regenerating from scratch.",
        input: `Slide title: ${page.title}\nBullets: ${(page.content || []).join(" | ")}\nOriginal visual description: ${page.description || ""}\nInstruction: ${instruction}\nTemplate/style reference: ${hasTemplate ? "provided -- a style and colour-tone reference only: it decides palette, colour tone, typography feel and mood, never the layout" : "not provided"}\nAdditional references: ${hasAdditional ? "provided" : "none"}`,
        steps: "1. Start from the current slide image.\n2. Apply the requested visual edit.\n3. Keep the overall visual style and colour tone consistent with the template, which outranks any style named in the description.\n4. Take the layout from the current slide (or from the instruction), never from the template.\n5. Preserve readability.",
        endGoal: "Produce one edited 16:9 slide image that reflects the instruction while staying visually consistent.",
        narrowing: "1. Treat the current slide image as the base image.\n2. Keep layout readable.\n3. Do not add a watermark.",
    });
}

/**
 * The line added to a routed edit when other slides' (or outside) images are given as style references.
 * `mapping` lists each reference's label and source, in the order the images are sent.
 */
export function buildStyleReferenceInstruction(
    uiLanguage: "zh" | "en",
    policy: "style_only" | "style_and_layout",
    mapping: Array<{ label: string; source: string }>,
): string {
    if (mapping.length === 0) return "";
    const text = mapping.map((x, i) => `${i + 1}. ${x.label} => ${x.source}`).join("\n");
    if (policy === "style_and_layout") {
        return uiLanguage === "zh"
            ? `参考映射如下（标签 => 来源）:\n${text}\n可参考其风格和版式，但不要复制其中的文字内容。`
            : `Style reference mapping (label => source):\n${text}\nYou may follow both style and layout, but must not copy their text content.`;
    }
    return uiLanguage === "zh"
        ? `参考映射如下（标签 => 来源）:\n${text}\n仅参考风格，不要复制其版式和文字内容。`
        : `Style reference mapping (label => source):\n${text}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`;
}

/** The line added to a routed edit when the user attached pictures in chat: they go into the slide unchanged. */
export function buildChatImagesInstruction(uiLanguage: "zh" | "en", labels: string[]): string {
    if (labels.length === 0) return "";
    return uiLanguage === "zh"
        ? `用户在对话中上传了这些参考图：${labels.join("、")}。请把它们放进画面并保持原貌，不要重画、改色或替换。`
        : `The user attached these reference images in chat: ${labels.join(", ")}. Place them in the slide as they are; do not redraw, recolour or replace them.`;
}
