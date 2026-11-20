import test from "node:test";
import assert from "node:assert/strict";
import { dayKey, dayRecords, lastDays, recordDuration, recordUse, readStats, streaks, usesByCanvas, usesByMonth, usesByWeekday, type UsageStats } from "../client/shared/usage-stats";

const stats = (days: Record<string, Record<string, number>>): UsageStats => ({ days, tokens: {}, images: {}, hours: Array(24).fill(0), tokenDays: {}, durations: {}, models: {}, since: 0 });

test("uses add up per canvas across days", () => {
  assert.deepEqual(usesByCanvas(stats({ "2026-11-01": { diagram: 2, ppt: 1 }, "2026-11-02": { diagram: 3 } })), { diagram: 5, ppt: 1 });
});

test("streaks: the longest run, and the run up to today (or yesterday)", () => {
  const today = new Date("2026-11-20T12:00:00");
  const s = stats({
    "2026-11-01": { diagram: 1 },
    "2026-11-02": { cad: 1 },
    "2026-11-03": { cad: 1 },
    "2026-11-18": { ppt: 1 },
    "2026-11-19": { ppt: 2 },
  });
  assert.deepEqual(streaks(s, today), { longest: 3, current: 2 });
  assert.deepEqual(streaks(stats({}), today), { longest: 0, current: 0 });
});

test("a use is counted on its day and canvas", () => {
  const at = new Date("2026-11-20T09:00:00").getTime();
  recordUse("canvas", at);
  recordUse("canvas", at);
  assert.equal(readStats().days[dayKey(at)]?.canvas, 2);
});

test("a use also counts for its hour", () => {
  const at = new Date("2026-11-20T15:30:00").getTime();
  const before = readStats().hours[15];
  recordUse("ppt", at);
  assert.equal(readStats().hours[15], before + 1);
});

test("durations keep count, total and the longest", () => {
  recordDuration("cad", 2000);
  recordDuration("cad", 6000);
  recordDuration("cad", -1);
  assert.deepEqual(readStats().durations.cad, { count: 2, total: 8000, longest: 6000 });
});

test("weekday, month, recent days and records", () => {
  const s = stats({ "2026-11-16": { diagram: 2 }, "2026-11-17": { cad: 5 }, "2026-10-03": { ppt: 1 } });
  const weekdays = usesByWeekday(s);
  assert.equal(weekdays[0], 2); // Monday 16th
  assert.equal(weekdays[1], 5);
  assert.equal(weekdays[5], 1); // Saturday 3rd
  const months = usesByMonth(s, new Date("2026-11-20T12:00:00"));
  assert.equal(months.length, 12);
  assert.deepEqual(months.slice(-2).map((m) => [m.key, m.uses]), [["2026-10", 1], ["2026-11", 7]]);
  const days = lastDays(s, 5, new Date("2026-11-20T12:00:00"));
  assert.deepEqual(days.map((d) => d.key), ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  assert.deepEqual(dayRecords(s), { best: { key: "2026-11-17", uses: 5 }, average: 8 / 3 });
});
