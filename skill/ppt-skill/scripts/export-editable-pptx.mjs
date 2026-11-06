#!/usr/bin/env node

/**
 * Editable PPTX export: the same run as CanvasAnvil's "Export Editable PPTX".
 *
 * It hands the deck's slide images to the slide-alchemy agent pipeline
 * (scripts/slide-agent/pipeline.ts in this repository) and copies the deck it
 * writes to --output. The pipeline rebuilds every slide as a clean base,
 * editable geometry, generated PNG assets and editable text, checking each
 * page against its source and reworking it up to --qa-rounds times.
 *
 *   node scripts/export-editable-pptx.mjs --manifest-file slides.manifest.json --output deck.pptx [--qa-rounds 3] [--run-dir <dir>]
 *
 * Needs: the slide-alchemy skill (SLIDE_ALCHEMY_DIR, default ~/.claude/skills/slide-alchemy),
 * Python with its requirements, Microsoft PowerPoint (previews for the checks),
 * a chat model (SLIDE_AGENT_API_KEY / _BASE_URL / _MODEL) and an image model
 * (this skill's config/image-provider.json, or SLIDE_ALCHEMY_IMAGE_API_KEY /
 * _BASE_URL / _MODEL), from the environment or scripts/slide-agent/.env.local.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_IMAGE_CONFIG_FILE, fail, loadManifest, readJson, resolveFromCwd } from "./lib/common.mjs";

/** The app asks for at least three check-and-fix rounds per page; so does this. */
const MIN_QA_ROUNDS = 3;
const MAX_QA_ROUNDS = 10;

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const PIPELINE = path.join(REPO_ROOT, "scripts", "slide-agent", "pipeline.ts");

/** The pipeline's stage names, as the app's run panel shows them. */
const STAGES = {
  ocr: "识别文字",
  grouping: "规划底图",
  bases: "生成干净底图",
  analysis: "分析页面元素",
  "shared-assets": "生成图标与插图",
  pages: "逐页重建",
  merge: "合成 PPTX",
};

function parseArgs(argv) {
  const args = { manifestFile: "", output: "", qaRounds: MIN_QA_ROUNDS, runDir: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--manifest-file") {
      args.manifestFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output" || token === "-o") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--qa-rounds") {
      args.qaRounds = Number(argv[i + 1]);
      i += 1;
    } else if (token === "--run-dir") {
      args.runDir = argv[i + 1] || "";
      i += 1;
    }
  }
  return args;
}

/**
 * The image model comes from this skill's config/image-provider.json, like the
 * other export modes, unless the environment already names one. The chat model
 * has no place in that file: it comes from the environment or
 * scripts/slide-agent/.env.local, which the pipeline reads itself.
 */
function pipelineEnv() {
  const env = { ...process.env };
  if (!env.SLIDE_ALCHEMY_IMAGE_API_KEY && fs.existsSync(DEFAULT_IMAGE_CONFIG_FILE)) {
    const config = readJson(DEFAULT_IMAGE_CONFIG_FILE);
    if (String(config.apiKey || "").trim() && String(config.model || "").trim()) {
      env.SLIDE_ALCHEMY_IMAGE_API_KEY = String(config.apiKey).trim();
      env.SLIDE_ALCHEMY_IMAGE_MODEL = String(config.model).trim();
      if (String(config.baseUrl || "").trim()) env.SLIDE_ALCHEMY_IMAGE_BASE_URL = String(config.baseUrl).trim();
    }
  }
  return env;
}

/** The pipeline reads PNG headers; any other format is converted with Pillow, which slide-alchemy already needs. */
function copyAsPng(source, target) {
  if (path.extname(source).toLowerCase() === ".png") {
    fs.copyFileSync(source, target);
    return;
  }
  const python = process.env.PYTHON || "python";
  const r = spawnSync(python, ["-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2])", source, target], {
    encoding: "utf8",
  });
  if (r.status !== 0) fail(`Could not convert ${source} to PNG: ${r.stderr || r.error}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestFile) fail("Missing --manifest-file <slides.manifest.json>.");
  if (!args.output) fail("Missing --output <file.pptx>.");
  if (!Number.isInteger(args.qaRounds) || args.qaRounds < MIN_QA_ROUNDS || args.qaRounds > MAX_QA_ROUNDS) {
    fail(`--qa-rounds must be an integer from ${MIN_QA_ROUNDS} to ${MAX_QA_ROUNDS}.`);
  }
  if (!fs.existsSync(PIPELINE)) fail(`Missing the pipeline at ${PIPELINE}; run this from a CanvasAnvil checkout.`);

  const { manifest, manifestPath } = loadManifest(args.manifestFile);
  const slides = Array.isArray(manifest?.slides) ? manifest.slides : [];
  if (slides.length === 0) fail("Manifest contains no slides.");

  const outputPath = resolveFromCwd(args.output);
  const runDir = args.runDir
    ? resolveFromCwd(args.runDir)
    : path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}.editable-run`);
  const inputDir = path.join(runDir, "input");
  fs.mkdirSync(inputDir, { recursive: true });

  const baseDir = path.dirname(manifestPath);
  const inputs = slides.map((item, index) => {
    const imagePath = path.resolve(baseDir, item.imageFile);
    if (!fs.existsSync(imagePath)) fail(`Missing slide image: ${imagePath}`);
    const target = path.join(inputDir, `slide_${String(index + 1).padStart(3, "0")}.png`);
    copyAsPng(imagePath, target);
    return target;
  });

  console.log(`Editable export: ${inputs.length} slide(s), up to ${args.qaRounds} check rounds per page. This usually takes 10+ minutes.`);
  const child = spawn(
    process.execPath,
    ["--import", "tsx", PIPELINE, "--run", runDir, "--qa-rounds", String(args.qaRounds), ...inputs],
    { cwd: REPO_ROOT, env: pipelineEnv(), stdio: ["ignore", "pipe", "pipe"] },
  );

  // Show the pipeline's progress events as readable lines; keep everything else in a log.
  const log = fs.createWriteStream(path.join(runDir, "console.txt"));
  let buffered = "";
  const onOutput = (chunk) => {
    const text = chunk.toString("utf8");
    log.write(text);
    buffered += text;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("@@event ")) continue;
      let event;
      try {
        event = JSON.parse(line.slice(8));
      } catch {
        continue;
      }
      const stage = STAGES[event.stage] || event.stage;
      if (event.type === "stage" && event.status === "start") console.log(`\n▶ ${stage}`);
      else if (event.type === "stage") console.log(`  ${event.status === "done" ? "✓" : "✗"} ${stage}（${event.seconds ?? "?"}s）`);
      else if (event.type === "line") console.log(`  ${event.level === "warn" ? "!" : event.level === "error" ? "✗" : "·"} ${event.text}`);
      else if (event.type === "artifact") console.log(`    ${event.label}: ${path.join(runDir, event.path)}`);
    }
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);

  const code = await new Promise((resolve) => child.on("close", resolve));
  log.end();
  const deck = path.join(runDir, "out", "editable.pptx");
  if (code !== 0 || !fs.existsSync(deck)) {
    fail(`Editable export failed (exit code ${code}). See ${path.join(runDir, "console.txt")}.`);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(deck, outputPath);
  console.log(`\nEditable PPTX written to ${outputPath}`);
  console.log(`Intermediate files (bases, asset sheets, per-round previews and checks): ${runDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
