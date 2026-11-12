import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Deletes finished job folders older than RUNS_KEEP_DAYS (default 7) from one runs directory.
 *
 * Each CAD delivery check and editable export leaves its inputs, logs, screenshots and result in its own
 * folder; nothing else removed them, so a long-lived server filled its disk. Called when a new job starts.
 * Only folders named like a job id (timestamp-hex) are touched, and never one that is still in use.
 */
export function pruneRuns(runsDir: string, inUse: Iterable<string> = []): number {
  const days = Number(process.env.RUNS_KEEP_DAYS);
  const keepMs = (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
  if (!existsSync(runsDir)) return 0;
  const busy = new Set(inUse);
  let removed = 0;
  for (const name of readdirSync(runsDir)) {
    if (!/^\d{14}-[0-9a-f]{8}$/.test(name) || busy.has(name)) continue;
    const dir = path.join(runsDir, name);
    try {
      const stat = statSync(dir);
      if (!stat.isDirectory() || Date.now() - stat.mtimeMs < keepMs) continue;
      rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      // A folder that cannot be read or removed now is tried again with the next job.
    }
  }
  return removed;
}
