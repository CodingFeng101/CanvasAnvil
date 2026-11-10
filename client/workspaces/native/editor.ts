import { call, connect, readBlob, writeBlob } from '../canvas/skill/bridge';
import type { DiagramOperation } from '../diagram/lib/diagram-operations';

export type Command = { id: string; action: string; baseRevision: number; xml?: string; operations?: DiagramOperation[]; mode?: 'create' | 'edit'; layout?: string; payload?: unknown; plan?: unknown; allowReplace?: boolean; format: string };
export interface EditorAdapter {
  load(document: unknown): Promise<void>;
  read(): Promise<unknown>;
  apply(command: Command): Promise<void>;
  export(format: string): Promise<string>;
}
export async function runEditor(adapter: EditorAdapter) {
  await connect();
  let revision = 0;
  let saved = '';
  const restore = async () => {
    const state = await call<{ revision: number; document: unknown; documentBlobId?: string }>('get_editor_state');
    const document = state.documentBlobId ? JSON.parse(await readBlob(state.documentBlobId)) : state.document;
    revision = state.revision;
    await adapter.load(document);
    saved = JSON.stringify(await adapter.read());
  };
  const save = async (operationId?: string) => {
    const document = await adapter.read();
    const text = JSON.stringify(document);
    if (!operationId && text === saved) return;
    const payload = text.length > 512 * 1024 ? { documentBlobId: await writeBlob(text) } : { document };
    const result = await call<{ revision: number }>('save_editor_state', { ...payload, baseRevision: revision, operationId });
    revision = result.revision;
    saved = text;
  };
  await restore();
  const error = document.createElement('p');
  error.setAttribute('role', 'alert');
  error.style.cssText = 'position:fixed;bottom:12px;left:16px;color:#b42318;background:white;z-index:10000';
  document.body.append(error);
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await save();
      const { commands } = await call<{ commands: Command[] }>('get_editor_commands');
      for (const command of commands) {
        try {
          if (command.baseRevision !== revision) throw new Error('画布已修改，请读取最新版本后重试');
          document.getElementById('root')!.style.pointerEvents = 'none';
          if (command.action === 'export') {
            const data = await adapter.export(command.format);
            const payload = data.length > 512 * 1024 ? { blobId: await writeBlob(data) } : { data };
            await call('finish_editor_command', { operationId: command.id, ...payload });
          } else {
            await adapter.apply(command);
            await save(command.id);
          }
        } catch (reason) {
          await call('finish_editor_command', { operationId: command.id, error: String(reason) });
          await restore();
        } finally { document.getElementById('root')!.style.pointerEvents = ''; }
      }
      error.textContent = '';
    } catch (reason) { error.textContent = String(reason); }
    finally { running = false; }
  }, 1000);
}
