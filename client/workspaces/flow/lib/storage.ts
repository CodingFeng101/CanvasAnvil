/**
 * Every localStorage key the Flow workspace uses.
 *
 * The names keep their original "next-ai-draw-io-" prefix from before this
 * workspace was folded into CanvasAnvil: renaming one would orphan whatever a
 * user had saved under it.
 */

export const STORAGE_KEYS = {
    // Chat data
    messages: "next-ai-draw-io-messages",
    xmlSnapshots: "next-ai-draw-io-xml-snapshots",
    diagramXml: "next-ai-draw-io-diagram-xml",
    sessionId: "next-ai-draw-io-session-id",

    // Quota tracking
    requestCount: "next-ai-draw-io-request-count",
    requestDate: "next-ai-draw-io-request-date",
    tokenCount: "next-ai-draw-io-token-count",
    tokenDate: "next-ai-draw-io-token-date",
    tpmCount: "next-ai-draw-io-tpm-count",
    tpmMinute: "next-ai-draw-io-tpm-minute",

    // Settings
    globalConstraints: "next-ai-draw-io-global-constraints",
    accessCode: "next-ai-draw-io-access-code",
    closeProtection: "next-ai-draw-io-close-protection",
    accessCodeRequired: "next-ai-draw-io-access-code-required",
    aiProvider: "next-ai-draw-io-ai-provider",
    aiBaseUrl: "next-ai-draw-io-ai-base-url",
    aiApiKey: "next-ai-draw-io-ai-api-key",
    aiModel: "next-ai-draw-io-ai-model",
} as const

