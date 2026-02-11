import PptxGenJS from "pptxgenjs"
import { PDFDocument } from "pdf-lib"
import { generateChatMessage, generateImage } from "./ai-client"
import pptOutlineSystem from "../../agent/ppt/outline.md?raw"
import pptSlidesGenerateSystem from "../../agent/ppt/slides-generate.md?raw"

export interface PptPage {
    title: string;
    content: string[];
    description?: string;
    note?: string;
    layout?: string;
    materialLabels?: string[];
    status?: string;
    id?: string;
}

export interface SlideEditRoutingItem {
    slideId: string;
    kind: "content" | "visual" | "both";
    instruction: string;
}

type ReferenceFileInput = { filename: string; content: string };
type ReferenceImageAssetInput = { label: string; caption: string; sourceFile: string; sourcePage?: number };

const PPT_OUTLINE_SYSTEM = String(pptOutlineSystem || "").trim() || `You are a presentation outline generator.
Return ONLY JSON. Do not wrap in markdown code blocks. Do not include any extra text.`;

const PPT_SLIDES_GENERATE_SYSTEM = String(pptSlidesGenerateSystem || "").trim() || `You are a presentation slide planning agent.
Return ONLY JSON. Do not include any extra text.`;

const formatReferenceFiles = (referenceFiles?: ReferenceFileInput[]) => {
    if (!Array.isArray(referenceFiles) || referenceFiles.length === 0) return "";
    return referenceFiles
        .slice(0, 5)
        .map((f, i) => `Reference ${i + 1}: ${f.filename}\n${String(f.content || "").slice(0, 4000)}`)
        .join("\n\n");
};

const formatReferenceImageAssets = (assets?: ReferenceImageAssetInput[]) => {
    if (!Array.isArray(assets) || assets.length === 0) return "";
    return assets
        .slice(0, 30)
        .map((a) => {
            const pageText = typeof a.sourcePage === "number" ? `, page=${a.sourcePage}` : "";
            return `- ${a.label}: ${a.caption} (source=${a.sourceFile}${pageText})`;
        })
        .join("\n");
};

const parseJsonLoose = (text: string) => {
    const raw = String(text || "").trim();
    if (!raw) throw new Error("Empty AI response");

    const tryParse = (s: string) => {
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    };

    const direct = tryParse(raw);
    if (direct) return direct;

    const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
        const inner = String(jsonBlock[1]).trim();
        const parsed = tryParse(inner);
        if (parsed) return parsed;
    }

    const findBalanced = (openChar: "[" | "{", closeChar: "]" | "}") => {
        const start = raw.indexOf(openChar);
        if (start < 0) return null;
        let depth = 0;
        for (let i = start; i < raw.length; i += 1) {
            const ch = raw[i];
            if (ch === openChar) depth += 1;
            if (ch === closeChar) depth -= 1;
            if (depth === 0) {
                const candidate = raw.slice(start, i + 1);
                const parsed = tryParse(candidate);
                if (parsed) return parsed;
                return null;
            }
        }
        return null;
    };

    const arr = findBalanced("[", "]");
    if (arr) return arr;
    const obj = findBalanced("{", "}");
    if (obj) return obj;

    throw new Error("Failed to parse AI JSON");
};

const normalizePages = (value: any): PptPage[] => {
    const asArray = Array.isArray(value) ? value : Array.isArray(value?.slides) ? value.slides : null;
    if (!asArray) return [];
    return asArray
        .map((p: any) => ({
            title: typeof p?.title === "string" ? p.title : "",
            content: Array.isArray(p?.content) ? p.content.map((x: any) => String(x)) : Array.isArray(p?.bullets) ? p.bullets.map((x: any) => String(x)) : [],
            description: typeof p?.description === "string" ? p.description : "",
            note: typeof p?.note === "string" ? p.note : undefined,
            layout: typeof p?.layout === "string" ? p.layout : undefined,
            materialLabels: Array.isArray(p?.materialLabels)
                ? p.materialLabels.map((x: any) => String(x)).filter(Boolean)
                : Array.isArray(p?.material_labels)
                    ? p.material_labels.map((x: any) => String(x)).filter(Boolean)
                    : [],
        }))
        .filter((p: PptPage) => p.title.trim().length > 0);
};

const urlToDataUri = async (url: string): Promise<string> => {
    if (!url) return "";
    if (url.startsWith("data:")) return url;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/png";
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return `data:${contentType};base64,${base64}`;
};

const downloadBlob = (data: Uint8Array | ArrayBuffer, mime: string, filename: string) => {
    const blob = new Blob([data], { type: mime });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
};

export const pptService = {
    // A1. PlanFromIdeaAgent
    generateOutline: async (
        topic: string,
        uiLanguage: "zh" | "en" = "zh",
        referenceFiles?: ReferenceFileInput[],
        referenceImageAssets?: ReferenceImageAssetInput[]
    ): Promise<PptPage[]> => {
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = `PlanFromIdeaAgent
required:
- idea_prompt: ${topic}
- ui_language: ${uiLanguage}
optional:
- reference_files_content:
${refText || "(none)"}
- reference_image_assets:
${imageAssetText || "(none)"}

Generate a complete PptPlan.
Return JSON only (markdown json block allowed).
Every slide must include:
- id
- title
- content (array of detailed bullets)
- description
- layout
- note
- materialLabels (array of labels selected from reference_image_assets, max 3; no label not in assets list)
Rules for materialLabels:
- Only assign when truly relevant to this slide.
- It is valid to return [] for slides that do not need material images.
Quality requirements:
- Each slide content should have 4-6 bullets.
- Each bullet should be specific and informative, not generic placeholders.
- description should clearly explain visual hierarchy and key visual elements (including placement hints when useful).
- note should include practical speaking guidance (2-4 concise points).
`;

        const response = await generateChatMessage([
            { role: "system", content: PPT_OUTLINE_SYSTEM },
            { role: "user", content: prompt }
        ], undefined, { timeoutMs: 120000 });

        try {
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed).map((p, i) => ({
                ...p,
                id: p.id || `slide-${i + 1}`,
                note: typeof p.note === "string" ? p.note : "",
                layout: typeof p.layout === "string" ? p.layout : "",
                description: typeof p.description === "string" ? p.description : "",
            }));
            if (pages.length === 0) throw new Error("No outline parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse outline", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
    },

    // B1. PlanFromOutlineAgent
    generatePlanFromOutline: async (
        outlineText: string,
        uiLanguage: "zh" | "en" = "zh",
        referenceFiles?: ReferenceFileInput[],
        referenceImageAssets?: ReferenceImageAssetInput[]
    ): Promise<PptPage[]> => {
        const refText = formatReferenceFiles(referenceFiles);
        const imageAssetText = formatReferenceImageAssets(referenceImageAssets);
        const prompt = `PlanFromOutlineAgent
required:
- outline_text:
${outlineText}
- ui_language: ${uiLanguage}
optional:
- reference_files_content:
${refText || "(none)"}
- reference_image_assets:
${imageAssetText || "(none)"}

Generate a complete PptPlan from this outline.
Return JSON only (markdown json block allowed).
Every slide must include:
- id
- title
- content
- description
- layout
- note
- materialLabels (array of labels selected from reference_image_assets, max 3; no label not in assets list)
Rules for materialLabels:
- Only assign when truly relevant to this slide.
- It is valid to return [] for slides that do not need material images.
Quality requirements:
- Each slide content should have 4-6 bullets.
- Each bullet should be specific and informative, not generic placeholders.
- description should clearly explain visual hierarchy and key visual elements (including placement hints when useful).
- note should include practical speaking guidance (2-4 concise points).
`;
        const response = await generateChatMessage([
            { role: "system", content: PPT_OUTLINE_SYSTEM },
            { role: "user", content: prompt }
        ], undefined, { timeoutMs: 120000 });
        try {
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed).map((p, i) => ({
                ...p,
                id: p.id || `slide-${i + 1}`,
                note: typeof p.note === "string" ? p.note : "",
                layout: typeof p.layout === "string" ? p.layout : "",
                description: typeof p.description === "string" ? p.description : "",
            }));
            if (pages.length === 0) throw new Error("No plan parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse plan from outline", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
    },

    // Backward-compatible alias used by legacy workspace path.
    generateSlidesFromDescription: async (description: string): Promise<PptPage[]> => {
        return await pptService.generateOutline(description, "zh");
    },

    // 2. Generate Description (Refinement)
    generatePageDescription: async (pages: PptPage[], index: number, topic: string, referenceFiles: any[]): Promise<PptPage> => {
        const page = pages[index];
        const refText = Array.isArray(referenceFiles) && referenceFiles.length > 0
            ? referenceFiles
                .slice(0, 3)
                .map((f: any) => `- ${f.filename || f.name || "ref"}:\n${String(f.content || "").slice(0, 2000)}`)
                .join("\n\n")
            : "";

        const currentSlideJson = JSON.stringify(
            {
                id: page.id || `slide-${index + 1}`,
                title: page.title,
                content: page.content,
                description: page.description || "",
                note: page.note || "",
                layout: page.layout || "",
            },
            null,
            2
        );

        const prompt = `Topic: ${topic}
Slide index: ${index + 1}

Current slide:
${currentSlideJson}

${refText ? `Reference:\n${refText}\n\n` : ""}Task:
- Improve bullets (<= 12 words each), and refine description for image generation.
- Optionally add speaker note and layout hint if helpful.
- Keep id stable.

Return JSON only (no extra text).`;

        const response = await generateChatMessage(
            [
                { role: "system", content: PPT_SLIDES_GENERATE_SYSTEM },
                { role: "user", content: prompt },
            ],
            undefined,
            { timeoutMs: 120000 }
        );

        try {
            const parsed = parseJsonLoose(response);
            const asSlides = Array.isArray(parsed?.slides) ? parsed.slides : Array.isArray(parsed) ? parsed : null;
            const first = Array.isArray(asSlides) && asSlides.length > 0 ? asSlides[0] : null;
            if (!first || typeof first !== "object") return page;
            return {
                ...page,
                title: typeof first.title === "string" ? first.title : page.title,
                content: Array.isArray(first.content) ? first.content.map((x: any) => String(x)) : page.content,
                description: typeof first.description === "string" ? first.description : page.description,
                note: typeof first.note === "string" ? first.note : page.note,
                layout: typeof first.layout === "string" ? first.layout : page.layout,
            };
        } catch {
            return page;
        }
    },

    // 3. Generate Image
    generatePageImage: async (
        page: PptPage,
        uiLanguageOrAllPages: "zh" | "en" | PptPage[],
        templateImageUrl?: string,
        additionalImagesOrMaterialUrls?: Array<{ url: string; label?: string }> | string[],
        extraRequirements?: string,
    ): Promise<string> => {
        const uiLanguage: "zh" | "en" = Array.isArray(uiLanguageOrAllPages) ? "zh" : uiLanguageOrAllPages;
        const normalizedAdditional: Array<{ url: string; label?: string }> = Array.isArray(additionalImagesOrMaterialUrls)
            ? (additionalImagesOrMaterialUrls as any[]).map((x, i) =>
                typeof x === "string" ? { url: x, label: `MATERIAL_${i + 1}` } : { url: String(x?.url || ""), label: x?.label }
            ).filter((x) => x.url)
            : [];
        const additionalLabelText = normalizedAdditional.length > 0
            ? normalizedAdditional
                .map((x, i) => `${i + 1}. ${x.label || `MATERIAL_${i + 1}`}`)
                .join("\n")
            : "(none)";
        const prompt = `Design a presentation slide image.
Title: ${page.title}
Bullets: ${(page.content || []).join(" | ")}
Language: ${uiLanguage}
Visual style: modern, professional, clean layout, high contrast, no watermarks.
Scene/subject: ${page.description || page.title}
Format: Landscape 16:9 aspect ratio.
Rules:
- MUST follow the template reference image style consistently for this slide.
- Avoid large paragraphs of text in the image.
- Prefer diagrammatic/illustrative composition matching the bullets.
- Uploaded material labels and order (matches additional reference images order exactly):
${additionalLabelText}
- If slide description contains token {{image:Name}}, you MUST use the material image whose label is Name.
- Preserve referenced material image identity exactly: do not redraw, restyle, recolor, or replace with similar content.
- Keep referenced material aspect ratio and key details intact; avoid cropping away chart/table/flow core content.
- Follow position instructions in Scene/subject when placing referenced materials (left/right/top/bottom/center/background).
- If no token is present for a material label, do not force that material into the slide.
${extraRequirements ? `- Extra requirements: ${extraRequirements}` : ""}
`;
        const additionalReferenceImageUrls = Array.isArray(normalizedAdditional)
            ? normalizedAdditional.map((x) => String(x?.url || "")).filter(Boolean)
            : [];

        return await generateImage({
            prompt,
            referenceImageUrl: templateImageUrl,
            additionalReferenceImageUrls,
        });
    },

    editPageImage: async (page: PptPage, instruction: string, referenceImageUrl?: string, templateImageUrl?: string, additionalImages?: string[]) => {
        const prompt = `Edit the slide image based on instruction.
You will be given the current slide image as the primary reference image. Treat it as the base image and modify it, not regenerate from scratch.
If additional reference images are provided, they may include the template/style reference and user-provided assets. Keep the overall visual style consistent with the template.
Slide title: ${page.title}
Bullets: ${(page.content || []).join(" | ")}
Original visual description: ${page.description || ""}
Instruction: ${instruction}
Style: keep consistent with the template, professional, clean.
Format: Landscape 16:9 aspect ratio.
Rules:
- Keep layout readable.
- Do not add watermark.
`;

        const ref = referenceImageUrl || templateImageUrl;
        const additionalReferenceImageUrls = Array.isArray(additionalImages) ? [...additionalImages] : [];
        if (referenceImageUrl && templateImageUrl && templateImageUrl !== referenceImageUrl) {
            additionalReferenceImageUrls.push(templateImageUrl);
        }
        return await generateImage({
            prompt,
            referenceImageUrl: ref,
            additionalReferenceImageUrls
        });
    },

    routeSlideEdits: async (slides: Array<{ id: string; title: string; bullets: string[]; description?: string; layout?: string; note?: string }>, feedback: string): Promise<SlideEditRoutingItem[]> => {
        const slideList = slides
            .map((s, i) => `${i + 1}. id=${s.id}; title=${s.title}; bullets=${(s.bullets || []).join(" | ")}; description=${s.description || ""}; layout=${s.layout || ""}; note=${s.note || ""}`)
            .join("\n");

        const prompt = `You are a routing agent for slide edits.
Slides:
${slideList}

User feedback:
${feedback}

Return ONLY JSON array, each item:
{ "slideId": "slide-2", "kind": "content|visual|both", "instruction": "..." }
Rules:
- If feedback mentions multiple slides, split into multiple items.
- If you are unsure, assign to the most relevant slide.
- Do not invent new slides.
`;

        const response = await generateChatMessage([
            { role: "system", content: PPT_SLIDES_GENERATE_SYSTEM },
            { role: "user", content: prompt }
        ]);
        const match = response.match(/\[[\s\S]*\]/);
        if (!match) return [];
        try {
            const parsed = JSON.parse(match[0]);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((it: any) => ({
                    slideId: String(it.slideId || ""),
                    kind: it.kind === "content" || it.kind === "visual" || it.kind === "both" ? it.kind : "both",
                    instruction: String(it.instruction || ""),
                }))
                .filter((it: SlideEditRoutingItem) => it.slideId.trim().length > 0 && it.instruction.trim().length > 0);
        } catch {
            return [];
        }
    },

    exportPptx: async (pages: PptPage[], images: Record<string, string>, filename: string) => {
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";

        const slideW = 13.33;
        const slideH = 7.5;

        for (const page of pages) {
            const slide = pptx.addSlide();
            const img = page.id ? images[page.id] : undefined;
            if (img) {
                const dataUri = await urlToDataUri(img);
                slide.addImage({
                    data: dataUri,
                    x: 0,
                    y: 0,
                    w: slideW,
                    h: slideH,
                });
            } else {
                slide.addText(page.title || "", {
                    x: 0.6,
                    y: 0.6,
                    w: slideW - 1.2,
                    h: 1.0,
                    fontSize: 28,
                    bold: true,
                    color: "111827",
                });
            }
        }

        await pptx.writeFile({ fileName: `${filename}.pptx` });
    },

    exportPdf: async (pages: PptPage[], images: Record<string, string>, filename: string) => {
        const pdfDoc = await PDFDocument.create();
        const pageWidth = 960;
        const pageHeight = 540;

        for (const page of pages) {
            const img = page.id ? images[page.id] : undefined;
            const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

            if (!img) continue;
            const dataUri = await urlToDataUri(img);
            const base64 = dataUri.split(",")[1] || "";
            const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

            if (dataUri.startsWith("data:image/jpeg") || dataUri.startsWith("data:image/jpg")) {
                const embedded = await pdfDoc.embedJpg(bytes);
                pdfPage.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
            } else {
                const embedded = await pdfDoc.embedPng(bytes);
                pdfPage.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
            }
        }

        const pdfBytes = await pdfDoc.save();
        downloadBlob(pdfBytes, "application/pdf", `${filename}.pdf`);
    }
};
