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
    status?: string;
    id?: string;
}

export interface SlideEditRoutingItem {
    slideIndex: number;
    title?: string;
    instruction: string;
}

const PPT_OUTLINE_SYSTEM = String(pptOutlineSystem || "").trim() || `You are a presentation outline generator.
Return ONLY JSON. Do not wrap in markdown code blocks. Do not include any extra text.`;

const PPT_SLIDES_GENERATE_SYSTEM = String(pptSlidesGenerateSystem || "").trim() || `You are a presentation slide planning agent.
Return ONLY JSON. Do not include any extra text.`;

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
    // 1. Generate Outline
    generateOutline: async (topic: string): Promise<PptPage[]> => {
        const prompt = `Create a presentation outline for the topic: "${topic}".
Return JSON (no extra text). Markdown code block is allowed.
Return either:
- a JSON array of slide objects, OR
- an object with a "slides" array.

Each slide object:
{ "title": "Slide title", "content": ["bullet 1", "bullet 2"], "description": "visual description for image generation", "note": "speaker notes (optional)", "layout": "layout hint (optional)" }

Rules:
- Prefer 6-10 slides unless the topic requires otherwise.
- Each bullet <= 12 words.
- description must be concrete (subject, composition, lighting, colors, style).`;

        const response = await generateChatMessage([
            { role: "system", content: PPT_OUTLINE_SYSTEM },
            { role: "user", content: prompt }
        ], undefined, { timeoutMs: 120000 });

        try {
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed);
            if (pages.length === 0) throw new Error("No outline parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse outline", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
    },

    generateSlidesFromDescription: async (description: string): Promise<PptPage[]> => {
        const prompt = `Given the following user description, create a complete slide plan (titles, bullets, and visual descriptions).

User description:
${description}

Return JSON (no extra text). Markdown code block is allowed.
Return either:
- a JSON array of slide objects, OR
- an object with a "slides" array.

Each slide object:
{ "title": "Slide title", "content": ["bullet 1", "bullet 2"], "description": "visual description for image generation", "note": "speaker notes (optional)", "layout": "layout hint (optional)" }

Rules:
- Prefer 6-10 slides unless the description implies otherwise.
- Bullets are short and specific (<= 12 words each).
- Descriptions are concrete: subject, composition, lighting, colors, style.
`;

        try {
            const response = await generateChatMessage([
                { role: "system", content: PPT_OUTLINE_SYSTEM },
                { role: "user", content: prompt }
            ], undefined, { timeoutMs: 120000 });
            const parsed = parseJsonLoose(response);
            const pages = normalizePages(parsed);
            if (pages.length === 0) throw new Error("No slides parsed from AI response");
            return pages;
        } catch (e) {
            console.error("Failed to parse slides from description", e);
            throw e instanceof Error ? e : new Error("Failed to parse AI response");
        }
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
    generatePageImage: async (page: PptPage, allPages: PptPage[], templateImage?: string): Promise<string> => {
        const prompt = `Design a presentation slide image.
Title: ${page.title}
Bullets: ${(page.content || []).join(" | ")}
Visual style: modern, professional, clean layout, high contrast, no watermarks.
Scene/subject: ${page.description || page.title}
Format: Landscape 16:9 aspect ratio.
Rules:
- Avoid large paragraphs of text in the image.
- Prefer diagrammatic/illustrative composition matching the bullets.
`;
        
        return await generateImage({
            prompt,
            referenceImageUrl: templateImage
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

    routeSlideEdits: async (slides: Array<{ title: string; bullets: string[] }>, feedback: string): Promise<SlideEditRoutingItem[]> => {
        const slideList = slides
            .map((s, i) => `${i + 1}. ${s.title} :: ${(s.bullets || []).join(" | ")}`)
            .join("\n");

        const prompt = `You are a routing agent for slide edits.
Slides:
${slideList}

User feedback:
${feedback}

Return ONLY JSON array, each item:
{
  "slideIndex": number, // 0-based
  "instruction": string
}
Rules:
- If feedback mentions multiple slides, split into multiple items.
- If you are unsure, assign to the most relevant slide.
- Do not invent new slides.
`;

        const response = await generateChatMessage([{ role: "user", content: prompt }]);
        const match = response.match(/\[[\s\S]*\]/);
        if (!match) return [];
        try {
            const parsed = JSON.parse(match[0]);
            if (!Array.isArray(parsed)) return [];
            return parsed
                .map((it: any) => ({
                    slideIndex: Number(it.slideIndex),
                    instruction: String(it.instruction || ""),
                }))
                .filter((it: SlideEditRoutingItem) => Number.isFinite(it.slideIndex) && it.instruction.trim().length > 0);
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
