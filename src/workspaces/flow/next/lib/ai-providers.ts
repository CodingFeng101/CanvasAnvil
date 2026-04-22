import { createOpenAI } from "@ai-sdk/openai"

export type ProviderName =
    | "bedrock"
    | "openai"
    | "anthropic"
    | "google"
    | "azure"
    | "ollama"
    | "openrouter"
    | "deepseek"
    | "siliconflow"

interface ModelConfig {
    model: any
    providerOptions?: any
    headers?: Record<string, string>
    modelId: string
}

export interface ClientOverrides {
    provider?: string | null
    baseUrl?: string | null
    apiKey?: string | null
    modelId?: string | null
}

// Providers that can be used with client-provided API keys
const _ALLOWED_CLIENT_PROVIDERS: ProviderName[] = [
    "openai",
    "anthropic",
    "google",
    "azure",
    "openrouter",
    "deepseek",
    "siliconflow",
]

// Bedrock provider options for Anthropic beta features
const _BEDROCK_ANTHROPIC_BETA = {
    bedrock: {
        anthropicBeta: ["fine-grained-tool-streaming-2025-05-14"],
    },
}

// Direct Anthropic API headers for beta features
const _ANTHROPIC_BETA_HEADERS = {
    "anthropic-beta": "fine-grained-tool-streaming-2025-05-14",
}

/**
 * Safely parse integer from environment variable with validation
 */
function parseIntSafe(
    value: string | undefined,
    varName: string,
    min?: number,
    max?: number,
): number | undefined {
    if (!value) return undefined
    const parsed = Number.parseInt(value, 10)
    if (Number.isNaN(parsed)) {
        throw new Error(`${varName} must be a valid integer, got: ${value}`)
    }
    if (min !== undefined && parsed < min) {
        throw new Error(`${varName} must be >= ${min}, got: ${parsed}`)
    }
    if (max !== undefined && parsed > max) {
        throw new Error(`${varName} must be <= ${max}, got: ${parsed}`)
    }
    return parsed
}

/**
 * Build provider-specific options from environment variables
 * Supports various AI SDK providers with their unique configuration options
 *
 * Environment variables:
 * - OPENAI_REASONING_EFFORT: OpenAI reasoning effort level (minimal/low/medium/high) - for o1/o3/gpt-5
 * - OPENAI_REASONING_SUMMARY: OpenAI reasoning summary (none/brief/detailed) - auto-enabled for o1/o3/gpt-5
 * - ANTHROPIC_THINKING_BUDGET_TOKENS: Anthropic thinking budget in tokens (1024-64000)
 * - ANTHROPIC_THINKING_TYPE: Anthropic thinking type (enabled)
 * - GOOGLE_THINKING_BUDGET: Google Gemini 2.5 thinking budget in tokens (1024-100000)
 * - GOOGLE_THINKING_LEVEL: Google Gemini 3 thinking level (low/high)
 * - AZURE_REASONING_EFFORT: Azure/OpenAI reasoning effort (low/medium/high)
 * - AZURE_REASONING_SUMMARY: Azure reasoning summary (none/brief/detailed)
 * - BEDROCK_REASONING_BUDGET_TOKENS: Bedrock Claude reasoning budget in tokens (1024-64000)
 * - BEDROCK_REASONING_EFFORT: Bedrock Nova reasoning effort (low/medium/high)
 * - OLLAMA_ENABLE_THINKING: Enable Ollama thinking mode (set to "true")
 */
function _buildProviderOptions(
    provider: ProviderName,
    modelId?: string,
): Record<string, any> | undefined {
    const options: Record<string, any> = {}

    switch (provider) {
        case "openai": {
            const reasoningEffort = process.env.OPENAI_REASONING_EFFORT
            const reasoningSummary = process.env.OPENAI_REASONING_SUMMARY

            // OpenAI reasoning models (o1, o3, gpt-5) need reasoningSummary to return thoughts
            if (
                modelId &&
                (modelId.includes("o1") ||
                    modelId.includes("o3") ||
                    modelId.includes("gpt-5"))
            ) {
                options.openai = {
                    // Auto-enable reasoning summary for reasoning models (default: detailed)
                    reasoningSummary:
                        (reasoningSummary as "none" | "brief" | "detailed") ||
                        "detailed",
                }

                // Optionally configure reasoning effort
                if (reasoningEffort) {
                    options.openai.reasoningEffort = reasoningEffort as
                        | "minimal"
                        | "low"
                        | "medium"
                        | "high"
                }
            } else if (reasoningEffort || reasoningSummary) {
                // Non-reasoning models: only apply if explicitly configured
                options.openai = {}
                if (reasoningEffort) {
                    options.openai.reasoningEffort = reasoningEffort as
                        | "minimal"
                        | "low"
                        | "medium"
                        | "high"
                }
                if (reasoningSummary) {
                    options.openai.reasoningSummary = reasoningSummary as
                        | "none"
                        | "brief"
                        | "detailed"
                }
            }
            break
        }

        case "anthropic": {
            const thinkingBudget = parseIntSafe(
                process.env.ANTHROPIC_THINKING_BUDGET_TOKENS,
                "ANTHROPIC_THINKING_BUDGET_TOKENS",
                1024,
                64000,
            )
            const thinkingType =
                process.env.ANTHROPIC_THINKING_TYPE || "enabled"

            if (thinkingBudget) {
                options.anthropic = {
                    thinking: {
                        type: thinkingType,
                        budgetTokens: thinkingBudget,
                    },
                }
            }
            break
        }

        case "google": {
            const reasoningEffort = process.env.GOOGLE_REASONING_EFFORT
            const thinkingBudgetVal = parseIntSafe(
                process.env.GOOGLE_THINKING_BUDGET,
                "GOOGLE_THINKING_BUDGET",
                1024,
                100000,
            )
            const thinkingLevel = process.env.GOOGLE_THINKING_LEVEL
            const maxOutputTokens = parseIntSafe(
                process.env.GOOGLE_MAX_OUTPUT_TOKENS,
                "GOOGLE_MAX_OUTPUT_TOKENS",
                256,
                65535,
            )

            if (
                modelId &&
                (modelId.includes("gemini-2") ||
                    modelId.includes("gemini-3") ||
                    modelId.includes("gemini2") ||
                    modelId.includes("gemini3"))
            ) {
                const thinkingConfig: Record<string, any> = {
                    includeThoughts: true,
                }

                if (
                    thinkingBudgetVal &&
                    (modelId.includes("2.5") || modelId.includes("2-5"))
                ) {
                    thinkingConfig.thinkingBudget = thinkingBudgetVal
                } else if (
                    thinkingLevel &&
                    (modelId.includes("gemini-3") ||
                        modelId.includes("gemini3"))
                ) {
                    thinkingConfig.thinkingLevel = thinkingLevel as
                        | "low"
                        | "high"
                }

                options.google = { thinkingConfig }
            } else if (reasoningEffort) {
                options.google = {
                    reasoningEffort: reasoningEffort as
                        | "low"
                        | "medium"
                        | "high",
                }
            }

            const effectiveMaxOutputTokens = maxOutputTokens || 8192

            options.google = {
                ...options.google,
                maxOutputTokens: effectiveMaxOutputTokens,
                responseModalities: ["TEXT"],
            }

            const options_obj: Record<string, any> = {}
            const candidateCount = parseIntSafe(
                process.env.GOOGLE_CANDIDATE_COUNT,
                "GOOGLE_CANDIDATE_COUNT",
                1,
                8,
            )
            if (candidateCount) {
                options_obj.candidateCount = candidateCount
            }
            const topK = parseIntSafe(
                process.env.GOOGLE_TOP_K,
                "GOOGLE_TOP_K",
                1,
                100,
            )
            if (topK) {
                options_obj.topK = topK
            }
            if (process.env.GOOGLE_TOP_P) {
                const topP = Number.parseFloat(process.env.GOOGLE_TOP_P)
                if (Number.isNaN(topP) || topP < 0 || topP > 1) {
                    throw new Error(
                        `GOOGLE_TOP_P must be a number between 0 and 1, got: ${process.env.GOOGLE_TOP_P}`,
                    )
                }
                options_obj.topP = topP
            }

            if (Object.keys(options_obj).length > 0) {
                options.google = { ...options.google, ...options_obj }
            }

            break
        }

        case "azure": {
            const reasoningEffort = process.env.AZURE_REASONING_EFFORT
            const reasoningSummary = process.env.AZURE_REASONING_SUMMARY

            if (reasoningEffort || reasoningSummary) {
                options.azure = {}
                if (reasoningEffort) {
                    options.azure.reasoningEffort = reasoningEffort as
                        | "low"
                        | "medium"
                        | "high"
                }
                if (reasoningSummary) {
                    options.azure.reasoningSummary = reasoningSummary as
                        | "none"
                        | "brief"
                        | "detailed"
                }
            }
            break
        }

        case "bedrock": {
            const budgetTokens = parseIntSafe(
                process.env.BEDROCK_REASONING_BUDGET_TOKENS,
                "BEDROCK_REASONING_BUDGET_TOKENS",
                1024,
                64000,
            )
            const reasoningEffort = process.env.BEDROCK_REASONING_EFFORT

            // Bedrock reasoning ONLY for Claude and Nova models
            // Other models (MiniMax, etc.) don't support reasoningConfig
            if (
                modelId &&
                (budgetTokens || reasoningEffort) &&
                (modelId.includes("claude") ||
                    modelId.includes("anthropic") ||
                    modelId.includes("nova") ||
                    modelId.includes("amazon"))
            ) {
                const reasoningConfig: Record<string, any> = { type: "enabled" }

                // Claude models: use budgetTokens (1024-64000)
                if (
                    budgetTokens &&
                    (modelId.includes("claude") ||
                        modelId.includes("anthropic"))
                ) {
                    reasoningConfig.budgetTokens = budgetTokens
                }
                // Nova models: use maxReasoningEffort (low/medium/high)
                else if (
                    reasoningEffort &&
                    (modelId.includes("nova") || modelId.includes("amazon"))
                ) {
                    reasoningConfig.maxReasoningEffort = reasoningEffort as
                        | "low"
                        | "medium"
                        | "high"
                }

                options.bedrock = { reasoningConfig }
            }
            break
        }

        case "ollama": {
            const enableThinking = process.env.OLLAMA_ENABLE_THINKING
            // Ollama supports reasoning with think: true for models like qwen3
            if (enableThinking === "true") {
                options.ollama = { think: true }
            }
            break
        }

        case "deepseek":
        case "openrouter":
        case "siliconflow": {
            // These providers don't have reasoning configs in AI SDK yet
            break
        }

        default:
            break
    }

    return Object.keys(options).length > 0 ? options : undefined
}

// Map of provider to required environment variable
const PROVIDER_ENV_VARS: Record<ProviderName, string | null> = {
    bedrock: null, // AWS SDK auto-uses IAM role on AWS, or env vars locally
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
    azure: "AZURE_API_KEY",
    ollama: null, // No credentials needed for local Ollama
    openrouter: "OPENROUTER_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    siliconflow: "SILICONFLOW_API_KEY",
}

/**
 * Auto-detect provider based on available API keys
 * Returns the provider if exactly one is configured, otherwise null
 */
function _detectProvider(): ProviderName | null {
    const configuredProviders: ProviderName[] = []

    for (const [provider, envVar] of Object.entries(PROVIDER_ENV_VARS)) {
        if (envVar === null) {
            // Skip ollama - it doesn't require credentials
            continue
        }
        if (process.env[envVar]) {
            configuredProviders.push(provider as ProviderName)
        }
    }

    if (configuredProviders.length === 1) {
        return configuredProviders[0]
    }

    return null
}

/**
 * Validate that required API keys are present for the selected provider
 */
function _validateProviderCredentials(provider: ProviderName): void {
    const requiredVar = PROVIDER_ENV_VARS[provider]
    if (requiredVar && !process.env[requiredVar]) {
        throw new Error(
            `${requiredVar} environment variable is required for ${provider} provider. ` +
                `Please set it in your .env.local file.`,
        )
    }
}

/**
 * Get the AI model based on environment variables
 *
 * Environment variables:
 * - AI_MODEL: The model ID (e.g. gpt-4, claude-3, gemini-pro)
 * - AI_API_KEY: Universal API key (or specific provider key)
 * - AI_BASE_URL: Universal API base URL (optional)
 */
export function getAIModel(overrides?: ClientOverrides): ModelConfig {
    // 1. Determine Model ID
    const modelId = String(
        overrides?.modelId || process.env.AI_MODEL || "",
    ).trim()

    if (!modelId) {
        throw new Error(
            `AI_MODEL environment variable is required. Example: AI_MODEL=claude-3-5-sonnet-20240620`,
        )
    }

    // 2. Determine API Key
    // Use the key supplied by the app Settings dialog as the authoritative source.
    const apiKey = String(overrides?.apiKey || "").trim()

    if (!apiKey) {
        throw new Error(
            "API Key is missing. Please set it in the app Settings dialog.",
        )
    }

    // 3. Determine Base URL
    const baseURL = String(
        overrides?.baseUrl ||
            process.env.AI_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            "",
    ).trim()

    // 4. Initialize Universal Provider
    const openAIConfig: { apiKey: string; baseURL?: string } = {
        apiKey,
    }
    if (baseURL) {
        openAIConfig.baseURL = baseURL
    }
    const universalOpenAI = createOpenAI(openAIConfig)

    const model = universalOpenAI.chat(modelId)
    const providerOptions = {} 
    const headers: Record<string, string> | undefined = undefined

    console.log(
        `[AI Provider] Initializing Universal Provider with model: ${modelId}${baseURL ? ` at ${baseURL}` : ""}`,
    )

    return { model, providerOptions, headers, modelId }
}

/**
 * Check if a model supports prompt caching.
 * Currently only Claude models on Bedrock support prompt caching.
 */
export function supportsPromptCaching(modelId: string): boolean {
    // Bedrock prompt caching is supported for Claude models
    return (
        modelId.includes("claude") ||
        modelId.includes("anthropic") ||
        modelId.startsWith("us.anthropic") ||
        modelId.startsWith("eu.anthropic")
    )
}

