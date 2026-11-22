import assert from "node:assert/strict";
import { test } from "node:test";
import { nudgeFurniture } from "../client/workspaces/cad/lib/design/auto-nudge";
import type { DesignIssue, SinglePlan } from "../client/workspaces/cad/lib/design/types";

const planWith = (item: Record<string, unknown>) =>
  ({ version: 2, name: "", nodes: [], walls: [], openings: [], rooms: [], furniture: [{ id: "f1", key: "clothesRack", x: 0, y: 0, rot: 0, ...item }] }) as unknown as SinglePlan;
const error = (): DesignIssue => ({ level: "error", code: "wall", msg: "嵌入墙体", targets: [{ kind: "furn", id: "f1" }] }) as DesignIssue;
const warning = (): DesignIssue => ({ level: "warn", code: "window", msg: "挡住窗户" }) as DesignIssue;

test("a shift that takes the error away is kept even if it brings a warning", () => {
  // In the wall until it is 100mm clear; anywhere clear of it, it blocks a window (a warning).
  const issuesOf = (plan: SinglePlan) => (plan.furniture[0].x < 100 ? [error()] : [warning()]);
  const { plan, moved } = nudgeFurniture(planWith({ w: 2400, d: 450 }), issuesOf);
  assert.equal(moved, 1);
  assert.equal(plan.furniture[0].x, 100, "the smallest shift that helps");
  assert.deepEqual(issuesOf(plan).map((issue) => issue.level), ["warn"]);
});

test("where no shift helps, the piece is made a little smaller", () => {
  // Too long for the room wherever it stands: the error goes once it is 2200mm or less.
  const issuesOf = (plan: SinglePlan) => (Number(plan.furniture[0].w) > 2200 ? [error()] : []);
  const { plan, moved } = nudgeFurniture(planWith({ w: 2400, d: 450 }), issuesOf);
  assert.equal(moved, 1);
  assert.equal(plan.furniture[0].w, 2160, "the least shrinking that helps (90%)");
  assert.equal(plan.furniture[0].d, 450);
  assert.equal(plan.furniture[0].x, 0, "not moved");
});

test("nothing is changed when neither a shift nor a smaller size helps", () => {
  const start = planWith({ w: 2400, d: 450 });
  const { plan, moved } = nudgeFurniture(start, () => [error()]);
  assert.equal(moved, 0);
  assert.deepEqual(plan, start);
});
