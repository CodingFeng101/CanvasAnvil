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
            aiImageProvider: "openai",
            aiImageBaseUrl: "",
            aiImageApiKey: "",
        }
    }

    const topConfig = getWorkspaceAIConfig()
    const topApiKey = String(topConfig.textApiKey || topConfig.apiKey || "").trim()
    const topBaseUrl = String(topConfig.textBaseUrl || topConfig.baseUrl || "").trim()
    const topChatModel = String(topConfig.textModel || topConfig.chatModel || "").trim()
    const topImageModel = String(topConfig.imageModel || topConfig.imageModelLegacy || "").trim()
    const topImageApiKey = String(topConfig.imageApiKey || topConfig.apiKey || "").trim()
    const topImageBaseUrl = String(topConfig.imageBaseUrl || topConfig.baseUrl || "").trim()

    return {
        accessCode: localStorage.getItem(STORAGE_KEYS.accessCode) || "",
        aiProvider: String(topConfig.textProvider || "openai"),
        aiBaseUrl: topBaseUrl,
        aiApiKey: topApiKey,
        aiModel: topChatModel,
        aiImageModel: topImageModel,
        aiImageProvider: String(topConfig.imageProvider || "openai"),
        aiImageBaseUrl: topImageBaseUrl,
        aiImageApiKey: topImageApiKey,
    }
}
