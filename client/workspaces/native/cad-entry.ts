import designerHtml from '../../../public/vendor/house-designer/designer.html?raw';
import { CadDesignSession, type MepRun } from '../cad/lib/design/design-session';
import { elecPrefsFromDecisions } from '../cad/lib/design/elec-prefs';
import { layoutToSpec } from '../cad/lib/design/layout';
import { createDesignerBridge, type DesignerApi } from '../cad/designer/designer-bridge';
import type { WorkspaceStore } from '@/shared/storage/indexed-db-store';
import { runEditor } from './editor';
import { unwrapCadPlan } from '../cad/lib/design/cad-plan';
import './editor.css';

let record: unknown = null;
/** The confirmed cad_plan: its decisions carry the wiring preferences applied after every MEP layout. */
let cadPlan: { decisions?: unknown } | null = null;
/** What the last model change did beyond the change itself, as the website's chat reports it. */
let lastRun: Record<string, unknown> | null = null;
let session: CadDesignSession;
let frame: HTMLIFrameElement;
const store: WorkspaceStore = {
  async read<T>(key: string) { return (key === 'cad-design-record' ? record : null) as T | null; },
  async save(key, value) { if (key === 'cad-design-record') record = structuredClone(value); },
  async clear() { record = null; },
};
const html = designerHtml.replace(/location\.search\.includes\("debug"\)&&/g, '');
const nativeWindow = window as Window & { __CA_HPD_PRESET__?: object };
const api = () => (frame.contentWindow as Window & { __designer?: DesignerApi })?.__designer;
void runEditor({
  async load(document) {
    record = (document as { record?: unknown } | null)?.record ?? null;
    cadPlan = unwrapCadPlan((document as { cadPlan?: unknown } | null)?.cadPlan);
    lastRun = (document as { lastRun?: typeof lastRun } | null)?.lastRun ?? null;
    session = new CadDesignSession({ store, confirmReplace: () => true });
    session.setLoader(async preset => {
      nativeWindow.__CA_HPD_PRESET__ = { id: 'native-' + crypto.randomUUID(), ...preset };
      frame = window.document.createElement('iframe');
      frame.title = '户型设计器';
      window.document.getElementById('root')!.replaceChildren(frame);
      frame.srcdoc = html;
      const bridge = createDesignerBridge(api, () => (frame.contentWindow as Window & { __CA_HPD_ERRORS__?: string[] })?.__CA_HPD_ERRORS__ ?? [], () => frame.contentDocument ?? undefined);
      await bridge.ready();
      bridge.fit2D();
      return bridge;
    });
    await session.hydrate();
    if (session.getSnapshot().design) await session.ensureReady();
    else {
      window.document.getElementById('root')!.textContent = '在 Codex 对话中描述户型需求，或提供原始户型图';
    }
  },
  async read() {
    await session.sync();
    const state = session.getSnapshot();
    return { record, cadPlan, lastRun, spec: state.design ? JSON.parse(session.spec()) : null, summary: session.summary(),
      plan: state.design?.plan ?? null, issues: state.issues, audit: state.audit };
  },
  /*
   * The website's steps after a model change (cad ChatPanel generateDesign): a layout becomes walls, openings and
   * furniture by program; the change is applied and checked; MEP is laid out again after wall, opening or furniture
   * edits; then the plan's wiring preferences. Fixing the remaining issues and audit problems is the agent's next
   * round (it reads them from get_cad_state), where the website asks its model in a loop.
   */
  async apply(command) {
    if (command.plan) cadPlan = unwrapCadPlan(command.plan);
    let payload = command.payload as { type?: string; layout?: unknown; replace?: boolean };
    let layoutNotes: string[] = [];
    if (payload?.type === 'cad_layout') {
      const converted = layoutToSpec(payload.layout as Parameters<typeof layoutToSpec>[0]);
      layoutNotes = converted.notes;
      payload = { type: 'cad_spec', spec: converted.spec, replace: payload.replace } as typeof payload;
    }
    const result = await session.applyModelOutput(payload, undefined, { allowReplace: command.allowReplace });
    const mep = await session.autoMep({ relayout: result.touched.layout || result.touched.relayoutElec, force: result.touched.relayoutElec })
      .catch((reason): MepRun => { console.error('[CAD] Auto MEP failed', reason); return { placed: 0 }; });
    const elecNotes = mep.placed ? await session.applyElecPrefs(elecPrefsFromDecisions(cadPlan?.decisions)).catch(() => [] as string[]) : [];
    const state = session.getSnapshot();
    lastRun = { applied: result.applied, errors: result.errors, warnings: result.warnings, layoutNotes,
      mepPlaced: mep.placed, mepSkipped: mep.skipped ?? null, elecNotes, auditProblems: state.audit?.problems.length ?? 0 };
  },
  async export(format) {
    const bridge = await session.ensureReady();
    if (format === 'png') return bridge.shot2d();
    if (format === 'dxf') {
      const bytes = bridge.exportDxf();
      let data = '';
      for (const byte of bytes) data += String.fromCharCode(byte);
      return `data:application/dxf;base64,${btoa(data)}`;
    }
    if (format === 'spec') return session.spec();
    const delivery = await session.deliveryPreset();
    const preset = JSON.stringify({ id: 'export-' + crypto.randomUUID(), ...delivery!.preset }).replace(/</g, '\\u003c');
    return html.replace('<head>', `<head><script>window.__CA_HPD_PRESET__=${preset};</script>`)
      .replace('(window.parent&&window.parent!==window&&window.parent.__CA_HPD_PRESET__)||null', 'window.__CA_HPD_PRESET__||null');
  },
}).catch(error => { document.getElementById('root')!.textContent = String(error); });
