import { App } from '@modelcontextprotocol/ext-apps';

/**
 * How an editor page reaches its tools: through the host when it runs as an inline MCP App widget, or over
 * HTTP to the local page server when it was opened at a 127.0.0.1 address (the server injects __CANVAS_HTTP__).
 */
type HttpTarget = { token: string; projectDir: string; editor: string };
const nativeWindow = window as Window & { __CANVAS_NATIVE_APP__?: App; __CANVAS_PROJECT__?: string; __CANVAS_EDITOR__?: string; __CANVAS_HTTP__?: HttpTarget };
const http = nativeWindow.__CANVAS_HTTP__;
if (http) Object.assign(nativeWindow, { __CANVAS_PROJECT__: http.projectDir, __CANVAS_EDITOR__: http.editor });
export const app = nativeWindow.__CANVAS_NATIVE_APP__ ?? new App({ name: 'CanvasAnvil', version: '1.0.0' }, {});
type ToolResult = { isError?: boolean; content?: Array<{ type: string; text?: string }>; structuredContent?: unknown };
async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (!http) return await app.callServerTool({ name, arguments: args }) as ToolResult;
  const response = await fetch(`/call?token=${encodeURIComponent(http.token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, arguments: args }),
  });
  if (!response.ok && response.status !== 500) throw new Error(`画布服务没有响应（${response.status}），请重新打开画布`);
  return await response.json() as ToolResult;
}
let projectDir = '';
let resolveTarget: () => void;
const targetReady = new Promise<void>(resolve => { resolveTarget = resolve; });
const acceptTarget = (value: unknown) => {
  const target = value as { projectDir?: string };
  if (target?.projectDir) { projectDir = target.projectDir; resolveTarget(); }
};
app.ontoolinput = input => acceptTarget(input.arguments);
app.ontoolresult = result => acceptTarget(result.structuredContent);
export async function connect() {
  if (nativeWindow.__CANVAS_PROJECT__) acceptTarget({ projectDir: nativeWindow.__CANVAS_PROJECT__ });
  if (!nativeWindow.__CANVAS_NATIVE_APP__ && !http) await app.connect();
  await targetReady;
}
export async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  await targetReady;
  const result = await callTool(name, { ...args, projectDir, editor: nativeWindow.__CANVAS_EDITOR__ ?? 'canvas' });
  if (result.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || '画布操作失败');
  return result.structuredContent as T;
}
export async function writeBlob(text: string) {
  const id = crypto.randomUUID();
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 128 * 1024, text.length);
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(text.slice(start, end));
    start = end;
  }
  if (!chunks.length) chunks.push('');
  for (let chunk = 0; chunk < chunks.length; chunk++) await call('store_canvas_blob', { id, chunk, total: chunks.length, data: chunks[chunk] });
  return id;
}
export async function readBlob(id: string) {
  let text = '';
  let total = 1;
  for (let chunk = 0; chunk < total; chunk++) {
    const result = await call<{ data: string; total: number }>('read_canvas_blob', { id, chunk });
    text += result.data;
    total = result.total;
  }
  return text;
}
