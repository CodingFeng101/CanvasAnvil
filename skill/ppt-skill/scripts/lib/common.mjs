import fs from "node:fs";
import path from "node:path";
import { getDefaultBaseUrl as getDefaultImageBaseUrl } from "./provider-registry.mjs";

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function resolveFromCwd(inputPath) {
  return path.resolve(process.cwd(), inputPath);
}

export function loadImageProviderConfig(configFile) {
  const target = configFile
    ? resolveFromCwd(configFile)
    : resolveFromCwd(path.join("config", "image-provider.json"));
  if (!fs.existsSync(target)) {
    fail(`Missing provider config file: ${target}`);
  }
  const raw = readJson(target);
  const provider = String(raw.provider || "").trim().toLowerCase();
  const apiKey = String(raw.apiKey || "").trim();
  const model = String(raw.model || "").trim();
  const baseUrl = String(raw.baseUrl || getDefaultImageBaseUrl(provider) || "").trim();
  if (!provider || !apiKey || !model) {
    fail("Missing image provider configuration. Required: provider, apiKey, model.");
  }
  if (provider === "custom") {
    fail("Custom image providers are not supported in ppt-skill.");
  }
  return {
    provider,
    apiKey,
    model,
    baseUrl,
    sourceFile: target,
  };
}

export function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.*)$/);
  if (!match) fail("Image generation did not return a base64 data URL.");
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

export function imageExtensionFromMime(mime, fallback = "png") {
  const normalized = String(mime || "").toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("png")) return "png";
  return fallback;
}

export function readPromptInput({ prompt, promptFile }) {
  if (promptFile) {
    const filePath = resolveFromCwd(promptFile);
    const text = fs.readFileSync(filePath, "utf8");
    return { text, filePath };
  }
  return { text: String(prompt || ""), filePath: "" };
}

export function safeSlug(value, fallback = "slide") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

export function loadManifest(filePath) {
  const target = resolveFromCwd(filePath);
  if (!fs.existsSync(target)) fail(`Missing manifest file: ${target}`);
  return { manifest: readJson(target), manifestPath: target };
}

export function fileToDataUrl(filePath) {
  const abs = resolveFromCwd(filePath);
  const ext = path.extname(abs).toLowerCase();
  const mime =
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".webp" ? "image/webp"
    : "image/png";
  const buffer = fs.readFileSync(abs);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export function parseSlideSize(value) {
  const raw = String(value || "16:9").trim();
  if (raw === "4:3") {
    return { layout: "LAYOUT_STANDARD", widthInches: 10, heightInches: 7.5, aspectRatio: raw };
  }
  return { layout: "LAYOUT_WIDE", widthInches: 13.333, heightInches: 7.5, aspectRatio: "16:9" };
}
