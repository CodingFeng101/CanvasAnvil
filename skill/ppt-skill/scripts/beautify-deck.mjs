#!/usr/bin/env node
/**
 * Beautify mode: redraws each page of an existing deck in place, the way the website's "美化" mode does.
 *
 *   node scripts/beautify-deck.mjs --input deck.pdf|deck.pptx --out-dir <deck> [--template <image>]
 *        [--requirement "user's wording"] [--concurrency 4] [--only slide-2,slide-5] [--python python]
 *
 * Pages are rendered to <deck>/source/ (a PPTX is converted to PDF with LibreOffice first), then every page
 * image is edited with the website's beautify instruction: same text, numbers and meaning, better typography,
 * spacing, hierarchy and colour; with --template, the template's style and colour tone. Writes plan.json
 * (one entry per page) and slides.manifest.json, so edit-slide and the exports work on the result.
 * Rerun with --only to redo failed or unwanted pages; the source images are reused.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, loadImageConfig, writeJson } from "./lib/common.mjs";
import {
  DEFAULT_CONCURRENCY, errorMessage, imageRef, loadManifest, parseArgs, report, requestImage, runInParallel,
  saveManifest, selectSlides, upsertSlide, writeSlideImage,
} from "./lib/deck.mjs";
import { buildBeautifyInstruction, buildEditPagePrompt } from "./lib/website-prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  input: "", outDir: "", template: "", requirement: "", concurrency: String(DEFAULT_CONCURRENCY), only: "",
  python: process.platform === "win32" ? "python" : "python3", configFile: "", language: "zh",
});
if (!args.outDir) fail("Missing --out-dir <deck folder>.");
const outDir = path.resolve(args.outDir);
const sourceDir = path.join(outDir, "source");
const planPath = path.join(outDir, "plan.json");
const channel = loadImageConfig(args.configFile);

function findSoffice() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe", "soffice"]
    : ["soffice", "libreoffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {}
  }
  return "";
}

function renderPages(input) {
  let pdf = input;
  if (/\.pptx?$/i.test(input)) {
    const soffice = findSoffice();
    if (!soffice) fail("A PPTX needs LibreOffice to become page images. Install it, or export the deck as PDF and pass that.");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-beautify-"));
    execFileSync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", tmp, input], { stdio: "ignore" });
    pdf = path.join(tmp, `${path.basename(input).replace(/\.pptx?$/i, "")}.pdf`);
    if (!fs.existsSync(pdf)) fail(`LibreOffice did not convert ${input}.`);
  } else if (!/\.pdf$/i.test(input)) {
    fail("--input must be a .pdf or .pptx file.");
  }
  const script = fileURLToPath(new URL("./pdf_to_images.py", import.meta.url));
  try {
    const out = execFileSync(args.python, [script, pdf, sourceDir], { encoding: "utf8" });
    return JSON.parse(out.trim().split("\n").at(-1)).pages;
  } catch (error) {
    fail(`Rendering the pages failed (needs Python with pymupdf: pip install pymupdf): ${error.message}`);
  }
}

let plan;
if (fs.existsSync(planPath) && !args.input) {
  plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
} else {
  if (!args.input) fail("Missing --input <deck.pdf|deck.pptx>.");
  const input = path.resolve(args.input);
  if (!fs.existsSync(input)) fail(`Missing input: ${input}`);
  const pages = renderPages(input);
  if (!pages.length) fail("The input has no pages.");
  const zh = args.language !== "en";
  plan = {
    type: "ppt_plan",
    mode: "beautify",
    language: zh ? "zh" : "en",
    title: path.basename(input).replace(/\.[^.]+$/, ""),
    source: path.relative(outDir, input).replace(/\\/g, "/"),
    template: args.template ? path.resolve(args.template) : "",
    requirement: args.requirement,
    slides: pages.map((page, i) => ({
      id: `slide-${i + 1}`,
      title: zh ? `第 ${i + 1} 页` : `Slide ${i + 1}`,
      content: [],
      description: "",
      source: path.relative(outDir, page).replace(/\\/g, "/"),
    })),
  };
  writeJson(planPath, plan);
}

const templateValue = args.template || plan.template || "";
const template = templateValue ? imageRef(templateValue, args.template ? process.cwd() : outDir) : "";
const instruction = buildBeautifyInstruction(args.requirement || plan.requirement || "");
const order = plan.slides.map((slide) => slide.id);
const targets = selectSlides(plan.slides, args.only);
const manifest = loadManifest(outDir, plan.title);
manifest.model = channel.model;

console.log(`Beautifying ${targets.length} page(s), ${args.concurrency} at a time${template ? ", with the template" : ""}.`);
const results = [];
await runInParallel(
  targets.map((slide) => async () => {
    const prompt = buildEditPagePrompt({ page: slide, instruction, hasTemplate: Boolean(template), hasAdditional: false });
    const refs = [imageRef(slide.source, outDir), ...(template ? [template] : [])];
    try {
      const imageFile = writeSlideImage(outDir, slide.id, order.indexOf(slide.id), await requestImage(channel, prompt, refs));
      upsertSlide(manifest, { slideId: slide.id, title: slide.title, imageFile, aspectRatio: "16:9", status: "ok", error: null });
      results.push({ slideId: slide.id, status: "ok", imageFile });
    } catch (error) {
      upsertSlide(manifest, { slideId: slide.id, title: slide.title, status: "failed", error: errorMessage(error) });
      results.push({ slideId: slide.id, status: "failed", error: errorMessage(error) });
    }
    saveManifest(outDir, manifest, order);
    console.log(`[${results.length}/${targets.length}] ${slide.id} ${results.at(-1).status}`);
  }),
  Math.max(1, Number(args.concurrency) || DEFAULT_CONCURRENCY),
);
results.sort((a, b) => order.indexOf(a.slideId) - order.indexOf(b.slideId));
report(results, `node scripts/beautify-deck.mjs --out-dir ${args.outDir}`);
