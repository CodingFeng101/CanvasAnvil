#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    svg: "",
    outDir: "",
    name: "cad-output",
    imagePromptFile: "",
    referenceImageUrl: "",
    productImageUrl: "",
    export2d: true,
    generateImage: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--svg") {
      args.svg = argv[i + 1] || "";
      i += 1;
    } else if (token === "--out-dir" || token === "-o") {
      args.outDir = argv[i + 1] || "";
      i += 1;
    } else if (token === "--name") {
      args.name = argv[i + 1] || args.name;
      i += 1;
    } else if (token === "--image-prompt-file") {
      args.imagePromptFile = argv[i + 1] || "";
      args.generateImage = true;
      i += 1;
    } else if (token === "--reference-image-url") {
      args.referenceImageUrl = argv[i + 1] || "";
      i += 1;
    } else if (token === "--product-image-url") {
      args.productImageUrl = argv[i + 1] || "";
      i += 1;
    } else if (token === "--skip-2d-export") {
      args.export2d = false;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runNodeScript(scriptPath, scriptArgs) {
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`Script failed: ${path.basename(scriptPath)}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outDir) fail("Missing --out-dir <directory>.");

  const outDir = path.resolve(process.cwd(), args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const scriptDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));
  const export2dScript = path.join(scriptDir, "export-cad-2d-image.mjs");
  const generateImageScript = path.join(scriptDir, "generate-cad-image.mjs");

  const metadata = {
    name: args.name,
    generatedAt: new Date().toISOString(),
    files: {},
  };

  if (args.svg) {
    const svgInput = path.resolve(process.cwd(), args.svg);
    if (!fs.existsSync(svgInput)) fail(`SVG file not found: ${svgInput}`);
    const svgOutput = path.join(outDir, `${args.name}.svg`);
    fs.copyFileSync(svgInput, svgOutput);
    metadata.files.svg = path.basename(svgOutput);

    if (args.export2d) {
      const pngOutput = path.join(outDir, `${args.name}.png`);
      runNodeScript(export2dScript, ["--input", svgOutput, "--output", pngOutput, "--format", "png"]);
      metadata.files.floorplanPreview = path.basename(pngOutput);
    }
  }

  if (args.generateImage) {
    const promptPath = path.resolve(process.cwd(), args.imagePromptFile);
    if (!fs.existsSync(promptPath)) fail(`Prompt file not found: ${promptPath}`);
    const imageOutput = path.join(outDir, `${args.name}.render.png`);
    const imageArgs = ["--prompt-file", promptPath, "--output", imageOutput];
    if (args.referenceImageUrl) imageArgs.push("--reference-image-url", args.referenceImageUrl);
    if (args.productImageUrl) imageArgs.push("--product-image-url", args.productImageUrl);
    runNodeScript(generateImageScript, imageArgs);
    metadata.files.renderImage = path.basename(imageOutput);
    const promptCopy = path.join(outDir, `${args.name}.prompt.txt`);
    fs.copyFileSync(promptPath, promptCopy);
    metadata.files.prompt = path.basename(promptCopy);
  }

  const metadataPath = path.join(outDir, `${args.name}.metadata.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`CAD bundle written to ${outDir}`);
}

main();
