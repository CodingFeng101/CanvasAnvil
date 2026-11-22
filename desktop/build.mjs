// Builds the Windows desktop installer: `npm run desktop:build` (web build first, then this script).
//
// It stages a self-contained app folder in build/desktop/app — the Electron entry, the API server bundled
// into one file, the built client (dist/), resources/ and skill/ — and has electron-builder package that
// folder. The staged package.json has no dependencies, so none of the repo's node_modules are shipped.
// Output: build/desktop/out/CanvasAnvil-Setup-<version>.exe

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import builder from "electron-builder";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "build", "desktop");
const stage = path.join(out, "app");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const electronVersion = JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version;

if (!existsSync(path.join(root, "dist", "index.html"))) {
  console.error('dist/ is missing: run "npm run build" first (npm run desktop:build does both).');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// The API server as one ES module. Bundled CommonJS dependencies still call require() for Node built-ins,
// which an ES module lacks, hence the banner.
await esbuild({
  entryPoints: [path.join(root, "server", "index.ts")],
  outfile: path.join(stage, "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  logLevel: "warning",
  banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' },
});

cpSync(path.join(root, "desktop", "main.cjs"), path.join(stage, "main.cjs"));
cpSync(path.join(root, "dist"), path.join(stage, "dist"), { recursive: true });
cpSync(path.join(root, "resources"), path.join(stage, "resources"), { recursive: true });
// Floorplan recognition runs this script when the computer has Python with its requirements.
cpSync(path.join(root, "server", "recognizer"), path.join(stage, "server", "recognizer"), {
  recursive: true,
  filter: (src) => !src.includes("__pycache__"),
});
// The skills as Settings → Skills offers them: no dependencies, caches or the user's own provider keys.
const skipDirs = new Set(["node_modules", ".git", "__pycache__"]);
cpSync(path.join(root, "skill"), path.join(stage, "skill"), {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(path.join(root, "skill"), src);
    const parts = rel.split(path.sep);
    if (parts.some((part) => skipDirs.has(part))) return false;
    if (rel.endsWith(".pyc")) return false;
    return !/[\\/]config[\\/](image-provider|file-parser)\.json$/.test(rel);
  },
});

writeFileSync(
  path.join(stage, "package.json"),
  JSON.stringify({ name: "canvasanvil", productName: "CanvasAnvil", version: pkg.version, description: "CanvasAnvil", author: "CanvasAnvil", license: pkg.license, main: "main.cjs" }, null, 2),
);

await builder.build({
  projectDir: stage,
  win: ["nsis"],
  config: {
    appId: "com.canvasanvil.desktop",
    productName: "CanvasAnvil",
    electronVersion,
    electronDist: path.join(root, "node_modules", "electron", "dist"),
    directories: { output: path.join(out, "out") },
    // The server reads resources/ and skill/ from its working directory, which cannot be inside an asar.
    asar: false,
    files: ["**/*"],
    npmRebuild: false,
    win: { target: "nsis", signAndEditExecutable: false },
    // Per-user install (no admin prompt) into a folder the app can write its runs/ into.
    nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, artifactName: "CanvasAnvil-Setup-${version}.${ext}" },
  },
});

console.log(`\nInstaller: ${path.join(out, "out", `CanvasAnvil-Setup-${pkg.version}.exe`)}`);
