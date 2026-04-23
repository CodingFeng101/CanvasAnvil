#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    input: "",
    outDir: "",
    name: "diagram",
    title: "Draw.io Preview",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (token === "--out-dir" || token === "-o") {
      args.outDir = argv[i + 1] || "";
      i += 1;
    } else if (token === "--name") {
      args.name = argv[i + 1] || args.name;
      i += 1;
    } else if (token === "--title") {
      args.title = argv[i + 1] || args.title;
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function resolveDefaultOutputDir() {
  const cwd = path.resolve(process.cwd());
  const baseDir = cwd.startsWith(skillRoot) ? path.resolve(skillRoot, "..") : cwd;
  const dir = path.join(baseDir, `flow-skill-bundle-${timestamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) fail("Missing --input <path-to-drawio-or-xml>.");

  const inputPath = path.resolve(process.cwd(), args.input);
  const outDir = args.outDir
    ? path.resolve(process.cwd(), args.outDir)
    : resolveDefaultOutputDir();
  const xml = fs.readFileSync(inputPath, "utf8");

  fs.mkdirSync(outDir, { recursive: true });

  const drawioPath = path.join(outDir, `${args.name}.drawio`);
  const pngPath = path.join(outDir, `${args.name}.png`);
  const metadataPath = path.join(outDir, `${args.name}.metadata.json`);

  const validateScript = path.join(scriptDir, "validate-drawio-xml.mjs");
  const validateResult = spawnSync(process.execPath, [
    validateScript,
    "--input",
    inputPath,
    "--quiet",
  ], { stdio: "inherit" });

  if (validateResult.status !== 0) {
    fail("Validation failed. Bundle was not created.");
  }

  fs.writeFileSync(drawioPath, xml, "utf8");

  const exportImageScript = path.join(scriptDir, "export-drawio-image.mjs");
  const exportResult = spawnSync(process.execPath, [
    exportImageScript,
    "--input",
    drawioPath,
    "--output",
    pngPath,
    "--format",
    "png",
  ], { stdio: "inherit" });

  if (exportResult.status !== 0) {
    fail("Failed to export PNG preview.");
  }

  const metadata = {
    name: args.name,
    sourceFile: path.basename(drawioPath),
    imageFile: path.basename(pngPath),
    generatedAt: new Date().toISOString(),
    validated: true,
    notes: [
      "PNG export is generated directly to local disk through the official embed export action.",
      "The bundle includes the source .drawio file and a PNG export for quick review.",
    ],
  };

  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`Flow bundle written to ${outDir}`);
}

main();
