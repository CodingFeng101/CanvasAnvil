#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pako = require("../vendor/pako_deflate.min.cjs");

const BASE_URL = "https://app.diagrams.net/?offline=1#R";
const SAFE_URL_LENGTH = 1_500_000;

function parseArgs(argv) {
  const args = { input: null, json: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") {
      args.input = argv[++i];
    } else if (arg === "--json") {
      args.json = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/build-drawio-url.mjs --input <diagram.drawio> [--json]",
    "",
    "Builds a self-contained https://app.diagrams.net editor URL that loads the diagram.",
    "The XML is URI-encoded, compressed with pako deflateRaw, and base64-encoded.",
    "Use '-' as the input path to read XML from stdin.",
  ].join("\n");
}

function readXml(input) {
  const raw =
    input === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(path.resolve(input), "utf8");

  return raw.replace(/^\uFEFF/, "");
}

function buildEditorUrl(xml) {
  const encoded = encodeURIComponent(xml);
  const compressed = pako.deflateRaw(encoded);
  const base64 = Buffer.from(compressed).toString("base64");

  return {
    url: `${BASE_URL}${encodeURIComponent(base64)}`,
    compressedBytes: compressed.length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (!args.input) {
    throw new Error("Missing required option: --input <diagram.drawio>");
  }

  const xml = readXml(args.input);

  if (!xml.includes("<mxGraphModel")) {
    throw new Error(
      "Input must contain <mxGraphModel>. Extract the graph model from any <mxfile> wrapper first.",
    );
  }

  const { url, compressedBytes } = buildEditorUrl(xml);
  const tooLong = url.length > SAFE_URL_LENGTH;
  const fallback = tooLong
    ? "URL is too long for some browsers. Open the .drawio file in app.diagrams.net via File > Open From > Device."
    : null;

  if (args.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          url,
          urlLength: url.length,
          xmlBytes: Buffer.byteLength(xml, "utf8"),
          compressedBytes,
          tooLong,
          fallback,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${url}\n`);
  }

  if (tooLong) {
    process.stderr.write(`Warning: ${fallback}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
