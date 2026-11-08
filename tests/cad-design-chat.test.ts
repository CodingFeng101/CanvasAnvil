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
