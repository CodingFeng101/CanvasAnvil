import { STORAGE_KEYS } from "./storage"
import { getAIConfig as getWorkspaceAIConfig } from "@/lib/ai-client"

/**
 * Get AI configuration from localStorage.
 * Returns API keys and settings for custom AI providers.
 * Uses top-bar workspace settings as the primary source.
 */
export function getAIConfig() {
    if (typeof window === "undefined") {
        return {
            accessCode: "",
            aiProvider: "openai",
            aiBaseUrl: "",
            aiApiKey: "",
            aiModel: "",
            aiImageModel: "",
        }
    }

    const topConfig = getWorkspaceAIConfig()
    const topApiKey = String(topConfig.apiKey || "").trim()
    const topBaseUrl = String(topConfig.baseUrl || "").trim()
    const topChatModel = String(topConfig.chatModel || "").trim()
    const topImageModel = String(topConfig.imageModel || "").trim()

    return {
        accessCode: localStorage.getItem(STORAGE_KEYS.accessCode) || "",
        aiProvider: "openai",
        aiBaseUrl: topBaseUrl,
        aiApiKey: topApiKey,
        aiModel: topChatModel,
        aiImageModel: topImageModel,
    }
}
