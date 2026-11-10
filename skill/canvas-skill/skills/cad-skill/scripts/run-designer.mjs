#!/usr/bin/env node

/**
 * HouseSpec → finished design and deliverables, on the house designer carried in ../designer/
 * (assets/template.html and its scripts).
 *
 * Opens the designer headless with the spec (or an earlier design.json) as its preset, then:
 *   1. pushes furniture out of small collisions (auto-nudge, from CanvasAnvil),
 *   2. runs the designer's one-click MEP layout,
 *   3. applies the wiring preferences from the plan's decisions (CanvasAnvil: more sockets, network
 *      points, panel / network box location, bedside USB, floor sockets),
 *   3a. applies a spec patch from --patch (cad_spec_patch, RFC 6902 on spec.json of the run it starts from):
 *      the design is exported as a HouseSpec, patched and loaded into the designer again, with its measures,
 *      prices and comments carried over: any field designer/reference/spec-format.md describes,
 *   3b. applies edit operations from --ops (prompts/edit.md: furniture, openings, walls, finishes, 3D look,
 *      MEP points); after wall / opening / furniture edits the MEP layout runs again unless the same
 *      batch edits points, or relayout_elec asks for it,
 *   4. runs the designer's checks,
 *   5. writes "<户型名>-装修设计器.html" the way designer/scripts/build.py does (template + preset),
 *      with the finished design (MEP included) as the preset, and opens it in the user's browser,
 *   6. runs designer/scripts/elecaudit.mjs on that page (room-by-room MEP audit),
 *   7. exports the designer's own deliverables,
 *   8. with --qa, runs the designer's delivery check on that page (designer/scripts/qa.mjs --lite --quick,
 *      then qa_files.py on what it downloaded).
 *
 * MEP on a spec start follows the designer: hand-written `elec` stays as written (with `autoElec` the designer
 * adds the rest when it loads); with `autoElec: true` and no `elec`, the one-click layout runs after the nudge;
 * a spec with neither gets no points. The wiring preferences apply whenever points were laid out.
 *
 *   node scripts/run-designer.mjs --spec house-spec.json [--plan cad_plan.json] [--out-dir out]
 *        [--patch patch.json] [--ops ops.json] [--exports quote,drawings,plan-dxf,mep-dxf,colour,render | all | none] [--qa] [--no-open]
 *   node scripts/run-designer.mjs --design out/design.json (--patch patch.json | --ops ops.json) [--plan cad_plan.json] [--out-dir out2] …
 *
 * --design starts from a finished design (its MEP points kept); --ops is a cad_ops JSON
 * ({"type":"cad_ops","ops":[…]} or the bare list), ids taken from summary.json of that run; --patch is a
 * cad_spec_patch JSON ({"type":"cad_spec_patch","patch":[…]} or the bare list), paths into spec.json of that run
 * (with --spec, into that spec). A patch runs before ops.
 * Always writes the designer HTML, report.json, summary.json (rooms, walls, openings, furniture and MEP
 * points with their ids, for the next --ops), spec.json (the design as a HouseSpec, for the next --patch or
 * to edit directly), design.json (the designer's internal plan), plan2d.png and design.dxf.
 * --exports adds the engine's menu exports (default quote,drawings,mep-dxf,colour; render is slow).
 * Exit codes: 0 = delivery gates met (0 errors, 0 warnings, MEP audit without ✗, qa passed when asked);
 * 3 = everything written but warnings or MEP audit problems are left (fix and run again, or explain each);
 * 1 = errors, refused ops, a patch that does not apply, a failed qa or a run that broke; 2 = bad arguments.
 * The browser is started by designer/scripts/browser.mjs (the user's own Chrome / Edge / Chromium
 * through puppeteer-core); run "npm run setup" once in the skill folder.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

let launch;
let setDownloadDir;
try {
  ({ launch, setDownloadDir } = await import("../designer/scripts/browser.mjs"));
} catch {
  console.error('puppeteer-core is missing. Run "npm run setup" once in the skill folder (it installs designer/scripts).');
  process.exit(2);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HPD = fileURLToPath(new URL("../designer/", import.meta.url));
const TEMPLATE = path.join(HPD, "assets", "template.html");
const KIT = fileURLToPath(new URL("./lib/designer-kit.js", import.meta.url));

/**
 * The designer's own exports and the clicks that start each download (a CSS selector, a menu text,
 * a pause in ms, or {until: page expression} to wait for). The quote opens a dialog first; the colour
 * plan and render need the 3D view, entered as designer/scripts/qa.mjs does: wait until the 3D
 * scene is ready, let the 2D → 3D transition finish, then 重置视角 so the camera frames the whole home
 * (rendering during the transition leaves the home a small patch in the middle of the picture).
 */
const ENTER_3D = ['[data-view="3d"]', { until: "window.__designer.app.view === '3d' && window.__designer.S3?.ready" }, 2000, "#camReset", 1200];
const EXPORTS = {
  quote: { name: "报价单", clicks: ["#quoteBtn", 400, "#qCsv"] },
  drawings: { name: "施工图 PDF", clicks: [{ text: "整套施工图" }] },
  "plan-dxf": { name: "平面图 DXF", clicks: ['[data-exp="dxf"]'] },
  "mep-dxf": { name: "水电图 DXF", clicks: ['[data-exp="dxf-mep"]'] },
  colour: { name: "彩平图", clicks: [...ENTER_3D, '[data-exp="colorplan"]'], after: ['[data-view="2d"]'] },
  render: { name: "3D 效果图", clicks: [...ENTER_3D, "#renderBtn"], after: ['[data-view="2d"]'] },
};
const DEFAULT_EXPORTS = ["quote", "drawings", "mep-dxf", "colour"];

function parseArgs(argv) {
  const args = { spec: "", design: "", ops: "", patch: "", plan: "", outDir: "cad-output", exports: DEFAULT_EXPORTS, open: true, qa: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--no-open") args.open = false;
    else if (token === "--qa") args.qa = true;
    else if (token === "--patch") args.patch = argv[++i] || "";
    else if (token === "--spec") args.spec = argv[++i] || "";
    else if (token === "--plan") args.plan = argv[++i] || "";
    else if (token === "--design") args.design = argv[++i] || "";
    else if (token === "--ops") args.ops = argv[++i] || "";
    else if (token === "--out-dir" || token === "-o") args.outDir = argv[++i] || "";
    else if (token === "--exports") {
      const value = argv[++i] || "";
      args.exports = value === "all" ? Object.keys(EXPORTS) : value === "none" ? [] : value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.spec === !args.design) {
  console.error("Usage: node scripts/run-designer.mjs (--spec house-spec.json | --design design.json) [--patch patch.json] [--ops ops.json] [--plan cad_plan.json] [--out-dir out] [--exports list|all|none] [--qa]");
  process.exit(2);
}
for (const key of args.exports) if (!EXPORTS[key]) { console.error(`Unknown export "${key}". Choose from: ${Object.keys(EXPORTS).join(", ")}`); process.exit(2); }

const readJson = (file) => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const specFile = args.spec ? readJson(args.spec) : null;
const spec = specFile?.type === "cad_spec" ? specFile.spec : specFile;
// design.json is the designer's internal plan, loaded as is (MEP points and all).
const startPlan = args.design ? readJson(args.design) : null;
const opsFile = args.ops ? readJson(args.ops) : null;
const ops = Array.isArray(opsFile) ? opsFile : opsFile?.ops ?? [];
if (args.ops && !Array.isArray(ops)) { console.error(`${args.ops}: expected {"type":"cad_ops","ops":[…]} or a list`); process.exit(2); }
const patchFile = args.patch ? readJson(args.patch) : null;
const specPatch = Array.isArray(patchFile) ? patchFile : patchFile?.patch ?? [];
if (args.patch && (!Array.isArray(specPatch) || !specPatch.length)) { console.error(`${args.patch}: expected {"type":"cad_spec_patch","patch":[…]} or a non-empty list`); process.exit(2); }
const parts = (value) => Array.isArray(value?.floors) ? value.floors : [value ?? {}];
// The designer's own rule: hand-written points stay; autoElec without points means "lay them out".
const specHasElec = !!spec && parts(spec).some((floor) => Array.isArray(floor.elec) && floor.elec.length);
const specAutoElec = !!spec && (spec.autoElec === true || parts(spec).some((floor) => floor.autoElec === true));
const planFile = args.plan ? JSON.parse(fs.readFileSync(path.resolve(args.plan), "utf8")) : null;
const decisions = (planFile?.plan ?? planFile)?.decisions ?? [];
const outDir = path.resolve(args.outDir);
fs.mkdirSync(outDir, { recursive: true });
const step = (text) => console.log(`· ${text}`);

// The app's nudge and wiring-preference code, already bundled for the page.
const bundle = fs.readFileSync(KIT, "utf8");

/**
 * The designer as one offline HTML with this design as its preset, as designer/scripts/build.py builds
 * it from a spec: drop any preset left in the template, put ours right after <meta charset>, set the title.
 * The designer loads `preset.plan` as is, so the MEP and nudged furniture come along; the id follows the
 * content, so a new design never opens on an older browser save.
 */
function writeDesignerHtml(plan) {
  const name = String(plan.name || spec?.name || "户型").trim();
  const body = JSON.stringify({ plan });
  const preset = { id: createHash("sha1").update(body).digest("hex").slice(0, 12), plan };
  const script = `<script id="__preset">window.__PRESET__=${JSON.stringify(preset).replace(/</g, "\\u003c")}</script>`;
  let html = fs.readFileSync(TEMPLATE, "utf8").replace(/<script id="__preset">[\s\S]*?<\/script>/, "");
  const anchor = html.match(/<meta charset[^>]*>/i);
  if (!anchor) throw new Error("template.html has no <meta charset>; re-sync the skill");
  const at = anchor.index + anchor[0].length;
  html = html.slice(0, at) + script + html.slice(at);
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${name.replace(/[<&]/g, "")} · 装修设计器</title>`);
  const file = path.join(outDir, `${name.replace(/[\\/:*?"<>|\s]+/g, "_")}-装修设计器.html`);
  fs.writeFileSync(file, html);
  return file;
}

function openInBrowser(file) {
  const [command, list] = process.platform === "win32" ? ["cmd", ["/c", "start", "", file]]
    : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
  try {
    spawn(command, list, { detached: true, stdio: "ignore", windowsVerbatimArguments: false }).on("error", () => {}).unref();
  } catch {
    // No desktop (server or container): the path is printed above.
  }
}

/** The designer's room-by-room MEP audit (scripts/elecaudit.mjs) on the delivered page; its ✗ lines are problems, · lines notes. */
function elecAudit(file) {
  const run = spawnSync(process.execPath, [path.join(HPD, "scripts", "elecaudit.mjs"), file], { encoding: "utf8", timeout: 180000 });
  const lines = String(run.stdout || "").split(/\r?\n/);
  const problems = lines.filter((line) => line.startsWith("✗ ")).map((line) => line.slice(2));
  const notes = lines.filter((line) => line.startsWith("· ")).map((line) => line.slice(2));
  const ok = run.status === 0 && lines.some((line) => line.trim().startsWith("{"));
  return { ok, problems, notes, ...(ok ? {} : { error: String(run.stderr || run.error || "elecaudit.mjs failed").trim().split("\n")[0] }) };
}

// Serve the designer over http (a module page; file:// would block parts of it).
const server = http.createServer((request, response) => {
  if (new URL(request.url, "http://x").pathname !== "/designer.html") { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  fs.createReadStream(TEMPLATE).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

let browser;
let exitCode = 0;
let finished = null;
try {
  try {
    // Real GPU when there is one (the colour plan and render are WebGL); Chrome falls back to software otherwise.
    browser = await launch({ gpu: true, viewport: { width: 1600, height: 1000 } });
  } catch (error) {
    throw new Error(`The browser could not start (${error.message.split("\n")[0]}). Set CHROME_PATH to Chrome, Edge or Chromium.`);
  }
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message ?? error)));
  await setDownloadDir(browser, page, outDir);
  // The designer takes its preset from the parent page or window.__PRESET__; pin ours in before it loads
  // (again with the patched spec when there is a --patch).
  let pinned = null;
  const open = async (preset) => {
    if (pinned) await page.removeScriptToEvaluateOnNewDocument(pinned.identifier);
    pinned = await page.evaluateOnNewDocument((value) => {
      Object.defineProperty(window, "__PRESET__", { get: () => value, set: () => {}, configurable: true });
    }, { id: `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ...preset });
    await page.goto(`http://127.0.0.1:${port}/designer.html?debug`);
    await page.waitForFunction(() => window.__designer?.app?.plan && typeof window.__designer.runChecks === "function", { timeout: 60000 });
    await page.addScriptTag({ content: bundle });
    // The whole design: app.plan is only the floor on screen when the design is a building (as the app's designer bridge reads it).
    await page.evaluate(() => {
      window.__readPlan = () => {
        const d = window.__designer, clone = (value) => JSON.parse(JSON.stringify(value));
        if (d.bld?.floors?.length > 1) {
          const building = clone(d.bld);
          building.floors[building.cur].plan = clone(d.app.plan);
          return { ...building, version: 2, kind: "building" };
        }
        return clone(d.app.plan);
      };
    });
  };

  step("打开设计器并载入户型");
  await open(startPlan ? { plan: startPlan } : { spec });

  const checks = () => page.evaluate(() => window.__designer.runChecks().issues.map((issue) => ({ level: issue.level, code: issue.type, msg: issue.msg })));
  const initial = await checks();

  const nudge = () => page.evaluate(() => {
    const api = window.__designer;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    // Same issue shape as the app's designer bridge.
    const issuesOf = (plan) => {
      api.replacePlan(clone(plan));
      return api.runChecks().issues.map((issue) => ({
        level: issue.level, code: issue.type, msg: issue.msg,
        ...(issue.targets ? { targets: issue.targets.map((target) => ({ kind: target.kind, id: target.id })) } : {}),
        ...(typeof issue.at?.x === "number" && typeof issue.at.y === "number" ? { at: [issue.at.x, issue.at.y] } : {}),
      }));
    };
    const result = window.CadKit.nudgeFurniture(clone(api.app.plan), issuesOf);
    api.replacePlan(clone(result.plan));
    return result.moved;
  });
  // The designer's one-click MEP layout (it only lays out a plan without points), then the plan's wiring preferences.
  const layOutMep = async () => {
    await page.evaluate(() => {
      const api = window.__designer;
      api.replacePlan({ ...JSON.parse(JSON.stringify(api.app.plan)), elec: [] });
      document.querySelector('[data-tab="mep"]')?.click();
    });
    await sleep(150);
    await page.evaluate(() => document.querySelector("#autoElec")?.click());
    await sleep(500);
    await page.evaluate(() => document.querySelector('[data-tab="plan"]')?.click());
    return wiringPrefs();
  };
  const wiringPrefs = () => page.evaluate((decisionList) => {
    const api = window.__designer;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const rooms = api.app.rooms.regions.map((region) => ({ name: region.labels.map((label) => label.name).join(" / "), area: region.area, ...(region.rects ? { rects: clone(region.rects) } : {}), at: [region.interior.x, region.interior.y] }));
    const result = window.CadKit.applyElecPrefs(clone(api.app.plan), rooms, window.CadKit.elecPrefsFromDecisions(decisionList));
    if (result.changed) api.replacePlan(clone(result.plan));
    return { points: (api.app.plan.elec ?? []).length, notes: result.notes };
  }, decisions);

  const pointCount = () => page.evaluate(() => {
    const plan = window.__readPlan();
    return (plan.kind === "building" ? plan.floors.map((floor) => floor.plan ?? floor) : [plan]).reduce((sum, floor) => sum + (floor.elec ?? []).length, 0);
  });
  const isBuilding = () => page.evaluate(() => window.__readPlan().kind === "building");
  let moved = 0;
  let wiring = { points: 0, notes: [] };
  let relaidOut = false;
  // A building gets the designer's own per-floor layout as it loads (nudge and wiring preferences are single-floor).
  if (!startPlan && !await isBuilding()) {
    step("自动推开碰撞的家具");
    moved = await nudge();
    if (specAutoElec && !specHasElec) {
      step("一键布置水电");
      step("按方案里的水电偏好调整");
      wiring = await layOutMep();
      relaidOut = true;
    } else wiring.points = await pointCount();
  } else wiring.points = await pointCount();

  // cad_spec_patch: the design as a HouseSpec, patched, loaded again; what only lives in the plan comes along.
  let patched = null;
  if (specPatch.length) {
    step(`应用 ${specPatch.length} 条 spec 补丁`);
    const prepared = await page.evaluate((list, startSpec) => {
      const kit = window.CadKit;
      const before = window.__readPlan();
      const base = startSpec ?? kit.planToSpec(before, { defaults: (key) => window.__designer.makeFurn(key, 0, 0, 0) });
      const errorsOf = (value) => (Array.isArray(value.floors) ? value.floors.flatMap((floor, at) => kit.validateSpec(floor).map((issue) => ({ ...issue, msg: `floors[${at}].${issue.msg}` }))) : kit.validateSpec(value))
        .filter((issue) => issue.level === "error").map((issue) => issue.msg);
      try {
        const next = kit.applySpecPatch(base, list);
        const known = new Set(errorsOf(base));
        const added = errorsOf(next).filter((msg) => !known.has(msg));
        if (added.length) return { error: `补丁让 spec 出现新错误：${added.join("；")}` };
        return { next, before, touched: kit.patchTouches(list) };
      } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
    }, specPatch, startPlan ? null : spec);
    if (prepared.error) throw Object.assign(new Error(`spec 补丁没有应用：${prepared.error}`), { patchError: prepared.error });
    await open({ spec: prepared.next });
    await page.evaluate((before, keepComments) => {
      const api = window.__designer;
      api.replacePlan(window.CadKit.carryOver(before, window.__readPlan(), { comments: keepComments }));
    }, prepared.before, !prepared.touched.comments);
    patched = { applied: specPatch.length, touched: prepared.touched };
    const building = await isBuilding();
    if (prepared.touched.layout && !building) moved += await nudge();
    if (!building && (prepared.touched.relayoutElec || (prepared.touched.layout && !prepared.touched.elec))) {
      step("户型变了，重新布置水电");
      wiring = await layOutMep();
      relaidOut = true;
    } else wiring.points = await pointCount();
  }

  // Edit operations, as in the app's design assistant (prompts/edit.md).
  let edits = null;
  if (ops.length && await isBuilding()) throw new Error("多层户型请用 --patch（cad_spec_patch，路径 /floors/层号/…）修改");
  if (ops.length) {
    step(`执行 ${ops.length} 条修改指令`);
    edits = await page.evaluate((list) => {
      const api = window.__designer;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      const result = window.CadKit.applyOps(clone(api.app.plan), list, { makeFurn: api.makeFurn, isValidKey: (key) => key in api.CAT });
      if (result.applied) api.replacePlan(clone(result.plan));
      return { applied: result.applied, rejected: result.rejected, touched: result.touched };
    }, ops);
    if (edits.touched.layout) moved += await nudge();
    // Walls, openings or furniture moved: lay out MEP again, unless this batch placed points by hand.
    if (edits.touched.relayoutElec || (edits.touched.layout && !edits.touched.elec)) {
      step("户型变了，重新布置水电");
      wiring = await layOutMep();
      relaidOut = true;
    } else wiring.points = await pointCount();
  }

  const final = await checks();
  const errors = final.filter((issue) => issue.level === "error");
  const warnings = final.filter((issue) => issue.level === "warn");

  step("导出户型、平面图和 DXF");
  const core = await page.evaluate((issues) => {
    const api = window.__designer;
    const bounds = api.app.geo.bounds;
    const rooms = api.app.rooms.regions.map((region) => ({ name: region.labels.map((label) => label.name).join(" / "), area: region.area, ...(region.rects ? { rects: JSON.parse(JSON.stringify(region.rects)) } : {}), at: [region.interior.x, region.interior.y] }));
    const round = (_, value) => typeof value === "number" ? Math.round(value * 10) / 10 : value;
    return {
      plan: window.__readPlan(),
      spec: JSON.parse(JSON.stringify(window.CadKit.planToSpec(window.__readPlan(), { defaults: (key) => api.makeFurn(key, 0, 0, 0) }), round)),
      summary: window.CadKit.summarizePlan(window.__readPlan(), rooms, issues),
      png: api.shot2d("layout", bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, Math.min(1400 / bounds.w, 1000 / bounds.h)),
      dxf: Array.from(api.dxfBytes("gb", "layout")),
    };
  }, final);
  fs.writeFileSync(path.join(outDir, "design.json"), `${JSON.stringify(core.plan, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "summary.json"), `${JSON.stringify(JSON.parse(core.summary), null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "spec.json"), `${JSON.stringify(core.spec, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "plan2d.png"), Buffer.from(String(core.png).split(",")[1] ?? "", "base64"));
  fs.writeFileSync(path.join(outDir, "design.dxf"), Buffer.from(core.dxf));
  const designerFile = writeDesignerHtml(core.plan);
  step("水电逐房间审计");
  const audit = elecAudit(designerFile);

  const exported = [];
  // Downloads land in outDir (setDownloadDir). As in designer/scripts/qa.mjs, a download is a file that is new
  // or changed there, finished (no .crdownload left) and no longer growing.
  const snapshot = () => Object.fromEntries(fs.readdirSync(outDir).map((file) => [file, fs.statSync(path.join(outDir, file)).mtimeMs]));
  const newDownload = async (before, timeout) => {
    const until = Date.now() + timeout;
    let last = "";
    while (Date.now() < until) {
      await sleep(300);
      const now = snapshot();
      const fresh = Object.keys(now).filter((file) => !/\.(crdownload|tmp)$/.test(file) && before[file] !== now[file]);
      const pending = Object.keys(now).some((file) => /\.crdownload$/.test(file));
      if (fresh.length && !pending) {
        const sizes = fresh.map((file) => `${file}:${fs.statSync(path.join(outDir, file)).size}`).join("|");
        if (sizes === last) return fresh[0];
        last = sizes;
      }
    }
    throw new Error(`没有等到下载（${Math.round(timeout / 1000)}s）`);
  };
  const click = (target) => page.evaluate((what) => {
    const element = typeof what === "string"
      ? document.querySelector(what)
      : Array.from(document.querySelectorAll("button, [role=menuitem], a, li")).find((item) => item.textContent?.replace(/\s+/g, " ").trim().startsWith(what.text));
    if (!element) throw new Error(`设计器里没有找到 ${typeof what === "string" ? what : what.text}`);
    element.click();
  }, target);
  const runClicks = async (clicks) => {
    for (const item of clicks) {
      if (typeof item === "number") await sleep(item);
      else if (item.until) await page.waitForFunction(item.until, { timeout: 60000 });
      else await click(item);
    }
  };
  for (const key of args.exports) {
    const { name, clicks, after = [] } = EXPORTS[key];
    step(`导出${name}`);
    try {
      const before = snapshot();
      await runClicks(clicks);
      const file = await newDownload(before, key === "render" ? 240000 : 90000);
      exported.push({ export: key, name, file });
    } catch (error) {
      exported.push({ export: key, name, error: error instanceof Error ? error.message.split("\n")[0] : String(error) });
    } finally {
      await runClicks(after).catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
    }
  }

  const report = {
    ...(args.spec ? { spec: path.basename(args.spec) } : { design: path.basename(args.design) }),
    initialIssues: initial,
    furnitureNudged: moved,
    ...(patched ? { patch: patched } : {}),
    ...(edits ? { edits } : {}),
    mepLaidOut: relaidOut,
    mepPoints: wiring.points,
    wiringPreferences: wiring.notes,
    elecAudit: audit,
    issues: final,
    errors: errors.length,
    warnings: warnings.length,
    designerRuntimeErrors: pageErrors,
    designer: path.basename(designerFile),
    files: [path.basename(designerFile), "design.json", "spec.json", "summary.json", "plan2d.png", "design.dxf", ...exported.filter((item) => item.file).map((item) => item.file)],
    exports: exported,
  };
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  finished = { report, designerFile };

  console.log(`\n设计器检查：${errors.length} 个错误，${warnings.length} 个警告${moved ? `（自动推开了 ${moved} 件家具）` : ""}`);
  if (patched) console.log(`spec 补丁：应用 ${patched.applied} 条`);
  for (const issue of final) console.log(`- [${issue.level}] ${issue.msg}`);
  if (edits) {
    console.log(`修改指令：执行 ${edits.applied} 条，拒绝 ${edits.rejected.length} 条`);
    for (const item of edits.rejected) console.log(`✗ 第 ${item.index + 1} 条：${item.reason}`);
  }
  console.log(`水电点位 ${wiring.points} 个${relaidOut ? "（本次重新布置）" : ""}${wiring.notes.length ? `；按偏好调整：${wiring.notes.join("；")}` : ""}`);
  console.log(audit.ok ? `水电审计：${audit.problems.length} 个问题，${audit.notes.length} 条提示${audit.problems.length ? "（在设计器网页的「水电」里调整）" : ""}` : `水电审计没跑成：${audit.error}`);
  for (const item of audit.problems) console.log(`✗ ${item}`);
  for (const item of audit.notes) console.log(`· ${item}`);
  for (const item of exported) console.log(item.file ? `✓ ${item.name}：${item.file}` : `✗ ${item.name}：${item.error}`);
  console.log(`设计器网页：${designerFile}${args.open ? "（已在浏览器打开）" : ""}`);
  console.log(`输出目录：${outDir}`);
  if (args.open) openInBrowser(designerFile);
  if (errors.length || edits?.rejected.length || !audit.ok) exitCode = 1;
  else if (warnings.length || audit.problems.length) exitCode = 3;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (error?.patchError) fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify({ patchError: error.patchError }, null, 2)}\n`);
  exitCode = 1;
} finally {
  await browser?.close();
  server.close();
}

/**
 * The designer's delivery check (GUIDE section 6, reference/delivery.md), after our browser is closed so the two
 * do not fight over the GPU: qa.mjs --lite --quick operates every button, tool, panel and export of the page,
 * qa_files.py opens what it downloaded.
 */
if (args.qa && finished) {
  const qaDir = path.join(outDir, "qa");
  step("交付检查：qa.mjs --lite --quick（几分钟，按钮、面板、导出逐个操作）");
  const qa = spawnSync(process.execPath, [path.join(HPD, "scripts", "qa.mjs"), finished.designerFile, qaDir, "--lite", "--quick"], { encoding: "utf8", timeout: 1800000, maxBuffer: 64 * 1024 * 1024 });
  const qaTail = String(qa.stdout || "").trim().split(/\r?\n/).slice(-12);
  const qaResult = { ok: qa.status === 0, report: path.relative(outDir, path.join(qaDir, "report.md")), summary: qaTail.join("\n"), ...(qa.status === 0 ? {} : { error: String(qa.stderr || qa.error || "").trim().split("\n")[0] || `exit ${qa.status}` }) };
  let filesResult = { ok: false, error: "Python not found (pip install pillow ezdxf pypdf)" };
  for (const python of process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"]) {
    const run = spawnSync(python, [path.join(HPD, "scripts", "qa_files.py"), qaDir], { encoding: "utf8", timeout: 300000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    if (run.error) continue;
    filesResult = { ok: run.status === 0, summary: String(run.stdout || "").trim().split(/\r?\n/).slice(-15).join("\n"), ...(run.status === 0 ? {} : { error: String(run.stderr || "").trim().split("\n").slice(-1)[0] || `exit ${run.status}` }) };
    break;
  }
  finished.report.qa = { pages: qaResult, files: filesResult };
  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(finished.report, null, 2)}\n`);
  console.log(`\n交付检查（qa.mjs）：${qaResult.ok ? "通过" : "没通过"}，报告 ${qaResult.report}，截图在 qa/shots/（要人工过一遍）\n${qaResult.summary}`);
  console.log(`导出文件检查（qa_files.py）：${filesResult.ok ? "通过" : `没通过：${filesResult.error ?? ""}`}${filesResult.summary ? `\n${filesResult.summary}` : ""}`);
  if (!qaResult.ok || !filesResult.ok) exitCode = 1;
}
process.exit(exitCode);
