import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unwrapCadPlan } from "../client/workspaces/cad/lib/design/cad-plan";
import { applyPicks, takePicks } from "../client/workspaces/cad/chat/cad-steps-text";
import { elecPrefsFromDecisions } from "../client/workspaces/cad/lib/design/elec-prefs";

/**
 * The options a user clicks under the plan must end up in the plan the floorplan is generated from. The plan
 * used to be stored with the model's answer around it ({type:"cad_plan", plan}), so the picks were written
 * beside the plan instead of into it and the model kept its own recommendations.
 */
const answer = {
  type: "cad_plan",
  plan: {
    summary: "90㎡ 两室两厅",
    decisions: [
      { group: "设备", topic: "空调", options: ["每间挂机", "中央空调（风管机）"], choice: "每间挂机" },
      { group: "智能", topic: "全屋智能", options: ["智能灯光", "电动窗帘", "安防门锁"], choice: ["智能灯光"], multi: true },
    ],
  },
};

test("the stored plan is the plan itself, however often an older version wrapped it", () => {
  assert.equal(unwrapCadPlan(answer), answer.plan);
  assert.equal(unwrapCadPlan({ type: "cad_plan", plan: { type: "cad_plan", plan: answer.plan, decisions: [] } }), answer.plan);
  assert.equal(unwrapCadPlan(answer.plan), answer.plan);
  assert.equal(unwrapCadPlan(null), null);
});

test("the user's picks replace the recommended choices in the plan that goes to the model", () => {
  const sent = `[[CAD_CONFIRM]]确认方案，根据当前方案生成户型\n补充要求（生成户型时一并照做）：主卧要有飘窗\n[[CAD_PICKS]]${JSON.stringify({ 空调: ["中央空调（风管机）"], 全屋智能: ["电动窗帘", "安防门锁"] })}`;
  const { text, picks } = takePicks(sent);
  assert.ok(picks);
  assert.match(text, /主卧要有飘窗/, "the note typed under the plan travels with the confirm");
  const plan = applyPicks(unwrapCadPlan(answer), picks!);
  assert.equal(plan.summary, "90㎡ 两室两厅");
  assert.equal(plan.decisions[0].choice, "中央空调（风管机）");
  assert.deepEqual(plan.decisions[1].choice, ["电动窗帘", "安防门锁"]);
  // The wiring preferences read the same decisions.
  assert.doesNotThrow(() => elecPrefsFromDecisions(plan.decisions));
});

test("the workspace, the chat and the skill's editor all unwrap the plan, and confirm sends the note", () => {
  const read = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
  assert.ok(read("client/workspaces/cad/CadWorkspace.tsx").includes("setCadPlan(unwrapCadPlan(parsed))"));
  assert.ok(read("client/workspaces/cad/chat/ChatPanel.tsx").includes("unwrapCadPlan(cadContext?.plan)"));
  assert.ok(read("client/workspaces/native/cad-entry.ts").includes("unwrapCadPlan(command.plan)"));
  assert.ok(read("client/workspaces/cad/chat/CadSteps.tsx").includes("补充要求（生成户型时一并照做）"));
});
