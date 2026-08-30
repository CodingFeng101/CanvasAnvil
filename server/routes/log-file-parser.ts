import { z } from "zod"

const parserLogSchema = z.object({
    workspace: z.string().min(1).max(50),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().max(200).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    parserSource: z.enum([
        "third_party",
        "local",
        "third_party_fallback_local",
    ]),
    detail: z.string().max(500).optional(),
})

export async function POST(req: Request) {
    let data: z.infer<typeof parserLogSchema>
    try {
        data = parserLogSchema.parse(await req.json())
    } catch {
        return Response.json(
            { success: false, error: "Invalid input" },
            { status: 400 },
        )
    }

    const ts = new Date().toISOString()
    console.log(
        `[file-parser] ts=${ts} workspace=${data.workspace} parser=${data.parserSource} file="${data.fileName}" mime="${data.mimeType || ""}" size=${data.fileSize || 0} detail="${data.detail || ""}"`,
    )
    return Response.json({ success: true })
}

