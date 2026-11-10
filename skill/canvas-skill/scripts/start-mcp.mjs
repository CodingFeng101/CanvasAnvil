import { fileURLToPath } from 'node:url';
process.env.CANVAS_PLUGIN_ROOT = fileURLToPath(new URL('../', import.meta.url));
const { start } = await import('../assets/canvas-mcp.mjs');
await start();
