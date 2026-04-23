#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { generateImageThroughGateway } from "./lib/gateway.mjs";
import { getDefaultBaseUrl } from "./lib/provider-registry.mjs";

function parseArgs(argv) {
  const args = {
    prompt: "",
    promptFile: "",
    output: "",
    format: "png",
    configFile: "",
    referenceImageUrl: "",
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
    } else if (token === "--format" || token === "-f") {
      args.format = argv[i + 1] || args.format;
      i += 1;
    } else if (token === "--config-file") {
      args.configFile = argv[i + 1] || "";
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

function loadConfig(configFile) {
  const target = configFile
    ? path.resolve(process.cwd(), configFile)
    : path.resolve(process.cwd(), "config", "image-provider.json");
  if (!fs.existsSync(target)) {
    fail(`Missing provider config file: ${target}`);
  }
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.*)$/);
  if (!match) fail("Image generation did not return a base64 data URL.");
  return {
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.output) fail("Missing --output <path-to-image>.");

  const prompt = args.promptFile
    ? fs.readFileSync(path.resolve(process.cwd(), args.promptFile), "utf8")
    : args.prompt;

  if (!String(prompt || "").trim()) fail("Missing prompt. Use --prompt or --prompt-file.");

  const rawConfig = loadConfig(args.configFile);
  const provider = String(rawConfig.provider || "").trim().toLowerCase();
  const apiKey = String(rawConfig.apiKey || "").trim();
  const model = String(rawConfig.model || "").trim();
  const baseUrl = String(rawConfig.baseUrl || getDefaultBaseUrl(provider) || "").trim();

  if (!provider || !apiKey || !model) {
    fail("Missing image provider configuration. Required: provider, apiKey, model.");
  }

  const dataUrl = await generateImageThroughGateway({
    channel: {
      provider,
      apiKey,
      baseUrl,
      model,
    },
    prompt,
    referenceImageUrl: args.referenceImageUrl || undefined,
  });

  const { buffer } = decodeDataUrl(dataUrl);
  const outputPath = path.resolve(process.cwd(), args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  console.log(`Infographic image written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
