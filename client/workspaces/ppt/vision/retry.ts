/**
 * One more try before giving up on a page.
 *
 * Most of what fails here is transient: a provider answering 429, a
 * connection reset, a model reply that did not parse. A page given up on
 * after one of those exports as a flat picture, which is a steep price for a
 * hiccup, so every page gets exactly one second chance.
 *
 * Exactly one. A failure that survives a retry is rarely going to be fixed by
 * a third, and each attempt re-runs model calls somebody is paying for.
 */

import { sleep } from "@/workspaces/ppt/canvas/lib/concurrency";

export const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export interface RetryOptions {
  /** Pause before the second attempt, so a rate limit has time to lift. */
  delayMs?: number;
  /**
   * Whether this failure is worth a second attempt. Some are not: a page
   * with no background cannot grow one by being rebuilt again.
   */
  shouldRetry?: (reason: string) => boolean;
  /** Told the reason before the second attempt starts. */
  onRetry?: (reason: string) => void;
}

/** Run `work`; if it throws, run it once more; if that throws too, rethrow. */
export async function retryOnce<T>(work: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const reason = reasonOf(error);
    if (options.shouldRetry && !options.shouldRetry(reason)) throw error;

    options.onRetry?.(reason);
    if (options.delayMs && options.delayMs > 0) await sleep(options.delayMs);
    return await work();
  }
}
