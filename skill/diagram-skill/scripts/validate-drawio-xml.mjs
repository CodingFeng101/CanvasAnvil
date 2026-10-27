#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = { input: "", quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (token === "--quiet") {
      args.quiet = true;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function extractValue(source, pattern, fallback = "") {
  const match = source.match(pattern);
  return match ? match[1] : fallback;
}

function collectCells(xml) {
  const cells = [];
  const cellPattern = /<mxCell\b([^>]*?)(?:\/>|>[\s\S]*?<\/mxCell>)/g;
  let match = cellPattern.exec(xml);
  while (match) {
    const attrs = match[1] || "";
    cells.push({
      raw: match[0],
      id: extractValue(attrs, /\bid="([^"]+)"/, ""),
      parent: extractValue(attrs, /\bparent="([^"]+)"/, ""),
      source: extractValue(attrs, /\bsource="([^"]+)"/, ""),
      target: extractValue(attrs, /\btarget="([^"]+)"/, ""),
      edge: /\bedge="1"/.test(attrs),
    });
    match = cellPattern.exec(xml);
  }
  return cells;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    fail("Usage: node validate-drawio-xml.mjs --input <path-to-xml-or-drawio>");
  }

  const inputPath = path.resolve(process.cwd(), args.input);
  const xml = fs.readFileSync(inputPath, "utf8");

  if (!xml.includes("<mxGraphModel") || !xml.includes("<root")) {
    fail("Invalid draw.io XML: missing <mxGraphModel> or <root>.");
  }

  const cells = collectCells(xml);
  if (cells.length === 0) {
    fail("Invalid draw.io XML: no mxCell elements found.");
  }

  const ids = new Set();
  for (const cell of cells) {
    if (!cell.id) fail("Invalid draw.io XML: found mxCell without id.");
    if (ids.has(cell.id)) fail(`Invalid draw.io XML: duplicate id "${cell.id}".`);
    ids.add(cell.id);
  }

  if (!ids.has("0")) fail('Invalid draw.io XML: missing root cell id="0".');
  if (!ids.has("1")) fail('Invalid draw.io XML: missing root cell id="1".');

  const cell1 = cells.find((cell) => cell.id === "1");
  if (!cell1 || cell1.parent !== "0") {
    fail('Invalid draw.io XML: root cell id="1" must have parent="0".');
  }

  for (const cell of cells) {
    if (cell.id !== "0" && !cell.parent) {
      fail(`Invalid draw.io XML: cell "${cell.id}" is missing parent.`);
    }
    if (cell.edge) {
      if (cell.source && !ids.has(cell.source)) {
        fail(`Invalid draw.io XML: edge "${cell.id}" source "${cell.source}" not found.`);
      }
      if (cell.target && !ids.has(cell.target)) {
        fail(`Invalid draw.io XML: edge "${cell.id}" target "${cell.target}" not found.`);
      }
    }
  }

  if (!args.quiet) {
    console.log(`Valid draw.io XML: ${cells.length} cells checked in ${inputPath}`);
  }
}

main();
