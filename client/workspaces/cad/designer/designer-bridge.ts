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
export function cleanDesignerStorage(storage: Pick<Storage, 'length' | 'key' | 'removeItem'>, id: string) {
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key && ['house-designer-v2-plan:', 'house-designer-v2-underlay:', 'house-designer-scheme:'].some(prefix => key.startsWith(prefix) && key !== prefix + id)) storage.removeItem(key);
  }
}
