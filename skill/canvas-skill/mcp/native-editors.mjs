import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { isMxCellXmlComplete } from '../../../client/workspaces/diagram/lib/diagram-operations.ts';

/** Rounds the website's own loops allow: 6 for designer issues, 8 for the MEP audit; the gate allows the larger. */
export const CAD_MAX_FIX_ROUNDS = 8;

/**
 * What is left after a CAD change, and whether the agent must keep going -- the website fixes issues and audit
 * problems in a loop by itself; here each applied change carries this gate and the agent is told the next step.
 * Rounds count consecutive changes that left something to fix; a round that fixes nothing, or the round limit,
 * ends the loop with the remaining items to explain.
 */
export function cadGate(state, command) {
  const scene = state.scene || {};
  const issues = Array.isArray(scene.issues) ? scene.issues : [];
  const errors = issues.filter(issue => issue.level === 'error').map(issue => issue.msg);
  const warnings = issues.filter(issue => issue.level === 'warn').map(issue => issue.msg);
  const audit = Array.isArray(scene.audit?.problems) ? scene.audit.problems : [];
  const total = errors.length + warnings.length + audit.length;
  const previous = [...state.operations].reverse()
    .find(item => item !== command && item.action === 'apply' && item.status === 'applied' && item.gate);
  const fresh = command.payload?.type === 'cad_layout' || command.payload?.replace === true;
  const round = !fresh && previous && previous.gate.status !== 'clean' ? previous.gate.round + 1 : 1;
  const stalled = round > 1 && total >= previous.gate.remaining;
  const status = total === 0 ? 'clean' : stalled ? 'stalled' : round >= CAD_MAX_FIX_ROUNDS ? 'limit' : 'fix';
  const next = {
    clean: 'Done: 0 errors, 0 warnings, MEP audit clean. Go on to the delivery checks.',
    fix: `Not done: fix every item below with another apply_cad_design (round ${round + 1} of at most ${CAD_MAX_FIX_ROUNDS}), then read this gate again.`,
    stalled: 'Stopped: this round fixed nothing. Do not repeat it; explain each remaining item to the user (why it stays, or what they must decide).',
    limit: `Stopped after ${CAD_MAX_FIX_ROUNDS} rounds. Explain each remaining item to the user.`,
  }[status];
  return { status, round, remaining: total, errors, warnings, audit, next };
}

export function registerNativeEditors(server, storage) {
  const { root, readState, change, target, result, safely, saveBlob, blobPath, browserUrl } = storage;
  const editorSchema = z.enum(['diagram', 'cad']);
  const project = { projectDir: z.string().min(1) };
  const operation = { operationId: z.string().min(1), baseRevision: z.number().int().nonnegative() };
  const tool = (name, description, schema, handler, appOnly = false) => registerAppTool(server, name, {
    description, inputSchema: { ...project, ...schema },
    annotations: { readOnlyHint: name.startsWith('get_'), destructiveHint: false, openWorldHint: false, idempotentHint: true },
    _meta: { ui: { visibility: appOnly ? ['app'] : ['model', 'app'] } },
  }, safely(handler));
  const queue = (editor, args, command) => change(args.projectDir, state => {
    const previous = state.operations.find(item => item.id === args.operationId);
    if (previous) return previous;
    if (state.revision !== args.baseRevision) throw new Error('Revision changed. Read the current editor state before retrying.');
    if (editor === 'diagram') {
      if (command.action === 'append') {
        const draft = state.diagramDraft;
        if (!draft || draft.id !== args.draftId) throw new Error('Draft changed or finished. Read the previous operation before appending.');
        if (draft.baseRevision !== state.revision) throw new Error('Canvas changed while generating. Read the current document and restart generation.');
        if (/^(?:<mxGraphModel\b|<root\b|<mxfile\b|<mxCell id="[01]")/.test(command.xml.trim())) throw new Error('Do not restart the diagram. Continue from the exact next character without wrapper tags or root cells.');
        const previousChunk = state.operations.find(item => item.id === draft.id);
        Object.assign(previousChunk, { status: 'continued', nextOperationId: args.operationId });
        command = { action: 'replace', xml: draft.xml + command.xml, mode: draft.mode, layout: draft.layout };
      } else if (state.diagramDraft) {
        const previousDraft = state.operations.find(item => item.id === state.diagramDraft.id);
        Object.assign(previousDraft, { status: 'superseded', nextOperationId: args.operationId });
      }
      state.diagramDraft = null;
      if (command.action === 'replace' && !isMxCellXmlComplete(command.xml)) {
        const draft = { id: args.operationId, baseRevision: args.baseRevision, ...command };
        state.diagramDraft = draft;
        const item = { ...draft, status: 'awaiting_append', message: 'XML is truncated. Continue with append_diagram from the exact next character.', ending: command.xml.slice(-500) };
        state.operations.push(item);
        return item;
      }
    }
    const item = { id: args.operationId, baseRevision: args.baseRevision, status: 'pending', ...command };
    state.operations.push(item);
    return item;
  }, editor);
  for (const editor of ['diagram', 'cad']) {
    const uri = `ui://canvasanvil/${editor}.html`;
    const csp = { resourceDomains: ['data:', 'blob:'], connectDomains: ['data:'], frameDomains: editor === 'diagram' ? ['https://embed.diagrams.net', 'https://jgraph.github.io'] : ['blob:'] };
    const meta = { ui: { csp }, 'openai/ui': { availableDisplayModes: ['fullscreen'], preferredDisplayMode: 'fullscreen' } };
    registerAppResource(server, `CanvasAnvil ${editor}`, uri, { _meta: meta }, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE,
      text: (await readFile(path.join(root, 'assets/canvas-widget.html'), 'utf8')).replace('<head>', `<head><meta name="canvas-editor" content="${editor}">`), _meta: meta }] }));
    registerAppTool(server, `render_${editor}_widget`, { title: editor === 'diagram' ? 'CanvasAnvil 图表' : 'CanvasAnvil 室内设计',
      description: `Open the ${editor === 'diagram' ? 'draw.io' : 'house designer'} editor. Hosts that render MCP App widgets show it in the conversation; otherwise open the returned browserUrl in the built-in browser or give it to the user. Reuse the open editor.`,
      inputSchema: project, _meta: { ui: { resourceUri: uri }, 'openai/outputTemplate': uri } }, async ({ projectDir }) => {
      await change(projectDir, () => ({}), editor);
      return { ...result({ projectDir: path.resolve(projectDir), editor, browserUrl: browserUrl ? await browserUrl(projectDir, editor) : undefined }), _meta: { 'openai/outputTemplate': uri } };
    });
    tool(`get_${editor}_state`, `Read the latest saved ${editor} document and revision. Manual changes are synchronized by the open widget.`, {}, async ({ projectDir }) => {
      const state = await readState(projectDir, editor);
      const document = editor === 'cad' && state.scene ? { ...state.scene, record: undefined } : state.scene;
      const folder = path.join(target(projectDir, editor), 'snapshots');
      await mkdir(folder, { recursive: true });
      const documentPath = path.join(folder, `${state.revision}.${editor === 'diagram' ? 'drawio' : 'json'}`);
      const text = editor === 'diagram' ? document?.xml ?? '' : JSON.stringify(document);
      await writeFile(documentPath, text);
      return { revision: state.revision, updatedAt: state.updatedAt, documentPath, document: JSON.stringify(document).length < 512 * 1024 ? document : undefined };
    });
    tool(`export_${editor}`, `Export the current ${editor} through its open widget. Poll get_editor_operation for the saved file.`, {
      ...operation, format: editor === 'diagram' ? z.enum(['drawio', 'svg', 'png']) : z.enum(['spec', 'designer', 'png', 'dxf']),
    }, async args => {
      if (editor === 'cad' && args.format === 'spec') {
        // The spec export feeds the delivery checks; the fix rounds come first.
        const state = await readState(args.projectDir, 'cad');
        const last = [...state.operations].reverse().find(item => item.action === 'apply' && item.status === 'applied' && item.gate);
        if (last?.gate.status === 'fix') throw new Error(`Fix rounds not finished: ${last.gate.remaining} item(s) left (${last.gate.next}). Apply the fixes first.`);
      }
      return queue(editor, args, { action: 'export', format: args.format });
    });
  }
  tool('set_diagram_xml', 'Apply complete draw.io XML with the website layout correction. Use mode=create for a new diagram or explicit relayout, mode=edit for local edits. Read the revision first and poll get_editor_operation. Read get_diagram_state for correction scores and original XML.', {
    ...operation, xml: z.string().min(1), mode: z.enum(['create', 'edit']).optional(),
    layout: z.enum(['flow-down', 'flow-right', 'flow-up', 'tree-down', 'tree-right', 'mindmap', 'swimlane', 'sequence', 'timeline', 'free', 'auto']).default('auto'),
  }, args => queue('diagram', args, { action: 'replace', xml: args.xml, mode: args.mode, layout: args.layout }));
  tool('append_diagram', 'Continue an awaiting_append diagram from the exact next character. Use its operation ID as draftId, a new stable operationId for this chunk, and the original baseRevision. Poll only after status becomes pending. A continued draft names the nextOperationId.', {
    ...operation, draftId: z.string().min(1), xml: z.string().min(1),
  }, args => queue('diagram', args, { action: 'append', xml: args.xml }));
  tool('edit_diagram', 'Apply ordered add/update/delete mxCell operations to the current diagram using the website editing logic. Read the current revision and cell IDs first. Layout correction is limited to the edited cells before the final result is shown.', {
    ...operation, operations: z.array(z.object({ operation: z.enum(['add', 'update', 'delete']), cell_id: z.string().min(1), new_xml: z.string().optional() })).min(1),
  }, args => queue('diagram', args, { action: 'edit', operations: args.operations, mode: 'edit' }));
  tool('apply_cad_design', 'Apply cad_layout (a new floorplan from prompts/layout.md), cad_spec, cad_ops or cad_spec_patch through the existing house designer session, as the website does: layout to spec, apply and check, MEP laid out again after wall/opening/furniture edits, then the wiring preferences of the confirmed cad_plan. Pass that plan as `plan` with the first design (it is kept). Preserve manual edits using the latest baseRevision. Full replacement requires replace=true and allowReplace=true. When get_editor_operation reports it applied, its `gate` says what is left (errors, warnings, MEP audit problems) and `next` says what to do: keep applying fix rounds while gate.status is "fix"; "clean" means done; "stalled" or "limit" means explain each remaining item to the user.', {
    ...operation, payload: z.object({ type: z.enum(['cad_layout', 'cad_spec', 'cad_ops', 'cad_spec_patch']) }).passthrough(), plan: z.object({}).passthrough().optional(), allowReplace: z.boolean().default(false),
  }, args => queue('cad', args, { action: 'apply', payload: args.payload, plan: args.plan, allowReplace: args.allowReplace }));
  tool('get_editor_operation', 'Read whether an editor operation is pending, applied or failed, including exported file paths and actual errors. An applied CAD change carries `gate`: the remaining errors, warnings and MEP audit problems and the required next step.', { editor: editorSchema, operationId: z.string() }, async ({ projectDir, editor, operationId }) => {
    const item = (await readState(projectDir, editor)).operations.find(item => item.id === operationId);
    if (!item) throw new Error('Operation not found');
    return item;
  });
  tool('get_editor_state', 'Load the native editor document.', { editor: editorSchema }, async ({ projectDir, editor }) => {
    const state = await readState(projectDir, editor);
    const text = JSON.stringify(state.scene);
    return { revision: state.revision, document: text.length <= 512 * 1024 ? state.scene : null,
      documentBlobId: text.length > 512 * 1024 ? await saveBlob(projectDir, `scene-${state.revision}`, text, editor) : undefined };
  }, true);
  tool('get_editor_commands', 'Poll pending commands for the native editor.', { editor: editorSchema }, async ({ projectDir, editor }) => ({
    commands: (await readState(projectDir, editor)).operations.filter(item => item.status === 'pending'),
  }), true);
  tool('save_editor_state', 'Persist manual changes or atomically commit a model command and its document.', {
    editor: editorSchema, baseRevision: z.number().int().nonnegative(), document: z.unknown().optional(), documentBlobId: z.string().optional(), operationId: z.string().optional(),
  }, args => change(args.projectDir, async state => {
    const command = args.operationId && state.operations.find(item => item.id === args.operationId);
    if (args.operationId && !command) throw new Error('Operation not found');
    if (command && command.status === 'applied') return { revision: state.revision };
    if (state.revision !== args.baseRevision || (command && (command.status !== 'pending' || command.baseRevision !== state.revision))) throw new Error('Revision changed. Reopen the widget to load the saved document.');
    if (args.document === undefined && !args.documentBlobId) throw new Error('Missing document');
    state.scene = args.documentBlobId ? JSON.parse(await readFile(blobPath(args.projectDir, args.documentBlobId, args.editor), 'utf8')) : args.document;
    state.revision++;
    state.updatedAt = Date.now();
    if (command) Object.assign(command, { status: 'applied', revision: state.revision });
    if (command && args.editor === 'cad' && command.action === 'apply') command.gate = cadGate(state, command);
    return { revision: state.revision };
  }, args.editor), true);
  tool('finish_editor_command', 'Save an editor export or record a failed command.', {
    editor: editorSchema, operationId: z.string(), error: z.string().optional(), data: z.string().optional(), blobId: z.string().optional(),
  }, args => change(args.projectDir, async state => {
    const command = state.operations.find(item => item.id === args.operationId);
    if (!command) throw new Error('Operation not found');
    if (command.status !== 'pending') return command;
    if (args.error) { Object.assign(command, { status: 'failed', error: args.error }); return command; }
    if (command.action !== 'export') throw new Error('Only export commands can return files');
    if (state.revision !== command.baseRevision) throw new Error('Document changed before export. Read the current revision and retry.');
    const data = args.blobId ? await readFile(blobPath(args.projectDir, args.blobId, args.editor), 'utf8') : args.data;
    if (data === undefined) throw new Error('Missing export data');
    const ext = { spec: 'json', designer: 'html', drawio: 'drawio', svg: 'svg', png: 'png', dxf: 'dxf' }[command.format];
    const folder = path.join(target(args.projectDir, args.editor), 'exports');
    await mkdir(folder, { recursive: true });
    const filePath = path.join(folder, `${createHash('sha256').update(command.id).digest('hex').slice(0, 20)}.${ext}`);
    const match = /^data:[^,]*;base64,(.*)$/s.exec(data);
    await writeFile(filePath, match ? Buffer.from(match[1], 'base64') : data);
    Object.assign(command, { status: 'applied', filePath, revision: state.revision });
    return command;
  }, args.editor), true);
}
