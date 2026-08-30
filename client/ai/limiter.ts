/**
 * Bounded-concurrency queue for model calls.
 *
 * The workspaces fan out dozens of per-slide requests at once; without a cap
 * the provider rejects the burst. Queued items honour their AbortSignal both
 * while waiting and while running.
 */
type QueueItem<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

export function createLimiter(max: number) {
  let active = 0;
  const queue: QueueItem<any>[] = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      const item = queue.shift()!;
      if (item.signal?.aborted) {
        item.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        continue;
      }

      active += 1;
      if (item.signal && item.onAbort) {
        item.signal.removeEventListener("abort", item.onAbort);
        item.onAbort = undefined;
      }
      let finished = false;
      let abortHandler: (() => void) | null = null;

      const finish = () => {
        if (finished) return;
        finished = true;
        if (item.signal && abortHandler) {
          item.signal.removeEventListener("abort", abortHandler as any);
        }
        active -= 1;
        pump();
      };

      if (item.signal) {
        abortHandler = () => {
          const err = Object.assign(new Error("Aborted"), { name: "AbortError" });
          item.reject(err);
          finish();
        };
        item.signal.addEventListener("abort", abortHandler, { once: true });
      }

      item.run().then(
        (value) => {
          item.resolve(value);
          finish();
        },
        (reason) => {
          item.reject(reason);
          finish();
        }
      );
    }
  };

  return function limit<T>(run: () => Promise<T>, signal?: AbortSignal) {
    if (signal?.aborted) {
      return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { run, resolve, reject, signal };
      if (signal) {
        const onAbort = () => {
          const idx = queue.indexOf(item as any);
          if (idx >= 0) queue.splice(idx, 1);
          reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        };
        item.onAbort = onAbort;
        signal.addEventListener("abort", onAbort, { once: true });
      }

      queue.push(item);
      pump();
    });
  };
}
