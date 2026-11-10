import { z } from "zod"
import { extractMineruAssets, MINERU_DEFAULT_BASE } from "./mineru"

const requestSchema = z.object({
    fileName: z.string().min(1).max(255),
    fileType: z.string().max(200).optional(),
    fileBase64: z.string().min(1),
    apiToken: z.string().min(1),
    apiBase: z.string().url().optional(),
    maxAssets: z.number().int().positive().max(50).optional(),
    maxWaitMs: z.number().int().positive().max(300000).optional(),
})

export async function POST(req: Request) {
    let data: z.infer<typeof requestSchema>
    try {
        data = requestSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    try {
        const assets = await extractMineruAssets({
            fileName: data.fileName,
            bytes: Buffer.from(data.fileBase64, "base64"),
            apiToken: data.apiToken,
            apiBase: data.apiBase || MINERU_DEFAULT_BASE,
            maxAssets: data.maxAssets,
            maxWaitMs: data.maxWaitMs,
        })
        return Response.json({
            success: true,
            assets: assets.map((asset) => ({
                dataUrl: `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString("base64")}`,
                textHint: asset.textHint,
            })),
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error"
        console.error("[third-party-parser] failed:", msg)
        return Response.json(
            { success: false, error: msg },
            { status: 500 },
        )
    }
}
