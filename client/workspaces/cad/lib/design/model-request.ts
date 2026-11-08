/** Repeat a failed transport once. Model output validation has its own repair budget. */
export async function retryCadTextRequest(request: () => Promise<string>, signal?: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await request(); }
    catch (reason) {
      signal?.throwIfAborted();
      const message = reason instanceof Error ? reason.message : String(reason);
      if (attempt > 0 || !/fetch failed|failed to fetch|networkerror|network request failed/i.test(message)) throw reason;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
