#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifestFile) fail("Missing --manifest-file <slides.manifest.json>.");
  if (!args.output) fail("Missing --output <file.pptx>.");

  const { manifest, manifestPath } = loadManifest(args.manifestFile);
  const slides = Array.isArray(manifest?.slides) ? manifest.slides : [];
  if (slides.length === 0) fail("Manifest contains no slides.");

  const size = parseSlideSize(args.slideSize);
  const pptx = new PptxGenJS();
  pptx.layout = size.layout;
  pptx.author = "CanvasAnvil";
  pptx.subject = manifest?.name || "Presentation";
  pptx.title = manifest?.name || "Presentation";
  pptx.company = "CanvasAnvil";
  pptx.lang = "zh-CN";

  const baseDir = path.dirname(manifestPath);

  for (const item of slides) {
    const imagePath = path.resolve(baseDir, item.imageFile);
    if (!fs.existsSync(imagePath)) fail(`Missing slide image: ${imagePath}`);
    const slide = pptx.addSlide();
    slide.addImage({ path: imagePath, x: 0, y: 0, w: size.widthInches, h: size.heightInches });
  }

  const outputPath = resolveFromCwd(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await pptx.writeFile({ fileName: outputPath });
  console.log(`Image PPT written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
