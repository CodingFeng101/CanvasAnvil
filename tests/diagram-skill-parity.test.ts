import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_SYSTEM_PROMPT } from "../server/chat/system-prompt";

/**
 * The diagram skill keeps hand-written prompts (its tools differ from the website's), so this checks that the
 * rules they share with the website's system prompt have not drifted apart.
 */
const read = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const layoutSection = DEFAULT_SYSTEM_PROMPT.split("## Layout")[1].split("\n## ")[0];
const websiteKinds = [...layoutSection.matchAll(/^- ([a-z-]+(?:, [a-z-]+)*):/gm)].flatMap((m) => m[1].split(", "));

test("the website's layout kinds are read from its system prompt", () => {
  assert.ok(websiteKinds.includes("flow-down") && websiteKinds.includes("auto"), websiteKinds.join(" "));
});

test("the diagram skill offers every layout kind the website prompt does", () => {
  for (const file of ["skill/diagram-skill/SKILL.md", "skill/diagram-skill/prompts/display.md", "skill/diagram-skill/references/layout-rules.md"]) {
    const text = read(file);
    for (const kind of websiteKinds) assert.ok(text.includes(`\`${kind}\``), `${file}: ${kind}`);
  }
  const schema = read("skill/canvas-skill/mcp/native-editors.mjs").match(/layout: z\.enum\(\[([^\]]+)\]\)/)![1];
  assert.deepEqual(schema.match(/'([a-z-]+)'/g)!.map((s) => s.slice(1, -1)).sort(), [...websiteKinds].sort());
});

test("the diagram skill keeps the website's diagram constraints", () => {
  const rules = read("skill/diagram-skill/references/layout-rules.md") + read("skill/diagram-skill/references/xml-rules.md");
  for (const [website, skill] of [
    ["container=1", "container=1"], ["at least 40px", "40px"], ['ids "0" and "1" are reserved', '"0"'],
    ["orthogonalEdgeStyle", "orthogonalEdgeStyle"], ["Never include XML comments", "comment"],
  ]) {
    assert.ok(DEFAULT_SYSTEM_PROMPT.includes(website), `website prompt changed: ${website}`);
    assert.ok(rules.toLowerCase().includes(skill.toLowerCase()), `skill rules lost: ${skill}`);
  }
});
