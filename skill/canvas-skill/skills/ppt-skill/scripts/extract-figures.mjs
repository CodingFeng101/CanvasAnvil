#!/usr/bin/env node
/**
 * Figures from the user's PDF / Word documents through MinerU, as the website does when a MinerU token is set.
 *
 *   node scripts/extract-figures.mjs --out-dir <deck>/materials <doc.pdf> [<doc.docx> ...] [--config-file <json>]
 *
 * Needs `mineruToken` in config/file-parser.json. Without it nothing is extracted (exit 0, "not configured"):
 * the deck then uses only pictures the user gave directly. Up to 10 figures per document and 24 in all, named
 * FIG_1, FIG_2, ...; writes <out-dir>/figures.json with each figure's label, file, source and MinerU's text hint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, imageExtensionFromMime, readJson, writeJson } from "./lib/common.mjs";
import { extractMineruAssets, MINERU_DEFAULT_BASE } from "./lib/mineru.mjs";

const PER_FILE = 10;
const TOTAL = 24;
const argv = process.argv.slice(2);
let outDir = "";
let configFile = fileURLToPath(new URL("../config/file-parser.json", import.meta.url));
const inputs = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--out-dir") outDir = argv[++i] || "";
  else if (argv[i] === "--config-file") configFile = path.resolve(argv[++i] || "");
  else inputs.push(argv[i]);
}

const config = fs.existsSync(configFile) ? readJson(configFile) : {};
const token = String(config.mineruToken || "").trim();
if (!token) {
  console.log("MinerU is not configured (config/file-parser.json mineruToken): no figures extracted.");
  process.exit(0);
}
if (!outDir) fail("Missing --out-dir <folder>.");
if (inputs.length === 0) fail("Give one or more .pdf / .docx files.");

const figures = [];
for (const input of inputs) {
  const file = path.resolve(input);
  if (!fs.existsSync(file)) fail(`Missing file: ${file}`);
  if (!/\.(pdf|docx?)$/i.test(file)) {
    console.log(`skip ${path.basename(file)}: MinerU is used for PDF and Word only`);
    continue;
  }
  if (figures.length >= TOTAL) break;
  try {
    const assets = await extractMineruAssets({
      fileName: path.basename(file),
      bytes: new Uint8Array(fs.readFileSync(file)),
      apiToken: token,
      apiBase: config.baseUrl || MINERU_DEFAULT_BASE,
      maxAssets: Math.min(PER_FILE, TOTAL - figures.length),
    });
    fs.mkdirSync(outDir, { recursive: true });
    for (const asset of assets) {
      const label = `FIG_${figures.length + 1}`;
      const name = `${label}.${asset.mime === "image/svg+xml" ? "svg" : imageExtensionFromMime(asset.mime, "png")}`;
      fs.writeFileSync(path.join(outDir, name), asset.bytes);
      figures.push({ label, file: name, source: path.basename(file), textHint: asset.textHint });
    }
    console.log(`${path.basename(file)}: ${assets.length} figure(s)`);
  } catch (error) {
    console.log(`${path.basename(file)}: MinerU failed (${error instanceof Error ? error.message : error}); no figures from it`);
  }
}
if (figures.length) writeJson(path.join(outDir, "figures.json"), figures);
console.log(`${figures.length} figure(s)${figures.length ? ` in ${outDir} (figures.json)` : ""}.`);
