import { cadQaAvailable } from "./cad-qa"

export async function GET() {
    return Response.json({
        accessCodeRequired: !!process.env.ACCESS_CODE_LIST,
        dailyRequestLimit: Number(process.env.DAILY_REQUEST_LIMIT) || 0,
        dailyTokenLimit: Number(process.env.DAILY_TOKEN_LIMIT) || 0,
        tpmLimit: Number(process.env.TPM_LIMIT) || 0,
        // Expose safe AI config for frontend defaults
        defaultProvider: process.env.AI_PROVIDER || "openai",
        defaultModel: process.env.AI_MODEL || "gpt-4o",
        defaultBaseUrl: process.env.AI_BASE_URL || "",
        cadRecognizer: !!process.env.RECOGNIZER_URL,
        // The delivery check (交付检查) runs the designer's qa in a headless Chrome / Edge on this server.
        cadQa: await cadQaAvailable(),
    })
}

