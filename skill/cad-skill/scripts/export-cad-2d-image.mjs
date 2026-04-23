#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    format: "png",
    width: 1600,
    height: 1000,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output" || token === "-o") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--format" || token === "-f") {
      args.format = argv[i + 1] || args.format;
      i += 1;
    } else if (token === "--width") {
      args.width = Number(argv[i + 1] || args.width);
      i += 1;
    } else if (token === "--height") {
      args.height = Number(argv[i + 1] || args.height);
      i += 1;
    }
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function getSvgContent(inputPath) {
  const text = fs.readFileSync(inputPath, "utf8");
  const match = text.match(/<svg[\s\S]*<\/svg>/i);
  return match ? match[0] : text.trim();
}

function buildPreviewHtml(svg) {
  const encoded = JSON.stringify(svg);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
        height: 100%;
      }
      .stage {
        width: 100vw;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #ffffff;
      }
      .stage svg {
        max-width: 100%;
        max-height: 100%;
      }
    </style>
  </head>
  <body>
    <div class="stage" id="stage"></div>
    <script>
      const svg = ${encoded};
      document.getElementById("stage").innerHTML = svg;
    </script>
  </body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) fail("Missing --input <path-to-svg>.");
  if (!args.output) fail("Missing --output <path-to-image>.");

  const inputPath = path.resolve(process.cwd(), args.input);
  if (!fs.existsSync(inputPath)) fail(`Input file not found: ${inputPath}`);

  const svg = getSvgContent(inputPath);
  if (!/^<svg[\s\S]*<\/svg>$/i.test(svg)) fail("Input does not contain a valid SVG block.");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cad-svg-export-"));
  const htmlPath = path.join(tempDir, "preview.html");
  fs.writeFileSync(htmlPath, buildPreviewHtml(svg), "utf8");

  const outputPath = path.resolve(process.cwd(), args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: {
        width: Number.isFinite(args.width) ? args.width : 1600,
        height: Number.isFinite(args.height) ? args.height : 1000,
      },
      deviceScaleFactor: 1,
    });
    await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`);
    await page.locator("#stage").waitFor();

    if (String(args.format).toLowerCase() === "jpg" || String(args.format).toLowerCase() === "jpeg") {
      await page.screenshot({ path: outputPath, type: "jpeg", quality: 92 });
    } else {
      await page.screenshot({ path: outputPath, type: "png" });
    }
    console.log(`CAD 2D preview written to ${outputPath}`);
  } finally {
    await browser.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
