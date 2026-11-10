import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

/**
 * The editors without an inline-widget host: a standalone skill folder's runtime opens the editor at a
 * 127.0.0.1 address and runs the same tools from the command line, on the same state and revisions.
 */
const run = promisify(execFile);
const cli = path.resolve('skill/diagram-skill/runtime/scripts/canvas.mjs');
const canvas = async (...args: string[]) => JSON.parse((await run(process.execPath, [cli, ...args], { cwd: os.tmpdir() })).stdout);

test('standalone skill runtime: CLI tools share state, the local page needs its token and this host', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'canvas-browser-'));
  try {
    const opened = await canvas('open', 'diagram', projectDir);
    const url = new URL(opened.url);
    assert.equal(url.hostname, '127.0.0.1');
    const token = url.searchParams.get('token')!;

    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /__CANVAS_HTTP__/);
    assert.equal((await fetch(`${url.origin}/editor?editor=diagram&project=${encodeURIComponent(projectDir)}`)).status, 403);
    // fetch drops a custom Host header, so the rebinding-style request goes through http.request.
    const foreignHost = await new Promise<number>((resolve, reject) => {
      http.get({ host: '127.0.0.1', port: url.port, path: `/health?token=${token}`, headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode!); }).on('error', reject);
    });
    assert.equal(foreignHost, 403);

    const state = await canvas('call', 'get_diagram_state', JSON.stringify({ projectDir }));
    assert.equal(state.revision, 0);
    const queued = await canvas('call', 'set_diagram_xml', JSON.stringify({ projectDir, baseRevision: 0, operationId: 'op-1', xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>' }));
    assert.equal(queued.status, 'pending');

    // The page reaches the same handlers over HTTP and sees the command the CLI queued.
    const call = await fetch(`${url.origin}/call?token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'get_editor_commands', arguments: { projectDir, editor: 'diagram' } }) });
    const commands = (await call.json()).structuredContent.commands;
    assert.deepEqual(commands.map((item: { id: string }) => item.id), ['op-1']);

    await assert.rejects(canvas('call', 'set_diagram_xml', JSON.stringify({ projectDir, baseRevision: 5, operationId: 'op-2', xml: '<mxGraphModel/>' })), /Revision changed/);
  } finally { await rm(projectDir, { recursive: true, force: true }); }
});
