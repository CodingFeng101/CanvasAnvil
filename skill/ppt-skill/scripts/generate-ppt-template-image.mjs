#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { generateImageThroughGateway } from "./lib/gateway.mjs";
import {
  decodeDataUrl,
  ensureDir,
  imageExtensionFromMime,
  loadImageProviderConfig,
  readJson,
  resolveFromCwd,
  safeSlug,
  fail,
} from "./lib/common.mjs";

function parseArgs(argv) {
  const args = {
    prompt: "",
    promptFile: "",
    output: "",
    outDir: "",
    variantId: "",
    configFile: "",
    referenceImageUrl: "",
    name: "template",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--prompt") {
      args.prompt = argv[i + 1] || "";
      i += 1;
    } else if (token === "--prompt-file") {
      args.promptFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output" || token === "-o") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--out-dir") {
      args.outDir = argv[i + 1] || "";
      i += 1;
    } else if (token === "--variant-id") {
      args.variantId = argv[i + 1] || "";
      i += 1;
    } else if (token === "--config-file") {
      args.configFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--reference-image-url") {
      args.referenceImageUrl = argv[i + 1] || "";
      i += 1;
    } else if (token === "--name") {
      args.name = argv[i + 1] || args.name;
      i += 1;
    }
  }
  return args;
}

function resolveVariant(payload, variantId) {
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];
  if (variants.length === 0) return null;
  if (!variantId) return variants[0];
  return variants.find((item) => item?.id === variantId) || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt && !args.promptFile) fail("Missing prompt input. Use --prompt or --prompt-file.");
  if (!args.output && !args.outDir) fail("Missing --output <file> or --out-dir <dir>.");

  let prompt = String(args.prompt || "").trim();
  let selectedVariant = null;
  let promptSource = "";

  if (args.promptFile) {
    const promptPath = resolveFromCwd(args.promptFile);
    const raw = fs.readFileSync(promptPath, "utf8");
    promptSource = promptPath;
    if (promptPath.toLowerCase().endsWith(".json")) {
      const payload = readJson(promptPath);
      selectedVariant = resolveVariant(payload, args.variantId);
      if (!selectedVariant?.prompt) fail("Prompt JSON did not contain a usable template variant prompt.");
      prompt = String(selectedVariant.prompt || "").trim();
    } else {
      prompt = raw.trim();
    }
  }

  if (!prompt) fail("Resolved template prompt is empty.");

  const channel = loadImageProviderConfig(args.configFile);
  const dataUrl = await generateImageThroughGateway({
    channel,
    prompt,
    referenceImageUrl: args.referenceImageUrl || undefined,
  });
  const { mime, buffer } = decodeDataUrl(dataUrl);
  const ext = imageExtensionFromMime(mime, "png");

  let outputPath = "";
  if (args.output) {
    outputPath = resolveFromCwd(args.output);
    ensureDir(path.dirname(outputPath));
  } else {
    const outDir = resolveFromCwd(args.outDir);
    ensureDir(outDir);
    const fileStem = safeSlug(selectedVariant?.id || args.name, "template");
    outputPath = path.join(outDir, `${fileStem}.${ext}`);
  }

  fs.writeFileSync(outputPath, buffer);

  if (args.outDir) {
    const outDir = resolveFromCwd(args.outDir);
    const metadataPath = path.join(outDir, `${safeSlug(selectedVariant?.id || args.name, "template")}.metadata.json`);
    fs.writeFileSync(
      metadataPath,
      JSON.stringify(
        {
          type: "ppt_template_image",
          variantId: selectedVariant?.id || null,
          name: selectedVariant?.name || args.name,
          imageFile: path.basename(outputPath),
          promptSource: promptSource || null,
          generatedAt: new Date().toISOString(),
          provider: channel.provider,
          model: channel.model,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(`Template image written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
