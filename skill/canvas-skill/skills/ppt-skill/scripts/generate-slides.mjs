#!/usr/bin/env node
/**
 * Draws the deck's slide images from the confirmed plan, several at a time.
 *
 *   node scripts/generate-slides.mjs --plan <deck>/plan.json [--out-dir <deck>] [--template <image>]
 *        [--concurrency 4] [--only slide-2,slide-5] [--extra "text for every slide"] [--config-file <json>]
 *
 * Each slide uses the website's slide-image prompt with the template (style and colour tone only) and the
 * materials its description names with {{image:Name}}. A failed request is retried (timeouts, rate limits,
 * gateway errors); a slide that still fails is listed with the --only command that redraws just those.
 */
import path from "node:path";
import { loadImageConfig, fail } from "./lib/common.mjs";
import {
  DEFAULT_CONCURRENCY, errorMessage, imageRef, loadManifest, loadPlan, parseArgs, referencedMaterials, report,
  requestImage, runInParallel, saveManifest, selectSlides, upsertSlide, writeSlideImage,
} from "./lib/deck.mjs";
import { buildPageImagePrompt } from "./lib/website-prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  plan: "", outDir: "", template: "", concurrency: String(DEFAULT_CONCURRENCY), only: "", extra: "", configFile: "", name: "",
});
if (!args.plan) fail("Missing --plan <plan.json>.");

const { plan, planDir } = loadPlan(args.plan);
const outDir = path.resolve(args.outDir || planDir);
const channel = loadImageConfig(args.configFile);
const language = plan.language === "en" ? "en" : "zh";
const templateValue = args.template || plan.template || "";
const template = templateValue ? imageRef(templateValue, args.template ? process.cwd() : planDir) : "";
const order = plan.slides.map((slide) => slide.id);
const targets = selectSlides(plan.slides, args.only);
const manifest = loadManifest(outDir, args.name || plan.title || plan.theme);
manifest.model = channel.model;

console.log(`Drawing ${targets.length} slide(s), ${args.concurrency} at a time${template ? ", with the template" : ""}.`);
const results = [];
await runInParallel(
  targets.map((slide) => async () => {
    const index = order.indexOf(slide.id);
    const materials = referencedMaterials(slide, plan);
    const prompt = buildPageImagePrompt({
      page: slide,
      uiLanguage: language,
      hasTemplate: Boolean(template),
      materialLabels: materials.map((m) => m.label),
      extraRequirements: [args.extra, slide.extraRequirements].filter(Boolean).join("\n"),
    });
    const refs = [...(template ? [template] : []), ...materials.map((m) => imageRef(m.path, planDir))];
    try {
      const imageFile = writeSlideImage(outDir, slide.id, index, await requestImage(channel, prompt, refs));
      upsertSlide(manifest, { slideId: slide.id, title: slide.title || null, imageFile, aspectRatio: "16:9", status: "ok", error: null });
      results.push({ slideId: slide.id, status: "ok", imageFile });
    } catch (error) {
      upsertSlide(manifest, { slideId: slide.id, title: slide.title || null, status: "failed", error: errorMessage(error) });
      results.push({ slideId: slide.id, status: "failed", error: errorMessage(error) });
    }
    saveManifest(outDir, manifest, order);
    console.log(`[${results.length}/${targets.length}] ${slide.id} ${results.at(-1).status}`);
  }),
  Math.max(1, Number(args.concurrency) || DEFAULT_CONCURRENCY),
);
results.sort((a, b) => order.indexOf(a.slideId) - order.indexOf(b.slideId));
report(results, `node scripts/generate-slides.mjs --plan ${args.plan}${args.outDir ? ` --out-dir ${args.outDir}` : ""}`);
