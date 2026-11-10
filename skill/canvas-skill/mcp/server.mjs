import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile, writeFile, mkdir, rename, open, unlink, rmdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { registerNativeEditors } from './native-editors.mjs';
import { registerImageFallback } from './image-fallback.mjs';

const ROOT = process.env.CANVAS_PLUGIN_ROOT || fileURLToPath(new URL('../', import.meta.url));
const URI = 'ui://canvasanvil/canvas.html';
const targetSchema = { projectDir: z.string().min(1) };
const terminal = ['done', 'failed'];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function target(projectDir, editor = 'canvas') {
  if (!path.isAbsolute(projectDir)) throw new Error('projectDir must be absolute');
  return path.join(path.resolve(projectDir), editor);
}
async function readState(projectDir, editor = 'canvas') {
  try { return JSON.parse(await readFile(path.join(target(projectDir, editor), `${editor}.json`), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { version: 1, revision: 0, scene: null, selection: null, requests: [], operations: [] };
  }
}
async function change(projectDir, mutate, editor = 'canvas') {
  const folder = target(projectDir, editor);
  await mkdir(folder, { recursive: true });
  const lockPath = path.join(folder, '.write.lock');
  let lock;
  for (let attempt = 0; attempt < 200 && !lock; attempt++) {
    try { lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(await readFile(lockPath, 'utf8').catch(() => ''));
      if (owner > 0) {
        try { process.kill(owner, 0); }
        catch (reason) { if (reason.code === 'ESRCH') await unlink(lockPath).catch(() => {}); }
      }
      await wait(25);
    }
  }
  if (!lock) throw new Error('Canvas is busy, retry the operation');
  try {
    const state = await readState(projectDir, editor);
    const result = await mutate(state);
    const temp = path.join(folder, `.canvas-${randomUUID()}.tmp`);
    await writeFile(temp, JSON.stringify(state));
    await rename(temp, path.join(folder, `${editor}.json`));
    return result;
  } finally { await lock.close(); await unlink(lockPath); }
}
async function saveDataUrl(projectDir, value) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value ?? '');
  if (!match) throw new Error('Expected a base64 PNG, JPEG, WebP or GIF');
  const extension = match[1].split('/')[1].replace('jpeg', 'jpg');
  const relative = `assets/${randomUUID()}.${extension}`;
  await mkdir(path.join(target(projectDir), 'assets'), { recursive: true });
  await writeFile(path.join(target(projectDir), relative), Buffer.from(match[2], 'base64'));
  return relative;
}
function blobPath(projectDir, id, editor = 'canvas') {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error('Invalid blob id');
  return path.join(target(projectDir, editor), 'blobs', `${id}.txt`);
}
async function saveBlob(projectDir, id, text, editor = 'canvas') {
  const file = blobPath(projectDir, id, editor);
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, text);
  await rename(temp, file);
  return id;
}
function result(value) {
  const text = JSON.stringify(value);
  return { content: [{ type: 'text', text: text.length < 8192 ? text : 'Canvas operation completed' }], structuredContent: value };
}
const safely = handler => async args => {
  try { return result(await handler(args)); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
};

export function createCanvasServer() {
  const server = new McpServer({ name: 'canvasanvil-canvas', version: '1.0.0' });
  // Every tool is also kept here, so the local browser page and the command line run the same handlers.
  const handlers = new Map();
  const registerTool = server.registerTool.bind(server);
  server.registerTool = (name, config, callback) => { handlers.set(name, { config, callback }); return registerTool(name, config, callback); };
  server.canvasHandlers = handlers;
  registerNativeEditors(server, { root: ROOT, readState, change, target, result, safely, saveBlob, blobPath, browserUrl });
  const widgetData = new Map();
  registerAppTool(server, 'get_canvas_widget_chunk', { description: 'Load a bounded native widget resource chunk.',
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: { ...targetSchema, chunk: z.number().int().nonnegative(), editor: z.enum(['canvas', 'diagram', 'cad']).default('canvas') }, _meta: { ui: { visibility: ['app'] } } },
  async ({ chunk, editor }) => {
    if (!widgetData.has(editor)) widgetData.set(editor, readFile(path.join(ROOT, `assets/${editor}-widget.bin`)));
    const bytes = await widgetData.get(editor);
    const chunkSize = 1024 * 1024;
    const total = Math.ceil(bytes.length / chunkSize);
    if (chunk >= total) return { isError: true, content: [{ type: 'text', text: 'Invalid resource chunk' }] };
    return { content: [{ type: 'text', text: 'Widget resource chunk' }],
      structuredContent: { total, data: bytes.subarray(chunk * chunkSize, (chunk + 1) * chunkSize).toString('base64') } };
  });
  const tool = (name, description, schema, handler, appOnly = false) => registerAppTool(server, name, {
    description, inputSchema: { ...targetSchema, ...schema },
    annotations: { readOnlyHint: /^(get|read)_/.test(name) && name !== 'get_canvas_request', destructiveHint: false, openWorldHint: false, idempotentHint: name !== 'submit_canvas_request' },
    _meta: { ui: { visibility: appOnly ? ['app'] : ['model', 'app'] } },
  }, safely(handler));
  registerImageFallback(tool, { root: ROOT, readState, target });
  tool('store_canvas_blob', 'Upload a bounded scene or image chunk.', { id: z.string(), chunk: z.number().int().nonnegative(), total: z.number().int().min(1).max(1024), data: z.string().max(512 * 1024), editor: z.enum(['canvas', 'diagram', 'cad']).default('canvas') }, async ({ projectDir, id, chunk, total, data, editor }) => {
    const file = blobPath(projectDir, id, editor);
    if (chunk >= total) throw new Error('Invalid chunk');
    const folder = `${file}.parts`;
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, String(chunk)), data);
    if (chunk === total - 1) {
      const parts = [];
      for (let index = 0; index < total; index++) parts.push(await readFile(path.join(folder, String(index)), 'utf8'));
      await saveBlob(projectDir, id, parts.join(''), editor);
      for (let index = 0; index < total; index++) await unlink(path.join(folder, String(index)));
      await rmdir(folder);
    }
    return { id, chunk };
  }, true);
  tool('read_canvas_blob', 'Read a bounded scene or image chunk.', { id: z.string(), chunk: z.number().int().nonnegative(), editor: z.enum(['canvas', 'diagram', 'cad']).default('canvas') }, async ({ projectDir, id, chunk, editor }) => {
    const text = await readFile(blobPath(projectDir, id, editor), 'utf8');
    const size = 512 * 1024;
    return { total: Math.max(1, Math.ceil(text.length / size)), data: text.slice(chunk * size, (chunk + 1) * size) };
  }, true);
  const metadata = { ui: { csp: { resourceDomains: ['data:', 'blob:'], connectDomains: ['data:'] } },
    'openai/ui': { availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen' } };
  registerAppResource(server, 'CanvasAnvil', URI, { _meta: metadata }, async () => ({ contents: [{ uri: URI,
    mimeType: RESOURCE_MIME_TYPE, text: await readFile(path.join(ROOT, 'assets/canvas-widget.html'), 'utf8'), _meta: metadata }] }));
  registerAppTool(server, 'render_canvas_widget', { title: 'CanvasAnvil 自由画布', description: 'Open the native Excalidraw canvas for the active user project. Reuse the open widget for subsequent image edits.',
    inputSchema: targetSchema, _meta: { ui: { resourceUri: URI }, 'openai/outputTemplate': URI } }, async ({ projectDir }) => {
    await change(projectDir, () => ({}));
    const data = { projectDir: path.resolve(projectDir), browserUrl: await browserUrl(projectDir, 'canvas') };
    return { ...result(data), _meta: { 'openai/outputTemplate': URI, widgetData: data } };
  });
  tool('get_canvas_state', 'Read the persisted Excalidraw scene for the widget.', {}, async ({ projectDir }) => {
    const state = await readState(projectDir);
    const json = JSON.stringify(state.scene);
    if (json.length > 512 * 1024) return { revision: state.revision, scene: null, sceneBlobId: await saveBlob(projectDir, `scene-${state.revision}`, json) };
    return { revision: state.revision, scene: state.scene };
  }, true);
  tool('save_canvas_state', 'Save an Excalidraw snapshot with optimistic concurrency control.', {
    scene: z.unknown().optional(), sceneBlobId: z.string().optional(), baseRevision: z.number().int().nonnegative(),
  }, async ({ projectDir, scene, sceneBlobId, baseRevision }) => {
    const saved = await change(projectDir, async state => {
    if (baseRevision !== state.revision) throw new Error('Scene changed in another widget. Reopen to load the saved version.');
    if (scene === undefined && !sceneBlobId) throw new Error('Missing scene');
    state.scene = sceneBlobId ? JSON.parse(await readFile(blobPath(projectDir, sceneBlobId), 'utf8')) : scene;
    state.revision++;
      return { revision: state.revision };
    });
    if (sceneBlobId) await unlink(blobPath(projectDir, sceneBlobId)).catch(() => {});
    return saved;
  }, true);
  tool('save_canvas_selection', 'Persist the widget selection.', { selection: z.unknown() }, ({ projectDir, selection }) => change(projectDir, state => {
    state.selection = selection;
    return { saved: true };
  }), true);
  tool('get_canvas_selection', 'Read selected image IDs, image bounds and insertion status without transferring image bytes.', {}, async ({ projectDir }) => {
    const state = await readState(projectDir);
    return { selection: state.selection, images: (state.scene?.elements ?? []).filter(item => item.type === 'image' && !item.isDeleted)
      .map(({ id, x, y, width, height, customData }) => ({ id, x, y, width, height, customData })),
    operations: state.operations.map(({ id, status }) => ({ id, status })) };
  });
  tool('submit_canvas_request', 'Save the selected image and annotation snapshot for a chat request.', {
    kind: z.enum(['generate', 'edit']), prompt: z.string(), sourceId: z.string().optional(), originalDataUrl: z.string().optional(),
    annotatedDataUrl: z.string().optional(), annotationIds: z.array(z.string()).default([]), annotationTexts: z.array(z.string()).default([]),
    originalBlobId: z.string().optional(), annotatedBlobId: z.string().optional(),
    requestId: z.string().optional(),
  }, args => change(args.projectDir, async state => {
    const capturing = args.requestId ? state.requests.find(item => item.id === args.requestId) : null;
    if (args.requestId && !capturing) throw new Error('Request not found');
    if (capturing && capturing.status !== 'capturing') return capturing;
    if (!args.prompt.trim() && !args.annotationIds.length) throw new Error('Provide a prompt or annotation');
    const references = [];
    if (args.kind === 'edit') {
      if (!state.scene?.elements.some(element => element.id === args.sourceId && element.type === 'image' && !element.isDeleted)) throw new Error('Selected image no longer exists');
      const original = args.originalBlobId ? await readFile(blobPath(args.projectDir, args.originalBlobId), 'utf8') : args.originalDataUrl;
      const annotated = args.annotatedBlobId ? await readFile(blobPath(args.projectDir, args.annotatedBlobId), 'utf8') : args.annotatedDataUrl;
      for (const image of [original, annotated]) references.push(await saveDataUrl(args.projectDir, image));
    }
    const request = { id: capturing?.id ?? randomUUID(), kind: args.kind, prompt: capturing?.prompt ?? args.prompt, sourceId: args.sourceId,
      annotationIds: args.annotationIds, annotationTexts: args.annotationTexts, references, createdAt: Date.now(), status: 'pending' };
    if (capturing) Object.assign(capturing, request);
    else state.requests.push(request);
    return request;
  }), true);
  tool('get_canvas_request', 'Read an edit snapshot with exact annotation text and absolute image paths. To capture the current widget selection for a chat instruction, supply a new stable requestId and prompt. Poll the same ID until status is pending or failed. Keep the widget open while capturing.', { requestId: z.string().min(1), prompt: z.string().optional() }, async ({ projectDir, requestId, prompt }) => {
    const request = await change(projectDir, state => {
      const existing = state.requests.find(item => item.id === requestId);
      if (existing) return existing;
      if (prompt === undefined) return null;
      if (!prompt.trim()) throw new Error('Provide the edit instruction from the chat');
      const capturing = { id: requestId, kind: 'edit', prompt, references: [], status: 'capturing', createdAt: Date.now() };
      state.requests.push(capturing);
      return capturing;
    });
    if (!request) throw new Error('Request not found');
    return { ...request, references: request.references.map(file => path.join(target(projectDir), file)) };
  });
  tool('fail_canvas_request', 'Record an image-generation failure so the request is closed without changing the scene.', { requestId: z.string(), error: z.string().max(4000) }, ({ projectDir, requestId, error }) => change(projectDir, state => {
    const request = state.requests.find(item => item.id === requestId);
    if (!request) throw new Error('Request not found');
    if (!['capturing', 'pending'].includes(request.status)) throw new Error('Request is already queued or closed');
    Object.assign(request, { status: 'failed', error });
    return { status: 'failed' };
  }));
  tool('insert_canvas_image', 'Copy a generated local image into the project and enqueue placement using the website image-placement and version logic. Reuse operationId when retrying.', {
    imagePath: z.string(), operationId: z.string().min(1), requestId: z.string().optional(), sourceElementId: z.string().optional(), note: z.string().default(''),
  }, args => change(args.projectDir, async state => {
    const previous = state.operations.find(item => item.id === args.operationId);
    if (previous) return { operationId: previous.id, status: previous.status };
    const request = args.requestId ? state.requests.find(item => item.id === args.requestId) : null;
    if (args.requestId && !request) throw new Error('Request not found');
    const queued = request && state.operations.find(item => item.requestId === request.id);
    if (queued) return { operationId: queued.id, status: queued.status };
    if (request?.status === 'capturing') throw new Error('Wait for the widget to finish capturing the selected image');
    if (request && terminal.includes(request.status)) throw new Error('Request is already closed');
    const sourceId = request?.sourceId ?? args.sourceElementId;
    const source = sourceId ? state.scene?.elements.find(item => item.id === sourceId && item.type === 'image' && !item.isDeleted) : null;
    if (sourceId && !source) throw new Error('Source image no longer exists');
    if (!path.isAbsolute(args.imagePath)) throw new Error('imagePath must be absolute');
    const bytes = await readFile(args.imagePath);
    const extension = path.extname(args.imagePath).slice(1).toLowerCase().replace('jpeg', 'jpg');
    const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[extension];
    if (!mime) throw new Error('Unsupported image format');
    const file = await saveDataUrl(args.projectDir, `data:${mime};base64,${bytes.toString('base64')}`);
    state.operations.push({ id: args.operationId, file, status: 'pending', sourceId,
      lineageId: source ? (source.customData?.canvasAnvil?.lineageId ?? source.id) : undefined,
      note: args.note || request?.prompt || '', annotationIds: request?.annotationIds ?? [], requestId: request?.id });
    if (request) request.status = 'queued';
    return { operationId: args.operationId, status: 'pending' };
  }));
  tool('get_canvas_operations', 'Read pending insertions for the widget.', {}, async ({ projectDir }) => {
    const state = await readState(projectDir);
    const operations = [];
    for (const item of state.operations.filter(item => item.status === 'pending')) {
      const bytes = await readFile(path.join(target(projectDir), item.file));
      const extension = path.extname(item.file).slice(1);
      const dataUrl = `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}`;
      operations.push(dataUrl.length > 512 * 1024
        ? { ...item, dataUrlBlobId: await saveBlob(projectDir, `image-${createHash('sha256').update(item.id).digest('hex')}`, dataUrl) }
        : { ...item, dataUrl });
    }
    return { operations, captures: state.requests.filter(item => item.status === 'capturing').map(({ id, prompt }) => ({ id, prompt })) };
  }, true);
  tool('ack_canvas_operation', 'Acknowledge insertion after the scene has been saved.', { operationId: z.string() }, ({ projectDir, operationId }) => change(projectDir, state => {
    const operation = state.operations.find(item => item.id === operationId);
    if (!operation) throw new Error('Operation not found');
    if (!state.scene?.elements.some(element => element.customData?.canvasOperationId === operationId)) throw new Error('Inserted image has not been saved');
    operation.status = 'applied';
    const request = state.requests.find(item => item.id === operation.requestId);
    if (request) request.status = 'done';
    return { status: 'applied' };
  }), true);
  return server;
}
export async function start() { await createCanvasServer().connect(new StdioServerTransport()); }

/*
 * The same editors outside an inline-widget host: a local page per editor and a command line.
 *
 * A host that renders MCP App widgets shows the editor in the conversation. Anywhere else the editor
 * opens at a 127.0.0.1 address in the built-in or the user's own browser, and the page calls the same
 * tool handlers over HTTP instead of through the host. State stays in <projectDir>/<editor>/ with its
 * revision checks either way, so the model always edits what the user last saved.
 *
 * One background page server per runtime folder; it outlives the MCP process or CLI call that started it.
 */
const EDITORS = ['canvas', 'diagram', 'cad'];
const serverFile = () => path.join(os.tmpdir(), `canvasanvil-${createHash('sha256').update(path.resolve(ROOT)).digest('hex').slice(0, 12)}.json`);

async function liveServer() {
  try {
    const info = JSON.parse(await readFile(serverFile(), 'utf8'));
    const response = await fetch(`http://127.0.0.1:${info.port}/health?token=${info.token}`, { signal: AbortSignal.timeout(1500) });
    return response.ok ? info : null;
  } catch { return null; }
}
async function ensurePageServer() {
  const running = await liveServer();
  if (running) return running;
  const cli = path.join(ROOT, 'scripts', 'canvas.mjs');
  // Its own working directory, so it never holds the caller's folder (a plugin being updated, a project being removed).
  spawn(process.execPath, [cli, 'serve'], { cwd: os.tmpdir(), detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CANVAS_PLUGIN_ROOT: ROOT } }).unref();
  for (let attempt = 0; attempt < 100; attempt++) {
    await wait(100);
    const started = await liveServer();
    if (started) return started;
  }
  throw new Error('The local editor page did not start');
}
async function browserUrl(projectDir, editor) {
  try {
    const info = await ensurePageServer();
    return `http://127.0.0.1:${info.port}/editor?${new URLSearchParams({ editor, project: path.resolve(projectDir), token: info.token })}`;
  } catch { return undefined; }
}

async function callTool(handlers, name, args = {}) {
  const entry = handlers.get(name);
  if (!entry) throw new Error(`Unknown tool ${name}`);
  const schema = entry.config.inputSchema;
  const parsed = schema ? (typeof schema.parse === 'function' ? schema : z.object(schema)).parse(args) : args;
  return await entry.callback(parsed, {});
}

async function editorPage(editor, projectDir, token) {
  const html = gunzipSync(await readFile(path.join(ROOT, `assets/${editor}-widget.bin`))).toString('utf8');
  const config = JSON.stringify({ token, projectDir, editor }).replace(/</g, '\\u003c');
  const title = { canvas: '自由画布', diagram: '图表', cad: '室内设计' }[editor];
  return html.replace('<head>', `<head><title>CanvasAnvil ${title}</title><script>window.__CANVAS_HTTP__=${config};</script>`);
}

export async function serve() {
  const handlers = createCanvasServer().canvasHandlers;
  const token = randomUUID();
  const send = (response, status, body, type = 'application/json; charset=utf-8') => {
    response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    response.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  // An open editor page polls every second; with none open for 10 minutes the server goes away.
  let lastRequest = Date.now();
  setInterval(async () => {
    if (Date.now() - lastRequest < 10 * 60 * 1000) return;
    const info = await readFile(serverFile(), 'utf8').then(JSON.parse).catch(() => null);
    if (info?.pid === process.pid) await unlink(serverFile()).catch(() => {});
    process.exit(0);
  }, 60 * 1000).unref();
  const pageServer = http.createServer(async (request, response) => {
    lastRequest = Date.now();
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      const { port } = pageServer.address();
      // Only this machine, only pages that carry the token (no other site can drive the editors).
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host) || url.searchParams.get('token') !== token) return send(response, 403, { error: 'Forbidden' });
      if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, { ok: true });
      if (request.method === 'GET' && url.pathname === '/editor') {
        const editor = url.searchParams.get('editor');
        const projectDir = url.searchParams.get('project') ?? '';
        if (!EDITORS.includes(editor) || !path.isAbsolute(projectDir)) return send(response, 400, { error: 'Bad editor or project' });
        return send(response, 200, await editorPage(editor, path.resolve(projectDir), token), 'text/html; charset=utf-8');
      }
      if (request.method === 'POST' && url.pathname === '/call') {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const { name, arguments: args } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return send(response, 200, await callTool(handlers, name, args));
      }
      send(response, 404, { error: 'Not found' });
    } catch (error) { send(response, 500, { isError: true, content: [{ type: 'text', text: error.message }] }); }
  });
  pageServer.listen(0, '127.0.0.1', async () => {
    await writeFile(serverFile(), JSON.stringify({ port: pageServer.address().port, token, pid: process.pid }));
  });
}

const USAGE = `CanvasAnvil editors (diagram, cad, canvas) without an inline-widget host.

  node canvas.mjs open <editor> <projectDir> [--launch]   start the editor page, print its URL (--launch opens the system browser)
  node canvas.mjs call <tool> '<json>' | @args.json | -   run one tool, print its JSON result
  node canvas.mjs tools                                   list the tools and their arguments
  node canvas.mjs serve                                   run the page server in the foreground

Every tool takes "projectDir" (absolute). The page must stay open: it applies queued edits and saves manual ones.`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  const handlers = createCanvasServer().canvasHandlers;
  const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  if (command === 'serve') return serve();
  if (command === 'tools') {
    const list = [];
    for (const [name, { config }] of handlers) {
      if (config._meta?.ui?.visibility && !config._meta.ui.visibility.includes('model')) continue;
      list.push({ name, description: config.description, arguments: Object.keys(config.inputSchema ?? {}) });
    }
    return print(list);
  }
  if (command === 'open') {
    const [editor, projectDir] = rest.filter(item => !item.startsWith('--'));
    if (!EDITORS.includes(editor) || !projectDir || !path.isAbsolute(projectDir)) throw new Error(USAGE);
    await callTool(handlers, `render_${editor}_widget`, { projectDir });
    const url = await browserUrl(projectDir, editor);
    if (!url) throw new Error('The local editor page did not start');
    if (rest.includes('--launch')) {
      const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [url]];
      spawn(opener[0], opener[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    return print({ editor, projectDir: path.resolve(projectDir), url });
  }
  if (command === 'call') {
    const [name, raw = '{}'] = rest;
    const text = raw === '-' ? await new Promise(resolve => { let data = ''; process.stdin.on('data', chunk => { data += chunk; }).on('end', () => resolve(data)); })
      : raw.startsWith('@') ? await readFile(raw.slice(1), 'utf8') : raw;
    const output = await callTool(handlers, name, JSON.parse(text));
    if (output?.isError) { process.stderr.write(`${output.content?.[0]?.text ?? 'Tool failed'}\n`); process.exitCode = 1; return; }
    return print(output?.structuredContent ?? output);
  }
  process.stdout.write(`${USAGE}\n`);
}
