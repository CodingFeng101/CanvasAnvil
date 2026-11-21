#!/usr/bin/env node
/**
 * Puts a local copy of the draw.io editor in public/drawio/, so the diagram canvas opens without
 * reaching embed.diagrams.net. Runs after `npm install` (postinstall) and by hand with `npm run drawio`.
 *
 * The copy comes from draw.io's own release (draw.war, a zip of its web app, ~50 MB), pinned to one
 * version so the editor's message protocol stays the one the canvas was tested with. It is not in git:
 * public/drawio/ is ignored, and the build copies it into dist/ like the rest of public/.
 *
 * Never fails the install: without network (or with CANVASANVIL_SKIP_DRAWIO=1) it prints a note and
 * the canvas keeps loading draw.io online. DRAWIO_WAR_URL points at another copy of draw.war (a
 * mirror closer to you, or a file:// path).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DRAWIO_VERSION = '32.6.9';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'public/drawio');
const marker = path.join(target, 'canvasanvil-drawio.json');
const source = process.env.DRAWIO_WAR_URL || `https://github.com/jgraph/drawio/releases/download/v${DRAWIO_VERSION}/draw.war`;
const force = process.argv.includes('--force');

const note = (message) => console.log(`[drawio] ${message}`);

function installed() {
  try {
    return JSON.parse(fs.readFileSync(marker, 'utf8')).version;
  } catch {
    return null;
  }
}

async function download(url) {
  if (url.startsWith('file://')) return fs.readFileSync(fileURLToPath(url));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      note(`download attempt ${attempt} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function main() {
  if (process.env.CANVASANVIL_SKIP_DRAWIO) return note('skipped (CANVASANVIL_SKIP_DRAWIO is set); the canvas loads draw.io online.');
  if (!force && installed() === DRAWIO_VERSION) return note(`draw.io ${DRAWIO_VERSION} is already in public/drawio.`);
  const { default: JSZip } = await import('jszip');
  note(`downloading draw.io ${DRAWIO_VERSION} (~50 MB) from ${source} …`);
  const zip = await JSZip.loadAsync(await download(source));
  // Unpack next to the target and swap at the end, so a half-written copy is never served.
  const staging = `${target}.partial`;
  fs.rmSync(staging, { recursive: true, force: true });
  let files = 0;
  for (const entry of Object.values(zip.files)) {
    // WEB-INF and META-INF are the Java servlet side; the editor is static files.
    if (entry.dir || /^(WEB-INF|META-INF)\//.test(entry.name)) continue;
    const out = path.join(staging, entry.name);
    if (!out.startsWith(staging + path.sep)) continue; // no paths outside the folder
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, await entry.async('nodebuffer'));
    files += 1;
  }
  if (!fs.existsSync(path.join(staging, 'index.html'))) throw new Error('draw.war has no index.html');
  fs.writeFileSync(path.join(staging, 'canvasanvil-drawio.json'), JSON.stringify({ version: DRAWIO_VERSION, source }, null, 2));
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  note(`draw.io ${DRAWIO_VERSION} unpacked to public/drawio (${files} files).`);
}

main().catch((error) => {
  note(`could not set up the local copy (${error.message}). The diagram canvas will load draw.io online; run "npm run drawio" to try again.`);
});
