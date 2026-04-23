#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_EMBED_URL = "https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    format: "png",
    embedUrl: DEFAULT_EMBED_URL,
    timeout: 60000,
    transparent: true,
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
    } else if (token === "--embed-url") {
      args.embedUrl = argv[i + 1] || args.embedUrl;
      i += 1;
    } else if (token === "--timeout") {
      args.timeout = Number(argv[i + 1] || args.timeout);
      i += 1;
    } else if (token === "--opaque") {
      args.transparent = false;
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
  const dir = path.join(baseDir, `flow-skill-output-${timestamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultExtension(format) {
  if (format === "svg") return "svg";
  if (format === "xmlpng") return "png";
  return "png";
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    fail(
      "Missing dependency 'playwright'. Run 'npm install' inside skill/flow-skill, then 'npx playwright install chromium'.",
    );
  }
}

function decodeDataUri(uri) {
  const match = String(uri || "").match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    fail("Export did not return a base64 data URI.");
  }
  return {
    mediaType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function buildHarnessHtml({ xml, embedUrl, format, transparent }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>flow-skill-export</title>
  <style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:white}</style>
</head>
<body>
  <iframe id="editor" src="${embedUrl}"></iframe>
  <script>
    const xml = ${JSON.stringify(xml)};
    const format = ${JSON.stringify(format)};
    const transparent = ${transparent ? "true" : "false"};
    const iframe = document.getElementById("editor");

    function post(message) {
      iframe.contentWindow.postMessage(JSON.stringify(message), "*");
    }

    window.addEventListener("message", (event) => {
      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;

      if (payload.event === "init" || payload.event === "ready") {
        post({ action: "load", xml });
        return;
      }

      if (payload.event === "load") {
        post({
          action: "export",
          format,
          xml,
          transparent,
          scale: 1,
          keepTheme: true
        });
        return;
      }

      if (payload.event === "export") {
        window.__FLOW_EXPORT_RESULT__ = payload;
      }

      if (payload.error) {
        window.__FLOW_EXPORT_ERROR__ = payload;
      }
    });
  </script>
</body>
</html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) fail("Missing --input <path-to-drawio-or-xml>.");

  const inputPath = path.resolve(process.cwd(), args.input);
  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(resolveDefaultOutputDir(), `diagram.${defaultExtension(args.format)}`);
  const xml = fs.readFileSync(inputPath, "utf8");

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const html = buildHarnessHtml({
      xml,
      embedUrl: args.embedUrl,
      format: args.format,
      transparent: args.transparent,
    });

    await page.setContent(html, { waitUntil: "load", timeout: args.timeout });

    const result = await page.waitForFunction(
      () => window.__FLOW_EXPORT_RESULT__ || window.__FLOW_EXPORT_ERROR__,
      { timeout: args.timeout },
    );

    const payload = await result.jsonValue();
    if (payload?.error) {
      fail(`Remote export failed: ${payload.error}`);
    }

    if (!payload?.data) {
      fail("Remote export did not return export data.");
    }

    const { buffer } = decodeDataUri(payload.data);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    console.log(`Exported ${args.format} to ${outputPath}`);
  } finally {
    await page.close();
    await browser.close();
  }
}

main();
