#!/usr/bin/env node

/**
 * Layout → HouseSpec, the same step as CanvasAnvil's "生成户型".
 *
 * The model writes a cad_layout (grid, rooms, doors, windows, furniture intent, finishes); this runs
 * the app's layout program (bundled into ./lib/cad-core.mjs) to compute walls, openings and
 * furniture positions, then the app's autofix and validation. Plain Node 18+, no dependencies.
 *
 *   node scripts/build-house-spec.mjs --layout cad_layout.json --output house-spec.json
 *
 * The layout file may hold {"type":"cad_layout","layout":{...}} or the bare layout object.
 * Prints the program's placement notes and the validation result; exits 1 when the layout
 * cannot be built or the spec still has errors, so the agent fixes the layout and runs again.
 */

import fs from "node:fs";
import path from "node:path";
import { autofixSpec, layoutToSpec, validateSpec } from "./lib/cad-core.mjs";

function parseArgs(argv) {
  const args = { layout: "", output: "house-spec.json" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--layout") args.layout = argv[++i] || "";
    else if (argv[i] === "--output" || argv[i] === "-o") args.output = argv[++i] || "";
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.layout) {
  console.error("Usage: node scripts/build-house-spec.mjs --layout cad_layout.json [--output house-spec.json]");
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(path.resolve(args.layout), "utf8"));
const layout = raw?.type === "cad_layout" ? raw.layout : raw?.layout && raw.layout.cols ? raw.layout : raw;

let converted;
try {
  converted = layoutToSpec(layout);
} catch (error) {
  console.error(`布局说明无法生成户型 / The layout cannot be built: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
let spec = converted.spec;
let issues = validateSpec(spec);
if (!issues.some((issue) => issue.code === "schema")) {
  spec = autofixSpec(spec);
  issues = validateSpec(spec);
}
fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
fs.writeFileSync(path.resolve(args.output), `${JSON.stringify(spec, null, 2)}\n`);

const errors = issues.filter((issue) => issue.level === "error");
const warnings = issues.filter((issue) => issue.level === "warn");
console.log(`户型已写入 ${args.output}：${spec.walls.length} 面墙，${spec.rooms?.length ?? 0} 个房间，${spec.furniture?.length ?? 0} 件家具`);
if (converted.notes.length) console.log(`程序摆放时的调整：\n${converted.notes.map((note) => `- ${note}`).join("\n")}`);
if (warnings.length) console.log(`警告 ${warnings.length} 个：\n${warnings.map((issue) => `- ${issue.msg}`).join("\n")}`);
if (errors.length) {
  console.error(`错误 ${errors.length} 个（改布局说明后重跑）：\n${errors.map((issue) => `- ${issue.msg}`).join("\n")}`);
  process.exit(1);
}
