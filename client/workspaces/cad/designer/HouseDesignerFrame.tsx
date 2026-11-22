import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CanvasPen } from '@/shared/canvas-pen';
import { useUiLanguage } from '@/shared/i18n';
import { cleanDesignerStorage, createDesignerBridge } from './designer-bridge';
import { applyDesignerTheme } from './designer-theme';
import type { DesignerApi, DesignerBridge } from './designer-bridge';
import { designerPen, type CadDesignSession, type DesignerPreset } from '../lib/design/design-session';
import type { DesignIssue } from '../lib/design/types';
import { errorText, notify } from '@/shared/ui/notify';
import { loadChatHistory } from '@/shared/chat/chat-storage';
import { setPendingPrompt } from '@/shared/pending-prompt';
import { canOpenCanvas, openCanvasFor } from '@/shared/references/bus';
import { setPendingReference } from '@/shared/references/pending';
import { useWork, useWorkStore } from '@/shared/works/work-context';
import { CAD_CHAT_STORAGE_KEY, cadStore } from '../storage';
import { REFERENCE_BUNDLE_KEY, buildReferenceBundle, isBundleCurrent, readReferenceBundle, type ReferenceBundle } from '../lib/reference-bundle';

/** The user's requests in the CAD chat, as the design brief (image payloads and long pastes trimmed). */
function chatRequirements(): string[] {
  return loadChatHistory(CAD_CHAT_STORAGE_KEY)
    .filter(message => message.role === 'user')
    .map(message => message.content.replace(/\[\[IMAGE\|[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-10)
    .map(line => (line.length > 300 ? `${line.slice(0, 300)}…` : line));
}

type DesignerWindow = Window & { __designer?: DesignerApi; __CA_HPD_ERRORS__?: string[]; __CA_HPD_PRESET__?: object };
type LoadRequest = { id: number; preset: DesignerPreset; resolve(bridge: DesignerBridge): void; reject(reason: unknown): void };
type Props = { session: CadDesignSession; onFocus(): void; onFixIssue(issue: DesignIssue): void; canRecognize?: boolean; onUpload?(): void; hasPlan?: boolean; canQa?: boolean; qaRunning?: boolean; onQa?(): void };

export function HouseDesignerFrame({ session, onFocus, onFixIssue, canRecognize = false, onUpload, hasPlan = false, canQa = false, qaRunning = false, onQa }: Props) {
  const language = useUiLanguage();
  const tr = (zh: string, en: string) => language === 'zh' ? zh : en;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<DesignerBridge>();
  const loadSeed = useRef(0);
  const [request, setRequest] = useState<LoadRequest | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<{ incompatible: boolean; message: string }>();
  const [runtimeError, setRuntimeError] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const work = useWork();
  const workStore = useWorkStore(cadStore);
  /** The deliverables being made: which export, of how many. */
  const [exporting, setExporting] = useState<{ label: string; index: number; total: number } | null>(null);
  // Exports change the plan for a moment (the colour plan sets a look and takes it off again); the
  // periodic sync would keep those as hand edits and unconfirm the design, so it pauses meanwhile.
  const exportingRef = useRef(false);
  const [bundleRevision, setBundleRevision] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readReferenceBundle(workStore).then(bundle => { if (!cancelled) setBundleRevision(bundle?.revision ?? null); });
    return () => { cancelled = true; };
  }, [workStore]);
  const errors = snapshot.issues.filter(issue => issue.level === 'error').length;
  const warnings = snapshot.issues.filter(issue => issue.level === 'warn').length;

  useEffect(() => {
    let disposed = false;
    session.setLoader((preset, recovering = false) => new Promise((resolve, reject) => {
      if (!recovering) setLoadError(undefined);
      setRequest({ id: ++loadSeed.current, preset, resolve, reject });
    }));
    void session.hydrate().then(async () => {
      if (disposed) return;
      setHydrated(true);
      if (session.getSnapshot().design) await session.ensureReady();
    }).catch(reason => {
      if (!disposed) setLoadError({ incompatible: String(reason).includes('API incompatible'), message: String(reason) });
    });
    return () => { disposed = true; session.setLoader(undefined); };
  }, [session]);

  useEffect(() => {
    if (!request || !frameRef.current) return;
    const frame = frameRef.current;
    const bridge = createDesignerBridge(
      () => (frame.contentWindow as DesignerWindow | null)?.__designer,
      () => (frame.contentWindow as DesignerWindow | null)?.__CA_HPD_ERRORS__ ?? [],
      () => frame.contentDocument ?? undefined,
    );
    let disposed = false;
    let initialized = false;
    let detach = () => {};
    let untheme = () => {};
    const reportRuntime = (reason: unknown) => {
      console.error('[CAD designer] Runtime error', reason);
      if (!disposed) setRuntimeError(String(reason));
    };
    const mount = async () => {
      const data = new TextEncoder().encode(JSON.stringify(request.preset));
      const hash = await crypto.subtle.digest('SHA-1', data);
      if (disposed) return;
      const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
      cleanDesignerStorage(localStorage, id);
      for (const prefix of ['house-designer-v2-plan:', 'house-designer-v2-underlay:', 'house-designer-scheme:']) localStorage.removeItem(prefix + id);
      (window as DesignerWindow).__CA_HPD_PRESET__ = { id, ...request.preset };
      // Replace the iframe node between requests so ready() cannot see the previous preset's API.
      frame.src = '/vendor/house-designer/designer.html?debug';
      await bridge.ready();
      if (disposed) return;
      if (frame.contentDocument) untheme = applyDesignerTheme(frame.contentDocument);
      bridge.fit2D();
      bridgeRef.current = bridge;
      initialized = true;
      const win = frame.contentWindow!;
      const fail = (event: ErrorEvent | PromiseRejectionEvent) => reportRuntime('message' in event ? event.message : event.reason);
      win.addEventListener('error', fail);
      win.addEventListener('unhandledrejection', fail);
      detach = () => { win.removeEventListener('error', fail); win.removeEventListener('unhandledrejection', fail); };
      request.resolve(bridge);
    };
    void mount().catch(reason => {
      if (disposed) return;
      console.error('[CAD designer] Loading failed', reason);
      setLoadError({ incompatible: String(reason).includes('API incompatible'), message: String(reason) });
      request.reject(reason);
    });
    return () => {
      disposed = true;
      detach();
      untheme();
      if (initialized) session.detachBridge(bridge);
      else request.reject(new Error('设计器加载已取消 / Designer loading cancelled'));
      if (bridgeRef.current === bridge) bridgeRef.current = undefined;
      delete (window as DesignerWindow).__CA_HPD_PRESET__;
    };
  }, [request, session]);

  useEffect(() => {
    // A floor plan drawn in while streaming stays until the turn ends; one that never became a design goes again.
    if (hydrated && !snapshot.design && !snapshot.busy && !snapshot.previewing && !loadError && request) setRequest(null);
  }, [hydrated, snapshot.design, snapshot.busy, snapshot.previewing, loadError, request]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !exportingRef.current) void session.sync().catch(reason => {
        console.error('[CAD designer] Sync failed', reason);
        setRuntimeError(String(reason));
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [session]);

  /** The delivery bundle for the current confirmed revision: kept one, or made now by the designer's own exports. */
  const ensureBundle = async (force = false): Promise<ReferenceBundle> => {
    const design = await session.sync();
    const bridge = bridgeRef.current;
    if (!design || design.status !== 'confirmed') throw new Error(tr('请先确认户型', 'Confirm the design first'));
    if (!bridge) throw new Error(tr('设计器还没加载好', 'The designer is not ready'));
    const kept = await readReferenceBundle(workStore);
    if (!force && isBundleCurrent(kept, design)) return kept;
    setExporting({ label: tr('平面图与文字', 'Plan and texts'), index: 0, total: 1 });
    exportingRef.current = true;
    try {
      const bundle = await buildReferenceBundle({
        bridge,
        design,
        requirements: chatRequirements(),
        lang: language === 'zh' ? 'zh' : 'en',
        onStep: (label, index, total) => setExporting({ label, index: index + 1, total }),
      });
      await workStore.save(REFERENCE_BUNDLE_KEY, bundle);
      setBundleRevision(bundle.revision);
      if (bundle.failed?.length) notify.warning(tr('部分交付物没能导出', 'Some deliverables could not be exported'), { description: tr(`缺少：${bundle.failed.join('、')}。其余的已经可以引用。`, `Missing: ${bundle.failed.join(', ')}. The rest can be referenced.`) });
      return bundle;
    } finally {
      exportingRef.current = false;
      setExporting(null);
    }
  };
  /**
   * Deliverables are made, not asked for: right after the design is confirmed, and when a
   * confirmed design is opened without current ones (made before this was automatic, or a failed
   * run). Failing leaves the design confirmed; the notice offers to try again.
   */
  // Confirming and the opened-design check can both ask at once: one run, announced if either wanted it.
  const preparing = useRef<{ run: Promise<void>; announce: boolean } | null>(null);
  const prepareDeliverables = (announce: boolean): Promise<void> => {
    if (preparing.current) {
      preparing.current.announce ||= announce;
      return preparing.current.run;
    }
    const job = { announce, run: Promise.resolve() };
    job.run = runPrepare(job).finally(() => { preparing.current = null; });
    preparing.current = job;
    return job.run;
  };
  const runPrepare = async (job: { announce: boolean }) => {
    try {
      const bundle = await ensureBundle();
      if (job.announce) notify.success(tr('户型已确认', 'Design confirmed'), { description: tr(`交付物已准备好（${bundle.items.length} 项），其他画布现在可以引用这套户型。`, `${bundle.items.length} deliverables are ready; other canvases can reference this design now.`) });
    } catch (reason) {
      console.error('[CAD designer] Deliverables failed', reason);
      notify.error(tr('交付物没能生成', 'The deliverables could not be made'), {
        description: tr(`户型仍是已确认的，只是暂时不能被其他画布引用。原因：${errorText(reason)}`, `The design stays confirmed, but other canvases cannot reference it yet. Reason: ${errorText(reason)}`),
        action: { label: tr('重试', 'Try again'), onClick: () => void prepareDeliverables(true) },
      });
    }
  };
  const confirmDesign = () => run(async () => {
    await session.confirm();
    if (session.getSnapshot().design?.status === 'confirmed') await prepareDeliverables(true);
  });
  // A confirmed design opened without current deliverables gets them once the designer is up.
  const autoPrepared = useRef<number | null>(null);
  useEffect(() => {
    const design = snapshot.design;
    if (!snapshot.ready || snapshot.busy || exporting || design?.status !== 'confirmed') return;
    if (bundleRevision === design.revision || autoPrepared.current === design.revision) return;
    autoPrepared.current = design.revision;
    void prepareDeliverables(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.ready, snapshot.busy, snapshot.design?.status, snapshot.design?.revision, bundleRevision, exporting]);
  const makeReport = () => run(async () => {
    const bundle = await ensureBundle();
    const zh = language === 'zh';
    const prompt = zh
      ? '根据引用的这套户型，做一份给业主看的装修汇报 PPT。建议结构：项目概况、原始户型与改造思路、平面布置方案、分区说明、彩平图与效果图、预算（数字只用报价单里的）、施工图与下一步。'
      : 'Make a renovation report PPT for the homeowner from the referenced design. Suggested structure: project overview, original layout and the changes, furnished plan, room-by-room notes, colour plan and renders, budget (figures only from the quote), construction drawings and next steps.';
    setPendingReference({
      to: 'ppt',
      intent: { kind: 'deck-source', prompt },
      reference: { workspace: 'cad', workId: work?.workId ?? '', workName: work?.name || tr('室内设计', 'Interior design'), items: bundle.items, revision: bundle.revision },
    });
    setPendingPrompt('ppt', prompt);
    await openCanvasFor('ppt', null);
  });

  // A button's work that failed: said in a notice. The toolbar marker is for the designer itself breaking.
  const run = (action: () => Promise<unknown>) => { void action().catch(reason => {
    console.error('[CAD designer] Action failed', reason);
    notify.error(tr('这一步没有完成', 'That did not finish'), { description: errorText(reason) });
  }); };
  if (hydrated && !snapshot.design && !snapshot.busy && !request) return <div className="flex h-full flex-col items-center justify-center gap-4 bg-background" data-testid="cad-design-empty">
    <p className="text-muted-foreground">{hasPlan ? tr('设计方案已在左侧对话里，确认后会在这里生成户型', 'The design plan is in the chat on the left; confirm it there to generate the floorplan here.') : tr('在左侧描述需求，先出设计方案；或上传原始户型图', 'Describe your needs on the left to get a design plan, or upload an existing floorplan.')}</p>
    {canRecognize && <button className="rounded border px-4 py-2" onClick={onUpload}>{tr('上传原始户型图', 'Upload original floorplan')}</button>}
  </div>;

  return <div className="relative flex h-full flex-col overflow-hidden bg-background">
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs" data-testid="cad-design-result" data-rounds={snapshot.lastResult?.rounds ?? 0}>
      <span>{snapshot.busy ? tr('检查中', 'Checking') : snapshot.ready ? snapshot.design?.lastSource === 'user' ? tr('手动修改已同步', 'Manual changes synced') : tr('已同步', 'Synced') : tr('加载设计器…', 'Loading designer…')}</span>
      <span data-testid="cad-design-revision">revision {snapshot.design?.revision ?? 0}</span>
      <button onClick={() => setShowIssues(value => !value)}>{tr(`${errors} 个错误 · ${warnings} 个警告`, `${errors} errors · ${warnings} warnings`)}</button>
      {canRecognize && <button className="rounded border px-2 py-1" onClick={onUpload}>{tr('上传原始户型', 'Upload floorplan')}</button>}
      <button className="rounded border px-2 py-1" onClick={onFocus}>{tr('专注模式', 'Focus mode')}</button>
      <button className="rounded border px-2 py-1" disabled={!snapshot.ready || snapshot.busy} onClick={() => run(() => session.recheck())}>{tr('重新检查', 'Recheck')}</button>
      <button className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50" title={errors > 0 ? tr('请先解决全部错误', 'Resolve all errors first') : ''} disabled={!snapshot.ready || snapshot.busy || errors > 0} onClick={confirmDesign}>{snapshot.design?.status === 'confirmed' ? tr('户型已确认', 'Design confirmed') : tr('确认户型', 'Confirm design')}</button>
      {canQa && snapshot.design && <button className="rounded border px-2 py-1 disabled:opacity-50" title={tr('设计器逐项操作验收 + 导出文件检查（几分钟）', 'Operate every button, panel and export, then open the exported files (a few minutes)')} disabled={!snapshot.ready || snapshot.busy || qaRunning} onClick={onQa}>{qaRunning ? tr('交付检查中…', 'Checking delivery…') : tr('交付检查', 'Delivery check')}</button>}
      {snapshot.design?.status === 'confirmed' && canOpenCanvas() && <>
        <button className="rounded border px-2 py-1 disabled:opacity-50" title={tr('带上交付物，新建一份给业主的装修汇报 PPT', 'Start a renovation report PPT with the deliverables')} disabled={!snapshot.ready || snapshot.busy || !!exporting} onClick={makeReport}>{tr('生成汇报 PPT', 'Make report PPT')}</button>
      </>}
      {runtimeError && <span role="status" className="flex items-center gap-2 text-destructive" title={runtimeError}>{tr('设计器运行出错', 'Designer runtime error')}<button aria-label={tr('关闭错误提示', 'Dismiss error')} onClick={() => setRuntimeError('')}>×</button></span>}
    </div>
    {showIssues && <div className="max-h-48 overflow-auto border-b p-3 text-xs">{snapshot.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex items-center justify-between gap-3 py-1"><span>{issue.level} · {issue.msg}</span><button className="shrink-0 rounded border px-2 py-1" onClick={() => onFixIssue(issue)}>{tr('发给 AI 修复', 'Ask AI to fix')}</button></div>)}</div>}
    {request && <iframe key={request.id} ref={frameRef} title={tr('户型设计器', 'House designer')} className={`min-h-0 w-full flex-1 border-0 ${snapshot.busy || exporting ? 'pointer-events-none' : ''}`} />}
    {snapshot.previewing && <CanvasPen store={designerPen} />}
    {exporting && <div role="status" className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full border bg-background/95 px-4 py-2 text-xs shadow">
      {tr(`正在导出交付物：${exporting.label}（${exporting.index}/${exporting.total}）· 效果图较慢，请勿操作设计器`, `Exporting deliverables: ${exporting.label} (${exporting.index}/${exporting.total}) · the render is slow; leave the designer alone`)}
    </div>}
    {loadError && <div role="alert" data-testid="cad-design-loading-error" className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 p-6"><strong>{loadError.incompatible ? tr('设计器版本不兼容', 'Designer version incompatible') : tr('设计器加载失败', 'Designer failed to load')}</strong><p>{loadError.message}</p>{snapshot.ready && <button className="mt-3 rounded border px-3 py-2" onClick={() => setLoadError(undefined)}>{tr('查看恢复后的户型', 'View restored design')}</button>}</div>}
  </div>;
}
