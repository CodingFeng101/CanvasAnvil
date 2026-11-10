#!/usr/bin/env node
/**
 * Prints the website's own planning or template prompt, so the plan you write follows the same rules.
 *
 *   node scripts/prompt.mjs plan --mode idea|outline --input-file <brief.txt> [--language zh|en] [--template]
 *        [--references-file <notes.txt>] [--materials-file <labels.txt>]
 *   node scripts/prompt.mjs template --requirements "<visual direction>" [--language zh|en]
 *
 * plan: the system rules (prompts/plan-system.md) come first, then the task prompt for that mode. With
 * --template, the rules that keep descriptions inside the template's style but out of its layout are added
 * (look at the template image while planning). --materials-file lists "Name: caption" lines for the
 * reference pictures the user gave; slides may use them as {{image:Name}}.
 * template: the prompt to pass to generate-ppt-template-image.mjs --prompt-file.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { fail } from "./lib/common.mjs";
import { parseArgs } from "./lib/deck.mjs";
import { buildPlanPrompt, getTemplateGenerationPrompt } from "./lib/website-prompts.mjs";

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest, {
  mode: "idea", inputFile: "", language: "zh", template: false, referencesFile: "", materialsFile: "", requirements: "",
});
const read = (file) => (file ? fs.readFileSync(file, "utf8").trim() : "");
const language = args.language === "en" ? "en" : "zh";

if (command === "plan") {
  if (args.mode !== "idea" && args.mode !== "outline") fail("--mode must be idea or outline.");
  const input = read(args.inputFile);
  if (!input) fail("Missing --input-file with the idea or the outline text.");
  const system = fs.readFileSync(fileURLToPath(new URL("../prompts/plan-system.md", import.meta.url)), "utf8").trim();
  const task = buildPlanPrompt({
    mode: args.mode, input, uiLanguage: language, hasTemplate: args.template,
    referenceText: read(args.referencesFile), imageAssetText: read(args.materialsFile),
  });
  process.stdout.write(`${system}\n\n---\n\n${task}\n`);
} else if (command === "template") {
  process.stdout.write(`${getTemplateGenerationPrompt({ requirements: args.requirements, language })}\n`);
} else {
  fail("Usage: prompt.mjs plan|template [options]");
}
