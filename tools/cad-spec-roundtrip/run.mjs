#!/usr/bin/env node
/**
 * Round trip of the plan → HouseSpec export (client/workspaces/cad/lib/design/plan-to-spec.ts):
 * each spec in specs/ is loaded into the designer (plan₁), exported with planToSpec, loaded again
 * (plan₂); plan₁ and plan₂ must match once ids are replaced by what they point at.
 *
 *   node tools/cad-spec-roundtrip/run.mjs [spec.json …]
 *
 * Uses the system Chrome / Edge through Playwright (channel), no browser download. Exit 1 on any difference.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HERE = fileURLToPath(new URL("./", import.meta.url));
const TEMPLATE = path.join(ROOT, "skill/cad-skill/designer/assets/template.html");
const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(HERE, "specs")).filter((f) => f.endsWith(".json")).map((f) => path.join(HERE, "specs", f));

const kit = (await build({
  stdin: { contents: `export { planToSpec, carryOver } from "./plan-to-spec";`, resolveDir: path.join(ROOT, "client/workspaces/cad/lib/design"), loader: "ts" },
  bundle: true, write: false, format: "iife", globalName: "RoundTrip", platform: "browser", target: "es2020",
})).outputFiles[0].text;

// The same functions in Node, for carryOver after the second load.
const nodeKit = (await build({
  stdin: { contents: `export { planToSpec, carryOver } from "./plan-to-spec";`, resolveDir: path.join(ROOT, "client/workspaces/cad/lib/design"), loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", target: "node18",
})).outputFiles[0].text;
const { carryOver } = await import(`data:text/javascript;base64,${Buffer.from(nodeKit).toString("base64")}`);

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  fs.createReadStream(TEMPLATE).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/designer.html?debug`;

let browser;
for (const channel of ["chrome", "msedge", undefined]) {
  try { browser = await chromium.launch({ channel, headless: true }); break; } catch { /* next */ }
}
if (!browser) { console.error("No Chrome / Edge / Playwright Chromium found"); process.exit(2); }

/** Load a preset, return the whole plan (a building with every floor) the way the app's bridge reads it. */
async function load(preset) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error.message ?? error)));
  await page.addInitScript((value) => {
    try { localStorage.clear(); } catch { /* opaque origin */ }
    Object.defineProperty(window, "__PRESET__", { get: () => value, set: () => {}, configurable: true });
  }, preset);
  await page.goto(url);
  await page.waitForFunction(() => window.__designer?.app?.plan, null, { timeout: 60000 });
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: kit });
  const result = await page.evaluate(() => {
    const d = window.__designer, clone = (v) => JSON.parse(JSON.stringify(v));
    let plan = clone(d.app.plan);
    if (d.bld?.floors?.length > 1) {
      const building = clone(d.bld);
      building.floors[building.cur].plan = plan;
      plan = { ...building, version: 2, kind: "building" };
    }
    return { plan, spec: window.RoundTrip.planToSpec(plan) };
  });
  await page.close();
  return { ...result, errors };
}

/** Ids → what they point at, so two loads compare by content. */
function normalize(plan) {
  if (plan.kind === "building") return { ...plan, floors: plan.floors.map((floor) => ({ name: floor.name, plan: normalize(floor.plan) })), cur: undefined };
  const r = (v) => Math.round(v);
  const nodes = new Map(plan.nodes.map((n) => [n.id, `${r(n.x)},${r(n.y)}`]));
  const walls = new Map(plan.walls.map((w) => [w.id, `${nodes.get(w.a)}→${nodes.get(w.b)}`]));
  const roomName = new Map(plan.rooms.map((room) => [room.id, room.name]));
  const elecRef = new Map((plan.elec ?? []).map((e) => [e.id, `${e.kind}@${r(e.x)},${r(e.y)}`]));
  const strip = ({ id, ...rest }) => rest;
  const sortBy = (list) => list.sort((p, q) => JSON.stringify(p).localeCompare(JSON.stringify(q)));
  const roundAll = (value) => JSON.parse(JSON.stringify(value, (_, v) => (typeof v === "number" ? Math.round(v * 2) / 2 : v)));
  return roundAll({
    ...plan,
    nodes: sortBy([...nodes.values()]),
    walls: sortBy(plan.walls.map((w) => ({ ...strip(w), a: nodes.get(w.a), b: nodes.get(w.b) }))),
    openings: sortBy(plan.openings.map((o) => ({ ...strip(o), wall: walls.get(o.wall) }))),
    rooms: sortBy(plan.rooms.map(strip)),
    furniture: sortBy(plan.furniture.map(strip)),
    structs: sortBy((plan.structs ?? []).map(strip)),
    beams: sortBy((plan.beams ?? []).map(strip)),
    voids: sortBy((plan.voids ?? []).map(strip)),
    // Cove strips are rebuilt from the ceilings and re-linked by the designer: compare them without links into them.
    elec: sortBy((plan.elec ?? []).map((e) => ({ ...strip(e), ...(e.auto ? { auto: String(e.auto).replace(/^cove:([^:]+)/, (_, id) => `cove:${roomName.get(id) ?? id}`) } : {}), links: e.links?.map((id) => elecRef.get(id)).filter((ref) => ref && !ref.startsWith("strip@")).sort() }))),
    comments: sortBy((plan.comments ?? []).map(({ id, time, ...rest }) => rest)),
    mep: plan.mep ? { ...plan.mep, custom: plan.mep.custom?.map(strip) } : undefined,
  });
}

function diff(a, b, at = "", out = []) {
  if (out.length > 12) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], `${at}/${key}`, out);
    return out;
  }
  out.push(`${at}: ${JSON.stringify(a)?.slice(0, 160)}  ≠  ${JSON.stringify(b)?.slice(0, 160)}`);
  return out;
}

let failed = 0;
try {
  for (const file of files) {
    const spec = JSON.parse(fs.readFileSync(file, "utf8"));
    const first = await load({ id: `rt1-${Date.now()}`, spec });
    const second = await load({ id: `rt2-${Date.now()}`, spec: first.spec });
    // As the app and the skill do after a reload: comment threads, measures and prices come back.
    const restored = carryOver(first.plan, second.plan);
    const problems = diff(normalize(first.plan), normalize(restored));
    const errors = [...first.errors, ...second.errors];
    const name = path.basename(file);
    if (problems.length || errors.length) {
      failed++;
      console.log(`✗ ${name}`);
      for (const line of errors) console.log(`  page error: ${line}`);
      for (const line of problems) console.log(`  ${line}`);
    } else console.log(`✓ ${name}`);
  }
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
