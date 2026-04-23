#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

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

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    title: "Draw.io Preview",
    embedUrl: "https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=min",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input" || token === "-i") {
      args.input = argv[i + 1] || "";
      i += 1;
    } else if (token === "--output" || token === "-o") {
      args.output = argv[i + 1] || "";
      i += 1;
    } else if (token === "--title") {
      args.title = argv[i + 1] || args.title;
      i += 1;
    } else if (token === "--embed-url") {
      args.embedUrl = argv[i + 1] || args.embedUrl;
      i += 1;
    }
  }
  return args;
}

function ensureArg(value, message) {
  if (!value) {
    console.error(message);
    process.exit(1);
  }
}

function toEscapedJsonString(value) {
  return JSON.stringify(String(value));
}

function buildHtml({ xml, title, embedUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: system-ui, sans-serif; background: #0b1020; color: #e5e7eb; }
    .shell { display: grid; grid-template-rows: 56px 1fr; height: 100%; }
    .toolbar { display: flex; gap: 8px; align-items: center; padding: 0 16px; border-bottom: 1px solid #1f2937; background: #111827; }
    .toolbar button { border: 0; border-radius: 8px; padding: 8px 12px; background: #2563eb; color: white; cursor: pointer; }
    .toolbar button.secondary { background: #374151; }
    iframe { width: 100%; height: 100%; border: 0; background: white; }
    .status { margin-left: auto; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <button id="exportSvg">Export SVG</button>
      <button id="exportPng">Export PNG</button>
      <button id="exportXmlPng" class="secondary">Export Editable PNG</button>
      <span class="status" id="status">Loading embed editor...</span>
    </div>
    <iframe id="editor" title="drawio-preview" src="${embedUrl}"></iframe>
  </div>
  <script>
    const xml = ${toEscapedJsonString(xml)};
    const editor = document.getElementById("editor");
    const status = document.getElementById("status");
    let ready = false;

    function saveDataUrl(filename, dataUrl) {
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function post(action) {
      if (!ready) return;
      editor.contentWindow.postMessage(JSON.stringify(action), "*");
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

      if (payload.event === "ready") {
        ready = true;
        status.textContent = "Loading diagram...";
        post({ action: "load", xml });
        return;
      }

      if (payload.event === "load") {
        status.textContent = "Diagram loaded";
        return;
      }

      if (payload.event === "export" && payload.data) {
        const format = payload.format || "svg";
        const ext = format === "png" || format === "xmlpng" ? "png" : format === "html" || format === "html2" ? "html" : "svg";
        saveDataUrl(\`diagram-preview.\${ext}\`, payload.data);
        status.textContent = \`Exported \${format}\`;
      }
    });

    document.getElementById("exportSvg").addEventListener("click", () => {
      status.textContent = "Exporting SVG...";
      post({ action: "export", format: "svg", xml });
    });

    document.getElementById("exportPng").addEventListener("click", () => {
      status.textContent = "Exporting PNG...";
      post({ action: "export", format: "png", xml, transparent: true, scale: 1 });
    });

    document.getElementById("exportXmlPng").addEventListener("click", () => {
      status.textContent = "Exporting editable PNG...";
      post({ action: "export", format: "xmlpng", xml, transparent: true, scale: 1 });
    });
  </script>
</body>
</html>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureArg(args.input, "Missing --input <path-to-drawio-or-xml>.");

  const inputPath = path.resolve(process.cwd(), args.input);
  const outputPath = args.output
    ? path.resolve(process.cwd(), args.output)
    : path.join(resolveDefaultOutputDir(), "diagram.preview.html");
  const xml = fs.readFileSync(inputPath, "utf8");
  const html = buildHtml({ xml, title: args.title, embedUrl: args.embedUrl });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  console.log(`Preview HTML written to ${outputPath}`);
}

main();
