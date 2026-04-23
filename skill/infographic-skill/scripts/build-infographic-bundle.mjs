#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const args = {
    promptFile: "",
    outDir: "",
    name: "infographic",
    configFile: "",
    format: "png",
    referenceImageUrl: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--prompt-file") {
      args.promptFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--out-dir" || token === "-o") {
      args.outDir = argv[i + 1] || "";
      i += 1;
    } else if (token === "--name") {
      args.name = argv[i + 1] || args.name;
      i += 1;
    } else if (token === "--config-file") {
      args.configFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--format") {
      args.format = argv[i + 1] || args.format;
      i += 1;
    } else if (token === "--reference-image-url") {
      args.referenceImageUrl = argv[i + 1] || "";
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.promptFile) fail("Missing --prompt-file <path-to-prompt>.");
  if (!args.outDir) fail("Missing --out-dir <bundle-directory>.");

  const promptFile = path.resolve(process.cwd(), args.promptFile);
  const outDir = path.resolve(process.cwd(), args.outDir);
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const generateScript = path.join(scriptDir, "generate-infographic-image.mjs");
  const imagePath = path.join(outDir, `${args.name}.${args.format}`);
  const metadataPath = path.join(outDir, `${args.name}.metadata.json`);
  const promptCopyPath = path.join(outDir, `${args.name}.prompt.txt`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(promptFile, promptCopyPath);

  const command = [
    generateScript,
    "--prompt-file",
    promptFile,
    "--output",
    imagePath,
    "--format",
    args.format,
  ];
  if (args.configFile) {
    command.push("--config-file", path.resolve(process.cwd(), args.configFile));
  }
  if (args.referenceImageUrl) {
    command.push("--reference-image-url", args.referenceImageUrl);
  }

  const result = spawnSync(process.execPath, command, { stdio: "inherit" });
  if (result.status !== 0) fail("Infographic image generation failed.");

  const metadata = {
    name: args.name,
    imageFile: path.basename(imagePath),
    promptFile: path.basename(promptCopyPath),
    generatedAt: new Date().toISOString(),
    format: args.format,
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  console.log(`Infographic bundle written to ${outDir}`);
}

main();
