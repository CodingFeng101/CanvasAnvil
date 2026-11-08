import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

const upstream = resolve(process.argv[2] || '');
if (!process.argv[2]) throw new Error('Usage: node scripts/sync-house-designer.mjs <upstream path>');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim();
const required = ['app', 'replacePlan', 'runChecks', 'makeFurn', 'CAT', 'dxfBytes', 'shot2d', 'fit2D'];
const bridge = '<script id="__ca_bridge">window.__CA_HPD_ERRORS__=[];window.addEventListener("error",e=>window.__CA_HPD_ERRORS__.push(String(e.message)));try{window.__PRESET__=(window.parent&&window.parent!==window&&window.parent.__CA_HPD_PRESET__)||null}catch(e){window.__PRESET__=null}</script>';
const template = await readFile(join(upstream, 'assets/template.html'), 'utf8');
const html = template.replace(/<script\b[^>]*id=["']__preset["'][^>]*>[\s\S]*?<\/script>/gi, '').replace(/<meta\s+charset[^>]*>/i, '$&' + bridge);
if (!html.includes(bridge)) throw new Error('Missing charset patch anchor');
const specText = await readFile(join(upstream, 'reference/example-spec.json'), 'utf8');
const spec = JSON.parse(specText);
const parent = `<script>window.__CA_HPD_PRESET__=${JSON.stringify({ id: 'sync-example', spec }).replace(/</g, '\\u003c')}</script><iframe src="/designer.html?debug" style="width:1600px;height:1000px"></iframe>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url?.startsWith('/designer.html') ? html : parent); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const frame = page.frames().find(f => f.url().includes('/designer.html'));
  await frame.waitForFunction(() => window.__designer, { timeout: 20000 });
  const data = await frame.evaluate(required => {
    const d = window.__designer;
    const missing = required.filter(k => d[k] == null || (!['app', 'CAT'].includes(k) && typeof d[k] !== 'function'));
    if (missing.length) throw new Error('Missing API: ' + missing.join(', '));
    const bytes = d.dxfBytes('gb', 'layout');
    const bounds = d.app.geo.bounds;
    const shot = d.shot2d('layout', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, Math.min(1400 / bounds.w, 1000 / bounds.h));
    if (!bytes.length || !shot.startsWith('data:image/png')) throw new Error('Export smoke test failed');
    return { catalog: Object.fromEntries(Object.entries(d.CAT).map(([k, v]) => [k, { name: v.name, type: v.type, w: v.w, d: v.d, h: v.h }])), plan: d.app.plan, checks: d.runChecks().issues, runtime: { building: d.bld, regions: d.app.rooms.regions, bounds, api: Object.keys(d), dxfBytes: bytes.length, pngLength: shot.length } };
  }, required);
  const sizes = JSON.parse(await readFile(join(upstream, 'reference/catalog-sizes.json'), 'utf8'));
  if (Object.keys(sizes).some(key => !(key in data.catalog))) throw new Error('Runtime catalog is missing reference keys');
  console.log('Reference keys', Object.keys(sizes).length, 'runtime keys', Object.keys(data.catalog).length);
  for (const dir of ['public/vendor/house-designer', 'resources/hpd', 'tests/fixtures/hpd']) await mkdir(dir, { recursive: true });
  const json = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
  await writeFile('public/vendor/house-designer/designer.html', html);
  await writeFile('public/vendor/house-designer/LICENSE', await readFile(join(upstream, 'LICENSE')));
  await json('public/vendor/house-designer/VERSION.json', { commit, syncedAt: new Date().toISOString(), patches: ['remove __preset script', 'inject __ca_bridge with early error collection after charset'] });
  await json('resources/hpd/catalog.json', data.catalog);
  await json('tests/fixtures/hpd/example-plan.json', data.plan);
  await json('tests/fixtures/hpd/example-checks.json', data.checks);
  await json('tests/fixtures/hpd/runtime-probe.json', data.runtime);
  await writeFile('tests/fixtures/hpd/example-spec.json', specText);
  // The designer's own references go to the model with every edit (spec format) or when the request needs them.
  for (const name of ['spec-format', 'furnishing', 'mep-rules', 'cad-conventions']) await writeFile(`resources/hpd/${name}.md`, await readFile(join(upstream, `reference/${name}.md`)));
  console.log(JSON.stringify({ commit, catalogKeys: Object.keys(data.catalog).length, dxfBytes: data.runtime.dxfBytes }));
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
