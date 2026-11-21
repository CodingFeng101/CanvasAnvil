import type { InternalPlan, SinglePlan, BuildingPlan, DesignIssue, RoomArea } from '../lib/design/types';
import { auditElec, type ElecAudit } from '../lib/design/elec-audit';

export const REQUIRED_API = ['app', 'replacePlan', 'runChecks', 'makeFurn', 'CAT', 'dxfBytes', 'shot2d', 'fit2D'] as const;
export type DesignerApi = {
  app: { plan: SinglePlan; geo: { bounds: { x: number; y: number; w: number; h: number } }; rooms: { regions: Array<{ area: number; interior: { x: number; y: number }; labels: Array<{ name: string; x: number; y: number }>; rects?: RoomArea['rects'] }> } };
  bld: Omit<BuildingPlan, 'version' | 'kind'> & { cur: number; floors: BuildingPlan['floors'] };
  replacePlan(plan: InternalPlan): void;
  runChecks(): { issues: Array<{ level: DesignIssue['level']; type: string; msg: string; at?: { x?: unknown; y?: unknown }; targets?: Array<{ kind: string; id: string }> }> };
  makeFurn(key: string, x: number, y: number, rot: number, opts?: object): object;
  CAT: Record<string, object>;
  dxfBytes(standard: string, mode: string): number[];
  shot2d(mode: string, cx: number, cy: number, scale: number, w?: number, h?: number): string;
  fit2D(): void;
};
/**
 * The designer's own one-click exports, as skill/cad-skill/scripts/run-designer.mjs drives them:
 * a CSS selector to click, a menu text, a pause in ms, or a condition to wait for. The colour plan
 * and render need the 3D view (scene ready, transition over, camera reset to frame the home).
 */
type ExportStep = string | number | { text: string } | { until: (api: DesignerApi & { S3?: { ready?: boolean } }) => boolean; retry?: string };
// The view can be put back to 2D by an export that finishes late (the drawings), so the 3D button is pressed again while waiting.
const IN_3D: ExportStep = { until: d => (d.app as { view?: string }).view === '3d' && !!d.S3?.ready, retry: '[data-view="3d"]' };
const ENTER_3D: ExportStep[] = ['[data-view="3d"]', IN_3D, 2000, IN_3D, '#camReset', 1200, IN_3D];
export const DESIGNER_EXPORTS = {
  quote: { name: '报价单', steps: ['#quoteBtn', 400, '#qCsv'], after: ['#qX'] as ExportStep[], timeout: 30000 },
  drawings: { name: '施工图', steps: [{ text: '整套施工图' }], after: [] as ExportStep[], timeout: 90000 },
  planDxf: { name: '平面图 DXF', steps: ['[data-exp="dxf"]'], after: [] as ExportStep[], timeout: 30000 },
  mepDxf: { name: '水电图 DXF', steps: ['[data-exp="dxf-mep"]'], after: [] as ExportStep[], timeout: 30000 },
  colour: { name: '彩平图', steps: [...ENTER_3D, '[data-exp="colorplan"]'], after: ['[data-view="2d"]'] as ExportStep[], timeout: 90000 },
  render: { name: '3D 效果图', steps: [...ENTER_3D, '#renderBtn'], after: ['[data-view="2d"]'] as ExportStep[], timeout: 240000 },
} satisfies Record<string, { name: string; steps: ExportStep[]; after: ExportStep[]; timeout: number }>;
export type DesignerExportKey = keyof typeof DESIGNER_EXPORTS;
export type DesignerExportResult = { key: DesignerExportKey; name: string; blob?: Blob; fileName?: string; error?: string };

export interface DesignerBridge {
  ready(): Promise<void>;
  checkApi(): string[];
  readPlan(): InternalPlan;
  replacePlan(plan: InternalPlan): void;
  runChecks(): DesignIssue[];
  makeFurn: DesignerApi['makeFurn'];
  roomAreas(): RoomArea[];
  exportDxf(): Uint8Array;
  shot2d(): string;
  fit2D(): void;
  /** Runs the designer's own 一键布置水电 when the plan has no MEP points yet; returns how many were placed. */
  autoElec(): Promise<number>;
  /** Room-by-room MEP audit (lights, switches, sockets, heights, door switches); null before any MEP points exist. */
  elecAudit(): ElecAudit | null;
  /**
   * Runs the designer's own exports one after another and catches each downloaded file instead of
   * saving it (every designer download is a blob URL on a clicked <a download>). A failed export is
   * reported and the rest go on.
   */
  exportFiles(keys: DesignerExportKey[], onStep?: (key: DesignerExportKey, index: number) => void): Promise<DesignerExportResult[]>;
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
export function createDesignerBridge(getApi: () => DesignerApi | undefined, getErrors: () => string[] = () => [], getDocument: () => Document | undefined = () => undefined): DesignerBridge {
  const api = () => { const value = getApi(); if (!value) throw new Error('Designer unavailable'); return value; };
  return {
    async ready() {
      const start = Date.now();
      while (true) {
        const missingFurniture = getErrors().find(message => message.includes('家具库缺少'));
        if (missingFurniture) throw new Error(missingFurniture);
        if (getApi()) break;
        if (Date.now() - start >= 20000) throw new Error('Designer loading timed out');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (this.checkApi().length) throw new Error('Designer API incompatible');
    },
    checkApi: () => REQUIRED_API.filter(key => {
      const value = getApi()?.[key];
      return value == null || (!['app', 'CAT'].includes(key) && typeof value !== 'function');
    }),
    readPlan() {
      const d = api();
      if (d.bld?.floors.length > 1) {
        const building = clone(d.bld);
        building.floors[building.cur].plan = clone(d.app.plan);
        return { ...building, version: 2, kind: 'building' } as BuildingPlan;
      }
      return clone(d.app.plan);
    },
    replacePlan: plan => api().replacePlan(clone(plan)),
    runChecks: () => api().runChecks().issues.map(issue => ({
      level: issue.level,
      code: issue.type,
      msg: issue.msg,
      ...(issue.targets ? { targets: issue.targets.map(target => ({ kind: target.kind, id: target.id })) } : {}),
      ...(typeof issue.at?.x === 'number' && typeof issue.at.y === 'number' && Number.isFinite(issue.at.x) && Number.isFinite(issue.at.y)
        ? { at: [issue.at.x, issue.at.y] as [number, number] } : {}),
    })),
    makeFurn: (...args) => api().makeFurn(...args),
    roomAreas: () => api().app.rooms.regions.map(region => ({ name: region.labels.map(label => label.name).join(' / '), area: region.area, ...(region.rects ? { rects: clone(region.rects) } : {}), at: [region.interior.x, region.interior.y] })),
    exportDxf: () => Uint8Array.from(api().dxfBytes('gb', 'layout')),
    shot2d() {
      const b = api().app.geo.bounds;
      return api().shot2d('layout', b.x + b.w / 2, b.y + b.h / 2, Math.min(1400 / b.w, 1000 / b.h));
    },
    fit2D: () => api().fit2D(),
    elecAudit: () => {
      const audit = auditElec(api());
      return audit.total.points ? audit : null;
    },
    exportFiles(keys, onStep) {
      const doc = getDocument();
      if (!doc) return Promise.reject(new Error('Designer unavailable'));
      return captureExports(doc, api, keys, onStep);
    },
    async autoElec() {
      const plan = api().app.plan as { elec?: unknown[] };
      if (plan.elec?.length) return 0;
      const doc = getDocument();
      const tab = (name: string) => doc?.querySelector<HTMLElement>(`[data-tab="${name}"]`);
      const previous = doc?.querySelector<HTMLElement>('[data-tab].on')?.dataset.tab ?? 'plan';
      tab('mep')?.click();
      await new Promise(resolve => setTimeout(resolve, 100));
      doc?.querySelector<HTMLElement>('#autoElec')?.click();
      await new Promise(resolve => setTimeout(resolve, 300));
      tab(previous)?.click();
      return (api().app.plan as { elec?: unknown[] }).elec?.length ?? 0;
    },
  };
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const isBlobLike = (value: unknown): value is Blob => !!value && typeof (value as Blob).size === 'number' && typeof (value as Blob).type === 'string' && typeof (value as Blob).arrayBuffer === 'function';

async function captureExports(doc: Document, api: () => DesignerApi, keys: DesignerExportKey[], onStep?: (key: DesignerExportKey, index: number) => void): Promise<DesignerExportResult[]> {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (!win) throw new Error('Designer unavailable');
  const blobs = new Map<string, Blob>();
  let waiting: ((file: { blob: Blob; fileName: string }) => void) | null = null;
  const createObjectURL = win.URL.createObjectURL;
  const anchorClick = win.HTMLAnchorElement.prototype.click;
  win.URL.createObjectURL = function (object: Blob | MediaSource) {
    const url = createObjectURL.call(win.URL, object);
    if (isBlobLike(object)) blobs.set(url, object);
    return url;
  };
  win.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = this.download ? blobs.get(this.href) : undefined;
    if (blob && waiting) { waiting({ blob, fileName: this.download }); return; }
    return anchorClick.call(this);
  };
  const press = (step: string | { text: string }) => {
    const element = typeof step === 'string'
      ? doc.querySelector<HTMLElement>(step)
      : Array.from(doc.querySelectorAll<HTMLElement>('button, [role=menuitem], a, li')).find(item => item.textContent?.replace(/\s+/g, ' ').trim().startsWith(step.text));
    if (!element) throw new Error(`设计器里没有找到 ${typeof step === 'string' ? step : step.text}`);
    element.click();
  };
  const run = async (steps: ExportStep[]) => {
    for (const step of steps) {
      if (typeof step === 'number') await sleep(step);
      else if (typeof step === 'object' && 'until' in step) {
        const start = Date.now();
        let pressed = start;
        while (!step.until(api() as DesignerApi & { S3?: { ready?: boolean } })) {
          if (Date.now() - start > 60000) throw new Error('等待 3D 视图超时');
          if (step.retry && Date.now() - pressed > 3000) { pressed = Date.now(); press(step.retry); }
          await sleep(100);
        }
      } else press(step);
    }
  };
  const escape = () => {
    for (const target of [doc, doc.body]) target?.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  };
  const results: DesignerExportResult[] = [];
  try {
    for (const [index, key] of keys.entries()) {
      const { name, steps, after, timeout } = DESIGNER_EXPORTS[key];
      onStep?.(key, index);
      try {
        const file = new Promise<{ blob: Blob; fileName: string }>((resolve, reject) => {
          const timer = setTimeout(() => { waiting = null; reject(new Error(`没有等到${name}（${Math.round(timeout / 1000)} 秒）`)); }, timeout);
          waiting = value => { clearTimeout(timer); waiting = null; resolve(value); };
        });
        file.catch(() => {});
        await run(steps);
        results.push({ key, name, ...(await file) });
      } catch (error) {
        waiting = null;
        results.push({ key, name, error: error instanceof Error ? error.message : String(error) });
      } finally {
        await run(after).catch(() => {});
        escape();
        await sleep(200);
      }
    }
  } finally {
    win.URL.createObjectURL = createObjectURL;
    win.HTMLAnchorElement.prototype.click = anchorClick;
  }
  return results;
}

export function cleanDesignerStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>, id: string) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && ['house-designer-v2-plan:', 'house-designer-v2-underlay:', 'house-designer-scheme:'].some(prefix => key.startsWith(prefix) && key !== prefix + id)) storage.removeItem(key);
  }
}
