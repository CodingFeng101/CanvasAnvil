import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { build } from 'esbuild';

test('native widget uploads preserve emoji and Chinese text across bounded chunks', async () => {
  const bundle = await build({ entryPoints: ['client/workspaces/canvas/skill/bridge.ts'], bundle: true, platform: 'browser', format: 'iife', globalName: 'CanvasBridge', write: false });
  const chunks: string[] = [];
  const bridge = new Function('window', bundle.outputFiles[0].text + '\nreturn CanvasBridge;')({
    __CANVAS_PROJECT__: 'C:/unicode-test',
    __CANVAS_NATIVE_APP__: { async callServerTool(input: { arguments: { data: string } }) {
      const data = input.arguments.data;
      assert.ok(Buffer.byteLength(data) <= 512 * 1024);
      chunks.push(Buffer.from(data, 'utf8').toString('utf8'));
      return { structuredContent: {} };
    } },
  });
  await bridge.connect();
  const text = 'x'.repeat(131071) + '🛋' + '中文'.repeat(200000);
  await bridge.writeBlob(text);
  assert.equal(chunks.join(''), text);
});

test('native canvas MCP exposes widget resources, checks revisions and inserts each request once', async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), 'canvas-native-'));
  const root = path.join(projectDir, 'installed-plugin');
  await cp(path.resolve('skill/canvas-skill'), root, { recursive: true });
  const client = new Client({ name: 'native-canvas-test', version: '1.0.0' });
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: { projectDir, ...args } });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['scripts/start-mcp.mjs'], cwd: root }));
    const opened = await call('render_canvas_widget');
    assert.equal(opened.isError, undefined);
    assert.equal(opened._meta?.['openai/outputTemplate'], 'ui://canvasanvil/canvas.html');
    const resource = await client.readResource({ uri: 'ui://canvasanvil/canvas.html' });
    assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
    const widget = resource.contents[0];
    assert.ok('text' in widget);
    assert.ok(Buffer.byteLength(widget.text) < 1024 * 1024);
    const source = { id: 'source', type: 'image', x: 10, y: 20, width: 400, height: 300 };
    const scene = { elements: [source], files: {}, appState: {} };
    const concurrent = await Promise.all([call('save_canvas_state', { scene, baseRevision: 0 }), call('save_canvas_state', { scene, baseRevision: 0 })]);
    assert.equal(concurrent.filter(item => item.isError).length, 1);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=';
    const capture = await call('get_canvas_request', { requestId: 'chat-edit', prompt: 'Change title' });
    assert.equal((capture.structuredContent as { status: string }).status, 'capturing');
    const retry = await call('get_canvas_request', { requestId: 'chat-edit', prompt: 'Retry must preserve the instruction' });
    assert.equal((retry.structuredContent as { prompt: string }).prompt, 'Change title');
    const captures = (await call('get_canvas_operations')).structuredContent as { captures: Array<{ id: string }> };
    assert.deepEqual(captures.captures.map(item => item.id), ['chat-edit']);
    const submitted = await call('submit_canvas_request', { requestId: 'chat-edit', kind: 'edit', prompt: 'Change title', sourceId: 'source',
      originalDataUrl: png, annotatedDataUrl: png, annotationIds: ['annotation'], annotationTexts: ['New title'] });
    const requestId = (submitted.structuredContent as { id: string }).id;
    const request = await call('get_canvas_request', { requestId });
    assert.equal(requestId, 'chat-edit');
    assert.equal((request.structuredContent as { status: string }).status, 'pending');
    assert.deepEqual((request.structuredContent as { annotationTexts: string[] }).annotationTexts, ['New title']);
    const duplicate = await call('submit_canvas_request', { requestId, kind: 'edit', prompt: 'Duplicate snapshot' });
    assert.deepEqual(duplicate.structuredContent, submitted.structuredContent);
    await call('get_canvas_request', { requestId: 'bad-selection', prompt: 'Edit the selected picture' });
    const blocked = await call('insert_canvas_image', { requestId: 'bad-selection', operationId: 'too-early', imagePath: path.join(projectDir, 'missing.png') });
    assert.equal(blocked.isError, true);
    await call('fail_canvas_request', { requestId: 'bad-selection', error: 'Select a picture first' });
    assert.equal(((await call('get_canvas_request', { requestId: 'bad-selection' })).structuredContent as { status: string }).status, 'failed');
    const imagePath = path.join(projectDir, 'result.png');
    await writeFile(imagePath, Buffer.from(png.split(',')[1], 'base64'));
    const first = await call('insert_canvas_image', { requestId, imagePath, operationId: 'op-1' });
    const repeated = await call('insert_canvas_image', { requestId, imagePath, operationId: 'different-retry-id' });
    assert.deepEqual(repeated.structuredContent, first.structuredContent);
    const operations = await call('get_canvas_operations');
    assert.equal((operations.structuredContent as { operations: unknown[] }).operations.length, 1);
    const premature = await call('ack_canvas_operation', { operationId: 'op-1' });
    assert.equal(premature.isError, true);
    const saved = await call('save_canvas_state', { scene: { ...scene, elements: [source, { id: 'result', type: 'image', customData: { canvasOperationId: 'op-1' } }] }, baseRevision: 1 });
    assert.equal(saved.isError, undefined);
    assert.equal(((await call('ack_canvas_operation', { operationId: 'op-1' })).structuredContent as { status: string }).status, 'applied');
    assert.equal(((await call('get_canvas_request', { requestId })).structuredContent as { status: string }).status, 'done');
    const largeScene = JSON.stringify({ ...scene, files: { large: { dataURL: 'x'.repeat(11 * 1024 * 1024) } } });
    const size = 512 * 1024;
    const total = Math.ceil(largeScene.length / size);
    for (let chunk = 0; chunk < total; chunk++) {
      const stored = await call('store_canvas_blob', { id: 'large-scene-test', chunk, total, data: largeScene.slice(chunk * size, (chunk + 1) * size) });
      assert.equal(stored.isError, undefined);
    }
    const uploaded = await call('save_canvas_state', { sceneBlobId: 'large-scene-test', baseRevision: 2 });
    assert.equal(uploaded.isError, undefined);
    const largeState = (await call('get_canvas_state')).structuredContent as { sceneBlobId: string };
    let restored = '';
    for (let chunk = 0; chunk < total; chunk++) {
      const part = (await call('read_canvas_blob', { id: largeState.sceneBlobId, chunk })).structuredContent as { data: string };
      restored += part.data;
    }
    assert.equal(JSON.parse(restored).files.large.dataURL.length, 11 * 1024 * 1024);
  } finally { await client.close(); await rm(projectDir, { recursive: true, force: true }); }
});

test('native diagram and CAD commands enforce revisions and commit once', async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), 'native-editors-'));
  const client = new Client({ name: 'editor-test', version: '1' });
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: { projectDir, ...args } });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['scripts/start-mcp.mjs'], cwd: path.resolve('skill/canvas-skill') }));
    for (const editor of ['diagram', 'cad']) {
      const open = await call(`render_${editor}_widget`);
      assert.equal((open.structuredContent as { editor: string }).editor, editor);
      const resource = await client.readResource({ uri: `ui://canvasanvil/${editor}.html` });
      assert.equal(resource.contents[0].mimeType, 'text/html;profile=mcp-app');
      const args = editor === 'diagram' ? { xml: '<mxGraphModel><root/></mxGraphModel>' } : { payload: { type: 'cad_spec', spec: {} } };
      const tool = editor === 'diagram' ? 'set_diagram_xml' : 'apply_cad_design';
      await call(tool, { ...args, baseRevision: 0, operationId: 'first' });
      const commit = await call('save_editor_state', { editor, document: { value: 'new' }, baseRevision: 0, operationId: 'first' });
      assert.equal((commit.structuredContent as { revision: number }).revision, 1);
      const duplicate = await call(tool, { ...args, baseRevision: 0, operationId: 'first' });
      assert.equal((duplicate.structuredContent as { status: string }).status, 'applied');
      assert.equal((await call(tool, { ...args, baseRevision: 0, operationId: 'stale' })).isError, true);
      await call(tool, { ...args, baseRevision: 1, operationId: 'racing' });
      await call('save_editor_state', { editor, document: { value: 'manual' }, baseRevision: 1 });
      assert.equal((await call('save_editor_state', { editor, document: { value: 'overwrite' }, baseRevision: 2, operationId: 'racing' })).isError, true);
      await call('finish_editor_command', { editor, operationId: 'racing', error: 'Revision conflict' });
      const state = (await call('get_editor_state', { editor })).structuredContent as { document: { value: string } };
      assert.equal(state.document.value, 'manual');
      await call(`export_${editor}`, { format: editor === 'cad' ? 'spec' : 'drawio', baseRevision: 2, operationId: 'export' });
      const exported = await call('finish_editor_command', { editor, operationId: 'export', data: 'saved export' });
      assert.ok((exported.structuredContent as { filePath: string }).filePath.startsWith(path.join(projectDir, editor)));
    }
    const partial = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="x" value="';
    const started = await call('set_diagram_xml', { xml: partial, baseRevision: 2, operationId: 'draft', mode: 'create', layout: 'flow-down' });
    assert.equal((started.structuredContent as { status: string }).status, 'awaiting_append');
    const restarted = await call('append_diagram', { draftId: 'draft', xml: '<mxGraphModel><root/></mxGraphModel>', baseRevision: 2, operationId: 'restarted-wrapper' });
    assert.equal(restarted.isError, true);
    const middle = { draftId: 'draft', xml: 'Partial', baseRevision: 2, operationId: 'chunk-1' };
    const continued = await call('append_diagram', middle);
    assert.equal((continued.structuredContent as { status: string }).status, 'awaiting_append');
    assert.deepEqual((await call('append_diagram', middle)).structuredContent, continued.structuredContent);
    assert.equal((await call('append_diagram', { ...middle, operationId: 'wrong-draft' })).isError, true);
    await client.close();
    await client.connect(new StdioClientTransport({ command: process.execPath, args: ['scripts/start-mcp.mjs'], cwd: path.resolve('skill/canvas-skill') }));
    const ending = ' node" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel>';
    const finished = await call('append_diagram', { draftId: 'chunk-1', xml: ending, baseRevision: 2, operationId: 'chunk-2' });
    const finishedCommand = finished.structuredContent as { xml: string; status: string; mode: string; layout: string };
    assert.equal(finishedCommand.status, 'pending');
    assert.equal(finishedCommand.xml, partial + 'Partial' + ending);
    assert.equal(finishedCommand.mode, 'create');
    assert.equal(finishedCommand.layout, 'flow-down');
    assert.equal(((await call('get_editor_state', { editor: 'diagram' })).structuredContent as { revision: number }).revision, 2);
    const edit = await call('edit_diagram', { operations: [{ operation: 'delete', cell_id: 'x' }], baseRevision: 2, operationId: 'cell-edit' });
    assert.equal((edit.structuredContent as { action: string }).action, 'edit');
  } finally { await client.close(); await rm(projectDir, { recursive: true, force: true }); }
});
