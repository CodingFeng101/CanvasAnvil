import { createRoot } from 'react-dom/client';
import { createRef } from 'react';
import { DrawIoEmbed, type DrawIoEmbedRef } from 'react-drawio';
import { validateAndFixXml, validateMxCellStructure, wrapWithMxFile } from '../diagram/lib/drawio-xml';
import { applyDiagramOperations } from '../diagram/lib/diagram-operations';
import { runEditor } from './editor';
import { correctDiagramLayout } from './diagram-layout';
import './editor.css';

const blank = '<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
const drawio = createRef<DrawIoEmbedRef>();
let xml = blank;
let layoutCorrection: Awaited<ReturnType<typeof correctDiagramLayout>>['correction'] | null = null;
let xmlFixes: string[] = [];
let loadDone: (() => void) | undefined;
let exportDone: ((data: string) => void) | undefined;
let mounted = false;
let editorLoaded = false;
function waitFor<T>(start: (resolve: (value: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('draw.io 响应超时，请检查网络后重新打开画布')), 30000);
    start(value => { clearTimeout(timeout); resolve(value); });
  });
}
const root = createRoot(document.getElementById('root')!);
function mountEditor(baseUrl: string) {
  root.render(<DrawIoEmbed key={baseUrl} ref={drawio} xml={xml} autosave baseUrl={baseUrl}
    urlParameters={{ ui: 'min', lang: 'zh', spin: true, libraries: true, noSaveBtn: true, noExitBtn: true }}
    onLoad={() => { editorLoaded = true; loadDone?.(); loadDone = undefined; }}
    onAutoSave={event => { xml = event.xml; }}
    onExport={event => { exportDone?.(event.data); exportDone = undefined; }} />);
}
void runEditor({
  async load(document) {
    xml = (document as { xml?: string } | null)?.xml || blank;
    layoutCorrection = (document as { layoutCorrection?: typeof layoutCorrection } | null)?.layoutCorrection ?? null;
    xmlFixes = (document as { xmlFixes?: string[] } | null)?.xmlFixes ?? [];
    await waitFor<void>(resolve => {
      loadDone = resolve;
      if (mounted) drawio.current!.load({ xml, autosave: true });
      else {
        mounted = true;
        mountEditor('https://embed.diagrams.net');
        setTimeout(() => {
          if (!editorLoaded) mountEditor('https://jgraph.github.io/drawio/src/main/webapp/index.html');
        }, 8000);
      }
    });
  },
  async read() { return { xml, layoutCorrection, xmlFixes }; },
  async apply(command) {
    const edited = command.action === 'edit' ? applyDiagramOperations(xml, command.operations!) : command.xml!;
    const checked = validateAndFixXml(wrapWithMxFile(edited));
    if (!checked.valid) throw new Error(checked.error || 'Invalid diagram XML');
    const next = checked.fixed ?? wrapWithMxFile(edited);
    const only = command.operations?.filter(item => item.operation !== 'delete').map(item => item.cell_id);
    const corrected = await correctDiagramLayout(xml, next, { ...command, only });
    if (validateMxCellStructure(corrected.xml)) {
      corrected.xml = next;
      corrected.correction.correctedXml = next;
      corrected.correction.method = 'original';
      corrected.correction.afterScore = corrected.correction.scores.original;
      corrected.correction.reason = 'Corrected XML was invalid. Kept the original diagram.';
      corrected.correction.moved = 0;
      corrected.correction.straightened = 0;
    }
    await waitFor<void>(resolve => { loadDone = resolve; drawio.current!.load({ xml: corrected.xml, autosave: true }); });
    xml = corrected.xml;
    layoutCorrection = corrected.correction;
    xmlFixes = checked.fixes;
  },
  async export(format) {
    if (format === 'drawio') return xml;
    return waitFor<string>(resolve => { exportDone = resolve; drawio.current!.exportDiagram({ format: format as 'svg' | 'png' }); });
  },
}).catch(error => { document.getElementById('root')!.textContent = String(error); });
