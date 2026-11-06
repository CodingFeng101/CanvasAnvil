#!/usr/bin/env node

/**
 * Layout check for a draw.io diagram: the rules every readable diagram
 * keeps, whatever its kind. Run it after validate-drawio-xml.mjs and fix
 * what it reports before handing the diagram over.
 *
 * Errors:   overlap, container-escape, container-overlap, edge-through-shape
 * Warnings: text-overflow, dangling-edge, near-miss
 *
 * Prints each issue with the ids involved and a score (100 = clean).
 * Exits 1 when there are errors, so it can gate a pipeline; --json prints
 * the report as JSON instead.
 *
 * No dependencies. Mirrors the check the CanvasAnvil app runs on every
 * generated diagram (client/workspaces/diagram/lib/layout-lint.ts).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = { input: "", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (token === "--json") {
      args.json = true;
    }
  }
  return args;
}

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#xa;": "\n", "&#10;": "\n", "&nbsp;": " " };
const decode = (s) => String(s || "").replace(/&lt;|&gt;|&amp;|&quot;|&#xa;|&#10;|&nbsp;/g, (m) => ENTITIES[m]);

// Quote-aware, so a raw "<b>" inside a label does not end the tag.
const ATTRS = String.raw`((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)`;
const CELL_RE = new RegExp(String.raw`<mxCell\b${ATTRS}\s*(?:\/>|>([\s\S]*?)<\/mxCell>)`, "g");
const GEOMETRY_RE = new RegExp(String.raw`<mxGeometry\b${ATTRS}\s*\/?>`);

function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1]] = m[2] ?? m[3] ?? "";
  return attrs;
}

function styleValue(style, key) {
  for (const entry of String(style || "").split(";")) {
    const eq = entry.indexOf("=");
    if (eq > 0 && entry.slice(0, eq).trim() === key) return entry.slice(eq + 1).trim();
  }
  return undefined;
}

/** A bare style token such as "text" or "swimlane", or a shape= of that name. */
const styleHas = (style, token) =>
  String(style || "")
    .split(";")
    .some((e) => e.trim() === token) || styleValue(style, "shape") === token;

function scanCells(xml) {
  const cells = [];
  for (const m of xml.matchAll(CELL_RE)) {
    const attrs = parseAttrs(m[1] || "");
    for (const k of ["value", "style"]) if (attrs[k] !== undefined) attrs[k] = decode(attrs[k]);
    cells.push({ id: attrs.id || "", attrs, body: m[2] || "" });
  }
  return cells;
}

function readGeometry(body) {
  const m = body.match(GEOMETRY_RE);
  if (!m) return null;
  const a = parseAttrs(m[1]);
  return { x: Number(a.x || 0), y: Number(a.y || 0), w: Number(a.width || 0), h: Number(a.height || 0) };
}

const cx = (b) => b.x + b.w / 2;
const cy = (b) => b.y + b.h / 2;
const area = (b) => b.w * b.h;
const contains = (outer, inner, tol = 2) =>
  inner.x >= outer.x - tol &&
  inner.y >= outer.y - tol &&
  inner.x + inner.w <= outer.x + outer.w + tol &&
  inner.y + inner.h <= outer.y + outer.h + tol;
const containsPoint = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const overlapOf = (a, b) => [
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
];

function readModel(xml) {
  const cells = scanCells(xml);
  const byId = new Map(cells.map((c) => [c.id, c]));
  const rel = new Map();
  for (const c of cells) {
    if (c.attrs.vertex !== "1") continue;
    if (byId.get(c.attrs.parent || "")?.attrs.edge === "1") continue; // edge labels
    const g = readGeometry(c.body);
    if (g && g.w > 0 && g.h > 0) rel.set(c.id, g);
  }
  const absCache = new Map();
  const absOf = (id, depth = 0) => {
    if (absCache.has(id)) return absCache.get(id);
    const r = rel.get(id);
    const parentId = byId.get(id)?.attrs.parent || "";
    let box = r;
    if (rel.has(parentId) && depth < 20) {
      const p = absOf(parentId, depth + 1);
      box = { x: r.x + p.x, y: r.y + p.y, w: r.w, h: r.h };
    }
    absCache.set(id, box);
    return box;
  };

  const shapes = new Map();
  for (const id of rel.keys()) {
    const cell = byId.get(id);
    shapes.set(id, {
      id,
      parent: cell.attrs.parent || "",
      style: cell.attrs.style || "",
      value: cell.attrs.value || "",
      box: absOf(id),
      container: false,
      region: "",
      label: false,
    });
  }
  const all = [...shapes.values()];
  for (const s of all) {
    s.container =
      styleHas(s.style, "swimlane") ||
      styleValue(s.style, "container") === "1" ||
      styleHas(s.style, "group") ||
      all.some((o) => o.parent === s.id) ||
      all.some((o) => o !== s && area(o.box) < area(s.box) * 0.9 && contains(s.box, o.box));
  }
  const containers = all.filter((s) => s.container);
  for (const s of all) {
    const parent = shapes.get(s.parent);
    if (parent?.container) {
      s.region = parent.id;
      continue;
    }
    let best = null;
    for (const c of containers) {
      if (c === s || area(c.box) <= area(s.box)) continue;
      if (!containsPoint(c.box, cx(s.box), cy(s.box))) continue;
      if (!best || area(c.box) < area(best.box)) best = c;
    }
    s.region = best?.id || "";
  }

  const linked = new Set();
  const edges = [];
  const dangling = [];
  for (const c of cells) {
    if (c.attrs.edge !== "1") continue;
    const { source = "", target = "" } = c.attrs;
    linked.add(source);
    linked.add(target);
    if (!shapes.has(source) || !shapes.has(target)) {
      // A free end pinned to a point (a lifeline, a divider) is drawn on purpose;
      // an end that names a missing cell, or names nothing at all, is not.
      const free = (id, as) => !id && new RegExp(`<mxPoint\\b[^>]*as="${as}"`).test(c.body);
      const broken = [
        [source, "sourcePoint"],
        [target, "targetPoint"],
      ].some(([id, as]) => !shapes.has(id) && !free(id, as));
      if (broken) dangling.push(c.id);
      continue;
    }
    const style = c.attrs.style || "";
    const origin = shapes.get(c.attrs.parent || "")?.box;
    const points = [];
    const array = c.body.match(/<Array\b[^>]*as="points"[^>]*>[\s\S]*?<\/Array>/)?.[0] || "";
    for (const m of array.matchAll(/<mxPoint\b([^>]*)>?/g)) {
      const a = parseAttrs(m[1] || "");
      points.push([Number(a.x || 0) + (origin?.x ?? 0), Number(a.y || 0) + (origin?.y ?? 0)]);
    }
    const pair = (kx, ky) => {
      const x = styleValue(style, kx);
      const y = styleValue(style, ky);
      return x !== undefined && y !== undefined && x !== "" && y !== "" ? [Number(x), Number(y)] : null;
    };
    edges.push({ id: c.id, source, target, style, points, exit: pair("exitX", "exitY"), entry: pair("entryX", "entryY") });
  }
  for (const s of all) s.label = !s.container && styleHas(s.style, "text") && !linked.has(s.id);
  return { shapes, edges, dangling };
}

const isOrthogonal = (style) => /orthogonalEdgeStyle|elbowEdgeStyle/i.test(styleValue(style, "edgeStyle") || "");

function labelLines(value) {
  return decode(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function textWidth(line, fontSize) {
  let w = 0;
  for (const ch of line) w += /[⺀-鿿가-힯＀-￯]/.test(ch) ? 1 : 0.6;
  return w * fontSize;
}

function textOverflows(s) {
  if (s.container || s.label) return false;
  if (styleValue(s.style, "verticalLabelPosition") || styleValue(s.style, "labelPosition")) return false;
  const lines = labelLines(s.value);
  if (!lines.length) return false;
  const fontSize = Number(styleValue(s.style, "fontSize")) || 12;
  const inner = s.box.w - 8;
  if (inner <= 0) return true;
  const wraps = styleValue(s.style, "whiteSpace") === "wrap";
  let count = 0;
  for (const line of lines) {
    const w = textWidth(line, fontSize);
    if (!wraps && w > inner + 4) return true;
    count += wraps ? Math.max(1, Math.ceil(w / inner)) : 1;
  }
  return count * fontSize * 1.2 > s.box.h + 2;
}

function anchor(b, ratio, toward) {
  if (ratio) return [b.x + ratio[0] * b.w, b.y + ratio[1] * b.h];
  const dx = toward[0] - cx(b);
  const dy = toward[1] - cy(b);
  if (Math.abs(dx) * b.h >= Math.abs(dy) * b.w) return [dx >= 0 ? b.x + b.w : b.x, cy(b)];
  return [cx(b), dy >= 0 ? b.y + b.h : b.y];
}

/** Approximate the path draw.io draws for an edge. */
function edgePath(e, s, t) {
  if (e.points.length) {
    return [anchor(s, e.exit, e.points[0]), ...e.points, anchor(t, e.entry, e.points[e.points.length - 1])];
  }
  const start = anchor(s, e.exit, [cx(t), cy(t)]);
  const end = anchor(t, e.entry, [cx(s), cy(s)]);
  if (!isOrthogonal(e.style)) return [start, end];
  if (Math.abs(start[0] - end[0]) < 1 || Math.abs(start[1] - end[1]) < 1) return [start, end];
  if (start[0] === s.x || start[0] === s.x + s.w) {
    const mid = (start[0] + end[0]) / 2;
    return [start, [mid, start[1]], [mid, end[1]], end];
  }
  const mid = (start[1] + end[1]) / 2;
  return [start, [start[0], mid], [end[0], mid], end];
}

function segmentHitsBox(a, b, box, margin = 2) {
  const x0 = box.x + margin;
  const y0 = box.y + margin;
  const x1 = box.x + box.w - margin;
  const y1 = box.y + box.h - margin;
  if (x1 <= x0 || y1 <= y0) return false;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a[0] - x0) && clip(dx, x1 - a[0]) && clip(-dy, a[1] - y0) && clip(dy, y1 - a[1]) && t0 < t1;
}

const SEVERITY = {
  overlap: "error",
  "container-escape": "error",
  "container-overlap": "error",
  "edge-through-shape": "error",
  "text-overflow": "warning",
  "dangling-edge": "warning",
  "near-miss": "warning",
};
const PENALTY = { error: { each: 8, cap: 40 }, warning: { each: 2, cap: 20 } };

const HINT = {
  overlap: "move one shape so they no longer cover each other (keep 40px gaps)",
  "container-escape": "make the group larger or move the shape inside it",
  "container-overlap": "move the groups apart; groups side by side never overlap",
  "edge-through-shape": "move the shape off the line, or reorder the row so the edge has a clear path",
  "text-overflow": "widen the shape, add whiteSpace=wrap, or shorten the label",
  "dangling-edge": "point source and target at existing shapes",
  "near-miss": "line the two shapes up exactly (same centre x or y)",
};

export function checkLayout(xml) {
  const { shapes, edges, dangling } = readModel(xml);
  const issues = [];
  const add = (rule, ids) => issues.push({ rule, severity: SEVERITY[rule], ids });
  const all = [...shapes.values()];
  // Lines drawn as shapes (lifelines, dividers) and anchor points have no area.
  const thin = (s) => s.box.w <= 2 || s.box.h <= 2 || styleValue(s.style, "shape") === "line";
  const solid = all.filter((s) => !s.container && !thin(s));
  const containers = all.filter((s) => s.container);
  const ancestors = (s) => {
    const out = new Set();
    for (let r = s.region, n = 0; r && n < 20; r = shapes.get(r)?.region || "", n++) out.add(r);
    return out;
  };

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      const [ox, oy] = overlapOf(a.box, b.box);
      if (ox > 4 && oy > 4 && !contains(a.box, b.box, 0) && !contains(b.box, a.box, 0)) add("overlap", [a.id, b.id]);
    }
  }
  for (const s of all) {
    if (thin(s)) continue;
    const region = shapes.get(s.region);
    if (region && !contains(region.box, s.box)) add("container-escape", [s.id, region.id]);
  }
  for (let i = 0; i < containers.length; i++) {
    for (let j = i + 1; j < containers.length; j++) {
      const a = containers[i];
      const b = containers[j];
      if (ancestors(a).has(b.id) || ancestors(b).has(a.id)) continue;
      const [ox, oy] = overlapOf(a.box, b.box);
      if (ox > 4 && oy > 4 && !contains(a.box, b.box) && !contains(b.box, a.box)) add("container-overlap", [a.id, b.id]);
    }
  }
  for (const s of solid) if (textOverflows(s)) add("text-overflow", [s.id]);
  for (const id of dangling) add("dangling-edge", [id]);

  for (const e of edges) {
    const s = shapes.get(e.source);
    const t = shapes.get(e.target);
    const p = edgePath(e, s.box, t.box);
    const ends = new Set([e.source, e.target, ...ancestors(s), ...ancestors(t)]);
    const hit = solid.find((o) => !ends.has(o.id) && p.slice(1).some((q, i) => segmentHitsBox(p[i], q, o.box)));
    if (hit) add("edge-through-shape", [e.id, hit.id]);
    if (isOrthogonal(e.style) && !e.points.length) {
      const dx = Math.abs(cx(s.box) - cx(t.box));
      const dy = Math.abs(cy(s.box) - cy(t.box));
      const slipX = Math.max(12, 0.2 * Math.min(s.box.w, t.box.w));
      const slipY = Math.max(12, 0.2 * Math.min(s.box.h, t.box.h));
      if ((dx > 0.5 && dx <= slipX) || (dy > 0.5 && dy <= slipY)) add("near-miss", [e.id]);
    }
  }

  let score = 100;
  const perRule = new Map();
  for (const i of issues) perRule.set(i.rule, (perRule.get(i.rule) || 0) + 1);
  for (const [rule, n] of perRule) {
    const p = PENALTY[SEVERITY[rule]];
    score -= Math.min(p.cap, n * p.each);
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  return { score: Math.max(0, score), errors, warnings: issues.length - errors, issues };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: node check-layout.mjs --input <path-to-xml-or-drawio> [--json]");
    process.exit(2);
  }
  const inputPath = path.resolve(process.cwd(), args.input);
  const report = checkLayout(fs.readFileSync(inputPath, "utf8"));
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Layout score ${report.score}/100: ${report.errors} errors, ${report.warnings} warnings (${inputPath})`);
    for (const i of report.issues) {
      console.log(`  ${i.severity === "error" ? "ERROR" : "warn "} ${i.rule} [${i.ids.join(", ")}] - ${HINT[i.rule]}`);
    }
  }
  process.exit(report.errors > 0 ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
