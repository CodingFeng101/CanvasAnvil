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
    promptsFile: "",
    outDir: "",
    configFile: "",
    name: "deck",
    defaultReferenceImageUrl: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--prompts-file") {
      args.promptsFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--out-dir" || token === "-o") {
      args.outDir = argv[i + 1] || "";
      i += 1;
    } else if (token === "--config-file") {
      args.configFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--name") {
      args.name = argv[i + 1] || args.name;
      i += 1;
    } else if (token === "--default-reference-image-url") {
      args.defaultReferenceImageUrl = argv[i + 1] || "";
      i += 1;
    }
  }
  return args;
}

function normalizePromptPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.slides)) return payload.slides;
  if (Array.isArray(payload?.prompts)) return payload.prompts;
  return [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.promptsFile) fail("Missing --prompts-file <json-file>.");
  if (!args.outDir) fail("Missing --out-dir <directory>.");

  const promptsPath = resolveFromCwd(args.promptsFile);
  const payload = readJson(promptsPath);
  const prompts = normalizePromptPayload(payload).filter((item) => item && typeof item === "object");
  if (prompts.length === 0) fail("No slide prompts found in prompts file.");

  const channel = loadImageProviderConfig(args.configFile);
  const outDir = resolveFromCwd(args.outDir);
  ensureDir(outDir);
  const slidesDir = path.join(outDir, "slides");
  ensureDir(slidesDir);

  const slides = [];

  for (let index = 0; index < prompts.length; index += 1) {
    const item = prompts[index];
    const slideId = String(item.slideId || item.id || `slide-${index + 1}`);
    const prompt = String(item.prompt || "").trim();
    if (!prompt) fail(`Slide prompt is empty for ${slideId}.`);
    const dataUrl = await generateImageThroughGateway({
      channel,
      prompt,
      referenceImageUrl: item.referenceImageUrl || args.defaultReferenceImageUrl || undefined,
    });
    const { mime, buffer } = decodeDataUrl(dataUrl);
    const ext = imageExtensionFromMime(mime, "png");
    const fileName = `${String(index + 1).padStart(2, "0")}-${safeSlug(slideId, `slide-${index + 1}`)}.${ext}`;
    const outputPath = path.join(slidesDir, fileName);
    fs.writeFileSync(outputPath, buffer);
    slides.push({
      slideId,
      order: index + 1,
      title: item.title || null,
      prompt,
      negativePrompt: item.negativePrompt || null,
      imageFile: path.relative(outDir, outputPath).replace(/\\/g, "/"),
      aspectRatio: item.aspectRatio || "16:9",
      usesTemplateStyle: Boolean(item.usesTemplateStyle),
      usesMaterialImages: Boolean(item.usesMaterialImages),
    });
    console.log(`Generated slide ${index + 1}/${prompts.length}: ${outputPath}`);
  }

  const manifest = {
    type: "ppt_slide_manifest",
    name: args.name,
    generatedAt: new Date().toISOString(),
    provider: channel.provider,
    model: channel.model,
    promptsFile: path.relative(outDir, promptsPath).replace(/\\/g, "/"),
    slides,
  };
  const manifestPath = path.join(outDir, "slides.manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Deck image manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
