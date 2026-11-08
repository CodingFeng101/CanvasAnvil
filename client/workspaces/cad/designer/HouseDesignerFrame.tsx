import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useUiLanguage } from '@/shared/i18n';
import { cleanDesignerStorage, createDesignerBridge } from './designer-bridge';
import { applyDesignerTheme } from './designer-theme';
import type { DesignerApi, DesignerBridge } from './designer-bridge';
import type { CadDesignSession, DesignerPreset } from '../lib/design/design-session';
import type { DesignIssue } from '../lib/design/types';

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
    if (hydrated && !snapshot.design && !snapshot.busy && !loadError && request) setRequest(null);
  }, [hydrated, snapshot.design, snapshot.busy, loadError, request]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void session.sync().catch(reason => {
        console.error('[CAD designer] Sync failed', reason);
        setRuntimeError(String(reason));
      });
    }, 1500);
    return () => clearInterval(interval);
  }, [session]);

  const run = (action: () => Promise<unknown>) => { void action().catch(reason => {
    console.error('[CAD designer] Action failed', reason);
    setRuntimeError(String(reason));
  }); };
  // Delivery comes from the designer itself: its quote, drawing set, DXF, colour plan and renders.
  const engineAction = (label: string) => run(async () => {
    await session.sync();
    await session.ensureReady();
    const doc = frameRef.current?.contentDocument;
    const target = doc && Array.from(doc.querySelectorAll<HTMLElement>('button, [role=menuitem], a, li'))
      .find(element => element.textContent?.replace(/\s+/g, ' ').trim().startsWith(label));
    if (!target) throw new Error(tr(`设计器里没有找到“${label}”`, `"${label}" not found in the designer`));
    target.click();
  });
  const deliveries: Array<[string, string]> = [
    [tr('报价单', 'Quote'), '报价'],
    [tr('施工图 PDF', 'Drawings PDF'), '整套施工图'],
    [tr('平面图 DXF', 'Plan DXF'), 'CAD 平面布置图（DXF · 国标）'],
    [tr('水电图 DXF', 'MEP DXF'), 'CAD 水电点位图'],
    [tr('彩平图', 'Colour plan'), '彩平图（高清 PNG）'],
    [tr('3D 效果图', '3D render'), '渲染出图'],
  ];

  if (hydrated && !snapshot.design && !snapshot.busy && !request) return <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border bg-background" data-testid="cad-design-empty">
    <p className="text-muted-foreground">{hasPlan ? tr('设计方案已在右侧对话里，确认后会在这里生成户型', 'The design plan is in the chat on the right; confirm it there to generate the floorplan here.') : tr('在右侧描述需求，先出设计方案；或上传原始户型图', 'Describe your needs on the right to get a design plan, or upload an existing floorplan.')}</p>
    {canRecognize && <button className="rounded border px-4 py-2" onClick={onUpload}>{tr('上传原始户型图', 'Upload original floorplan')}</button>}
  </div>;

  return <div className="relative flex h-full flex-col overflow-hidden rounded-xl border bg-background">
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs" data-testid="cad-design-result" data-rounds={snapshot.lastResult?.rounds ?? 0}>
      <span>{snapshot.busy ? tr('检查中', 'Checking') : snapshot.ready ? snapshot.design?.lastSource === 'user' ? tr('手动修改已同步', 'Manual changes synced') : tr('已同步', 'Synced') : tr('加载设计器…', 'Loading designer…')}</span>
      <span data-testid="cad-design-revision">revision {snapshot.design?.revision ?? 0}</span>
      <button onClick={() => setShowIssues(value => !value)}>{tr(`${errors} 个错误 · ${warnings} 个警告`, `${errors} errors · ${warnings} warnings`)}</button>
      {canRecognize && <button className="rounded border px-2 py-1" onClick={onUpload}>{tr('上传原始户型', 'Upload floorplan')}</button>}
      <button className="rounded border px-2 py-1" onClick={onFocus}>{tr('专注模式', 'Focus mode')}</button>
      <button className="rounded border px-2 py-1" disabled={!snapshot.ready || snapshot.busy} onClick={() => run(() => session.recheck())}>{tr('重新检查', 'Recheck')}</button>
      <button className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50" title={errors > 0 ? tr('请先解决全部错误', 'Resolve all errors first') : ''} disabled={!snapshot.ready || snapshot.busy || errors > 0} onClick={() => run(() => session.confirm())}>{snapshot.design?.status === 'confirmed' ? tr('户型已确认', 'Design confirmed') : tr('确认户型', 'Confirm design')}</button>
      {snapshot.design?.status === 'confirmed' && deliveries.map(([text, label]) => <button key={label} className="rounded border px-2 py-1" disabled={!snapshot.ready || snapshot.busy} onClick={() => engineAction(label)}>{text}</button>)}
      {canQa && snapshot.design && <button className="rounded border px-2 py-1 disabled:opacity-50" title={tr('设计器逐项操作验收 + 导出文件检查（几分钟）', 'Operate every button, panel and export, then open the exported files (a few minutes)')} disabled={!snapshot.ready || snapshot.busy || qaRunning} onClick={onQa}>{qaRunning ? tr('交付检查中…', 'Checking delivery…') : tr('交付检查', 'Delivery check')}</button>}
      {runtimeError && <span role="status" className="flex items-center gap-2 text-destructive" title={runtimeError}>{tr('设计器运行出错', 'Designer runtime error')}<button aria-label={tr('关闭错误提示', 'Dismiss error')} onClick={() => setRuntimeError('')}>×</button></span>}
    </div>
    {showIssues && <div className="max-h-48 overflow-auto border-b p-3 text-xs">{snapshot.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className="flex items-center justify-between gap-3 py-1"><span>{issue.level} · {issue.msg}</span><button className="shrink-0 rounded border px-2 py-1" onClick={() => onFixIssue(issue)}>{tr('发给 AI 修复', 'Ask AI to fix')}</button></div>)}</div>}
    {request && <iframe key={request.id} ref={frameRef} title={tr('户型设计器', 'House designer')} className={`min-h-0 w-full flex-1 border-0 ${snapshot.busy ? 'pointer-events-none' : ''}`} />}
    {loadError && <div role="alert" data-testid="cad-design-loading-error" className="absolute inset-0 flex flex-col items-center justify-center bg-background/95 p-6"><strong>{loadError.incompatible ? tr('设计器版本不兼容', 'Designer version incompatible') : tr('设计器加载失败', 'Designer failed to load')}</strong><p>{loadError.message}</p>{snapshot.ready && <button className="mt-3 rounded border px-3 py-2" onClick={() => setLoadError(undefined)}>{tr('查看恢复后的户型', 'View restored design')}</button>}</div>}
  </div>;
}
