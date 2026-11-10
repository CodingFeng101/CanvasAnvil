import { readFile, writeFile, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { build as bundle } from 'esbuild';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { gzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('../', import.meta.url));
const plugin = path.join(root, 'skill/canvas-skill');
const entry = path.join(root, 'client/workspaces/canvas/skill');
const output = path.join(plugin, 'assets/.native-build');
const excalidraw = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod');
process.chdir(root);
await build({
  configFile: false, root: entry, publicDir: false,
  plugins: [react(), {
    name: 'embed-excalidraw-fonts', enforce: 'pre',
    async transform(code, id) {
      if (!id.includes('@excalidraw/excalidraw') || !id.endsWith('.js')) return;
      const matches = [...code.matchAll(/"(\.\/fonts\/[^"\s]+\.woff2)"/g)];
      for (const match of matches) {
        const bytes = await readFile(path.join(excalidraw, match[1]));
        code = code.replaceAll(match[0], JSON.stringify(`data:font/woff2;base64,${bytes.toString('base64')}`));
      }
      return code;
    },
  }, viteSingleFile()],
  resolve: { alias: [
    { find: '@/workspaces/canvas/storage', replacement: path.join(entry, 'storage.ts') },
    { find: '@contracts', replacement: path.join(root, 'contracts') },
    { find: '@prompts', replacement: path.join(root, 'resources/prompts') },
    { find: '@', replacement: path.join(root, 'client') },
  ] },
  build: { outDir: output, emptyOutDir: true, assetsInlineLimit: 100000000 },
});
await writeFile(path.join(plugin, 'assets/canvas-widget.bin'), gzipSync(await readFile(path.join(output, 'index.html'))));
for (const editor of ['diagram', 'cad']) {
  await build({ configFile: false, root: path.join(root, 'client/workspaces/native'), publicDir: false,
    plugins: [react(), viteSingleFile()],
    resolve: { alias: { '@': path.join(root, 'client'), '@contracts': path.join(root, 'contracts'), '@prompts': path.join(root, 'resources/prompts') } },
    build: { outDir: output, emptyOutDir: true, assetsInlineLimit: 100000000,
      rollupOptions: { input: path.join(root, `client/workspaces/native/${editor}.html`) } },
  });
  await writeFile(path.join(plugin, `assets/${editor}-widget.bin`), gzipSync(await readFile(path.join(output, `${editor}.html`))));
}
const bootstrap = await bundle({ entryPoints: [path.join(entry, 'bootstrap.ts')], bundle: true, platform: 'browser',
  format: 'esm', target: 'es2022', minify: true, write: false });
await writeFile(path.join(plugin, 'assets/canvas-widget.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><p id="loading">正在连接 CanvasAnvil 画布…</p><script type="module">${bootstrap.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`);
if (!output.startsWith(path.resolve(plugin, 'assets') + path.sep)) throw new Error('Invalid build output path');
await rm(output, { recursive: true, force: true });
await bundle({ entryPoints: [path.join(plugin, 'mcp/server.mjs')], outfile: path.join(plugin, 'assets/canvas-mcp.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node20', minify: true, legalComments: 'eof',
  banner: { js: 'import {createRequire as __createRequire} from "node:module";const require=__createRequire(import.meta.url);' } });
// The standalone skill folders carry their own runtime (page server, CLI and their editor), so a copied
// skill opens its editor in a browser and syncs edits without the plugin.
for (const [name, editor] of [['diagram-skill', 'diagram'], ['cad-skill', 'cad']]) {
  const runtime = path.join(root, 'skill', name, 'runtime');
  await rm(runtime, { recursive: true, force: true });
  await mkdir(path.join(runtime, 'assets'), { recursive: true });
  await mkdir(path.join(runtime, 'scripts'), { recursive: true });
  await cp(path.join(plugin, 'scripts/canvas.mjs'), path.join(runtime, 'scripts/canvas.mjs'));
  for (const file of ['canvas-mcp.mjs', `${editor}-widget.bin`]) await cp(path.join(plugin, 'assets', file), path.join(runtime, 'assets', file));
  await cp(path.join(root, 'LICENSE'), path.join(runtime, 'assets/LICENSE'));
}
await cp(path.join(root, 'LICENSE'), path.join(plugin, 'assets/LICENSE'));
const skill = path.join(plugin, 'skills/canvas-skill');
await mkdir(skill, { recursive: true });
await cp(path.join(plugin, 'SKILL.md'), path.join(skill, 'SKILL.md'));
// The canvas skill folder runs on its own too: its runtime opens the canvas in a browser, and its config
// folder holds the image API for hosts without an image tool.
const canvasRuntime = path.join(skill, 'runtime');
await rm(canvasRuntime, { recursive: true, force: true });
await mkdir(path.join(canvasRuntime, 'assets'), { recursive: true });
await mkdir(path.join(canvasRuntime, 'scripts'), { recursive: true });
await cp(path.join(plugin, 'scripts/canvas.mjs'), path.join(canvasRuntime, 'scripts/canvas.mjs'));
for (const file of ['canvas-mcp.mjs', 'canvas-widget.bin', 'canvas-widget.html', 'LICENSE']) await cp(path.join(plugin, 'assets', file), path.join(canvasRuntime, 'assets', file));
await mkdir(path.join(skill, 'config'), { recursive: true });
await cp(path.join(plugin, 'config/image-provider.example.json'), path.join(skill, 'config/image-provider.example.json'));
for (const name of ['diagram-skill', 'cad-skill']) {
  const destination = path.join(plugin, 'skills', name);
  await mkdir(destination, { recursive: true });
  await cp(path.join(root, 'skill', name, 'SKILL.md'), path.join(destination, 'SKILL.md'));
  // Its npm scripts (cad: `npm run setup` for the designer's QA) work in the plugin's copy too.
  await cp(path.join(root, 'skill', name, 'package.json'), path.join(destination, 'package.json'));
  for (const folder of name === 'diagram-skill' ? ['references', 'prompts', 'scripts', 'vendor', 'agents', 'runtime'] : ['references', 'prompts', 'scripts', 'designer', 'agents', 'runtime']) {
    await cp(path.join(root, 'skill', name, folder), path.join(destination, folder), { recursive: true, filter: source => !source.split(path.sep).includes('node_modules') });
  }
}
console.log('Built native Excalidraw widget and self-contained MCP server');
