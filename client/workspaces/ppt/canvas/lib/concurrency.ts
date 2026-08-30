/** Waits `ms` before resolving. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs `tasks` with at most `limit` in flight.
 *
 * Every task is awaited before this returns, even once one has failed: the
 * callers here are generating a deck slide by slide, and bailing out early
 * would leave the remaining slides writing state into a flow that has already
 * given up. The first failure is re-thrown once the rest have settled.
 */
export async function runInParallel(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  const results: Promise<void>[] = [];
  const executing: Promise<void>[] = [];

  for (const task of tasks) {
    const started = Promise.resolve().then(() => task());
    results.push(started);

    const slot: Promise<void> = started
      .catch(() => {})
      .then(() => {
        executing.splice(executing.indexOf(slot), 1);
      });
    executing.push(slot);

    if (executing.length >= limit) await Promise.race(executing);
  }

  const settled = await Promise.allSettled(results);
  const failed = settled.find((r) => r.status === "rejected");
  if (failed) throw (failed as PromiseRejectedResult).reason;
}
