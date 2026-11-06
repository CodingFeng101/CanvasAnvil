/**
 * Experimental v2: slide-alchemy as a code skeleton with model judgment nodes,
 * pages rebuilt in parallel.
 *
 *   npx tsx scripts/slide-agent/pipeline.ts --run <dir> <slide.png> [...]
 *
 * Code does the mechanical steps (OCR, image calls, slicing, edge checks,
 * composition, PowerPoint export, QA). The model is asked only for judgment:
 *   1. one call: base grouping + clean-base prompts for the whole deck
 *   2. after the bases, one call per page in parallel (source + its clean
 *      base), then a short lead call merging duplicate components across
 *      pages; code fills the mechanical fields and the sheet plan, and the
 *      skill's validator checks the merged element_analysis.json. PNG
 *      components are generated once, shared by all pages, with the skill's
 *      sheet template
 *   Run by the app's editable export (server/routes/editable-export.ts).
 *   3. per page, in parallel: place the page's instances (compose spec),
 *      regenerate only missing or wrong assets, fix what QA reports
 * Bases off the source's aspect ratio are regenerated, never stretched.
 * Every reference a node needs is put in its prompt, so nodes do not spend
 * turns reading files. Image generation runs in the background while the model
 * keeps working.
 *
 * Flags: --qa-rounds N (QA rounds per page, the user's choice; default 3 or
 * SLIDE_AGENT_QA_ROUNDS), --merge-only. Environment: see lib.ts. Also
 * SLIDE_AGENT_PAGE_CONCURRENCY (default 4), SLIDE_AGENT_PAGE_STEPS (default 14).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { chat, clip, exec, HERE, imagePart, mutex, MODEL, parseJsonReply, PYTHON, requireConfig, runNode, script, SKILL, skillRef, usage, type Tool } from "./lib";

requireConfig();
const args = process.argv.slice(2);
const runIdx = args.indexOf("--run");
if (runIdx < 0 || !args[runIdx + 1]) {
  console.error("usage: pipeline.ts --run <dir> <slide.png> [...]");
  process.exit(1);
}
const RUN = resolve(args[runIdx + 1]);
/** --merge-only: rebuild the deck from existing pages/pXXX outputs. */
const MERGE_ONLY = args.includes("--merge-only");
/** --qa-rounds N: the user's choice of QA rounds per page; a page stops early only when QA passes. */
const qaIdx = args.indexOf("--qa-rounds");
const QA_ROUNDS = Math.max(1, Number(qaIdx >= 0 ? args[qaIdx + 1] : process.env.SLIDE_AGENT_QA_ROUNDS || 3) || 3);
const flagSlots = new Set([runIdx, runIdx + 1, ...(qaIdx >= 0 ? [qaIdx, qaIdx + 1] : [])]);
const SOURCES = args.filter((a, i) => !flagSlots.has(i) && a !== "--merge-only").map((p) => resolve(p));
const PAGE_CONCURRENCY = Number(process.env.SLIDE_AGENT_PAGE_CONCURRENCY || 4);
// Each QA round costs about three turns (fix, check, look); the cap must not cut the user's rounds short.
const PAGE_STEPS = Math.max(Number(process.env.SLIDE_AGENT_PAGE_STEPS || 14), 4 + 3 * QA_ROUNDS);
const KEY = "#00FF00";
const QA_SCRIPT = join(HERE, "qa_check.py");
const LOG = join(RUN, "pipeline_log.jsonl");
const pad3 = (n: number) => String(n).padStart(3, "0");

const t0 = Date.now();
const timeline: { stage: string; start: number; end: number }[] = [];
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = (Date.now() - t0) / 1000;
  console.log(`\n=== ${name} (t=${start.toFixed(0)}s) ===`);
  emit({ type: "stage", stage: name, status: "start" });
  let failed = false;
  try {
    return await fn();
  } catch (err: any) {
    failed = true;
    emit({ type: "line", stage: name, level: "error", text: clip(String(err?.message || err), 400) });
    throw err;
  } finally {
    const end = (Date.now() - t0) / 1000;
    timeline.push({ stage: name, start: Math.round(start), end: Math.round(end) });
    console.log(`=== ${name} done in ${(end - start).toFixed(0)}s ===`);
    emit({ type: "stage", stage: name, status: failed ? "failed" : "done", seconds: Math.round(end - start) });
  }
}
const log = (e: object) => appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...e }) + "\n");

/**
 * Progress for the app's run panel (server/routes/editable-export.ts): one
 * "@@event {json}" line per event on stdout. Kinds: stage (start/done/failed),
 * line (a step, in Chinese for the panel) and artifact (a file worth looking
 * at, path relative to the run directory). page ties an event to one slide.
 */
type ProgressEvent =
  | { type: "stage"; stage: string; status: "start" | "done" | "failed"; seconds?: number }
  | { type: "page"; page: number; status: "start" | "done" }
  | { type: "line"; stage: string; text: string; level?: "info" | "warn" | "error"; page?: number }
  | { type: "artifact"; stage: string; label: string; path: string; page?: number };
const emit = (e: ProgressEvent) => console.log(`@@event ${JSON.stringify({ t: Math.round((Date.now() - t0) / 1000), ...e })}`);
const runRel = (abs: string) => relative(RUN, abs).replace(/\\/g, "/");

const exportLock = mutex();
async function exportPreview(pptx: string, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  const q = (s: string) => s.replace(/'/g, "''");
  const ps = `$ErrorActionPreference='Stop'
$pp = New-Object -ComObject PowerPoint.Application
$p = $pp.Presentations.Open('${q(pptx)}', $true, $false, $false)
$ratio = $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth
$i = 1
foreach ($s in $p.Slides) { $s.Export((Join-Path '${q(outDir)}' ('slide_{0:D3}.png' -f $i)), 'PNG', 1672, [int](1672 * $ratio)); $i++ }
$p.Close()
"exported $($i-1)"`;
  return exportLock(() => exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { cwd: RUN, timeoutMs: 5 * 60_000 }));
}

async function generateImage(cwd: string, promptFile: string, out: string, reference?: string, size?: string) {
  const argv = [`@${promptFile}`, out];
  if (reference) argv.push("--reference", reference);
  if (size) argv.push("--size", size);
  let r = await script("generate_image.py", argv, cwd);
  // The gateway drops TLS connections now and then, sometimes for half a minute;
  // an image call is worth five tries with a growing pause.
  for (let attempt = 2; r.code !== 0 && attempt <= 5; attempt++) {
    console.log(`[image] ${out} failed (${clip(r.out, 160).replace(/\s+/g, " ")}), retry ${attempt}/5`);
    await new Promise((res) => setTimeout(res, 10_000 * (attempt - 1)));
    r = await script("generate_image.py", argv, cwd);
  }
  if (r.code !== 0) throw new Error(`generate_image failed: ${clip(r.out, 800)}`);
  const m = r.out.match(/\{[\s\S]*\}/);
  return m ? JSON.parse(m[0]) : {};
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

type Asset = { id: string; description: string; bbox_px?: number[] };

/**
 * The model's notes and descriptions sometimes ask for a "transparent
 * background"; an image model answers that by painting a checkerboard, which
 * no key can remove. Transparency is the slicer's job, so those sentences go.
 */
function cleanNotes(text: string) {
  return text
    .split(/(?<=[.!?。；;])\s*/)
    .filter((s) => !/transparen|checker|alpha|rgba|matte|透明|棋盘/i.test(s))
    .join(" ")
    .trim();
}

/** The skill's own sheet prompt (references/icon-sheet-prompt-template.md), filled in. */
const SHEET_TEMPLATE = (() => {
  const m = skillRef("icon-sheet-prompt-template.md").match(/```text\s*([\s\S]*?)```/);
  if (!m) throw new Error("icon-sheet-prompt-template.md has no ```text block");
  return m[1].trim();
})();
const NO_CHECKER = `Paint the key colour ${KEY} as one flat solid fill: never a checkerboard or transparency pattern, no plate or tile behind an asset.`;

function sheetPrompt(kind: "icon" | "complex", assets: Asset[], notes: string) {
  const list = assets.map((a, i) => `${i + 1}. ${a.id}: ${a.description}`).join("\n");
  let text = SHEET_TEMPLATE.replace("<list icon ids and descriptions>", list).replace(/<run key_color>/g, KEY);
  if (kind === "icon") {
    text += `\nLayout: put the ${assets.length} assets in a 3x3 layout in the listed order, left to right and top to bottom; leave unused positions empty key colour.`;
  } else {
    // Approved deviation from the template's 2x2 packing: one composite per
    // canvas shaped like its bbox, since a grid cell is too small for it.
    text = text.replace(/^Make one 16:9 asset sheet[^\n]*$/m, `Make one asset sheet holding only this single composite, filling the canvas with about 5% key-colour margin on every side, on a solid key-color background ${KEY}. Keep its own proportions and the arrangement of all its parts exactly as on the slide.`);
  }
  return `${text}\n${NO_CHECKER}\n${notes}`.trim();
}

/** gpt-image sizes: pick the one nearest the element's aspect ratio. */
function canvasFor(bbox?: number[]) {
  if (!bbox || bbox.length !== 4 || !bbox[2] || !bbox[3]) return "1024x1024";
  const r = bbox[2] / bbox[3];
  return r > 1.25 ? "1536x1024" : r < 0.8 ? "1024x1536" : "1024x1024";
}

/**
 * Generate one sheet in `cwd` (its prompts/, assets/sheets|crop_specs|png),
 * then slice it by finding its drawings (as CanvasAnvil's findBlobs does). A
 * sheet whose drawing count differs from its ids is rejected, not sliced.
 */
async function makeSheet(cwd: string, name: string, kind: "icon" | "complex", assets: Asset[], notes: string, reference: string, page?: number): Promise<{ ok: boolean; report: string }> {
  const at = { stage: page ? "pages" : "shared-assets", page };
  const what = kind === "icon" ? `图标素材表（${assets.length} 个）` : "插图";
  emit({ type: "line", ...at, text: `开始绘制${what}：${assets.map((a) => a.id).join("、")}` });
  for (const d of ["prompts", "assets/sheets", "assets/crop_specs", "assets/png"]) mkdirSync(join(cwd, d), { recursive: true });
  const promptRel = `prompts/sheet_${name}.txt`;
  writeFileSync(join(cwd, promptRel), sheetPrompt(kind, assets, notes), "utf8");
  const sheetRel = `assets/sheets/${name}.png`;
  const size = kind === "icon" ? "1536x1024" : canvasFor(assets[0].bbox_px);
  await generateImage(cwd, promptRel, sheetRel, reference, size);
  emit({ type: "artifact", ...at, label: kind === "icon" ? `素材表 ${name}` : `插图 ${assets[0].id}`, path: runRel(join(cwd, sheetRel)) });
  const cropRel = `assets/crop_specs/${name}.json`;
  const found = await exec(PYTHON, [join(HERE, "slice_blobs.py"), sheetRel, cropRel, "--ids", assets.map((a) => a.id).join(","), "--key", KEY], { cwd, timeoutMs: 60_000 });
  let blobs: any = {};
  try {
    blobs = JSON.parse(found.out.trim().split(/\r?\n/).pop() || "{}");
  } catch {
    blobs = { ok: false, error: clip(found.out, 300) };
  }
  const ids = assets.map((a) => a.id).join(", ");
  if (!blobs.ok) {
    for (const a of assets) rmSync(join(cwd, "assets", "png", `${a.id}.png`), { force: true });
    emit({ type: "line", ...at, level: "warn", text: `${name} 数量不对：画出 ${blobs.found ?? "?"} 个，需要 ${assets.length} 个，作废` });
    return { ok: false, report: `sheet ${name}: REJECTED, found ${blobs.found ?? "?"} drawings for ${assets.length} assets (${ids})${blobs.error ? ` ${blobs.error}` : ""}; nothing sliced (${sheetRel}).` };
  }
  const s = await script("slice_asset_sheet.py", [sheetRel, cropRel, "assets/png", "--trim", "--pad", "16", "--edge-px", "3"], cwd);
  if (s.code !== 0) return { ok: false, report: `sheet ${name}: slicing failed ${clip(s.out, 400)}` };
  const e = await script("inspect_edges.py", assets.map((a) => `assets/png/${a.id}.png`), cwd);
  for (const a of assets)
    if (existsSync(join(cwd, "assets", "png", `${a.id}.png`))) emit({ type: "artifact", ...at, label: a.id, path: runRel(join(cwd, "assets", "png", `${a.id}.png`)) });
  return { ok: true, report: `sheet ${name} (${ids}): ${e.out.trim().replace(/\s+/g, " ")}` };
}

// ---------- setup ----------
mkdirSync(join(RUN, "source"), { recursive: true });
mkdirSync(join(RUN, "analysis"), { recursive: true });
mkdirSync(join(RUN, "prompts"), { recursive: true });
mkdirSync(join(RUN, "base"), { recursive: true });
mkdirSync(join(RUN, "out"), { recursive: true });
SOURCES.forEach((src, i) => copyFileSync(src, join(RUN, "source", `slide_${pad3(i + 1)}${extname(src) || ".png"}`)));
const N = MERGE_ONLY ? readdirSync(join(RUN, "source")).filter((f) => /^slide_\d+\.png$/.test(f)).length : SOURCES.length;
const sourceRel = (i: number) => `source/slide_${pad3(i)}.png`;

// OCR runs while the model plans the bases.
const ocr = MERGE_ONLY ? Promise.resolve(null as any) : stage("ocr", async () => {
  const r = await script("extract_text.py", [...Array.from({ length: N }, (_, i) => sourceRel(i + 1)), "--out", "analysis/texts_layout.json"], RUN);
  if (r.code !== 0) throw new Error(`OCR failed: ${clip(r.out, 800)}`);
  const layout = JSON.parse(readFileSync(join(RUN, "analysis", "texts_layout.json"), "utf8"));
  for (const s of layout.slides) emit({ type: "line", stage: "ocr", page: s.slide, text: `第 ${s.slide} 页识别出 ${s.texts.length} 段文字` });
  return layout;
});

// ---------- 1. grouping + base prompts: one model call ----------
type Group = { id: string; slides: number[]; reference_slide: number; prompt: string };
// Not awaited here: the deck analysis below runs alongside it.
const groupsP: Promise<Group[]> = MERGE_ONLY ? Promise.resolve([]) : stage("grouping", async () => {
  const images: any[] = [];
  for (let i = 1; i <= N; i++) images.push(...(await imagePart(join(RUN, sourceRel(i)), 900, `slide ${i}`)));
  const system = `You plan clean base backgrounds for the slide-alchemy workflow. Unattended run: decide yourself.

<base-grouping>
${skillRef("base-grouping.md")}
</base-grouping>

<base-prompt-template>
${skillRef("base-prompt-template.md")}
</base-prompt-template>

Reply with JSON only:
{"groups":[{"id":"g1","slides":[1,2],"reference_slide":1,"prompt":"<full image-edit prompt for this group's clean base, following the template, specific to what this background shows>"}],"notes":"<one line>"}
Every slide belongs to exactly one group. The base is produced by editing the reference slide, so the prompt says what to keep and what to remove on that slide.`;
  const resp = await chat({ messages: [{ role: "system", content: system }, { role: "user", content: [{ type: "text", text: `${N} slide(s) follow.` }, ...images] }] });
  const reply = String(resp.choices?.[0]?.message?.content || "");
  log({ node: "grouping", reply });
  const parsed = parseJsonReply(reply);
  writeFileSync(join(RUN, "analysis", "decisions.md"), `# Base grouping\n\n${parsed.notes || ""}\n\n\`\`\`json\n${JSON.stringify(parsed.groups, null, 2)}\n\`\`\`\n`);
  for (const g of parsed.groups as Group[]) emit({ type: "line", stage: "grouping", text: `底图 ${g.id}：第 ${g.slides.join("、")} 页共用` });
  return parsed.groups as Group[];
});

// ---------- 2. clean bases: code, in parallel ----------
const bases = MERGE_ONLY ? Promise.resolve([]) : groupsP.then((groups) => stage("bases", () =>
  Promise.all(
    groups.map(async (g) => {
      writeFileSync(join(RUN, "prompts", `base_${g.id}.txt`), g.prompt, "utf8");
      const out = `base/base_${g.id}.png`;
      const src = readFileSync(join(RUN, sourceRel(g.reference_slide)));
      const srcRatio = src.readUInt32BE(16) / src.readUInt32BE(20);
      // The skill: a base off the source's aspect ratio by more than 1% is
      // regenerated, never stretched or cropped to fit.
      for (let attempt = 1; ; attempt++) {
        const info = await generateImage(RUN, `prompts/base_${g.id}.txt`, out, sourceRel(g.reference_slide));
        const [w, h] = info.size || [0, 0];
        if (w && Math.abs(w / h - srcRatio) / srcRatio <= 0.01) break;
        if (attempt >= 3) throw new Error(`base ${g.id}: aspect ${w}x${h} still off the source after 3 attempts; refusing to stretch it`);
        console.log(`[bases] ${g.id} aspect ${w}x${h} off the source, regenerating (${attempt + 1}/3)`);
        emit({ type: "line", stage: "bases", level: "warn", text: `底图 ${g.id} 比例不对（${w}x${h}），重新生成（${attempt + 1}/3）` });
      }
      emit({ type: "artifact", stage: "bases", label: `底图 ${g.id}`, path: out });
      for (const s of g.slides) copyFileSync(join(RUN, out), join(RUN, "base", `slide_${pad3(s)}_base.png`));
    }),
  ),
));

// ---------- 2b. element analysis: per page in parallel after the bases, then the lead merges ----------
// The skill's order: clean bases first, then element analysis, with the base
// beside the page so background art is not mistaken for elements. Page-level
// analysis may run in parallel (the skill allows it); the lead merges the
// pages and deduplicates shared components into one element_analysis.json.
type Analysis = { ref_width: number; ref_height: number; components: Record<string, any>; slides: { slide: number; instances: any[]; notes?: string }[] };

const ASSET_PLAN: Record<string, string> = { simple_geometry_svg_ooxml: "svg_to_ooxml", icon_png: "generate_png_asset", complex_png_whole: "generate_png_whole" };

/** Mechanical fields are code's job: asset_plan from category, reuse default, bbox_frac from bbox_px. */
function normalisePage(raw: any, page: number, w: number, h: number) {
  const components: Record<string, any> = {};
  for (const [id, c] of Object.entries<any>(raw.components || {})) {
    if (!ASSET_PLAN[c?.category]) continue;
    components[id] = { ...c, asset_plan: ASSET_PLAN[c.category], reuse: String(c.reuse || "single use") };
  }
  const instances = (raw.instances || [])
    .filter((i: any) => components[i.component] && Array.isArray(i.bbox_px) && i.bbox_px.length === 4 && Math.max(0, i.bbox_px[0]) < i.bbox_px[0] + i.bbox_px[2] && Math.max(0, i.bbox_px[1]) < i.bbox_px[1] + i.bbox_px[3])
    .map((i: any, n: number) => {
      // Clamp to the slide: the schema rejects negative origins.
      const [x0, y0, w0, h0] = i.bbox_px.map(Number);
      const x = Math.max(0, x0), y = Math.max(0, y0), bw = w0 - (x - x0), bh = h0 - (y - y0);
      return { ...i, id: String(i.id || `${i.component}_${n + 1}`), bbox_px: [x, y, bw, bh], bbox_frac: [x / w, y / h, bw / w, bh / h].map((v) => Math.round(v * 1e6) / 1e6) };
    });
  return { components, slide: { slide: page, instances, notes: String(raw.notes || "") } };
}

const pageAnalysisSystem = `You analyse ONE slide page for the slide-alchemy workflow: every non-text visual element that is NOT part of the clean base.

<element-classification>
${skillRef("element-classification.md")}
</element-classification>

Rules:
- Compare the SOURCE with its clean BASE: anything also on the base (background gradients, waves, scenery, buildings, edge ornaments) is background, never an element.
- One component per distinct visual design, reused within the page (four identical cards = one component, four instances).
- category is one of simple_geometry_svg_ooxml, icon_png, complex_png_whole.
- PNG components: png_hint is the full drawing brief for the image model (shape, colours, parts, orientation, style); it sees nothing else about the component.
- Geometry components: svg_hint gives kind (rect, round_rect, oval, line, star), fill, outline, corner radius in px, transparency.
- Every instance: component, unique id, bbox_px [x,y,w,h] = the drawing's own bounds in source pixels. Include small things: bullet dots, connectors, arrows and arrowheads, accent bars, rings, dividers.
- Ink that belongs to words (e.g. a gradient-coloured word the OCR missed) is text, not an element: say so in "notes".
Reply with JSON only:
{"components":{"<id>":{"category":"...","reuse":"...","png_hint":"..." | "svg_hint":"..."}},"instances":[{"component":"<id>","id":"<id>","bbox_px":[x,y,w,h]}],"notes":"..."}`;

async function analysePage(page: number, slideLayout: any) {
  const content: any[] = [
    { type: "text", text: `Page ${page}, ${slideLayout.width}x${slideLayout.height} px. OCR text (already handled, not elements): ${JSON.stringify(slideLayout.texts.map((t: any) => ({ text: t.text, bbox_px: t.bbox_px })))}` },
    ...(await imagePart(join(RUN, sourceRel(page)), 1672, "SOURCE (full resolution: read coordinates from this one)")),
    ...(await imagePart(join(RUN, "base", `slide_${pad3(page)}_base.png`), 900, "clean BASE")),
  ];
  const messages: any[] = [{ role: "system", content: pageAnalysisSystem }, { role: "user", content }];
  for (let attempt = 1; ; attempt++) {
    const resp = await chat({ messages });
    const reply = String(resp.choices?.[0]?.message?.content || "");
    log({ node: `analysis-p${page}`, attempt, reply: clip(reply, 20000) });
    try {
      const out = normalisePage(parseJsonReply(reply), page, slideLayout.width, slideLayout.height);
      if (out.slide.instances.length || !Object.keys(out.components).length) {
        const count = (c: string) => Object.values(out.components).filter((x: any) => x.category === c).length;
        emit({ type: "line", stage: "analysis", page, text: `第 ${page} 页：${out.slide.instances.length} 个元素，形状 ${count("simple_geometry_svg_ooxml")} 种、图标 ${count("icon_png")} 种、插图 ${count("complex_png_whole")} 种` });
        return out;
      }
      throw new Error("no usable instances");
    } catch (err: any) {
      if (attempt >= 2) throw new Error(`page ${page} analysis unusable: ${err?.message || err}`);
      messages.push({ role: "assistant", content: reply }, { role: "user", content: `Unusable (${err?.message || err}). Reply with the corrected JSON object only.` });
    }
  }
}

/** The lead's dedupe: one short text call naming components that are the same design on different pages. */
async function dedupe(components: Record<string, any>): Promise<Record<string, string>> {
  const list = Object.entries(components).map(([id, c]) => ({ id, category: c.category, hint: c.png_hint || c.svg_hint || c.notes || "" }));
  if (list.length < 2) return {};
  const resp = await chat({
    messages: [
      { role: "system", content: 'These components were found on different pages of one deck. Merge components that are the same visual design (same icon, same card style, same divider), so it is generated once and reused. Only merge within the same category. Reply with JSON only: {"merge":{"<duplicate id>":"<id to keep>"}} ({} if none).' },
      { role: "user", content: JSON.stringify(list) },
    ],
  });
  const reply = String(resp.choices?.[0]?.message?.content || "");
  log({ node: "dedupe", reply });
  try {
    const merge = parseJsonReply(reply).merge || {};
    return Object.fromEntries(Object.entries<string>(merge).filter(([dup, keep]) => dup !== keep && components[dup] && components[keep] && components[dup].category === components[keep].category));
  } catch {
    return {};
  }
}

const analysis: Promise<Analysis | null> = MERGE_ONLY
  ? Promise.resolve(null)
  : Promise.all([ocr, bases]).then(([layout0]) =>
      stage("analysis", async () => {
        const pages = await Promise.all(layout0.slides.map((s: any) => analysePage(s.slide, s)));
        // Page-prefixed ids cannot collide; the lead then folds duplicates together.
        const components: Record<string, any> = {};
        const slides: Analysis["slides"] = [];
        pages.forEach((p, idx) => {
          const pre = `p${idx + 1}_`;
          const rename = (id: string) => (id.startsWith(pre) ? id : pre + id);
          for (const [id, c] of Object.entries(p.components)) components[rename(id)] = c;
          slides.push({ ...p.slide, instances: p.slide.instances.map((i: any) => ({ ...i, component: rename(i.component), id: rename(i.id) })) });
        });
        const merge = N > 1 ? await dedupe(components) : {};
        for (const dup of Object.keys(merge)) delete components[dup];
        for (const s of slides) for (const i of s.instances) i.component = merge[i.component] || i.component;
        const first = layout0.slides[0];
        // The skill's sheet plan is mechanical too: PNG components in first-use
        // order, icons 9 per sheet, complex 4 per sheet, only the last sheet short.
        const order: string[] = [];
        for (const s of slides) for (const i of s.instances) if (!order.includes(i.component)) order.push(i.component);
        for (const id of Object.keys(components)) if (!order.includes(id)) order.push(id);
        const sheets: { id: string; max: number; components: string[] }[] = [];
        for (const [category, max, prefix] of [["icon_png", 9, "icons"], ["complex_png_whole", 4, "complex"]] as const) {
          const ids = order.filter((id) => components[id].category === category);
          for (let k = 0; k < ids.length; k += max) sheets.push({ id: `${prefix}_${pad3(k / max + 1)}`, max, components: ids.slice(k, k + max) });
        }
        const result: Analysis & { png_asset_sheet_plan?: any } = { ref_width: first.width, ref_height: first.height, components, slides, ...(sheets.length ? { png_asset_sheet_plan: { key_color: KEY, sheets } } : {}) };
        writeFileSync(join(RUN, "analysis", "element_analysis.json"), JSON.stringify(result, null, 2));
        const v = await script("validate_element_analysis.py", ["analysis/element_analysis.json"], RUN, 60_000);
        if (v.code !== 0) throw new Error(`merged element analysis invalid: ${clip(v.out, 800)}`);
        console.log(`[analysis] ${Object.keys(components).length} components (${Object.keys(merge).length} merged across pages), ${slides.reduce((n, s) => n + s.instances.length, 0)} instances`);
        emit({ type: "line", stage: "analysis", text: `合计 ${Object.keys(components).length} 种组件${N > 1 ? `，跨页合并 ${Object.keys(merge).length} 种` : ""}` });
        return result;
      }),
    );

// ---------- 2c. shared PNG components: code, once for the deck ----------
type SharedAsset = { component: string; ok: boolean; report: string };
const sharedAssets: Promise<SharedAsset[]> = MERGE_ONLY
  ? Promise.resolve([])
  : analysis.then((analysed) => stage("shared-assets", async () => {
      // Begun only once the analysis is in, so progress reports the real stage.
      const a = analysed!;
      const firstUse = (component: string) => {
        for (const s of a.slides) for (const inst of s.instances) if (inst.component === component) return { slide: s.slide, bbox: inst.bbox_px };
        return null;
      };
      const pngs = Object.entries(a.components)
        .filter(([, c]) => c.category === "icon_png" || c.category === "complex_png_whole")
        .map(([id, c]) => ({ id, c, use: firstUse(id) }))
        .filter((x) => x.use);
      // Icons drawn against the slide they first appear on, 9 per sheet.
      const jobs: { name: string; kind: "icon" | "complex"; assets: Asset[]; ref: number }[] = [];
      const bySlide = new Map<number, typeof pngs>();
      for (const p of pngs.filter((p) => p.c.category === "icon_png")) bySlide.set(p.use!.slide, [...(bySlide.get(p.use!.slide) || []), p]);
      let n = 0;
      for (const [slide, list] of bySlide)
        for (let i = 0; i < list.length; i += 9)
          jobs.push({ name: `icon_${pad3(++n)}`, kind: "icon", ref: slide, assets: list.slice(i, i + 9).map((p) => ({ id: p.id, description: cleanNotes(p.c.png_hint || p.c.notes || p.id), bbox_px: p.use!.bbox })) });
      for (const p of pngs.filter((p) => p.c.category === "complex_png_whole"))
        jobs.push({ name: `complex_${pad3(++n)}`, kind: "complex", ref: p.use!.slide, assets: [{ id: p.id, description: cleanNotes(p.c.png_hint || p.c.notes || p.id), bbox_px: p.use!.bbox }] });
      const results = await Promise.all(
        jobs.map(async (j) => {
          let r = await makeSheet(RUN, j.name, j.kind, j.assets, "", sourceRel(j.ref)).catch((err) => ({ ok: false, report: `sheet ${j.name}: FAILED ${err?.message || err}` }));
          if (!r.ok) {
            console.log(`[shared-assets] ${r.report} -> regenerating once`);
            emit({ type: "line", stage: "shared-assets", level: "warn", text: `${j.name} 重画一次` });
            r = await makeSheet(RUN, `${j.name}b`, j.kind, j.assets, "", sourceRel(j.ref)).catch((err) => ({ ok: false, report: `sheet ${j.name}b: FAILED ${err?.message || err}` }));
          }
          return j.assets.map((as) => ({ component: as.id, ok: r.ok && existsSync(join(RUN, "assets", "png", `${as.id}.png`)), report: r.report }));
        }),
      );
      const flat = results.flat();
      if (flat.length) await script("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/shared.png"], RUN);
      console.log(`[shared-assets] ${flat.filter((x) => x.ok).length}/${flat.length} components ready from ${jobs.length} sheet(s)`);
      return flat;
    }));

const [layout, , deckAnalysis, shared] = await Promise.all([ocr, bases, analysis, sharedAssets]);

// ---------- 3. pages: one agent each, in parallel ----------
const pageSystem = `You rebuild ONE slide page into an editable PPTX slide, following the slide-alchemy workflow. The clean base is already generated and the text is already extracted by OCR; code handles image generation, slicing, edge checks, composition, PowerPoint export and QA through your tools.

Binding rules (from the skill):
- Layer order: base PNG -> editable geometry -> PNG icons -> editable text.
- Classify every non-text visual: simple_geometry_svg_ooxml (lines, dividers, circles, rings, rounded rects, card bases, title bars, borders, dots) becomes compose-spec geometry; icon_png (any recognisable object or semantic icon, even simple line art) and complex_png_whole (composite illustrations, glows, layered badges; one PNG, never split) are generated on asset sheets.
- Reuse repeated components; never generate the same simple geometry as PNGs.
- Never crop assets from the source slide: generate them.
- Normal text stays editable text. Artistic lettering only becomes PNG if a text box cannot approximate it.
- Element bboxes are the drawing's own bounds on the source slide, in source pixels [x, y, w, h].

<element-classification>
${skillRef("element-classification.md")}
</element-classification>

<compose-spec-reference>
${skillRef("compose-spec.md")}
</compose-spec-reference>

How this harness works:
1. The deck-level element analysis is done: you get this page's instances, their components, and the shared PNG assets already generated for the deck (in assets/png/<component>.png). Place them; do not re-analyse or re-invent shared components. In your FIRST turn write analysis/compose_spec.json: one geometry entry per simple_geometry instance (its bbox_px, styled per its component's svg_hint and what you see), one image per PNG instance (path ../assets/png/<component>.png, its bbox_px). Only for a PNG component that is missing or whose picture is wrong, call generate_assets in the same turn (it returns at once and draws in the background; icons share 3x3 sheets, each complex visual gets its own canvas shaped like its bbox_px, all on ${KEY}, sliced by finding each drawing; a sheet whose drawing count does not match its ids is rejected; never ask for transparent backgrounds). Add elements the analysis missed if you see them.
2. analysis/compose_spec.json is a PARTIAL spec; code adds the base, slide size and the OCR text:
   {"geometry":[...], "images":[{"id":"<asset id>","path":"../assets/png/<asset id>.png","bbox_px":[x,y,w,h]}],
    "extra_texts":[<text entries for ink the OCR missed, same fields as OCR texts>],
    "text_edits":{"<ocr id>":{<fields to change>}}, "drop_texts":["<ocr id>"]}
   Geometry and images are stacked in array order: containers first.
3. Call compose_and_check. It waits for the assets, composes, exports, runs QA and shows you source | preview with problem regions boxed red. QA hot regions inside a regenerated illustration are often just redraw differences; check the sliced-assets contact sheet: each thumbnail is labelled with its id, and a picture that does not match its id (the image model drew a different icon) must be regenerated; fix what is actually wrong: missing or misplaced elements, wrong size or colour, text problems, green spill (regenerate that asset with clearer instructions).
4. Fix by rewriting the spec (and, if needed, calling generate_assets again for just the assets to redo), then compose_and_check again. Call done when QA passes or when nothing fixable remains; done is refused while a QA round is pending and fixable rounds remain.
Be decisive: aim to finish in 4-6 turns.`;

type PageResult = { page: number; qaRounds: number; passed: boolean; steps: number; seconds: number; spec?: any };

/** One page's rebuild, bracketed by page events so the run panel can open and close its group. */
async function rebuildPage(page: number): Promise<PageResult> {
  emit({ type: "page", page, status: "start" });
  try {
    return await rebuildPageInner(page);
  } finally {
    emit({ type: "page", page, status: "done" });
  }
}

async function rebuildPageInner(page: number): Promise<PageResult> {
  const started = Date.now();
  emit({ type: "line", stage: "pages", page, text: `第 ${page} 页开始重建` });
  const dir = join(RUN, "pages", `p${pad3(page)}`);
  for (const d of ["source", "base", "analysis", "assets/png", "assets/sheets", "assets/crop_specs", "assets/contact_sheets", "prompts", "out"]) mkdirSync(join(dir, d), { recursive: true });
  copyFileSync(join(RUN, sourceRel(page)), join(dir, "source", "slide_001.png"));
  copyFileSync(join(RUN, "base", `slide_${pad3(page)}_base.png`), join(dir, "base", "slide_001_base.png"));
  const slideLayout = layout.slides.find((s: any) => s.slide === page);
  const pageLayout = { ...layout, slides: [{ ...slideLayout, slide: 1, source: "slide_001.png" }] };
  writeFileSync(join(dir, "analysis", "texts_layout.json"), JSON.stringify(pageLayout, null, 2));
  const ocrTexts: any[] = slideLayout.texts;

  // This page's share of the deck analysis, and the shared PNGs it uses.
  const pageAnalysis = deckAnalysis!.slides.find((s) => s.slide === page) || { slide: page, instances: [] };
  const usedComponents = [...new Set(pageAnalysis.instances.map((i: any) => i.component))];
  const componentDefs = Object.fromEntries(usedComponents.map((c) => [c, deckAnalysis!.components[c]]));
  const sharedStatus = shared.filter((s) => usedComponents.includes(s.component));
  for (const s of sharedStatus)
    if (s.ok) copyFileSync(join(RUN, "assets", "png", `${s.component}.png`), join(dir, "assets", "png", `${s.component}.png`));
  writeFileSync(join(dir, "analysis", "element_analysis.json"), JSON.stringify({ ...deckAnalysis, slides: [{ ...pageAnalysis, slide: 1 }] }, null, 2));

  const inDir = (p: string) => {
    const abs = resolve(dir, p);
    const r = relative(dir, abs);
    if (r.startsWith("..") || isAbsolute(r)) throw new Error(`path escapes the page directory: ${p}`);
    return abs;
  };

  const sheetJobs = new Map<string, Promise<string>>();
  let sheetCount = 0;
  const state = { rounds: 0, passed: false, pendingCheck: true, lastProblems: Infinity, done: false };

  async function runSheet(name: string, kind: "icon" | "complex", assets: Asset[], notes: string) {
    const r = await makeSheet(dir, name, kind, assets, notes, "source/slide_001.png", page);
    return r.ok ? r.report : `${r.report} View the sheet and call generate_assets again for these ids.`;
  }

  const tools: Record<string, Tool> = {
    generate_assets: {
      description: "Start generating PNG assets in the background (returns immediately). kind 'icon' assets share 3x3 sheets; each kind 'complex' asset gets its own canvas shaped like its bbox_px (required for complex). Describe each asset precisely (shape, colours, parts, orientation). Code paints the key-colour background and handles transparency itself: do not ask for transparent backgrounds. Calling again with an asset id regenerates it.",
      parameters: {
        type: "object",
        properties: {
          sheets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["icon", "complex"] },
                notes: { type: "string" },
                assets: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "string" }, description: { type: "string" }, bbox_px: { type: "array", items: { type: "number" } } },
                    required: ["id", "description"],
                  },
                },
              },
              required: ["kind", "assets"],
            },
          },
        },
        required: ["sheets"],
      },
      run: async ({ sheets }) => {
        const lines: string[] = [];
        for (const sh of sheets || []) {
          const max = sh.kind === "icon" ? 9 : 1;
          const assets: Asset[] = (sh.assets || []).map((a: any) => ({ id: String(a.id).replace(/[^\w-]/g, "_"), description: cleanNotes(String(a.description)), bbox_px: a.bbox_px }));
          for (let i = 0; i < assets.length; i += max) {
            const chunk = assets.slice(i, i + max);
            const name = `${sh.kind}_${pad3(++sheetCount)}`;
            const job = runSheet(name, sh.kind, chunk, cleanNotes(sh.notes || "")).catch((err) => `sheet ${name}: FAILED ${err?.message || err}`);
            sheetJobs.set(name, job);
            lines.push(`${name}: ${chunk.map((a: any) => a.id).join(", ")}`);
          }
        }
        state.pendingCheck = true;
        return { text: `started ${lines.length} sheet(s) in the background:\n${lines.join("\n")}\nAssets will be at assets/png/<id>.png. compose_and_check waits for them.` };
      },
    },
    write_file: {
      description: "Write a text file inside the page directory (analysis/compose_spec.json, notes).",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
      run: async ({ path, content }) => {
        const abs = inDir(path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, content, "utf8");
        state.pendingCheck = true;
        return { text: `wrote ${path} (${content.length} chars)` };
      },
    },
    view_image: {
      description: "Look at an image in the page directory (an asset sheet, a sliced PNG, the QA image).",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      run: async ({ path }) => ({ text: `viewing ${path}`, images: [await imagePart(inDir(path), 1200, path)] }),
    },
    compose_and_check: {
      description: "Wait for pending assets, build the full spec from analysis/compose_spec.json + OCR text, compose, export with PowerPoint, run QA. Returns the QA report and shows source | preview.",
      parameters: { type: "object", properties: {} },
      run: async () => {
        emit({ type: "line", stage: "pages", page, text: `第 ${page} 页：第 ${state.rounds + 1} 轮合成并检查` });
        const sheetReports = await Promise.all([...sheetJobs.values()]);
        sheetJobs.clear();
        const partial = JSON.parse(readFileSync(join(dir, "analysis", "compose_spec.json"), "utf8"));
        const drop = new Set<string>(partial.drop_texts || []);
        const edits = partial.text_edits || {};
        const texts = ocrTexts.filter((t) => !drop.has(t.id)).map((t) => ({ ...t, ...(edits[t.id] || {}) }));
        const images = (partial.images || []).filter((im: any) => existsSync(resolve(dir, "analysis", im.path)));
        const missing = (partial.images || []).filter((im: any) => !existsSync(resolve(dir, "analysis", im.path))).map((im: any) => im.path);
        const spec = {
          ref_width: slideLayout.width,
          ref_height: slideLayout.height,
          slide_width_in: layout.slide_width_in || 13.333333,
          image_fit: "visible",
          slides: [{ base: "../base/slide_001_base.png", geometry: partial.geometry || [], images, texts: [...texts, ...(partial.extra_texts || [])] }],
        };
        writeFileSync(join(dir, "analysis", "compose_full.json"), JSON.stringify(spec, null, 2));
        const c = await script("compose_component_pptx.py", ["analysis/compose_full.json", "out/editable.pptx"], dir);
        if (c.code !== 0) return { text: `compose failed: ${clip(c.out, 1500)}` };
        const ex = await exportPreview(join(dir, "out", "editable.pptx"), join(dir, "out", "preview"));
        if (ex.code !== 0) return { text: `export failed: ${clip(ex.out, 1500)}` };
        const qa = await exec(PYTHON, [QA_SCRIPT, dir, "--skill", SKILL], { cwd: dir, timeoutMs: 10 * 60_000 });
        state.rounds++;
        state.pendingCheck = false;
        state.passed = /^QA PASS/m.test(qa.out);
        const problems = (qa.out.match(/^\s+- /gm) || []).length;
        state.lastProblems = problems;
        // Each round's pictures are kept under their own names: the next round overwrites out/.
        mkdirSync(join(dir, "out", "rounds"), { recursive: true });
        for (const [from, to, label] of [
          [join(dir, "out", "preview", "slide_001.png"), `r${state.rounds}_preview.png`, `第 ${page} 页 · 第 ${state.rounds} 轮成品`],
          [join(dir, "out", "qa", "slide_001_qa.png"), `r${state.rounds}_qa.png`, `第 ${page} 页 · 第 ${state.rounds} 轮检查`],
        ]) {
          if (!existsSync(from)) continue;
          copyFileSync(from, join(dir, "out", "rounds", to));
          emit({ type: "artifact", stage: "pages", page, label, path: runRel(join(dir, "out", "rounds", to)) });
        }
        const similarity = qa.out.match(/similarity=([\d.]+)/)?.[1];
        emit({
          type: "line",
          stage: "pages",
          page,
          level: state.passed ? "info" : "warn",
          text: state.passed
            ? `第 ${page} 页：第 ${state.rounds} 轮检查通过`
            : `第 ${page} 页：第 ${state.rounds} 轮检查未通过（相似度 ${similarity ?? "?"}，${problems} 处问题）${state.rounds < QA_ROUNDS ? "，继续修改" : ""}`,
        });
        const shown = [await imagePart(join(dir, "out", "qa", "slide_001_qa.png"), 1800, "QA: source (left) | preview (right)")];
        if (existsSync(join(dir, "assets", "png")) && sheetReports.length) {
          await script("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/contact.png"], dir);
          if (existsSync(join(dir, "assets", "contact_sheets", "contact.png"))) shown.push(await imagePart(join(dir, "assets", "contact_sheets", "contact.png"), 900, "sliced assets"));
        }
        const left = QA_ROUNDS - state.rounds;
        const verdict = state.passed ? "QA passed: call done." : left > 0 ? `QA failed (round ${state.rounds}/${QA_ROUNDS}): fix what is fixable and check again.` : "QA rounds are used up: call done with the remaining defects.";
        return {
          text: [sheetReports.length ? `assets:\n${sheetReports.join("\n")}` : "", missing.length ? `MISSING asset files (skipped): ${missing.join(", ")}` : "", clip(qa.out, 3500), verdict].filter(Boolean).join("\n\n"),
          images: shown,
        };
      },
    },
    done: {
      description: "Finish this page with a one-paragraph summary of what is editable and the remaining defects.",
      parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
      run: async ({ summary }) => {
        if (state.rounds === 0) throw new Error("done refused: run compose_and_check first.");
        if (state.pendingCheck && state.rounds < QA_ROUNDS) throw new Error("done refused: you changed things after the last check; run compose_and_check.");
        if (!state.passed && state.rounds < QA_ROUNDS) throw new Error(`done refused: QA failed and ${QA_ROUNDS - state.rounds} round(s) remain.`);
        writeFileSync(join(dir, "analysis", "summary.md"), summary, "utf8");
        state.done = true;
        emit({ type: "line", stage: "pages", page, text: `第 ${page} 页完成（${state.rounds} 轮${state.passed ? "，检查通过" : "，用完返工次数"}）` });
        return { text: "ok" };
      },
    },
  };

  const textsForPrompt = ocrTexts.map((t) => ({ id: t.id, text: t.text, bbox_px: t.bbox_px, font_size_pt: t.font_size_pt, color: t.color, bold: t.bold, align: t.align }));
  const user = [
    {
      type: "text",
      text: `Page ${page} of ${N}. Source size ${slideLayout.width}x${slideLayout.height} px.\nOCR text already measured (code adds these to the slide; use text_edits / drop_texts / extra_texts only to correct them):\n${JSON.stringify(textsForPrompt)}\n\nElement instances on this page (deck-level analysis):\n${JSON.stringify(pageAnalysis)}\n\nTheir components:\n${JSON.stringify(componentDefs)}\n\nShared PNG assets for this page:\n${sharedStatus.map((s) => `${s.component}: ${s.ok ? `ready at assets/png/${s.component}.png` : `MISSING (${s.report})`}`).join("\n") || "(none)"}\n\nThe source page, its clean base and the shared assets follow. Everything on the source that is not on the base and is not OCR text must be on the slide as geometry or a PNG.`,
    },
    ...(await imagePart(join(dir, "source", "slide_001.png"), 1672, "SOURCE page (full resolution: read coordinates from this one)")),
    ...(await imagePart(join(dir, "base", "slide_001_base.png"), 900, "clean BASE")),
  ];
  if (sharedStatus.some((s) => s.ok)) {
    await script("build_contact_sheet.py", ["assets/png", "assets/contact_sheets/shared.png"], dir);
    if (existsSync(join(dir, "assets", "contact_sheets", "shared.png"))) user.push(...(await imagePart(join(dir, "assets", "contact_sheets", "shared.png"), 900, "shared assets for this page, labelled by component id")));
  }

  const steps = await runNode({ name: `p${page}`, system: pageSystem, user, tools, maxSteps: PAGE_STEPS, isDone: () => state.done, logFile: join(dir, "agent_log.jsonl") });
  const spec = existsSync(join(dir, "analysis", "compose_full.json")) ? JSON.parse(readFileSync(join(dir, "analysis", "compose_full.json"), "utf8")) : undefined;
  return { page, qaRounds: state.rounds, passed: state.passed, steps, seconds: Math.round((Date.now() - started) / 1000), spec };
}

const pages: PageResult[] = MERGE_ONLY
  ? Array.from({ length: N }, (_, i) => {
      const specPath = join(RUN, "pages", `p${pad3(i + 1)}`, "analysis", "compose_full.json");
      return { page: i + 1, qaRounds: 0, passed: false, steps: 0, seconds: 0, spec: existsSync(specPath) ? JSON.parse(readFileSync(specPath, "utf8")) : undefined };
    })
  : await stage("pages", () => pool(Array.from({ length: N }, (_, i) => i + 1), PAGE_CONCURRENCY, rebuildPage));

// ---------- 4. merge the deck: code ----------
const finalQa = await stage("merge", async () => {
  const slides = pages.map((p) => {
    if (!p.spec) throw new Error(`page ${p.page} produced no spec`);
    const prefix = `../pages/p${pad3(p.page)}/`;
    const fix = (path: string) => (path.startsWith("../") ? prefix + path.slice(3) : path);
    const s = p.spec.slides[0];
    return { ...s, base: fix(s.base), images: s.images.map((im: any) => ({ ...im, path: fix(im.path) })) };
  });
  const first = pages[0].spec;
  const deck = { ref_width: first.ref_width, ref_height: first.ref_height, slide_width_in: first.slide_width_in, image_fit: "visible", slides };
  writeFileSync(join(RUN, "analysis", "compose_spec.json"), JSON.stringify(deck, null, 2));
  const c = await script("compose_component_pptx.py", ["analysis/compose_spec.json", "out/editable.pptx"], RUN);
  if (c.code !== 0) throw new Error(`deck compose failed: ${clip(c.out, 800)}`);
  await exportPreview(join(RUN, "out", "editable.pptx"), join(RUN, "out", "preview"));
  for (let i = 1; i <= N; i++)
    if (existsSync(join(RUN, "out", "preview", `slide_${pad3(i)}.png`))) emit({ type: "artifact", stage: "merge", page: i, label: `第 ${i} 页成品`, path: `out/preview/slide_${pad3(i)}.png` });
  for (let i = 1; i <= N; i++) await script("compare_preview.py", [sourceRel(i), `out/preview/slide_${pad3(i)}.png`, `out/compare/slide_${pad3(i)}`], RUN);
  const qa = await exec(PYTHON, [QA_SCRIPT, RUN, "--skill", SKILL], { cwd: RUN, timeoutMs: 10 * 60_000 });
  return qa.out;
});

const summary = {
  minutes: ((Date.now() - t0) / 60000).toFixed(1),
  model: MODEL,
  usage: { ...usage, modelSeconds: Math.round(usage.modelSeconds) },
  timeline,
  pages: pages.map(({ spec, ...p }) => p),
  finalQa,
};
writeFileSync(join(RUN, "pipeline_summary.json"), JSON.stringify(summary, null, 2));
console.log("\n=== done ===\n", JSON.stringify({ ...summary, finalQa: undefined }, null, 2), "\n", finalQa);
