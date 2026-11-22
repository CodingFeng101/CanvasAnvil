import { cadStore } from '../../storage';
import type { WorkspaceStore } from '@/shared/storage/indexed-db-store';
import { makeThumbnail } from '@/shared/works/thumbnail';
import { createPenStore } from '@/shared/pen-store';
import type { StreamPreview } from '../stream-plan';
import type { DesignerBridge } from '../../designer/designer-bridge';
import type { CadDesign, DesignIssue, HouseSpec, InternalPlan, Point, SinglePlan, SymbolRow } from './types';
import { applyElecPrefs, type ElecPrefs } from './elec-prefs';
import type { ElecAudit } from './elec-audit';
import { isBuilding } from './types';
import { getUiLanguage } from '@/shared/i18n';

/** A message the user may see, in the interface language. */
const say = (zh: string, en: string) => (getUiLanguage() === 'zh' ? zh : en);
import { validateSpec } from './spec-validate';
import { autofixSpec } from './spec-autofix';
import { nudgeFurniture } from './auto-nudge';
import { applyOps } from './plan-ops';
import type { PlanOp, OpsTouched } from './plan-ops';
import { isValidKey } from './catalog';
import { summarizePlan } from './plan-summary';
import { planToSpec, carryOver } from './plan-to-spec';
import { applySpecPatch, patchTouches, type SpecPatchOp } from './spec-patch';
import { reviseUntilClean, MAX_REVISE_ROUNDS } from './revise-loop';

type Underlays = { underlay?: CadDesign['underlay']; underlays?: CadDesign['underlays'] };
export type DesignerPreset = ({ plan: InternalPlan } | { spec: HouseSpec }) & Underlays;
/** The underlay fields of a design, for a preset. */
const underlaysOf = (design: Pick<CadDesign, 'underlay' | 'underlays'>): Underlays => ({ underlay: design.underlay, ...(design.underlays ? { underlays: design.underlays } : {}) });
export type DesignResult = { applied: number; errors: number; warnings: number; rounds: number; touched: OpsTouched };
export type MepRun = { placed: number; skipped?: 'manual' };
export type MepRepair = { rounds: number; fixed: number; problems: string[] };
type Elec = { kind: string; auto?: unknown };
// The designer keeps its cove strips in step with the ceilings itself; those are not hand edits.
const handElec = (plan: InternalPlan) => JSON.stringify(((plan as { elec?: Elec[] }).elec ?? []).filter(item => !item.auto));
/** The pen over the designer while a floor plan streams in: it draws each wall before the wall is in. */
export const designerPen = createPenStore();

/** What a preview step changes: a step may add only a door, a window or a piece of furniture. */
const planKey = (plan: SinglePlan) =>
  `${plan.walls.length}:${plan.rooms.length}:${plan.nodes.length}:${plan.openings.length}:${plan.furniture.length}`;
const boundsOf = (points: Point[]) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

type Snapshot = { design: CadDesign | null; issues: DesignIssue[]; audit: ElecAudit | null; busy: boolean; ready: boolean; canUndo: boolean; lastResult: DesignResult | null; previewing?: boolean };
type StoredDesign = { design: CadDesign | null; history: CadDesign[]; undoAI: CadDesign | null };
type Retry = (feedback: string, summary: string) => Promise<unknown>;
type Loader = (preset: DesignerPreset, recovering?: boolean) => Promise<DesignerBridge>;
const RECORD_KEY = 'cad-design-record';
const clone = <T,>(value: T): T => structuredClone(value);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 cad_spec 或 cad_ops JSON 对象');
  return value as Record<string, unknown>;
}

/** Per-version designer screenshots (small JPEGs), keyed by CadDesignSession.shotKey. */
const SHOTS_KEY = 'cad-version-shots';

export class CadDesignSession {
  private store: WorkspaceStore;
  private activate: () => void;
  private confirmReplace: () => boolean | Promise<boolean>;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { design: null, issues: [], audit: null, busy: false, ready: false, canUndo: false, lastResult: null };
  private history: CadDesign[] = [];
  private undo: CadDesign | null = null;
  /**
   * While a chat turn runs: the design it started from. A turn saves one
   * version, its final result; the drafts and self-check rounds on the way
   * are not versions of their own.
   */
  private turn: { base: CadDesign | null } | null = null;
  /** A floor plan streaming in: the latest walls waiting for the designer, and whether it is loading for them. */
  private preview: { latest: StreamPreview; loading: boolean; queued: number; shown: number; key: string } | null = null;
  private bridge?: DesignerBridge;
  private loader?: Loader;
  private hydration?: Promise<void>;
  private loading?: Promise<DesignerBridge>;
  private syncing?: Promise<CadDesign | null>;
  private writes = Promise.resolve();

  constructor(options: { store?: WorkspaceStore; activate?: () => void; confirmReplace?: () => boolean | Promise<boolean> } = {}) {
    this.store = options.store ?? cadStore;
    this.activate = options.activate ?? (() => {});
    this.confirmReplace = options.confirmReplace ?? (() => window.confirm(say('将覆盖你在设计器里的手动修改。继续吗？', 'Replace manual changes?')));
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(values: Partial<Snapshot>) {
    // The MEP audit follows the designer check: whenever the issues are refreshed, so is the audit.
    if ('issues' in values && !('audit' in values)) values = { ...values, audit: this.auditNow() };
    this.snapshot = { ...this.snapshot, ...values };
    this.listeners.forEach(listener => listener());
  }
  private auditNow(): ElecAudit | null {
    try { return this.bridge?.elecAudit() ?? null; } catch (error) { console.warn('[CAD] MEP audit failed', error); return null; }
  }
  hydrate(): Promise<void> {
    return this.hydration ??= (async () => {
      const record = await this.store.read<StoredDesign>(RECORD_KEY);
      if (record) {
        this.history = record.history.slice(-20);
        this.undo = record.undoAI;
        this.update({ design: record.design, canUndo: !!this.undo });
        return;
      }
      const [design, history] = await Promise.all([this.store.read<CadDesign>('cad-design'), this.store.read<CadDesign[]>('cad-design-history')]);
      this.history = (history ?? []).slice(-20);
      this.update({ design });
      if (design) await this.persist(design, this.history, null);
    })();
  }
  private async persist(design: CadDesign | null, history: CadDesign[], undoAI: CadDesign | null) {
    const record = clone({ design, history: history.slice(-20), undoAI });
    const write = this.writes.then(() => this.store.save(RECORD_KEY, record));
    this.writes = write.catch(() => {});
    await write;
    if (design) this.keepShotSoon(design);
  }
  /**
   * Every saved version gets the designer's picture of it, taken once the
   * designer has drawn it. Taken here rather than by the canvas, so a version
   * the next AI step replaces at once still has its picture in the history.
   */
  private keepShotSoon(design: CadDesign) {
    const plan = JSON.stringify(design.plan);
    setTimeout(() => {
      const bridge = this.bridge;
      if (!bridge) return;
      let shot: string | null = null;
      // Only while the designer still shows this version.
      try { if (JSON.stringify(bridge.readPlan()) === plan) shot = bridge.shot2d(); } catch { return; }
      if (!shot) return;
      void makeThumbnail(shot, 480).then((thumb) => (thumb ? this.saveShot(design, thumb) : undefined)).catch(() => {});
    }, 600);
  }
  setLoader(loader: Loader | undefined) { this.loader = loader; }
  /** The designer's 2D plan as an image, when the designer is open; for the work's preview in My works. */
  previewImage(): string | null {
    try { return this.bridge?.shot2d() ?? null; } catch { return null; }
  }
  /** Which saved picture belongs to a version. */
  static shotKey(design: CadDesign): string {
    return `${design.revision}:${design.updatedAt}`;
  }
  /** Keep the designer's picture of a version, so the history shows what it really looked like. */
  async saveShot(design: CadDesign, image: string) {
    const shots = (await this.store.read<Record<string, string>>(SHOTS_KEY).catch(() => null)) ?? {};
    shots[CadDesignSession.shotKey(design)] = image;
    // Only versions still in the history keep theirs.
    const keep = new Set(this.versions().map(CadDesignSession.shotKey));
    for (const key of Object.keys(shots)) if (!keep.has(key)) delete shots[key];
    await this.store.save(SHOTS_KEY, shots).catch(() => {});
  }
  async shots(): Promise<Record<string, string>> {
    return (await this.store.read<Record<string, string>>(SHOTS_KEY).catch(() => null)) ?? {};
  }
  private async load(preset: DesignerPreset, recovering = false): Promise<DesignerBridge> {
    this.activate();
    const start = Date.now();
    while (!this.loader) {
      if (Date.now() - start > 20000) throw new Error(say('设计器标签页加载超时', 'Designer tab loading timed out'));
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const bridge = await this.loader(preset, recovering);
    this.bridge = bridge;
    this.update({ ready: true, issues: bridge.runChecks() });
    return bridge;
  }
  async ensureReady(): Promise<DesignerBridge> {
    await this.hydrate();
    if (this.bridge) return this.bridge;
    if (!this.snapshot.design) throw new Error(say('请先生成户型', 'Generate a design first'));
    this.loading ??= (async () => {
      const current = this.snapshot.design!;
      try { return await this.load({ plan: current.plan, ...underlaysOf(current) }); }
      catch (reason) {
        const fallback = this.history.at(-1);
        if (!fallback) throw reason;
        const bridge = await this.load({ plan: fallback.plan, ...underlaysOf(fallback) }, true);
        const design: CadDesign = { ...clone(fallback), revision: current.revision + 1, status: 'draft', updatedAt: Date.now() };
        const history = this.history.slice(0, -1);
        await this.persist(design, history, null);
        this.history = history;
        this.undo = null;
        this.update({ design, canUndo: false, issues: bridge.runChecks() });
        return bridge;
      }
    })().finally(() => { this.loading = undefined; });
    return await this.loading;
  }
  detachBridge(bridge: DesignerBridge) {
    if (this.bridge !== bridge) return;
    if (!this.snapshot.busy) {
      let plan: InternalPlan | undefined;
      try { plan = bridge.readPlan(); } catch { /* iframe already gone; last sync stands */ }
      if (plan) void this.captureUserPlan(plan).catch(reason => console.error('[CAD designer] Save on unmount failed', reason));
    }
    this.bridge = undefined;
    this.update({ ready: false });
  }
  private async captureUserPlan(plan: InternalPlan) {
    const before = this.snapshot.design;
    if (!before || JSON.stringify(before.plan) === JSON.stringify(plan)) return;
    const mepManual = before.mepManual || handElec(before.plan) !== handElec(plan);
    // Within a chat turn the designer's own changes belong to the turn's result, not to the user.
    const design: CadDesign = { ...before, plan, mepManual, revision: before.revision + 1, lastSource: this.turn ? before.lastSource : 'user', status: 'draft', updatedAt: Date.now() };
    const history = this.historyWith(before);
    await this.persist(design, history, this.undo);
    this.history = history;
    this.update({ design });
  }
  /**
   * The first floor plan of a work, drawn into the designer while the model is
   * still writing it: the walls that have arrived so far, then more. Nothing is
   * saved; the finished plan replaces it as usual. Only while there is no design
   * yet, so nothing the user drew can be overwritten or taken for theirs.
   */
  async previewPlan(next: StreamPreview) {
    if (this.snapshot.design || this.snapshot.busy || !next.steps.length) return;
    if (this.preview) {
      this.preview.latest = next;
      if (this.preview.loading) return;
    } else {
      this.preview = { latest: next, loading: false, queued: 0, shown: 0, key: '' };
      this.update({ previewing: true });
    }
    const preview = this.preview;
    try {
      if (!this.bridge) {
        // The designer opens on the first step; the pen draws the rest.
        preview.loading = true;
        const first = preview.latest.steps[0].plan;
        await this.load({ plan: first });
        preview.loading = false;
        if (this.preview !== preview || this.snapshot.design) return;
        preview.queued = preview.shown = 1;
        preview.key = planKey(first);
      }
      // Each new step: the pen draws it, then it is in the plan.
      for (let index = preview.queued; index < preview.latest.steps.length; index++) {
        designerPen.trace({
          prepare: () => this.stepIntoView(index),
          points: () => this.stepOnScreen(index),
          done: () => this.showStep(index + 1),
        });
      }
      preview.queued = Math.max(preview.queued, preview.latest.steps.length);
      // Caught up: what came after the last step (the rooms' names) shows at once.
      if (preview.shown >= preview.latest.steps.length) this.showStep(preview.shown);
    } catch (reason) {
      preview.loading = false;
      console.warn('[CAD] Streaming preview failed', reason);
    }
  }
  /** The preview and its designer, while the preview still stands (no design yet, nothing applying). */
  private livePreview() {
    if (!this.preview || this.snapshot.design || this.snapshot.busy || !this.bridge) return null;
    return { preview: this.preview, bridge: this.bridge };
  }
  /** The plan with the first `count` steps in (all of them: the full plan). */
  private showStep(count: number) {
    const live = this.livePreview();
    if (!live) return designerPen.clear();
    const { preview, bridge } = live;
    preview.shown = Math.max(preview.shown, count);
    const { steps, full } = preview.latest;
    const plan = preview.shown >= steps.length ? full : steps[preview.shown - 1].plan;
    const key = planKey(plan);
    if (key === preview.key) return;
    preview.key = key;
    // Furniture as the designer makes it (type, height, colour), at the size the layout gave it.
    const furnished = plan.furniture.length ? {
      ...plan,
      furniture: plan.furniture.map(item => {
        try {
          const size = { ...(typeof item.w === 'number' ? { w: item.w } : {}), ...(typeof item.d === 'number' ? { d: item.d } : {}) };
          return bridge.makeFurn(item.key, item.x, item.y, Number(item.rot) || 0, size) as SinglePlan['furniture'][number];
        } catch { return item; }
      }),
    } : plan;
    try { bridge.replacePlan(furnished); } catch (reason) { console.warn('[CAD] Streaming preview failed', reason); }
    // Every step in and the rooms named: the whole plan, centred.
    if (preview.shown >= steps.length && plan.rooms.length && plan.nodes.length) void bridge.viewTo(boundsOf(plan.nodes.map(node => [node.x, node.y])), 420);
  }
  private stepOf(index: number) {
    const live = this.livePreview();
    const step = live?.preview.latest.steps[index];
    return live && step ? { bridge: live.bridge, step } : null;
  }
  /** Before the pen draws off the edge of the view, the view widens to take in the plan so far and the step. */
  private async stepIntoView(index: number) {
    const found = this.stepOf(index);
    if (!found) return;
    const { bridge, step } = found;
    if (step.outline.every(([x, y]) => bridge.inView(x, y))) return;
    await bridge.viewTo(boundsOf([...step.plan.nodes.map(node => [node.x, node.y] as Point), ...step.outline]));
  }
  private stepOnScreen(index: number) {
    const found = this.stepOf(index);
    if (!found) return null;
    const points = found.step.outline.map(([x, y]) => found.bridge.toScreen(x, y));
    return points.every(Boolean) ? points as Array<{ x: number; y: number }> : null;
  }
  /** The turn is over: a preview that never became a design is taken down again. */
  endPreview() {
    if (!this.preview) return;
    this.preview = null;
    designerPen.clear();
    if (!this.snapshot.design && this.bridge) {
      this.bridge = undefined;
      this.update({ ready: false, previewing: false, issues: [] });
    } else this.update({ previewing: false });
  }
  sync(): Promise<CadDesign | null> {
    return this.syncing ??= (async () => {
      await this.hydrate();
      if (this.bridge && !this.snapshot.busy) await this.captureUserPlan(this.bridge.readPlan());
      return this.snapshot.design;
    })().finally(() => { this.syncing = undefined; });
  }
  summary(): string {
    const design = this.snapshot.design;
    return design ? summarizePlan(design.plan, this.bridge?.roomAreas() ?? [], this.snapshot.issues) : '';
  }
  /** The current design as the designer's preset (plan and underlays), with what is still open for the delivery check. */
  async deliveryPreset(): Promise<{ preset: DesignerPreset; errors: string[]; warnings: string[]; audit: string[] } | null> {
    const design = await this.sync();
    if (!design) return null;
    const { issues, audit } = this.snapshot;
    return {
      preset: { plan: design.plan, ...underlaysOf(design) },
      errors: issues.filter(issue => issue.level === 'error').map(issue => issue.msg),
      warnings: issues.filter(issue => issue.level === 'warn').map(issue => issue.msg),
      audit: audit?.problems ?? [],
    };
  }
  /** The current design as a HouseSpec (spec-format.md): what cad_spec_patch paths point into. */
  spec(): string {
    const design = this.snapshot.design;
    return design ? JSON.stringify(planToSpec(design.plan, this.specOptions()), (_, value) => typeof value === 'number' ? Math.round(value * 10) / 10 : value) : '';
  }
  /** Default furniture colours come from the designer, so the export leaves them out as a hand-written spec would. */
  private specOptions() {
    const bridge = this.bridge;
    return bridge ? { defaults: (key: string) => bridge.makeFurn(key, 0, 0, 0) as { color?: unknown } } : {};
  }
  async recheck(): Promise<DesignIssue[]> {
    await this.sync();
    const bridge = await this.ensureReady();
    const issues = bridge.runChecks();
    this.update({ issues });
    return issues;
  }
  async confirm() {
    await this.sync();
    if (this.snapshot.busy) throw new Error(say('设计器正在更新', 'Designer is updating'));
    this.update({ busy: true });
    try {
      const bridge = await this.ensureReady();
      const issues = bridge.runChecks();
      this.update({ issues });
      if (issues.some(issue => issue.level === 'error')) throw new Error(say('请先解决全部错误', 'Resolve all errors first'));
      const current = this.snapshot.design!;
      const design: CadDesign = { ...current, status: 'confirmed', updatedAt: Date.now() };
      await this.persist(design, this.history, this.undo);
      this.update({ design });
    } finally { this.update({ busy: false }); }
  }
  /** A chat turn starts: whatever it changes becomes one version on top of the design as it is now. */
  async beginTurn() {
    await this.sync().catch(() => null);
    this.turn = { base: this.snapshot.design };
  }
  endTurn() {
    this.turn = null;
  }
  /**
   * The history once `before` is replaced. Within a turn only the design the
   * turn started from goes in, once; outside one, `before` itself.
   */
  private historyWith(before: CadDesign | null): CadDesign[] {
    if (!this.turn) return before ? [...this.history, before].slice(-20) : this.history;
    const base = this.turn.base;
    if (!base || this.history.at(-1) === base) return this.history;
    return [...this.history, base].slice(-20);
  }
  /** What undoing the AI goes back to: the design the turn started from, within a turn. */
  private undoTo(before: CadDesign | null): CadDesign | null {
    return this.turn ? this.turn.base : before;
  }
  /** Saved versions, oldest first; the last one is the current design. */
  versions(): CadDesign[] {
    const current = this.snapshot.design;
    return current ? [...this.history, current] : [...this.history];
  }
  /**
   * The design as it was at an earlier point of the conversation (a message was edited or retried):
   * the version with that key, or (null) no design at all, before the first floorplan. What is
   * replaced goes into the history, so the version list can still bring it back.
   */
  async rewindTo(key: string | null) {
    await this.hydrate();
    await this.sync().catch(() => null);
    if (this.snapshot.busy) return;
    const current = this.snapshot.design;
    if (key === null) {
      if (!current) return;
      const history = [...this.history, current].slice(-20);
      await this.persist(null, history, null);
      this.history = history;
      this.undo = null;
      // The designer frame takes itself down once there is no design.
      this.bridge = undefined;
      this.update({ design: null, issues: [], audit: null, canUndo: false, lastResult: null, ready: false });
      return;
    }
    if (current && CadDesignSession.shotKey(current) === key) return;
    const index = this.history.findIndex(design => CadDesignSession.shotKey(design) === key);
    if (index < 0) return;
    if (current) return await this.restoreVersion(index);
    const restored: CadDesign = { ...clone(this.history[index]), status: 'draft', updatedAt: Date.now() };
    await this.persist(restored, this.history, null);
    this.update({ design: restored, canUndo: false, lastResult: null });
    await this.ensureReady();
  }
  /** Bring back an earlier version; the current one goes into the history, so this can be reversed too. */
  async restoreVersion(index: number) {
    await this.sync();
    const target = this.history[index];
    if (!target || !this.snapshot.design || this.snapshot.busy) return;
    this.update({ busy: true });
    const before = this.snapshot.design;
    try {
      const bridge = await this.ensureReady();
      const restored: CadDesign = { ...clone(target), revision: before.revision + 1, status: 'draft', updatedAt: Date.now() };
      bridge.replacePlan(restored.plan);
      const history = [...this.history, before].slice(-20);
      const issues = bridge.runChecks();
      await this.persist(restored, history, null);
      this.history = history;
      this.undo = null;
      this.update({ design: restored, issues, canUndo: false, lastResult: null });
    } catch (reason) {
      this.bridge?.replacePlan(before.plan);
      throw reason;
    } finally { this.update({ busy: false }); }
  }
  /**
   * Let the designer lay out MEP itself: once there is furniture but no MEP yet, or again after the
   * walls, openings or furniture changed (relayout). Points edited by hand are kept unless forced.
   */
  async autoMep(options: { relayout?: boolean; force?: boolean } = {}): Promise<MepRun> {
    const design = this.snapshot.design;
    if (!design || !this.bridge || this.snapshot.busy || isBuilding(design.plan)) return { placed: 0 };
    const plan = design.plan as { furniture?: unknown[]; elec?: unknown[] };
    if (!plan.furniture?.length) return { placed: 0 };
    if (plan.elec?.length) {
      if (!options.relayout && !options.force) return { placed: 0 };
      if (design.mepManual && !options.force) return { placed: 0, skipped: 'manual' };
      this.bridge.replacePlan({ ...design.plan, elec: [] } as InternalPlan);
    }
    const placed = await this.bridge.autoElec();
    if (!placed) { this.bridge.replacePlan(design.plan); return { placed: 0 }; }
    const next: CadDesign = { ...design, plan: this.bridge.readPlan(), mepManual: false, updatedAt: Date.now() };
    await this.persist(next, this.history, this.undo);
    this.update({ design: next, issues: this.bridge.runChecks() });
    return { placed };
  }
  /**
   * Fix what the room-by-room MEP audit finds: the model answers with MEP operations (add_elec /
   * move_elec / link_elec / remove of a point), a round is kept only when it leaves fewer problems,
   * and rounds go on until nothing is left or a round fixes nothing (the cap only guards a runaway).
   */
  async repairMep(ask: (problems: string[], summary: string) => Promise<unknown>, maxRounds = 8): Promise<MepRepair> {
    const design = this.snapshot.design;
    const audit = this.auditNow();
    const result: MepRepair = { rounds: 0, fixed: 0, problems: audit?.problems ?? [] };
    if (!design || !this.bridge || this.snapshot.busy || isBuilding(design.plan) || !result.problems.length) return result;
    const bridge = this.bridge;
    this.update({ busy: true });
    let current = design;
    try {
      for (let round = 0; round < maxRounds && result.problems.length; round++) {
        result.rounds++;
        const answer = object(await ask(result.problems, summarizePlan(current.plan, bridge.roomAreas(), this.snapshot.issues)));
        if (answer.type !== 'cad_ops' || !Array.isArray(answer.ops)) break;
        const ops = (answer.ops as PlanOp[]).filter(item => ['add_elec', 'move_elec', 'link_elec', 'remove'].includes(String(item?.op)));
        const applied = applyOps(current.plan, ops, { makeFurn: bridge.makeFurn, isValidKey });
        if (!applied.applied || applied.touched.layout) break;
        bridge.replacePlan(applied.plan);
        const left = this.auditNow()?.problems ?? [];
        if (left.length >= result.problems.length) { bridge.replacePlan(current.plan); break; }
        result.fixed += result.problems.length - left.length;
        result.problems = left;
        current = { ...current, plan: bridge.readPlan(), updatedAt: Date.now() };
      }
      if (current !== design) {
        await this.persist(current, this.history, this.undo);
        this.update({ design: current, issues: bridge.runChecks() });
      }
      return result;
    } catch (reason) {
      bridge.replacePlan(current.plan);
      throw reason;
    } finally { this.update({ busy: false }); }
  }
  /** The user's wiring preferences on top of the designer's MEP layout; returns what was changed, as sentences. */
  async applyElecPrefs(prefs: ElecPrefs): Promise<string[]> {
    const design = this.snapshot.design;
    if (!design || !this.bridge || this.snapshot.busy || isBuilding(design.plan)) return [];
    const result = applyElecPrefs(design.plan as SinglePlan, this.bridge.roomAreas(), prefs);
    if (!result.changed) return result.notes;
    this.bridge.replacePlan(result.plan);
    const next: CadDesign = { ...design, plan: this.bridge.readPlan(), updatedAt: Date.now() };
    await this.persist(next, this.history, this.undo);
    this.update({ design: next, issues: this.bridge.runChecks() });
    return result.notes;
  }
  /** Record more of how the uploaded drawing was read (the user's answers to the 待确认清单…) on the current design. */
  async noteRecognition(update: Partial<NonNullable<CadDesign['recognition']>>) {
    const design = this.snapshot.design;
    if (!design?.recognition) return;
    const next: CadDesign = { ...design, recognition: { ...design.recognition, ...update } };
    await this.persist(next, this.history, this.undo);
    this.update({ design: next });
  }
  /** Loads a recognized floorplan draft (walls + openings) with the original image as underlay (one per floor for a building). */
  async loadDraft(spec: HouseSpec, underlay?: CadDesign['underlay'], extra: { underlays?: CadDesign['underlays']; recognition?: CadDesign['recognition'] } = {}) {
    const before = await this.sync();
    if (this.snapshot.busy) throw new Error(say('请等待户型更新结束', 'Wait for design updates'));
    if (before?.lastSource === 'user' && !await this.confirmReplace()) throw new Error(say('已取消', 'Cancelled'));
    this.update({ busy: true });
    try {
      const bridge = await this.load({ spec, underlay, ...(extra.underlays ? { underlays: extra.underlays } : {}) });
      const design: CadDesign = {
        plan: bridge.readPlan(), underlay, ...(extra.underlays ? { underlays: extra.underlays } : {}), ...(extra.recognition ? { recognition: extra.recognition } : {}),
        revision: (before?.revision ?? 0) + 1, status: 'draft', lastSource: 'recognize', updatedAt: Date.now(),
      };
      const history = this.historyWith(before);
      const undo = this.undoTo(before);
      await this.persist(design, history, undo);
      this.history = history;
      this.undo = undo;
      this.update({ design, issues: bridge.runChecks(), canUndo: !!undo });
      return design;
    } finally { this.update({ busy: false }); }
  }
  async clear() {
    await this.sync();
    if (this.snapshot.busy) throw new Error(say('请等待户型更新结束', 'Wait for design updates'));
    this.update({ busy: true });
    try {
      await this.persist(null, [], null);
      await Promise.all([this.store.clear('cad-design'), this.store.clear('cad-design-history')]);
      this.history = [];
      this.undo = null;
      this.bridge = undefined;
      this.update({ design: null, issues: [], audit: null, ready: false, canUndo: false, lastResult: null });
    } finally { this.update({ busy: false }); }
  }
  async applyModelOutput(input: unknown, retry?: Retry, options: { signal?: AbortSignal; allowReplace?: boolean; initialRepairRounds?: number } = {}): Promise<DesignResult> {
    await this.sync();
    if (this.snapshot.design && !this.bridge) { await this.ensureReady(); await this.sync(); }
    if (this.snapshot.busy) throw new Error(say('已有户型更新正在执行', 'A design update is already running'));
    const before = clone(this.snapshot.design);
    const checkAbort = () => { options.signal?.throwIfAborted(); };
    checkAbort();
    this.update({ busy: true });
    let applied = 0;
    const touched: OpsTouched = { layout: false, elec: false, finish: false, look: false, relayoutElec: false };
    let validationRounds = Math.max(0, Math.min(3, options.initialRepairRounds ?? 0));
    let reloaded = false;
    const validatedSpec = async (value: unknown): Promise<HouseSpec> => {
      let spec = value;
      while (true) {
        let issues = validateSpec(spec);
        if (!issues.some(issue => issue.code === 'schema')) {
          spec = autofixSpec(spec as HouseSpec);
          issues = validateSpec(spec);
        }
        const errors = issues.filter(issue => issue.level === 'error');
        if (!errors.length) return spec as HouseSpec;
        const feedback = JSON.stringify({ issues: errors, spec });
        if (!retry || validationRounds >= 3) throw new Error(feedback);
        const previousCount = errors.length;
        checkAbort();
        const corrected = object(await retry(feedback, '尚无可加载的户型。请返回修正后的 cad_spec。 / Return a corrected cad_spec.'));
        checkAbort();
        if (corrected.type !== 'cad_spec') throw new Error(say('校验修复必须返回 cad_spec', 'Validation repair requires cad_spec'));
        spec = corrected.spec;
        validationRounds++;
        const nextErrors = validateSpec(spec).filter(issue => issue.level === 'error');
        if (nextErrors.length >= previousCount) throw new Error(JSON.stringify(nextErrors));
      }
    };
    const applyOperations = async (value: unknown, current: CadDesign, allowRetry: boolean): Promise<CadDesign> => {
      if (!Array.isArray(value)) throw new Error(say('cad_ops.ops 必须是数组', 'cad_ops.ops must be an array'));
      const bridge = await this.ensureReady();
      let result = applyOps(current.plan, value as PlanOp[], { makeFurn: bridge.makeFurn, isValidKey });
      if (result.rejected.length && allowRetry && retry) {
        checkAbort();
        const corrected = object(await retry(JSON.stringify(result.rejected), summarizePlan(current.plan, bridge.roomAreas(), this.snapshot.issues)));
        checkAbort();
        if (corrected.type !== 'cad_ops' || !Array.isArray(corrected.ops)) throw new Error(say('操作重试必须返回 cad_ops', 'Operation retry requires cad_ops'));
        result = applyOps(current.plan, corrected.ops as PlanOp[], { makeFurn: bridge.makeFurn, isValidKey });
      }
      if (result.rejected.length) throw new Error(JSON.stringify(result.rejected));
      checkAbort();
      applied += result.applied;
      for (const key of Object.keys(touched) as Array<keyof OpsTouched>) touched[key] ||= result.touched[key];
      bridge.replacePlan(result.plan);
      return { ...current, plan: bridge.readPlan(), revision: current.revision + 1, status: 'draft', lastSource: 'ai', updatedAt: Date.now() };
    };
    // Errors a patch adds on top of what the current design already has (an older design may carry some).
    const newErrors = (spec: HouseSpec, base: HouseSpec) => {
      const errorsOf = (value: HouseSpec) => {
        const floors = (value as { floors?: HouseSpec[] }).floors;
        return (Array.isArray(floors) ? floors.flatMap((floor, at) => validateSpec(floor).map(issue => ({ ...issue, msg: `floors[${at}].${issue.msg}` }))) : validateSpec(value))
          .filter(issue => issue.level === 'error');
      };
      const known = new Set(errorsOf(base).map(issue => issue.msg));
      return errorsOf(spec).filter(issue => !known.has(issue.msg));
    };
    /** cad_spec_patch: export the design as a HouseSpec, patch it, load it into the designer again. */
    const applyPatch = async (value: unknown, current: CadDesign, allowRetry: boolean): Promise<CadDesign> => {
      let ops = value as SpecPatchOp[];
      const base = planToSpec(current.plan, this.specOptions());
      const attempt = (list: SpecPatchOp[]) => {
        const next = applySpecPatch(base, list);
        const errors = newErrors(next, base);
        if (errors.length) throw new Error(JSON.stringify(errors));
        return next;
      };
      let next: HouseSpec;
      try { next = attempt(ops); }
      catch (reason) {
        if (!allowRetry || !retry) throw reason;
        checkAbort();
        const corrected = object(await retry(JSON.stringify({ patchError: reason instanceof Error ? reason.message : String(reason), patch: ops }), JSON.stringify(base)));
        checkAbort();
        if (corrected.type !== 'cad_spec_patch' || !Array.isArray(corrected.patch)) throw new Error(say('补丁重试必须返回 cad_spec_patch', 'Patch retry requires cad_spec_patch'));
        ops = corrected.patch as SpecPatchOp[];
        next = attempt(ops);
      }
      checkAbort();
      const scope = patchTouches(ops);
      for (const key of Object.keys(touched) as Array<keyof OpsTouched>) touched[key] ||= scope[key];
      reloaded = true;
      const bridge = await this.load({ spec: next, ...underlaysOf(current) });
      bridge.replacePlan(carryOver(current.plan, bridge.readPlan(), { comments: !scope.comments }));
      applied += ops.length;
      return { ...current, plan: bridge.readPlan(), revision: current.revision + 1, status: 'draft', lastSource: 'ai', updatedAt: Date.now() };
    };
    try {
      const payload = object(input);
      let candidate: CadDesign;
      if (payload.type === 'cad_spec') {
        if (before) {
          if (payload.replace !== true || !options.allowReplace) throw new Error(say('已有户型请输出 cad_ops，整体重画需用户明确要求', 'Existing designs require cad_ops or explicit redraw approval'));
          if (before.lastSource === 'user' && !await this.confirmReplace()) throw new Error(say('已取消整体重画', 'Redraw cancelled'));
        }
        const spec = await validatedSpec(payload.spec);
        checkAbort();
        reloaded = true;
        // Completing a recognized draft keeps the original drawing under it, and what was read from it.
        const kept: Partial<CadDesign> = before?.recognition ? { ...underlaysOf(before), recognition: before.recognition } : {};
        const bridge = await this.load({ spec, ...kept });
        checkAbort();
        candidate = { plan: bridge.readPlan(), ...kept, revision: (before?.revision ?? 0) + 1, status: 'draft', lastSource: 'ai', updatedAt: Date.now() };
        applied = 1;
        touched.layout = true;
      } else if (payload.type === 'cad_ops') {
        if (!before) throw new Error(say('尚无户型，请先生成 cad_spec', 'Generate cad_spec first'));
        if (isBuilding(before.plan)) throw new Error(say('多层户型请用 cad_spec_patch 修改（路径 /floors/层号/...）', 'Use cad_spec_patch for multi-floor designs'));
        candidate = await applyOperations(payload.ops, before, true);
      } else if (payload.type === 'cad_spec_patch') {
        if (!before) throw new Error(say('尚无户型，请先生成 cad_spec', 'Generate cad_spec first'));
        if (!Array.isArray(payload.patch)) throw new Error(say('cad_spec_patch.patch 必须是数组', 'patch must be an array'));
        candidate = await applyPatch(payload.patch, before, true);
      } else throw new Error(say('需要 cad_spec、cad_ops 或 cad_spec_patch', 'Expected cad_spec, cad_ops or cad_spec_patch'));
      // Read the bridge each time: a repair round answered with cad_spec_patch reloads the designer into a
      // new iframe, and a bridge kept from before then points at the removed one ("Designer unavailable").
      const live = () => { if (!this.bridge) throw new Error('Designer unavailable'); return this.bridge; };
      // Shift furniture stuck a few cm into walls, curtains or neighbours before (and after) asking the model.
      const nudge = (design: CadDesign): CadDesign => {
        if (isBuilding(design.plan)) return design;
        const result = nudgeFurniture(design.plan, plan => { live().replacePlan(plan); return live().runChecks(); });
        live().replacePlan(result.plan);
        return result.moved ? { ...design, plan: live().readPlan() } : design;
      };
      candidate = nudge(candidate);
      this.update({ design: candidate });
      const revised = await reviseUntilClean({
        initial: candidate,
        maxRounds: retry ? MAX_REVISE_ROUNDS - validationRounds : 0,
        issuesOf: async plan => { checkAbort(); live().replacePlan(plan); return live().runChecks(); },
        askModel: async (issues, summary, missed) => {
          checkAbort();
          const note = missed
            ? '上一轮的修改没有减少错误，已撤回。这次换一种改法：换个位置、缩小尺寸、换更小的型号，实在放不下就删掉这件。警告可以接受，只要把错误修掉。'
            : '只需修掉这些错误；警告可以接受，不必为了它们改动别处。';
          const correction = object(await retry!(JSON.stringify({ issues, note, requestedChanges: payload.type === 'cad_ops' ? payload.ops : payload.type === 'cad_spec_patch' ? payload.patch : undefined }), summary));
          checkAbort();
          if (correction.type === 'cad_spec_patch' && Array.isArray(correction.patch)) return { patch: correction.patch };
          if (correction.type !== 'cad_ops' || !Array.isArray(correction.ops)) throw new Error(say('设计器修复必须返回 cad_ops 或 cad_spec_patch', 'Designer repair requires cad_ops or cad_spec_patch'));
          return correction.ops as PlanOp[];
        },
        apply: async (output, current) => !Array.isArray(output) && 'patch' in output
          ? await applyPatch(output.patch, current, true)
          : await applyOperations(output, current, true),
      });
      checkAbort();
      if (revised.issues.some(issue => issue.level === 'error')) {
        revised.design = nudge(revised.design);
        revised.issues = live().runChecks();
      }
      // Points the user asked for by hand stay through later layout edits; a full relayout starts over.
      if (touched.elec && !touched.relayoutElec) revised.design = { ...revised.design, mepManual: true };
      // The 「图上符号 → 建模」 list and what is still to be confirmed, listed again at delivery.
      const symbols = Array.isArray(payload.symbols) ? (payload.symbols as unknown[]).filter((row): row is SymbolRow => !!row && typeof row === 'object' && typeof (row as SymbolRow).symbol === 'string') : null;
      const confirm = Array.isArray(payload.confirm) ? (payload.confirm as unknown[]).map(String).filter(Boolean) : null;
      if (payload.type === 'cad_spec' && revised.design.recognition && !revised.design.recognition.completed) {
        revised.design = { ...revised.design, recognition: { ...revised.design.recognition, completed: true, ...(symbols ? { symbols } : {}), ...(confirm ? { confirm } : {}) } };
      } else if ((symbols || confirm) && revised.design.recognition) {
        revised.design = { ...revised.design, recognition: { ...revised.design.recognition, ...(symbols ? { symbols } : {}), ...(confirm ? { confirm } : {}) } };
      }
      const history = this.historyWith(before);
      const undo = this.undoTo(before);
      await this.persist(revised.design, history, undo);
      this.history = history;
      this.undo = undo;
      const result = { applied, errors: revised.issues.filter(issue => issue.level === 'error').length, warnings: revised.issues.filter(issue => issue.level === 'warn').length, rounds: validationRounds + revised.rounds, touched };
      this.update({ design: revised.design, issues: revised.issues, lastResult: result, canUndo: !!undo });
      return result;
    } catch (reason) {
      if (before) {
        if (reloaded) {
          this.bridge = undefined;
          try { await this.load({ plan: before.plan, ...underlaysOf(before) }, true); }
          catch (recoveryError) { console.error('[CAD designer] Previous design reload failed', recoveryError); }
        } else if (this.bridge) this.bridge.replacePlan(before.plan);
      }
      if (!before) this.bridge = undefined;
      this.update({ design: before, ready: !!this.bridge });
      throw reason;
    } finally { this.update({ busy: false }); }
  }
}
