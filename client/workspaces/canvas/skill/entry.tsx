import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/inter';
import '../../../index.css';
import { CanvasBoard } from '../canvas/CanvasBoard';
import { resolveAnnotatedEdit } from '../canvas/annotated-edit';
import { insertGeneratedImage } from '../canvas/insert-image';
import { getLineageVersions, type SelectedImageInfo } from '../canvas/lineage';
import { VersionStrip } from '../chat/version-strip';
import { call, connect, readBlob, writeBlob } from './bridge';
import { canvasStore, loadState, type Operation } from './storage';

export function NativeCanvas() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const polling = useRef(false);
  const [selected, setSelected] = useState<SelectedImageInfo | null>(null);
  const [error, setError] = useState('');
  const [, refresh] = useState(0);
  const saveCurrent = async () => {
    const api = apiRef.current!;
    const state = api.getAppState();
    await canvasStore.save('scene', { elements: api.getSceneElementsIncludingDeleted(), appState: {
      viewBackgroundColor: state.viewBackgroundColor, scrollX: state.scrollX, scrollY: state.scrollY, zoom: state.zoom,
    }, files: api.getFiles() });
  };
  useEffect(() => {
    const timer = setInterval(async () => {
      const api = apiRef.current;
      if (!api || polling.current) return;
      const editing = api.getAppState();
      if (editing.newElement || editing.editingTextElement || editing.resizingElement) return;
      polling.current = true;
      try {
        const { operations, captures = [] } = await call<{ operations: Operation[]; captures?: Array<{ id: string; prompt: string }> }>('get_canvas_operations');
        for (const request of captures) {
          try {
            const resolved = await resolveAnnotatedEdit(api, 'zh');
            if (!resolved.ok) throw new Error(resolved.error);
            const { imageElement, originalDataUrl, annotatedDataUrl, annotationElements } = resolved.resolved;
            const input: Record<string, unknown> = {
              requestId: request.id, kind: 'edit', prompt: request.prompt, sourceId: imageElement.id,
              originalDataUrl, annotatedDataUrl: annotatedDataUrl || originalDataUrl,
              annotationIds: annotationElements.map(element => element.id),
              annotationTexts: annotationElements.filter(element => element.type === 'text').map(element => element.text),
            };
            await saveCurrent();
            for (const key of ['originalDataUrl', 'annotatedDataUrl']) {
              if (typeof input[key] === 'string' && input[key].length > 512 * 1024) {
                input[key.replace('DataUrl', 'BlobId')] = await writeBlob(input[key]);
                delete input[key];
              }
            }
            await call('submit_canvas_request', input);
          } catch (reason) {
            await call('fail_canvas_request', { requestId: request.id, error: String(reason) });
          }
        }
        for (const operation of operations) {
          const existing = api.getSceneElementsIncludingDeleted().find(element => element.customData?.canvasOperationId === operation.id);
          if (!existing) {
            const dataUrl = operation.dataUrl ?? await readBlob(operation.dataUrlBlobId!);
            const result = await insertGeneratedImage(api, dataUrl, { lineageId: operation.lineageId, note: operation.note });
            api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map(element => {
              if (element.id === result.elementId) return newElementWith(element, { customData: { ...element.customData, canvasOperationId: operation.id } });
              if (operation.annotationIds.includes(element.id)) return newElementWith(element, { isDeleted: true });
              return element;
            }), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
          }
          await saveCurrent();
          await call('ack_canvas_operation', { operationId: operation.id });
          refresh(value => value + 1);
        }
        setError('');
      } catch (reason) { setError(`同步失败 ${String(reason)}`); }
      finally { polling.current = false; }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const api = apiRef.current;
  const versions = selected && api ? getLineageVersions(api, selected.lineageId) : [];
  return <div className="h-screen w-screen bg-background font-sans relative">
    <CanvasBoard theme="light" langCode="zh-CN" onApiReady={value => { apiRef.current = value; refresh(count => count + 1); }}
      onSelectedImageChange={value => {
        setSelected(value);
        void call('save_canvas_selection', { selection: value }).catch(reason => setError(String(reason)));
      }} />
    {versions.length >= 2 && <div className="absolute bottom-14 right-4 max-w-[90vw] z-10">
      <VersionStrip versions={versions} activeElementId={selected?.elementId ?? null} onSelectVersion={id => {
        const element = api?.getSceneElements().find(item => item.id === id);
        if (!api || !element) return;
        api.updateScene({ appState: { selectedElementIds: { [id]: true } }, captureUpdate: CaptureUpdateAction.EVENTUALLY });
        api.scrollToContent(element, { fitToContent: true });
      }} />
    </div>}
    {error && <p role="alert" className="absolute bottom-14 left-4 text-sm text-destructive z-10">{error}</p>}
  </div>;
}
connect().then(loadState).then(() => createRoot(document.getElementById('root')!).render(<NativeCanvas />))
  .catch(error => { document.getElementById('root')!.textContent = `画布接入失败 ${String(error)}`; });
