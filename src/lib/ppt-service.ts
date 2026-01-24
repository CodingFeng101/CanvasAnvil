import PptxGenJS from "pptxgenjs"
import { PDFDocument } from "pdf-lib"
import { generateChatMessage, generateImage, type ChatMessage } from "./ai-client"

export interface PptPage {
    title: string;
    content: string[];
    description?: string;
    status?: string;
    id?: string;
}

export interface SlideEditRoutingItem {
    slideIndex: number;
    title?: string;
    instruction: string;
}

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
        Return ONLY a JSON array of objects with "title" (string) and "content" (array of strings, bullet points) and "description" (string, visual description for image generation).
        Example:
        [
            {"title": "Introduction", "content": ["Point 1", "Point 2"], "description": "A futuristic cityscape"},
            ...
        ]`;
        
        const response = await generateChatMessage([{ role: 'user', content: prompt }]);
        
        try {
            // Extract JSON
            const match = response.match(/\[[\s\S]*\]/);
            if (match) {
                return JSON.parse(match[0]);
            }
            return JSON.parse(response);
        } catch (e) {
            console.error("Failed to parse outline", e);
            throw new Error("Failed to parse AI response");
        }
    },

    generateSlidesFromDescription: async (description: string): Promise<PptPage[]> => {
        const prompt = `You are a presentation planner.
Given the following user description, create a complete slide plan (titles, bullets, and visual descriptions).

User description:
${description}

Return ONLY a JSON array of objects:
[
  {"title": "Slide title", "content": ["bullet 1", "bullet 2"], "description": "visual description for image generation"},
  ...
]
Rules:
- Prefer 6-10 slides unless the description implies otherwise.
- Bullets are short and specific (<= 12 words each).
- Descriptions are concrete: subject, composition, lighting, colors, style.
- Do not include markdown or extra text outside JSON.`;

        const response = await generateChatMessage([{ role: 'user', content: prompt }]);
        try {
            const match = response.match(/\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
            return JSON.parse(response);
        } catch (e) {
            console.error("Failed to parse slides from description", e);
            throw new Error("Failed to parse AI response");
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

        const prompt = `You are a presentation assistant.
Topic: ${topic}
Slide index: ${index + 1}
Slide title: ${page.title}
Current bullets: ${page.content.join(" | ")}
Current visual description: ${page.description || ""}

${refText ? `Reference:\n${refText}\n\n` : ""}Return ONLY valid JSON:
{
  "content": ["bullet1", "bullet2"],
  "description": "visual description for slide image generation"
}
Rules:
- Keep bullets short and specific (<= 12 words each).
- Make description precise: scene, objects, composition, style, colors.
`;

        const response = await generateChatMessage([{ role: "user", content: prompt }]);
        const match = response.match(/\{[\s\S]*\}/);
        if (!match) return page;

        try {
            const parsed = JSON.parse(match[0]);
            return {
                ...page,
                content: Array.isArray(parsed.content) ? parsed.content : page.content,
                description: typeof parsed.description === "string" ? parsed.description : page.description,
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
Rules:
- Avoid large paragraphs of text in the image.
- Prefer diagrammatic/illustrative composition matching the bullets.
`;
        
        return await generateImage({
            prompt,
            referenceImageUrl: templateImage
        });
    },

    editPageImage: async (page: PptPage, instruction: string, referenceImageUrl?: string, templateImageUrl?: string) => {
        const prompt = `Edit the slide image based on instruction.
Slide title: ${page.title}
Bullets: ${(page.content || []).join(" | ")}
Original visual description: ${page.description || ""}
Instruction: ${instruction}
Style: keep consistent with the template, professional, clean.
Rules:
- Keep layout readable.
- Do not add watermark.
`;

        const ref = referenceImageUrl || templateImageUrl;
        return await generateImage({
            prompt,
            referenceImageUrl: ref
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
