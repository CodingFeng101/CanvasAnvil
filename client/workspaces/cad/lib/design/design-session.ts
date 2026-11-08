import { cadStore } from '../../storage';
import type { WorkspaceStore } from '@/shared/storage/indexed-db-store';
import type { DesignerBridge } from '../../designer/designer-bridge';
import type { CadDesign, DesignIssue, HouseSpec, InternalPlan, SinglePlan } from './types';
import { applyElecPrefs, type ElecPrefs } from './elec-prefs';
import type { ElecAudit } from './elec-audit';
import { isBuilding } from './types';
import { validateSpec } from './spec-validate';
import { autofixSpec } from './spec-autofix';
import { nudgeFurniture } from './auto-nudge';
import { applyOps } from './plan-ops';
import type { PlanOp } from './plan-ops';
import { isValidKey } from './catalog';
import { summarizePlan } from './plan-summary';
import { reviseUntilClean } from './revise-loop';

export type DesignerPreset = { plan: InternalPlan; underlay?: CadDesign['underlay'] } | { spec: HouseSpec; underlay?: CadDesign['underlay'] };
export type DesignResult = { applied: number; errors: number; warnings: number; rounds: number };
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
      try { return await this.load({ plan: current.plan, underlay: current.underlay }); }
      catch (reason) {
        const fallback = this.history.at(-1);
        if (!fallback) throw reason;
        const bridge = await this.load({ plan: fallback.plan, underlay: fallback.underlay }, true);
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
    const design: CadDesign = { ...before, plan, revision: before.revision + 1, lastSource: 'user', status: 'draft', updatedAt: Date.now() };
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
  /** Once there is furniture but no MEP yet, let the designer lay out MEP itself. */
  async autoMep(): Promise<number> {
    const design = this.snapshot.design;
    if (!design || !this.bridge || this.snapshot.busy || isBuilding(design.plan)) return 0;
    const plan = design.plan as { furniture?: unknown[]; elec?: unknown[] };
    if (!plan.furniture?.length || plan.elec?.length) return 0;
    const placed = await this.bridge.autoElec();
    if (!placed) return 0;
    const next: CadDesign = { ...design, plan: this.bridge.readPlan(), updatedAt: Date.now() };
    await this.persist(next, this.history, this.undo);
    this.update({ design: next, issues: this.bridge.runChecks() });
    return placed;
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
  /** Loads a recognized floorplan draft (walls + openings) with the original image as underlay. */
  async loadDraft(spec: HouseSpec, underlay?: CadDesign['underlay']) {
    const before = await this.sync();
    if (this.snapshot.busy) throw new Error('请等待户型更新结束 / Wait for design updates');
    if (before?.lastSource === 'user' && !await this.confirmReplace()) throw new Error('已取消 / Cancelled');
    this.update({ busy: true });
    try {
      const bridge = await this.load({ spec, underlay });
      const design: CadDesign = { plan: bridge.readPlan(), underlay, revision: (before?.revision ?? 0) + 1, status: 'draft', lastSource: 'recognize', updatedAt: Date.now() };
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
      bridge.replacePlan(result.plan);
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
        const bridge = await this.load({ spec });
        checkAbort();
        candidate = { plan: bridge.readPlan(), revision: (before?.revision ?? 0) + 1, status: 'draft', lastSource: 'ai', updatedAt: Date.now() };
        applied = 1;
      } else if (payload.type === 'cad_ops') {
        if (!before) throw new Error('尚无户型，请先生成 cad_spec / Generate cad_spec first');
        if (isBuilding(before.plan)) throw new Error('暂只支持单层修改 / Only single-floor edits are supported');
        candidate = await applyOperations(payload.ops, before, true);
      } else throw new Error('需要 cad_spec 或 cad_ops / Expected cad_spec or cad_ops');
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
        maxRounds: retry ? 3 - validationRounds : 0,
        issuesOf: async plan => { checkAbort(); bridge.replacePlan(plan); return bridge.runChecks(); },
        askModel: async (issues, summary) => {
          checkAbort();
          const correction = object(await retry!(JSON.stringify({ issues, requestedChanges: payload.type === 'cad_ops' ? payload.ops : undefined }), summary));
          checkAbort();
          if (correction.type !== 'cad_ops' || !Array.isArray(correction.ops)) throw new Error('设计器修复必须返回 cad_ops / Designer repair requires cad_ops');
          return correction.ops as PlanOp[];
        },
        apply: async (ops, current) => await applyOperations(ops, current, true),
      });
      checkAbort();
      if (revised.issues.some(issue => issue.level === 'error')) {
        revised.design = nudge(revised.design);
        revised.issues = bridge.runChecks();
      }
      const history = before ? [...this.history, before].slice(-20) : this.history;
      await this.persist(revised.design, history, before);
      this.history = history;
      this.undo = before;
      const result = { applied, errors: revised.issues.filter(issue => issue.level === 'error').length, warnings: revised.issues.filter(issue => issue.level === 'warn').length, rounds: validationRounds + revised.rounds };
      this.update({ design: revised.design, issues: revised.issues, lastResult: result, canUndo: !!before });
      return result;
    } catch (reason) {
      if (before) {
        if (reloaded) {
          this.bridge = undefined;
          try { await this.load({ plan: before.plan, underlay: before.underlay }, true); }
          catch (recoveryError) { console.error('[CAD designer] Previous design reload failed', recoveryError); }
        } else if (this.bridge) this.bridge.replacePlan(before.plan);
      }
      if (!before) this.bridge = undefined;
      this.update({ design: before, ready: !!this.bridge });
      throw reason;
    } finally { this.update({ busy: false }); }
  }
}
