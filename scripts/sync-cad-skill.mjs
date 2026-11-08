#!/usr/bin/env node

/**
 * Bring skill/cad-skill in step. The skill carries the house designer and its own tools in
 * skill/cad-skill/designer/ (template, scripts, references, GUIDE.md), with CanvasAnvil's additions around
 * it (the design plan with clickable decisions, the layout program, auto-nudge, wiring preferences,
 * automatic exports). It is copied into other projects and runs on its own, so everything it needs is
 * written into the folder:
 *
 *   designer/                                 ← the designer checkout (only when its path is given)
 *   prompts/plan.md, prompts/layout.md        ← resources/prompts/cad/plan.md, design/create.md
 *   prompts/edit.md                           ← resources/prompts/cad/design/edit.md (edit operations on a finished design)
 *   references/furniture-catalog.md           ← resources/hpd/catalog.json
 *   scripts/lib/cad-core.mjs                  ← layout program, autofix and validation (Node, ESM)
 *   scripts/lib/designer-kit.js               ← auto-nudge, wiring preferences, edit operations and the plan summary
 *                                               (injected into the designer page)
 *
 * Run from the repository root after changing any of those sources:
 *
 *   node scripts/sync-cad-skill.mjs [<designer checkout>]
 *
 * Use the same commit as public/vendor/house-designer (scripts/sync-house-designer.mjs), so the furniture
 * catalog matches the designer the skill carries. The checkout's code is copied as it is; its LICENSE is
 * kept (MIT); its own skill page becomes designer/GUIDE.md (route A of SKILL.md), its README is left out.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SKILL = path.join(ROOT, "skill", "cad-skill");
const DESIGN = path.join(ROOT, "client", "workspaces", "cad", "lib", "design");
const NOTE = "Copied from CanvasAnvil by scripts/sync-cad-skill.mjs; edit the source there, not this file. Source: ";
const write = (target, content) => {
  fs.mkdirSync(path.dirname(path.join(SKILL, target)), { recursive: true });
  fs.writeFileSync(path.join(SKILL, target), content);
  console.log(`✓ ${target}`);
};

/** Text in the carried docs and package files names the checkout's own project; the skill speaks of "the designer". */
const projectName = (dir) => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, "scripts", "package.json"), "utf8")).name?.replace(/-scripts$/, "") || null; } catch { return null; }
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upstream = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (upstream) {
  if (!fs.existsSync(path.join(upstream, "SKILL.md")) || !fs.existsSync(path.join(upstream, "assets", "template.html"))) {
    throw new Error(`${upstream} is not a designer checkout (no SKILL.md / assets/template.html)`);
  }
  const target = path.join(SKILL, "designer");
  fs.rmSync(target, { recursive: true, force: true });
  // The checkout's own project name (from its scripts package, else its folder name) is replaced by "designer".
  const name = projectName(upstream) || path.basename(upstream);
  const UPSTREAM_NAME = new RegExp(escapeRe(name), "i");
  const scrub = (text) => text
    .replace(/（源码与本 skill 仓库：<https:\/\/github\.com\/[^>]+>）/g, "")
    .replace(/设计器源码仓库：<https:\/\/github\.com\/[^>]+>（[^）]*）。?/g, "")
    .replace(new RegExp(escapeRe(name), "g"), "designer");
  fs.cpSync(upstream, target, { recursive: true, filter: (source) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(path.relative(upstream, source).replace(/^/, path.sep)) });
  fs.rmSync(path.join(target, "README.md"), { force: true });
  // Its skill page is route A's guide here: no skill header (one skill per folder), no section on rebuilding the template.
  const guide = fs.readFileSync(path.join(target, "SKILL.md"), "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, "").replace(/\r?\n## 更新模板[\s\S]*$/, "\n");
  fs.rmSync(path.join(target, "SKILL.md"));
  fs.writeFileSync(path.join(target, "GUIDE.md"), guide);
  const leftovers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (entry.name === "LICENSE" || !/\.(md|json|py|mjs|js|txt)$/.test(entry.name)) continue;
      const text = fs.readFileSync(file, "utf8");
      const clean = scrub(text);
      if (clean !== text) fs.writeFileSync(file, clean);
      if (UPSTREAM_NAME.test(clean)) leftovers.push(path.relative(SKILL, file));
    }
  };
  walk(target);
  if (leftovers.length) throw new Error(`Upstream project name still in: ${leftovers.join(", ")}`);
  let commit = "";
  try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: upstream, encoding: "utf8" }).trim(); } catch { /* not a git checkout */ }
  fs.writeFileSync(path.join(target, "VERSION.json"), `${JSON.stringify({ commit, syncedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`✓ designer/ (${commit.slice(0, 7) || "no git"})`);
}
// The designer comes from designer/assets/template.html; drop older copies.
fs.rmSync(path.join(SKILL, "assets"), { recursive: true, force: true });

for (const [source, target] of [
  ["resources/prompts/cad/plan.md", "prompts/plan.md"],
  ["resources/prompts/cad/design/create.md", "prompts/layout.md"],
  ["resources/prompts/cad/design/edit.md", "prompts/edit.md"],
]) {
  write(target, `<!-- ${NOTE}${source} -->\n\n${fs.readFileSync(path.join(ROOT, source), "utf8").trimEnd()}\n`);
}

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/hpd/catalog.json"), "utf8"));
write("references/furniture-catalog.md", [
  `<!-- ${NOTE}resources/hpd/catalog.json -->`,
  "",
  "# Furniture catalog",
  "",
  "Every furniture `key` in a layout must come from this table (the designer has nothing else). Sizes are width × depth × height in mm.",
  "",
  "| key | 名称 | 宽×深×高 (mm) |",
  "|---|---|---|",
  ...Object.entries(catalog).map(([key, item]) => `| ${key} | ${item.name} | ${item.w}×${item.d}×${item.h} |`),
  "",
].join("\n"));

const bundle = async (target, contents, options) => {
  const result = await build({
    stdin: { contents, resolveDir: DESIGN, sourcefile: "entry.ts", loader: "ts" },
    bundle: true,
    write: false,
    legalComments: "none",
    banner: { js: `// ${NOTE}client/workspaces/cad/lib/design/ (bundled)` },
    ...options,
  });
  write(target, result.outputFiles[0].text);
};
await bundle(
  "scripts/lib/cad-core.mjs",
  `export { layoutToSpec } from "./layout"; export { validateSpec } from "./spec-validate"; export { autofixSpec } from "./spec-autofix";`,
  { format: "esm", platform: "node", target: "node18" },
);
await bundle(
  "scripts/lib/designer-kit.js",
  `export { nudgeFurniture } from "./auto-nudge"; export { applyElecPrefs, elecPrefsFromDecisions } from "./elec-prefs"; export { applyOps } from "./plan-ops"; export { summarizePlan } from "./plan-summary";`,
  { format: "iife", globalName: "CadKit", platform: "browser", target: "es2020" },
);
