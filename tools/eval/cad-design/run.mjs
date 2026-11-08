import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeCase, judgeEdit, extractSpecFlags, classifyModelResponse, classifyChatError, selectCases, summarizeRun } from './judge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; };
const baseUrl = option('--base-url', 'http://localhost:8013');
const storagePath = option('--storage-state');
const outputDir = resolve(option('--output-dir', join(here, 'results')));
const suite = JSON.parse(await readFile(join(here, 'cases.json'), 'utf8'));
selectCases(suite.cases, option('--case'));
const storagePathState = storagePath ? JSON.parse(await readFile(resolve(storagePath), 'utf8')) : undefined;
const interactive = args.includes('--interactive');
const browser = await chromium.launch({ headless: !interactive && !args.includes('--headed') });
let interactiveContext;
const terminal = interactive ? createInterface({ input: stdin, output: stdout }) : undefined;

async function modelMetadata(page) {
  return page.evaluate(async () => {
    const { getAIConfig } = await import('/client/ai/storage.ts');
    const config = getAIConfig();
    let baseHostname = '';
    try { baseHostname = new URL(config.textBaseUrl).hostname; } catch { /* An invalid base URL has no safe hostname. */ }
    return { modelName: String(config.textModel || ''), baseHostname };
  });
}

async function send(page, text, phase) {
  const previousRevision = await page.getByTestId('cad-design-revision').textContent().catch(() => null);
  const composer = page.getByTestId('cad-chat-composer');
  const input = composer.locator('textarea');
  const sendButton = composer.getByRole('button', { name: /^(发送|Send)$/ });
  await input.fill(text);
  await sendButton.click();
  await page.getByTestId('cad-chat-busy').waitFor({ state: 'attached', timeout: 10000 });
  await page.getByTestId('cad-chat-busy').waitFor({ state: 'detached', timeout: 600000 });
  const lastAssistant = await page.evaluate(() => {
    const messages = JSON.parse(localStorage.getItem('chat_history_v2_cad') || '[]');
    return [...messages].reverse().find(message => message.role === 'assistant')?.content || '';
  });
  if (phase === 'plan' && !/"type"\s*:\s*"cad_plan"/.test(lastAssistant)) {
    const error = new Error('Plan chat did not finish with a cad_plan result');
    error.chatErrorCategory = classifyChatError(lastAssistant);
    throw error;
  }
  if (phase === 'design') {
    if (!/已修改\s*\d+\s*处|Applied\s+\d+\s+changes/i.test(lastAssistant)) {
      const error = new Error('Design chat did not finish with a successful application summary');
      error.chatErrorCategory = classifyChatError(lastAssistant);
      throw error;
    }
    const nextRevision = await page.getByTestId('cad-design-revision').textContent().catch(() => null);
    if (nextRevision === null || nextRevision === previousRevision) {
      const error = new Error('Design chat did not advance the design revision');
      error.chatErrorCategory = 'revision_unchanged';
      throw error;
    }
  }
}
async function finalChatErrorCategory(page, error) {
  if (error.chatErrorCategory) return error.chatErrorCategory;
  const category = await page.evaluate(() => {
    const messages = JSON.parse(localStorage.getItem('chat_history_v2_cad') || '[]');
    return [...messages].reverse().find(message => message.role === 'assistant')?.content || '';
  }).then(classifyChatError).catch(() => 'chat_failed');
  return category === 'chat_failed' ? classifyChatError(String(error.message)) : category;
}
async function designerFrame(page) {
  await page.getByRole('button', { name: /^(设计器|Designer)$/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].some(frame => frame.contentWindow?.__designer), null, { timeout: 30000 });
  return page.frames().find(frame => frame.url().includes('/vendor/house-designer/designer.html'));
}
async function snapshot(page) {
  const frame = await designerFrame(page);
  const data = await frame.evaluate(() => {
    const d = window.__designer;
    const b = d.app.geo.bounds;
    return { plan: structuredClone(d.app.plan), regions: structuredClone(d.app.rooms.regions), issues: d.runChecks().issues, mepIssues: d.mepIssues(), bounds: { x: b.x, y: b.y, w: b.w, h: b.h }, runtimeErrors: window.__CA_HPD_ERRORS__ || [] };
  });
  data.rounds = await page.getByTestId('cad-design-result').getAttribute('data-rounds').then(value => Number(value || 0)).catch(() => null);
  if (data.rounds === null) throw new Error('Missing repair-round telemetry cad-design-result');
  return data;
}
async function screenshot(page, filename) {
  const frame = await designerFrame(page);
  const dataUrl = await frame.evaluate(() => {
    const d = window.__designer, b = d.app.geo.bounds;
    return d.shot2d('layout', b.x + b.w / 2, b.y + b.h / 2, Math.min(1400 / b.w, 1000 / b.h));
  });
  await writeFile(filename, Buffer.from(dataUrl.split(',')[1], 'base64'));
}
async function manualSofaMove(page) {
  const revision = await page.getByTestId('cad-design-revision').textContent();
  const frame = await designerFrame(page);
  await frame.evaluate(() => {
    const d = window.__designer;
    const plan = structuredClone(d.app.plan);
    const sofa = plan.furniture.find(item => /sofa/i.test(item.key));
    if (!sofa) throw new Error('Manual-before step could not find a sofa');
    sofa.x += 300;
    d.replacePlan(plan);
  });
  await page.waitForFunction(previous => document.querySelector('[data-testid="cad-design-revision"]')?.textContent !== previous, revision, { timeout: 5000 });
}
async function runRound(caseId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const assetDir = join(outputDir, timestamp);
  const reportPath = join(outputDir, timestamp + '.json');
  const selectedCases = selectCases(suite.cases, caseId);
  const fullSuite = !caseId;
  await mkdir(assetDir, { recursive: true });
  const report = { startedAt: new Date().toISOString(), baseUrl, modelEndpoints: [], selectedCaseIds: selectedCases.map(entry => entry.id), fullSuite, cases: [], passed: false, partial: true, completed: false, selectedCasesPassed: false, notes: ['CAD normal model calls use /api/ppt-ai. /api/chat is the Diagram endpoint.', 'Door-width checks are automated. Clear passage for the elderly case still needs manual review.'] };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  try {
    for (const entry of selectedCases) {
      const result = { id: entry.id, passed: false, reasons: [], rounds: null, issues: [], errors: [], warnings: [], edits: [], screenshot: null, responses: [], stage: 'setup' };
      const context = interactiveContext ?? await browser.newContext({ viewport: { width: 1680, height: 1100 }, storageState: storagePathState });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      let observedSpecFlags = {};
      let activeStage = 'setup';
      const pendingResponses = new Set();
      const requests = new Map();
      const stageCounters = new Map();
      const recordTask = task => {
        pendingResponses.add(task);
        task.finally(() => pendingResponses.delete(task));
      };
      page.on('response', response => {
        const request = response.request();
        const tracked = requests.get(request);
        if (!tracked) return;
        const task = (async () => {
          const metadata = { stage: tracked.stage, sequence: tracked.sequence, httpStatus: response.status(), durationMs: Date.now() - tracked.startedAt };
          try {
            const body = await response.json();
            if (!response.ok()) {
              result.responses.push({ ...metadata, errorCategory: classifyChatError(typeof body.error === 'string' ? body.error : '') });
            } else if (typeof body.content === 'string') {
              const responseFile = join(assetDir, `${entry.id}-${tracked.stage}-${String(tracked.sequence).padStart(2, '0')}.response.txt`);
              await writeFile(responseFile, body.content);
              result.responses.push({ ...metadata, textLength: body.content.length, responseFile, classification: classifyModelResponse(body.content) });
              const flags = extractSpecFlags(body.content);
              if (flags) observedSpecFlags = flags;
            } else if (typeof body.url !== 'string') {
              result.responses.push({ ...metadata, errorCategory: 'missing_content' });
            }
          } catch {
            result.responses.push({ ...metadata, errorCategory: 'response_body_unreadable' });
          } finally { requests.delete(request); }
        })();
        recordTask(task);
      });
      page.on('requestfailed', request => {
        const tracked = requests.get(request);
        if (!tracked) return;
        result.responses.push({ stage: tracked.stage, sequence: tracked.sequence, httpStatus: null, durationMs: Date.now() - tracked.startedAt, errorCategory: 'network_failed' });
        requests.delete(request);
      });
      page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (request.method() !== 'POST' || !['/api/ppt-ai', '/api/chat'].includes(pathname)) return;
        if (!report.modelEndpoints.includes(pathname)) report.modelEndpoints.push(pathname);
        const sequence = (stageCounters.get(activeStage) || 0) + 1;
        stageCounters.set(activeStage, sequence);
        requests.set(request, { stage: activeStage, sequence, startedAt: Date.now() });
      });
      try {
        const resetUrl = new URL('/__cad_eval_reset__', baseUrl).href;
        await page.route(resetUrl, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>CAD evaluation reset</title>' }));
        await page.goto(resetUrl);
        await page.evaluate(async () => {
          for (const key of Object.keys(localStorage)) if (key.startsWith('CanvasAnvil-cad-') || key.startsWith('house-designer-') || key === 'chat_history_v2_cad') localStorage.removeItem(key);
          await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase('CanvasAnvilCadWorkspaceDB');
            request.onsuccess = resolve;
            request.onerror = () => reject(new Error('CAD evaluation database reset failed'));
            request.onblocked = () => reject(new Error('Close other CAD tabs in the evaluation browser before resetting'));
          });
          localStorage.setItem('CanvasAnvil-app-view-v1', 'workspace');
          localStorage.setItem('CanvasAnvil-active-workspace-v1', 'cad');
        });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        const configured = await page.evaluate(async () => {
          const { getAIConfig } = await import('/client/ai/storage.ts');
          return Boolean(getAIConfig().textApiKey);
        });
        if (!configured) throw new Error('BLOCKED: text-model configuration is missing in the isolated browser context; provide --storage-state using a configured session');
        result.textModel = await modelMetadata(page);
        report.textModel ??= result.textModel;
        activeStage = result.stage = 'plan';
        await send(page, entry.prompt, 'plan');
        activeStage = result.stage = 'design';
        await send(page, '确认以上需求方案。请根据方案生成户型，使用 cad_spec 数据并执行设计器检查。', 'design');
        const initial = await snapshot(page);
        await Promise.allSettled([...pendingResponses]);
        const judgment = judgeCase(initial, entry.expect, suite.rules, observedSpecFlags);
        Object.assign(result, judgment, { rounds: initial.rounds, issues: initial.issues, plan: initial.plan });
        if (initial.runtimeErrors.length) result.reasons.push('Designer runtime errors were recorded');
        result.screenshot = join(assetDir, entry.id + '.png');
        await screenshot(page, result.screenshot);
        for (const [index, edit] of entry.edits.entries()) {
          const editResult = { say: edit.say, passed: false, reasons: [] };
          try {
            if (edit.manualBefore) await manualSofaMove(page);
            const before = await snapshot(page);
            activeStage = result.stage = `edit-${index + 1}`;
            await send(page, edit.say, 'design');
            const after = await snapshot(page);
            const inferredScope = entry.id === 'c03-2b1l-80' && index === 1
              ? 'furniture:desk*|kidsDesk|officeDesk|standingDesk|lDesk'
              : entry.id === 'c04-3b2l-110' ? 'furniture:bookshelf*'
              : entry.id === 'c09-kitchen-dense' ? 'furniture:diningTable*|longTable|roundTable|ovalTable' : undefined;
            Object.assign(editResult, judgeEdit(before.plan, after.plan, { ...edit, expectOnlyChanged: edit.expectOnlyChanged ?? inferredScope }), { rounds: after.rounds, issues: after.issues });
            if (after.issues.some(issue => issue.level === 'error')) editResult.reasons.push('Engine errors remain after edit');
            if (after.rounds > suite.rules.maxFixRounds) editResult.reasons.push('Edit repair exceeded maximum rounds');
            if (after.runtimeErrors.length) editResult.reasons.push('Designer runtime errors were recorded after edit');
            editResult.screenshot = join(assetDir, `${entry.id}-edit-${index + 1}.png`);
            await screenshot(page, editResult.screenshot);
            editResult.passed = editResult.reasons.length === 0;
          } catch (error) { editResult.reasons.push(String(error.message)); editResult.chatErrorCategory = await finalChatErrorCategory(page, error); }
          result.edits.push(editResult);
        }
        result.passed = result.reasons.length === 0 && result.edits.every(edit => edit.passed);
      } catch (error) {
        result.reasons.push(String(error.message));
        result.chatErrorCategory = await finalChatErrorCategory(page, error);
        for (const edit of entry.edits.slice(result.edits.length)) result.edits.push({ say: edit.say, passed: false, skipped: true, reasons: ['Generation or environment failed before this edit could run'] });
        const failureImage = join(assetDir, entry.id + '-failure.png');
        await page.screenshot({ path: failureImage }).then(() => { result.screenshot = failureImage; }).catch(() => {});
      } finally {
        await Promise.allSettled([...pendingResponses]);
        result.responses.sort((a, b) => a.stage.localeCompare(b.stage) || a.sequence - b.sequence);
        await page.close();
        if (!interactiveContext) await context.close();
      }
      report.cases.push(result);
      report.updatedAt = new Date().toISOString();
      Object.assign(report, summarizeRun(report.selectedCaseIds, report.cases, fullSuite, suite.cases.length));
      await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
      console.log(`${entry.id}: ${result.passed ? 'PASS' : 'FAIL'}`);
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    Object.assign(report, summarizeRun(report.selectedCaseIds, report.cases, fullSuite, suite.cases.length));
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Report ${reportPath}`);
  }
  return report;
}

try {
  if (interactive) {
    interactiveContext = await browser.newContext({ viewport: { width: 1680, height: 1100 }, storageState: storagePathState });
    const setup = await interactiveContext.newPage();
    await setup.goto(baseUrl);
    console.log('Configure the text model and optional image model in this dedicated browser window. Settings remain only in this browser session.');
    await setup.waitForFunction(async () => {
      const { getAIConfig } = await import('/client/ai/storage.ts');
      return Boolean(getAIConfig().textApiKey);
    }, null, { timeout: 1800000, polling: 1000 });
    console.log('Text model', JSON.stringify(await modelMetadata(setup)));
    await terminal.question('Finish optional image-model configuration, then press Enter to start evaluation. ');
    await setup.close();
  }
  let caseId = option('--case');
  let lastReport;
  let finish = false;
  while (!finish) {
    lastReport = await runRound(caseId);
    if (!interactive) break;
    const settingsPage = await interactiveContext.newPage();
    await settingsPage.goto(baseUrl);
    console.log('Text model', JSON.stringify(await modelMetadata(settingsPage)));
    while (true) {
      const command = (await terminal.question('Enter all, a case id, or finish: ')).trim();
      if (command === 'finish') { finish = true; break; }
      try {
        if (!command) throw new Error('Choose all, a case id, or finish.');
        caseId = command === 'all' ? undefined : command;
        selectCases(suite.cases, caseId);
        break;
      } catch { console.log('Unknown selection. Enter all, a case id, or finish.'); }
    }
    await settingsPage.close();
  }
  process.exitCode = (lastReport.fullSuite ? lastReport.passed : lastReport.selectedCasesPassed) ? 0 : 1;
} finally {
  terminal?.close();
  await browser.close();
}
