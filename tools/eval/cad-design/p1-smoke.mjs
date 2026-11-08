import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
const out = process.env.TEMP + '/cad-p1-browser';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  await page.addInitScript(() => {
    localStorage.setItem('CanvasAnvil-app-view-v1', 'workspace');
    localStorage.setItem('CanvasAnvil-active-workspace-v1', 'cad');
  });
  await page.goto('http://localhost:8013');
  await page.getByRole('button', { name: /Designer|设计器/, exact: true }).click();
  await page.getByTestId('cad-design-empty').waitFor();
  assert.equal(await page.locator('iframe[title="户型设计器"]').count(), 0);
  assert.equal(await page.getByRole('button', { name: /上传原始户型图|Upload original floorplan/ }).count(), 0);
  const fixture = JSON.parse(await readFile(new URL('../../../tests/fixtures/hpd/example-plan.json', import.meta.url), 'utf8'));
  await page.evaluate(async plan => {
    const { cadStore } = await import('/client/workspaces/cad/storage.ts');
    await cadStore.save('cad-design-record', { design: { plan, revision: 0, lastSource: 'ai', status: 'draft', updatedAt: Date.now() }, history: [], undoAI: null });
  }, fixture);
  await page.reload();

  await page.getByRole('button', { name: /Designer|设计器/, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => /^(Export DXF|导出 DXF)$/.test(button.textContent) && !button.disabled), null, { timeout: 30000 });
  const frame = page.frames().find(f => f.url().includes('designer.html'));
  assert.ok(frame);
  await page.screenshot({ path: out + '/2d.png' });
  const initial = await frame.evaluate(() => {
    const d = window.__designer;
    const f = d.app.plan.furniture.find(f => f.key === 'sofa') ?? d.app.plan.furniture[0];
    const rect = document.querySelector('#c2d').getBoundingClientRect();
    return { id: f.id, x: f.x, y: f.y, screenX: rect.x + d.view.ox + f.x * d.view.s, screenY: rect.y + d.view.oy + f.y * d.view.s };
  });
  const host = await page.locator('iframe[title="户型设计器"]').boundingBox();
  await page.mouse.move(host.x + initial.screenX, host.y + initial.screenY);
  await page.mouse.down();
  await page.mouse.move(host.x + initial.screenX + 25, host.y + initial.screenY + 10, { steps: 10 });
  await page.mouse.up();
  const moved = await frame.evaluate(id => window.__designer.app.plan.furniture.find(f => f.id === id), initial.id);
  assert.notEqual(moved.x, initial.x, 'Pointer drag must change furniture position');
  await page.waitForFunction(() => !document.querySelector('[data-testid="cad-design-revision"]').textContent.includes('revision 0'), null, { timeout: 1500 });
  const revisionBeforeError = await page.getByTestId('cad-design-revision').textContent();
  const runtimeLogs = [];
  page.on('console', message => { if (message.type() === 'error') runtimeLogs.push(message.text()); });
  for (const eventType of ['error', 'unhandledrejection']) {
    await frame.evaluate(eventType => {
      const event = eventType === 'error'
        ? new ErrorEvent('error', { message: 'P1 injected runtime error' })
        : new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: 'P1 injected rejection' });
      window.dispatchEvent(event);
    }, eventType);
    await page.getByRole('status').filter({ hasText: /设计器运行出错|Designer runtime error/ }).waitFor();
    assert.equal(await page.getByTestId('cad-design-loading-error').count(), 0);
    assert.equal(await frame.evaluate(id => window.__designer.app.plan.furniture.find(f => f.id === id).x, initial.id), moved.x);
    assert.equal(await page.getByTestId('cad-design-revision').textContent(), revisionBeforeError);
    await page.getByRole('button', { name: /关闭错误提示|Dismiss error/ }).click();
  }
  assert.ok(runtimeLogs.some(message => message.includes('P1 injected runtime error')));
  assert.ok(runtimeLogs.some(message => message.includes('P1 injected rejection')));
  await frame.evaluate(id => {
    const d = window.__designer;
    const plan = structuredClone(d.app.plan);
    plan.furniture.find(f => f.id === id).x += 100;
    d.replacePlan(plan);
  }, initial.id);
  moved.x += 100;
  await page.waitForFunction(previous => document.querySelector('[data-testid="cad-design-revision"]').textContent !== previous, revisionBeforeError, { timeout: 2000 });
  await page.screenshot({ path: out + '/before-export.png' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export DXF|导出 DXF/ }).click();
  const file = await download;
  await file.saveAs(out + '/design.dxf');
  await page.reload();
  await page.getByRole('button', { name: /Designer|设计器/, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => /^(Export DXF|导出 DXF)$/.test(button.textContent) && !button.disabled), null, { timeout: 30000 });
  const restored = page.frames().find(f => f.url().includes('designer.html'));
  assert.equal(await restored.evaluate(id => window.__designer.app.plan.furniture.find(f => f.id === id).x, initial.id), moved.x);
  await restored.evaluate(() => window.__designer.setView('3d'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + '/3d.png' });
  const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => /^house-designer-(v2-plan|v2-underlay|scheme):/.test(k)));
  assert.equal(new Set(keys.map(k => k.split(':')[1])).size, 1);
  const cancellation = await page.evaluate(async () => {
    const reactModule = await import('/node_modules/.vite/deps/react.js');
    const React = reactModule.default ?? reactModule;
    const domModule = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = domModule.default ?? domModule;
    const { HouseDesignerFrame } = await import('/client/workspaces/cad/designer/HouseDesignerFrame.tsx');
    const { CadDesignSession } = await import('/client/workspaces/cad/lib/design/design-session.ts');
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white';
    document.body.append(container);
    const session = new CadDesignSession({ store: { read: async () => null, save: async () => {}, clear: async () => {} } });
    const root = createRoot(container);
    root.render(React.createElement(HouseDesignerFrame, { session, onGenerate: () => {}, onFocus: () => {}, onFixIssue: () => {} }));
    const spec = { walls: [
      { a: [0, 0], b: [5000, 0], t: 200 }, { a: [5000, 0], b: [5000, 4000], t: 200 },
      { a: [5000, 4000], b: [0, 4000], t: 200 }, { a: [0, 4000], b: [0, 0], t: 200 },
    ], rooms: [{ name: 'Bedroom', at: [2500, 2000] }], furniture: [{ key: 'bed18', at: [2500, 2000], w: 12000, d: 12000 }] };
    const controller = new AbortController();
    let cancelled = false;
    try {
      await session.applyModelOutput({ type: 'cad_spec', spec }, async () => {
        controller.abort();
        return { type: 'cad_ops', ops: [] };
      }, { signal: controller.signal });
    } catch { cancelled = true; }
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = { cancelled, empty: !!container.querySelector('[data-testid="cad-design-empty"]'), frames: container.querySelectorAll('iframe').length };
    root.unmount();
    container.remove();
    return result;
  });
  assert.deepEqual(cancellation, { cancelled: true, empty: true, frames: 0 });
  await page.route('**/designer.html?debug', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({ response, body: html.replace('replacePlan:r3', 'missingReplacePlan:r3') });
  });
  await page.reload();
  await page.getByRole('button', { name: /Designer|设计器/, exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /incompatible|版本不兼容/ }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: out + '/incompatible.png' });
  await writeFile(out + '/report.json', JSON.stringify({ passed: true, initial, keys }, null, 2));
  console.log(out);
} finally { await browser.close(); }
