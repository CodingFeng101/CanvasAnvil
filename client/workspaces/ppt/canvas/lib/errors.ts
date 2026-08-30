/**
 * Error text and retry classification for the slide-generation flows.
 *
 * Kept free of the translator so it stays testable: callers supply their own
 * wording for the "no message at all" case.
 */

/** The human-readable part of a thrown value, or "" if there is none. */
export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  return "";
}

const RETRYABLE = [
  "429",
  "524",
  "timeout",
  "timed out",
  "networkerror",
  "fetch",
  "rate limit",
];

/**
 * Whether a failed page edit is worth sending again. Beautify runs a whole
 * deck through the image model, so transient rate limits and gateway
 * timeouts are the common case and a permanent refusal is not.
 */
export function isRetryableBeautifyError(error: unknown): boolean {
  const message = errorText(error).toLowerCase();
  return RETRYABLE.some((needle) => message.includes(needle));
}
