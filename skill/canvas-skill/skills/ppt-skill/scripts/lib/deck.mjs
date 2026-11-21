import fs from "node:fs";
import path from "node:path";
import { generateImageThroughGateway } from "./gateway.mjs";
import { decodeDataUrl, fail, fileToDataUrl, imageExtensionFromMime, readJson, resolveFromCwd, safeSlug, writeJson } from "./common.mjs";
import { isRetryableBeautifyError } from "./website-prompts.mjs";

/**
 * A deck folder, shared by generate-slides, edit-slide and beautify-deck:
 *
 *   <deck>/plan.json             the confirmed plan (slides, language, template, materials)
 *   <deck>/slides/NN-<id>.<ext>  one current image per slide (an edit replaces it)
 *   <deck>/slides.manifest.json  what export-pdf and build-image-ppt read, plus each slide's status
 */

/** The website's fan-out limit is 5; 4 leaves room for a slower gateway. */
export const DEFAULT_CONCURRENCY = 4;
/** A gateway that accepts a request and never answers must not hang the deck. */
export const SLIDE_IMAGE_TIMEOUT_MS = 240_000;
const ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1200;
/** Material pictures one slide sends besides the template. */
const MATERIAL_LIMIT = 4;

export function parseArgs(argv, spec) {
  const args = { ...spec };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in spec)) fail(`Unknown option ${token}.`);
    if (typeof spec[key] === "boolean") args[key] = true;
    else {
      args[key] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

export function loadPlan(planFile) {
  const planPath = resolveFromCwd(planFile);
  if (!fs.existsSync(planPath)) fail(`Missing plan file: ${planPath}`);
  const plan = readJson(planPath);
  const slides = Array.isArray(plan?.slides) ? plan.slides : Array.isArray(plan) ? plan : [];
  if (slides.length === 0) fail("The plan has no slides.");
  slides.forEach((slide, i) => {
    slide.id = String(slide.id || `slide-${i + 1}`);
  });
  return { plan: Array.isArray(plan) ? { slides } : plan, planPath, planDir: path.dirname(planPath) };
}

/** A local path (relative to the plan) or a URL, as something the gateway can send. */
export function imageRef(value, baseDir) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:image)/i.test(raw)) return raw;
  const abs = path.resolve(baseDir, raw);
  if (!fs.existsSync(abs)) fail(`Missing image: ${abs}`);
  return fileToDataUrl(abs);
}

/**
 * The materials a slide asks for: {{image:Name}} in its description (in order of first mention), then its materialLabels.
 * Names come from the slide's own `materials` first, then the plan's; unreferenced ones are not sent.
 */
export function referencedMaterials(slide, plan) {
  const named = { ...(plan.materials || {}), ...(slide.materials || {}) };
  const seen = [];
  for (const match of String(slide.description || "").matchAll(/\{\{image:([^}]+)\}\}/g)) {
    const name = match[1].trim();
    if (!seen.includes(name)) seen.push(name);
  }
  // The planner's materialLabels, like the website's auto-attached materials, count as references too.
  for (const label of Array.isArray(slide.materialLabels) ? slide.materialLabels : []) {
    if (!seen.includes(label)) seen.push(String(label));
  }
  const missing = seen.filter((name) => !named[name]);
  if (missing.length) fail(`${slide.id}: no material named ${missing.join(", ")} in plan.materials or the slide's materials.`);
  return seen.slice(0, MATERIAL_LIMIT).map((label) => ({ label, path: named[label] }));
}

export function manifestPath(outDir) {
  return path.join(outDir, "slides.manifest.json");
}

export function loadManifest(outDir, name) {
  const file = manifestPath(outDir);
  if (fs.existsSync(file)) return readJson(file);
  return { type: "ppt_slide_manifest", name: name || "deck", slides: [] };
}

/** Writes the manifest with slides in plan order; called after every finished slide so a crash keeps what was drawn. */
export function saveManifest(outDir, manifest, order) {
  if (order) manifest.slides.sort((a, b) => order.indexOf(a.slideId) - order.indexOf(b.slideId));
  manifest.slides.forEach((slide, i) => {
    slide.order = i + 1;
  });
  manifest.updatedAt = new Date().toISOString();
  writeJson(manifestPath(outDir), manifest);
}

export function upsertSlide(manifest, entry) {
  const index = manifest.slides.findIndex((slide) => slide.slideId === entry.slideId);
  if (index >= 0) manifest.slides[index] = { ...manifest.slides[index], ...entry };
  else manifest.slides.push(entry);
}

/** Saves a data URL as the slide's image, replacing any earlier one. */
export function writeSlideImage(outDir, slideId, index, dataUrl) {
  const { mime, buffer } = decodeDataUrl(dataUrl);
  const slidesDir = path.join(outDir, "slides");
  fs.mkdirSync(slidesDir, { recursive: true });
  const stem = `${String(index + 1).padStart(2, "0")}-${safeSlug(slideId, `slide-${index + 1}`)}`;
  for (const old of fs.readdirSync(slidesDir)) {
    if (old.startsWith(`${stem}.`)) fs.rmSync(path.join(slidesDir, old));
  }
  const file = path.join(slidesDir, `${stem}.${imageExtensionFromMime(mime, "png")}`);
  fs.writeFileSync(file, buffer);
  return path.relative(outDir, file).replace(/\\/g, "/");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error) =>
  error?.name === "TimeoutError" || error?.name === "AbortError" || isRetryableBeautifyError(error) || /status 5\d\d/.test(String(error?.message));

/**
 * One image request with the timeout and the website's retry policy (rate limits, timeouts, gateway errors;
 * exponential backoff). `retryAnyFailure` retries every failure, as slide edits do.
 */
export async function requestImage(channel, prompt, referenceImageUrls, { retryAnyFailure = false } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await generateImageThroughGateway({
        channel, prompt, referenceImageUrls, signal: AbortSignal.timeout(SLIDE_IMAGE_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if ((!retryAnyFailure && !isRetryable(error)) || attempt === ATTEMPTS) break;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 350));
    }
  }
  throw lastError;
}

/** Runs the tasks with at most `limit` in flight; never rejects (each task records its own failure). */
export async function runInParallel(tasks, limit) {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, worker));
}

export function errorMessage(error) {
  if (error?.name === "TimeoutError") return `timed out after ${SLIDE_IMAGE_TIMEOUT_MS / 1000}s`;
  return error instanceof Error ? error.message : String(error);
}

export function selectSlides(slides, only) {
  if (!only) return slides;
  const wanted = String(only).split(",").map((id) => id.trim()).filter(Boolean);
  const unknown = wanted.filter((id) => !slides.some((slide) => slide.id === id));
  if (unknown.length) fail(`Unknown slide id: ${unknown.join(", ")}`);
  return slides.filter((slide) => wanted.includes(slide.id));
}

/** Prints the per-slide outcome and exits 2 when any slide failed, naming the ids to retry. */
export function report(results, retryHint) {
  const failed = results.filter((r) => r.status === "failed");
  for (const r of results) {
    console.log(r.status === "ok" ? `ok      ${r.slideId}  ${r.imageFile}` : `failed  ${r.slideId}  ${r.error}`);
  }
  console.log(`${results.length - failed.length}/${results.length} slides done.`);
  if (failed.length) {
    console.log(`Retry the failed slides with: ${retryHint} --only ${failed.map((r) => r.slideId).join(",")}`);
    process.exitCode = 2;
  }
}
