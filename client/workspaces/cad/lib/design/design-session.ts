import { cadStore } from '../../storage';
import type { WorkspaceStore } from '@/shared/storage/indexed-db-store';
import type { DesignerBridge } from '../../designer/designer-bridge';
import type { CadDesign, DesignIssue, HouseSpec, InternalPlan, SinglePlan, SymbolRow } from './types';
import { applyElecPrefs, type ElecPrefs } from './elec-prefs';
import type { ElecAudit } from './elec-audit';
import { isBuilding } from './types';
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
type Snapshot = { design: CadDesign | null; issues: DesignIssue[]; audit: ElecAudit | null; busy: boolean; ready: boolean; canUndo: boolean; lastResult: DesignResult | null };
type StoredDesign = { design: CadDesign | null; history: CadDesign[]; undoAI: CadDesign | null };
type Retry = (feedback: string, summary: string) => Promise<unknown>;
type Loader = (preset: DesignerPreset, recovering?: boolean) => Promise<DesignerBridge>;
const RECORD_KEY = 'cad-design-record';
const clone = <T,>(value: T): T => structuredClone(value);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 cad_spec 或 cad_ops JSON 对象');
  return value as Record<string, unknown>;
}

export class CadDesignSession {
  private store: WorkspaceStore;
  private activate: () => void;
  private confirmReplace: () => boolean | Promise<boolean>;
  private listeners = new Set<() => void>();
  private snapshot: Snapshot = { design: null, issues: [], audit: null, busy: false, ready: false, canUndo: false, lastResult: null };
  private history: CadDesign[] = [];
  private undo: CadDesign | null = null;
  private bridge?: DesignerBridge;
  private loader?: Loader;
  private hydration?: Promise<void>;
  private loading?: Promise<DesignerBridge>;
  private syncing?: Promise<CadDesign | null>;
  private writes = Promise.resolve();

  constructor(options: { store?: WorkspaceStore; activate?: () => void; confirmReplace?: () => boolean | Promise<boolean> } = {}) {
    this.store = options.store ?? cadStore;
    this.activate = options.activate ?? (() => {});
    this.confirmReplace = options.confirmReplace ?? (() => window.confirm('将覆盖你在设计器里的手动修改。继续吗？ / Replace manual changes?'));
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
  }
  setLoader(loader: Loader | undefined) { this.loader = loader; }
  private async load(preset: DesignerPreset, recovering = false): Promise<DesignerBridge> {
    this.activate();
    const start = Date.now();
    while (!this.loader) {
      if (Date.now() - start > 20000) throw new Error('设计器标签页加载超时 / Designer tab loading timed out');
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
    if (!this.snapshot.design) throw new Error('请先生成户型 / Generate a design first');
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
    const design: CadDesign = { ...before, plan, mepManual, revision: before.revision + 1, lastSource: 'user', status: 'draft', updatedAt: Date.now() };
    const history = [...this.history, before].slice(-20);
    await this.persist(design, history, this.undo);
    this.history = history;
    this.update({ design });
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
    if (this.snapshot.busy) throw new Error('设计器正在更新 / Designer is updating');
    this.update({ busy: true });
    try {
      const bridge = await this.ensureReady();
      const issues = bridge.runChecks();
      this.update({ issues });
      if (issues.some(issue => issue.level === 'error')) throw new Error('请先解决全部错误 / Resolve all errors first');
      const current = this.snapshot.design!;
      const design: CadDesign = { ...current, status: 'confirmed', updatedAt: Date.now() };
      await this.persist(design, this.history, this.undo);
      this.update({ design });
    } finally { this.update({ busy: false }); }
  }
  /** Saved versions, oldest first; the last one is the current design. */
  versions(): CadDesign[] {
    const current = this.snapshot.design;
    return current ? [...this.history, current] : [...this.history];
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
    if (this.snapshot.busy) throw new Error('请等待户型更新结束 / Wait for design updates');
    if (before?.lastSource === 'user' && !await this.confirmReplace()) throw new Error('已取消 / Cancelled');
    this.update({ busy: true });
    try {
      const bridge = await this.load({ spec, underlay, ...(extra.underlays ? { underlays: extra.underlays } : {}) });
      const design: CadDesign = {
        plan: bridge.readPlan(), underlay, ...(extra.underlays ? { underlays: extra.underlays } : {}), ...(extra.recognition ? { recognition: extra.recognition } : {}),
        revision: (before?.revision ?? 0) + 1, status: 'draft', lastSource: 'recognize', updatedAt: Date.now(),
      };
      const history = before ? [...this.history, before].slice(-20) : this.history;
      await this.persist(design, history, before);
      this.history = history;
      this.undo = before;
      this.update({ design, issues: bridge.runChecks(), canUndo: !!before });
      return design;
    } finally { this.update({ busy: false }); }
  }
  async clear() {
    await this.sync();
    if (this.snapshot.busy) throw new Error('请等待户型更新结束 / Wait for design updates');
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
    if (this.snapshot.busy) throw new Error('已有户型更新正在执行 / A design update is already running');
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
        if (corrected.type !== 'cad_spec') throw new Error('校验修复必须返回 cad_spec / Validation repair requires cad_spec');
        spec = corrected.spec;
        validationRounds++;
        const nextErrors = validateSpec(spec).filter(issue => issue.level === 'error');
        if (nextErrors.length >= previousCount) throw new Error(JSON.stringify(nextErrors));
      }
    };
    const applyOperations = async (value: unknown, current: CadDesign, allowRetry: boolean): Promise<CadDesign> => {
      if (!Array.isArray(value)) throw new Error('cad_ops.ops 必须是数组 / cad_ops.ops must be an array');
      const bridge = await this.ensureReady();
      let result = applyOps(current.plan, value as PlanOp[], { makeFurn: bridge.makeFurn, isValidKey });
      if (result.rejected.length && allowRetry && retry) {
        checkAbort();
        const corrected = object(await retry(JSON.stringify(result.rejected), summarizePlan(current.plan, bridge.roomAreas(), this.snapshot.issues)));
        checkAbort();
        if (corrected.type !== 'cad_ops' || !Array.isArray(corrected.ops)) throw new Error('操作重试必须返回 cad_ops / Operation retry requires cad_ops');
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
        if (corrected.type !== 'cad_spec_patch' || !Array.isArray(corrected.patch)) throw new Error('补丁重试必须返回 cad_spec_patch / Patch retry requires cad_spec_patch');
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
          if (payload.replace !== true || !options.allowReplace) throw new Error('已有户型请输出 cad_ops，整体重画需用户明确要求 / Existing designs require cad_ops or explicit redraw approval');
          if (before.lastSource === 'user' && !await this.confirmReplace()) throw new Error('已取消整体重画 / Redraw cancelled');
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
        if (!before) throw new Error('尚无户型，请先生成 cad_spec / Generate cad_spec first');
        if (isBuilding(before.plan)) throw new Error('多层户型请用 cad_spec_patch 修改（路径 /floors/层号/...）/ Use cad_spec_patch for multi-floor designs');
        candidate = await applyOperations(payload.ops, before, true);
      } else if (payload.type === 'cad_spec_patch') {
        if (!before) throw new Error('尚无户型，请先生成 cad_spec / Generate cad_spec first');
        if (!Array.isArray(payload.patch)) throw new Error('cad_spec_patch.patch 必须是数组 / patch must be an array');
        candidate = await applyPatch(payload.patch, before, true);
      } else throw new Error('需要 cad_spec、cad_ops 或 cad_spec_patch / Expected cad_spec, cad_ops or cad_spec_patch');
      const bridge = this.bridge!;
      // Shift furniture stuck a few cm into walls, curtains or neighbours before (and after) asking the model.
      const nudge = (design: CadDesign): CadDesign => {
        if (isBuilding(design.plan)) return design;
        const result = nudgeFurniture(design.plan, plan => { bridge.replacePlan(plan); return bridge.runChecks(); });
        bridge.replacePlan(result.plan);
        return result.moved ? { ...design, plan: bridge.readPlan() } : design;
      };
      candidate = nudge(candidate);
      this.update({ design: candidate });
      const revised = await reviseUntilClean({
        initial: candidate,
        maxRounds: retry ? MAX_REVISE_ROUNDS - validationRounds : 0,
        issuesOf: async plan => { checkAbort(); bridge.replacePlan(plan); return bridge.runChecks(); },
        askModel: async (issues, summary) => {
          checkAbort();
          const correction = object(await retry!(JSON.stringify({ issues, requestedChanges: payload.type === 'cad_ops' ? payload.ops : payload.type === 'cad_spec_patch' ? payload.patch : undefined }), summary));
          checkAbort();
          if (correction.type === 'cad_spec_patch' && Array.isArray(correction.patch)) return { patch: correction.patch };
          if (correction.type !== 'cad_ops' || !Array.isArray(correction.ops)) throw new Error('设计器修复必须返回 cad_ops 或 cad_spec_patch / Designer repair requires cad_ops or cad_spec_patch');
          return correction.ops as PlanOp[];
        },
        apply: async (output, current) => !Array.isArray(output) && 'patch' in output
          ? await applyPatch(output.patch, current, true)
          : await applyOperations(output, current, true),
      });
      checkAbort();
      if (revised.issues.some(issue => issue.level === 'error')) {
        revised.design = nudge(revised.design);
        revised.issues = bridge.runChecks();
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
      const history = before ? [...this.history, before].slice(-20) : this.history;
      await this.persist(revised.design, history, before);
      this.history = history;
      this.undo = before;
      const result = { applied, errors: revised.issues.filter(issue => issue.level === 'error').length, warnings: revised.issues.filter(issue => issue.level === 'warn').length, rounds: validationRounds + revised.rounds, touched };
      this.update({ design: revised.design, issues: revised.issues, lastResult: result, canUndo: !!before });
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
