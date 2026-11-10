import { App } from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'CanvasAnvil', version: '1.0.0' }, {});
type Target = { projectDir: string; editor?: string };
let resolveTarget: (project: Target) => void;
const target = new Promise<Target>(resolve => { resolveTarget = resolve; });
app.ontoolresult = result => {
  const data = result.structuredContent as Target | undefined;
  if (data?.projectDir) resolveTarget(data);
};
app.ontoolinput = result => {
  const data = result.arguments as Target | undefined;
  if (data?.projectDir) resolveTarget(data);
};
async function load() {
  await app.connect();
  const destination = await target;
  const projectDir = destination.projectDir;
  const editor = destination.editor ?? document.querySelector<HTMLMetaElement>('meta[name="canvas-editor"]')?.content ?? 'canvas';
  const chunks: Uint8Array[] = [];
  let total = 1;
  for (let chunk = 0; chunk < total; chunk++) {
    const response = await app.callServerTool({ name: 'get_canvas_widget_chunk', arguments: { projectDir, chunk, editor } });
    if (response.isError) throw new Error('无法加载画布资源');
    const data = response.structuredContent as { data: string; total: number };
    total = data.total;
    chunks.push(Uint8Array.from(atob(data.data), character => character.charCodeAt(0)));
    document.getElementById('loading')!.textContent = `正在加载画布 ${chunk + 1}/${total}`;
  }
  const stream = new Blob(chunks as BlobPart[]).stream().pipeThrough(new DecompressionStream('gzip'));
  const html = await new Response(stream).text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.head.append(...parsed.querySelectorAll('style'));
  document.getElementById('loading')!.remove();
  const root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
  Object.assign(window, { __CANVAS_NATIVE_APP__: app, __CANVAS_PROJECT__: projectDir, __CANVAS_EDITOR__: editor });
  const script = parsed.querySelector('script[type="module"]')!.textContent!;
  const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
  try { await import(/* @vite-ignore */ url); } finally { URL.revokeObjectURL(url); }
}
void load().catch(error => { document.getElementById('loading')!.textContent = `加载失败 ${String(error)}`; });
