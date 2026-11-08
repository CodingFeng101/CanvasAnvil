import { Agent, fetch as directFetch } from "undici"

// The recognizer is an internal service: never send it through the outbound HTTP proxy.
const direct = new Agent()

/** Forwards floorplan uploads (multipart, as-is) to the recognizer service (services/floorplan-recognizer). */
export async function POST(req: Request) {
    const base = process.env.RECOGNIZER_URL
    if (!base) return Response.json({ error: "Floorplan recognition is not configured (RECOGNIZER_URL)" }, { status: 501 })
    const type = req.headers.get("content-type") || ""
    if (!type.startsWith("multipart/form-data")) return Response.json({ error: "Expected multipart form data" }, { status: 400 })
    try {
        const upstream = await directFetch(new URL("/recognize", base), {
            method: "POST",
            headers: { "content-type": type },
            body: Buffer.from(await req.arrayBuffer()),
            dispatcher: direct,
            signal: AbortSignal.timeout(180000),
        })
        return new Response(await upstream.text(), {
            status: upstream.status,
            headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
        })
    } catch (error) {
        return Response.json({ error: `Recognizer unreachable: ${(error as Error).message}` }, { status: 502 })
    }
}
