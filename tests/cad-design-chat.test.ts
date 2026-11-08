import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSpec } from "../client/workspaces/cad/lib/design/spec-validate";
const read = (file: string) =>
  readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("CAD design prompt example passes the actual prevalidator", () => {
  const prompt = read("resources/prompts/cad/design/create.md");
  const example = JSON.parse(
    prompt.split("\n").find((line) => line.startsWith('{"type":"cad_spec"'))!,
  );
  assert.deepEqual(validateSpec(example.spec), []);
});

test("create, edit and fix prompts list every supported opening type and world-coordinate rules", () => {
  const types =
    "door double unequal sliding folding pocket hole garage window slideWindow floorWindow highWindow bay glassWall".split(
      " ",
    );
  for (const mode of ["create", "edit", "fix", "create-from-draft"]) {
    const prompt = read(`resources/prompts/cad/design/${mode}.md`);
    for (const type of types)
      assert.ok(prompt.includes(type), `${mode}: ${type}`);
    assert.ok(prompt.includes("横墙 from/to 填世界 x"));
    assert.ok(prompt.includes("竖墙填世界 y"));
  }
});

test("CAD chat applies model data through the validated design session and gates downstream first", () => {
  const source = read("client/workspaces/cad/chat/ChatPanel.tsx");
  assert.ok(
    source.includes("session.applyModelOutput(payload, retry, options)"),
  );
  assert.ok(!source.includes("replacePlan("));
  assert.ok(!source.includes("__CA_HPD_PRESET__"));
  assert.ok(
    source.indexOf("isCadDownstreamRequest(text)") <
      source.indexOf("const global = getAIConfig()"),
  );
  assert.ok(source.includes("catalogPromptTable()"));
  const display = read("client/workspaces/cad/chat/ChatMessageDisplay.tsx");
  assert.ok(!display.includes("AutoApplyCodeOnce"));
});

test('CAD repair prompt specifies the supported operation envelope and operation names', () => {
  const prompt = read('resources/prompts/cad/design/fix.md');
  assert.ok(prompt.includes('{"type":"cad_ops","ops":['));
  for (const op of ['add_furniture','move_furniture','resize_furniture','replace_furniture','remove','add_opening','update_opening','add_wall','move_node','update_wall','set_room','set_plan']) assert.ok(prompt.includes(`"op":"${op}"`), op);
});

test("the floorplan check message carries the GUIDE's questions as clickable decisions", async () => {
  const { checkMessage, parseCadSteps, recognitionLines } = await import("../client/workspaces/cad/chat/CadSteps");
  const { floorplanQuestions, recognitionSummary } = await import("../client/workspaces/cad/lib/design/floorplan-check");
  const questions = floorplanQuestions(true, true);
  assert.ok(questions.some((item) => item.topic === "两张图以谁为准") && questions.some((item) => item.topic === "楼板厚"));
  assert.equal(floorplanQuestions(false, false).length, questions.length - 2);
  const parsed = parseCadSteps(checkMessage(recognitionSummary({ route: "cad", notes: ["比例来源：DXF 单位"] }, 20, 9, 1), questions));
  assert.equal(parsed?.kind, "check");
  assert.equal(parsed?.decisions.length, questions.length);
  assert.match(parsed!.body, /CAD 矢量图纸.*\n[\s\S]*墙 20 面，门窗洞口 9 个/);
  assert.match(recognitionLines({ symbols: [{ symbol: "烟道", where: "厨房", count: 1, model: "flue" }], confirm: ["层高估算"] }), /\| 烟道 \| 厨房 \| 1 \| flue \|[\s\S]*- 层高估算/);
});
