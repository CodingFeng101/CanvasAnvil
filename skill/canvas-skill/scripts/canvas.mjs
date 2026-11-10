#!/usr/bin/env node
// CanvasAnvil editors from any agent that can run commands: `node canvas.mjs` prints the usage.
import { fileURLToPath } from 'node:url';
process.env.CANVAS_PLUGIN_ROOT ||= fileURLToPath(new URL('../', import.meta.url));
const { runCli } = await import('../assets/canvas-mcp.mjs');
try { await runCli(process.argv.slice(2)); }
catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
