#!/usr/bin/env node
/**
 * Changes drawn slides, the way the website applies routed slide edits.
 *
 *   node scripts/edit-slide.mjs --plan <deck>/plan.json --edits edits.json [--out-dir <deck>] [--concurrency 4] [--only slide-3]
 *   node scripts/edit-slide.mjs --plan <deck>/plan.json --slide slide-3 --mode edit --instruction "..." [--refs a.png,b.png]
 *
 * edits.json: [{ "slideId": "slide-3", "mode": "edit" | "redraw", "instruction": "...", "refs": ["optional.png"],
 *               "styleRefs": ["slide-2" | "style.png"], "styleRefPolicy": "style_only" | "style_and_layout" }]
 *   refs      -- pictures the user gave in chat; they are placed in the slide unchanged (website: 对话图 n).
 *   styleRefs -- other slides (by id) or images whose style (and, with style_and_layout, layout) to follow.
 *   edit   -- the current slide image is the base and only the instruction changes (website: background_redraw on
 *             a slide whose text did not change). Up to 2 extra reference images, then the template; if that
 *             request fails, it is tried with the base image and template alone, as the website does.
 *   redraw -- the slide is drawn again from its (updated) plan entry with the instruction as extra requirements
 *             (website: text_only / text_relayout, or any slide whose title or bullets changed).
 * Update plan.json first when the edit changes a slide's title, bullets or description. The new image replaces
 * the old one; the manifest keeps pointing at it.
 */
import path from "node:path";
import { loadImageConfig, fail, readJson } from "./lib/common.mjs";
import {
  DEFAULT_CONCURRENCY, errorMessage, imageRef, loadManifest, loadPlan, parseArgs, referencedMaterials, report,
  requestImage, runInParallel, saveManifest, upsertSlide, writeSlideImage,
} from "./lib/deck.mjs";
import {
  buildChatImagesInstruction, buildEditPagePrompt, buildPageImagePrompt, buildStyleReferenceInstruction,
} from "./lib/website-prompts.mjs";

const args = parseArgs(process.argv.slice(2), {
  plan: "", outDir: "", edits: "", slide: "", mode: "edit", instruction: "", refs: "", template: "",
  concurrency: String(DEFAULT_CONCURRENCY), configFile: "", only: "",
});
if (!args.plan) fail("Missing --plan <plan.json>.");
const edits = args.edits
  ? readJson(path.resolve(args.edits))
  : args.slide ? [{ slideId: args.slide, mode: args.mode, instruction: args.instruction, refs: args.refs ? args.refs.split(",") : [] }] : [];
if (!Array.isArray(edits) || edits.length === 0) fail("Give --edits <edits.json> or --slide <id> --instruction <text>.");
if (args.only) {
  const wanted = args.only.split(",").map((id) => id.trim());
  edits.splice(0, edits.length, ...edits.filter((edit) => wanted.includes(edit.slideId)));
}

const { plan, planDir } = loadPlan(args.plan);
const outDir = path.resolve(args.outDir || planDir);
const channel = loadImageConfig(args.configFile);
const language = plan.language === "en" ? "en" : "zh";
const templateValue = args.template || plan.template || "";
const template = templateValue ? imageRef(templateValue, args.template ? process.cwd() : planDir) : "";
const order = plan.slides.map((slide) => slide.id);
const manifest = loadManifest(outDir);
const editsBase = args.edits ? path.dirname(path.resolve(args.edits)) : process.cwd();

for (const edit of edits) {
  if (!order.includes(edit.slideId)) fail(`Unknown slide id: ${edit.slideId}`);
  if (edit.mode !== "edit" && edit.mode !== "redraw") fail(`${edit.slideId}: mode must be "edit" or "redraw".`);
  if (edit.mode === "edit" && !String(edit.instruction || "").trim()) fail(`${edit.slideId}: an edit needs an instruction.`);
  for (const ref of edit.styleRefs || []) {
    if (order.includes(ref) && !manifest.slides.find((s) => s.slideId === ref)?.imageFile) fail(`${edit.slideId}: style reference ${ref} has no drawn image.`);
  }
}

const results = [];
await runInParallel(
  edits.map((edit) => async () => {
    const slide = plan.slides.find((s) => s.id === edit.slideId);
    const index = order.indexOf(slide.id);
    const instruction = String(edit.instruction || "").trim();
    const extras = (edit.refs || []).map((ref) => imageRef(ref, editsBase));
    const chatLabels = extras.map((_, i) => (language === "zh" ? `对话图${i + 1}` : `Chat image ${i + 1}`));
    // Style references: another slide's current image, or an outside picture (labels as the website names them).
    let externalCount = 0;
    const styleRefs = (edit.styleRefs || []).filter((ref) => ref !== slide.id).map((ref) => {
      if (order.includes(ref)) {
        const file = manifest.slides.find((s) => s.slideId === ref).imageFile;
        return { url: imageRef(file, outDir), label: `STYLE_REF_SLIDE_${ref.replace(/[^a-zA-Z0-9_-]/g, "_")}`, source: ref };
      }
      externalCount += 1;
      return { url: imageRef(ref, editsBase), label: `STYLE_REF_EXTERNAL_${externalCount}`, source: `external-${externalCount}` };
    });
    const policy = edit.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only";
    const fullInstruction = [
      instruction, buildStyleReferenceInstruction(language, policy, styleRefs), buildChatImagesInstruction(language, chatLabels),
    ].filter(Boolean).join("\n");
    const materials = referencedMaterials(slide, plan);
    let prompt;
    let refs;
    let fallback = null;
    if (edit.mode === "edit") {
      const current = manifest.slides.find((s) => s.slideId === slide.id);
      if (!current?.imageFile) {
        results.push({ slideId: slide.id, status: "failed", error: "no drawn image to edit yet; use mode redraw" });
        return;
      }
      const additional = [...new Set([...styleRefs.map((r) => r.url), ...extras, ...materials.map((m) => imageRef(m.path, planDir))])].slice(0, 2);
      const base = imageRef(current.imageFile, outDir);
      prompt = buildEditPagePrompt({ page: slide, instruction: fullInstruction, hasTemplate: Boolean(template), hasAdditional: additional.length > 0 });
      refs = [base, ...additional, ...(template ? [template] : [])];
      // The website retries an edit without the extra pictures when they make the request fail (too large, rejected).
      if (additional.length > 0) fallback = [base, ...(template ? [template] : [])];
    } else {
      const labels = materials.map((m) => m.label);
      prompt = buildPageImagePrompt({
        page: slide, uiLanguage: language, hasTemplate: Boolean(template),
        materialLabels: [...styleRefs.map((r) => r.label), ...labels, ...chatLabels],
        extraRequirements: fullInstruction,
      });
      refs = [...(template ? [template] : []), ...styleRefs.map((r) => r.url), ...materials.map((m) => imageRef(m.path, planDir)), ...extras];
    }
    try {
      let image;
      try {
        image = await requestImage(channel, prompt, refs, { retryAnyFailure: true });
      } catch (error) {
        if (!fallback) throw error;
        console.warn(`${slide.id}: retrying without the extra reference images (${errorMessage(error)})`);
        image = await requestImage(channel, prompt, fallback, { retryAnyFailure: true });
      }
      const imageFile = writeSlideImage(outDir, slide.id, index, image);
      upsertSlide(manifest, { slideId: slide.id, title: slide.title || null, imageFile, aspectRatio: "16:9", status: "ok", error: null });
      results.push({ slideId: slide.id, status: "ok", imageFile });
    } catch (error) {
      results.push({ slideId: slide.id, status: "failed", error: errorMessage(error) });
    }
    saveManifest(outDir, manifest, order);
  }),
  Math.max(1, Number(args.concurrency) || DEFAULT_CONCURRENCY),
);
results.sort((a, b) => order.indexOf(a.slideId) - order.indexOf(b.slideId));
report(results, `node scripts/edit-slide.mjs --plan ${args.plan} --edits ${args.edits || "<edits.json>"}`);
