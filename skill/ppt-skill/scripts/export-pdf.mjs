#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { loadManifest, parseSlideSize, resolveFromCwd, fail } from "./lib/common.mjs";

function parseArgs(argv) {
  const args = {
    manifestFile: "",
    output: "",
    slideSize: "16:9",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--manifest-file") {
      args.manifestFile = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output" || token === "-o") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--slide-size") {
      args.slideSize = argv[i + 1] || args.slideSize;
      i += 1;
    }
  }
  return args;
}

async function embedImage(pdfDoc, bytes, imagePath) {
  const lower = imagePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return await pdfDoc.embedJpg(bytes);
  if (lower.endsWith(".png")) return await pdfDoc.embedPng(bytes);
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return await pdfDoc.embedJpg(bytes);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestFile) fail("Missing --manifest-file <slides.manifest.json>.");
  if (!args.output) fail("Missing --output <file.pdf>.");

  const { manifest, manifestPath } = loadManifest(args.manifestFile);
  const slides = Array.isArray(manifest?.slides) ? manifest.slides : [];
  if (slides.length === 0) fail("Manifest contains no slides.");

  const pdfDoc = await PDFDocument.create();
  const size = parseSlideSize(args.slideSize);
  const pageWidth = size.widthInches * 72;
  const pageHeight = size.heightInches * 72;
  const baseDir = path.dirname(manifestPath);

  for (const slide of slides) {
    const imagePath = path.resolve(baseDir, slide.imageFile);
    if (!fs.existsSync(imagePath)) fail(`Missing slide image: ${imagePath}`);
    const bytes = fs.readFileSync(imagePath);
    const image = await embedImage(pdfDoc, bytes, imagePath);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  }

  const outputPath = resolveFromCwd(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, await pdfDoc.save());
  console.log(`PDF written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
