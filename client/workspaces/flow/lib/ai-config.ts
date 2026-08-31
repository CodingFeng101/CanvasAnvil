import { STORAGE_KEYS } from "@/workspaces/flow/storage"
import { DEFAULT_AI_CONFIG } from "@contracts/ai";
import { getAIConfig as getWorkspaceAIConfig } from "@/ai/storage";
import type { AIConfig } from "@contracts/ai"

/**
 * The Flow workspace sends its model settings to `/api/chat` alongside an
 * optional deployment access code. The model settings themselves are the
 * shared workspace config; only the access code is Flow-specific.
 */
export interface FlowRequestConfig {
    accessCode: string
    ai: AIConfig
}

export function getAIConfig(): FlowRequestConfig {
    if (typeof window === "undefined") {
        return { accessCode: "", ai: DEFAULT_AI_CONFIG }
    }
    return {
        accessCode: localStorage.getItem(STORAGE_KEYS.accessCode) || "",
        ai: getWorkspaceAIConfig(),
    }
}
