import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pruneRuns } from "../server/http/prune-runs";

test("old job folders are removed; recent ones, jobs in use and anything else are kept", () => {
  const runs = mkdtempSync(path.join(os.tmpdir(), "runs-"));
  try {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const make = (name: string, aged: boolean) => {
      mkdirSync(path.join(runs, name));
      writeFileSync(path.join(runs, name, "file.txt"), "x");
      if (aged) utimesSync(path.join(runs, name), old, old);
    };
    make("20260101000000-aaaaaaaa", true);
    make("20260102000000-bbbbbbbb", true);
    make("20261111000000-cccccccc", false);
    make("my-experiment", true);
    assert.equal(pruneRuns(runs, ["20260102000000-bbbbbbbb"]), 1);
    assert.equal(existsSync(path.join(runs, "20260101000000-aaaaaaaa")), false);
    for (const kept of ["20260102000000-bbbbbbbb", "20261111000000-cccccccc", "my-experiment"]) assert.ok(existsSync(path.join(runs, kept)), kept);
  } finally {
    rmSync(runs, { recursive: true, force: true });
  }
});
