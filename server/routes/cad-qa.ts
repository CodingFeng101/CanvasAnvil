import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { pythonCommand } from "./cad-python";

/**
 * The CAD delivery check (交付检查): the designer's own acceptance run, as the skill's run-designer --qa does it.
 *
 * The current design becomes one offline designer page (the template with the design as its preset, the way
 * the designer's build.py writes it); designer/scripts/qa.mjs --lite --quick then operates every button, tool,
 * panel and export of that page in a headless Chrome / Edge, and qa_files.py opens what it downloaded. A run
 * takes minutes, so the client starts a job and polls it; the step screenshots are served from the job's
 * directory. One run at a time: the runs would fight over the GPU.
 *
 * Available only where the skill's designer is present and a Chrome / Edge / Chromium is found
 * (/api/config `cadQa`); the app hides the button otherwise.
 */

type JobState = "running" | "done" | "failed";
interface Job { id: string; dir: string; state: JobState; error: string; startedAt: number; finishedAt: number }

const ROOT = process.cwd();
const DESIGNER = path.join(ROOT, "skill", "cad-skill", "designer");
const TEMPLATE = path.join(DESIGNER, "assets", "template.html");
const SCRIPTS = path.join(DESIGNER, "scripts");
const RUNS = path.join(ROOT, "runs", "cad-qa");
const jobs = new Map<string, Job>();

let chrome: Promise<string | null> | undefined;
/** The browser qa.mjs would launch (its browser.mjs search order), or null. */
function findChrome(): Promise<string | null> {
  return chrome ??= (async () => {
    if (!existsSync(TEMPLATE) || !existsSync(path.join(SCRIPTS, "qa.mjs"))) return null;
    try {
      const browser = await import(pathToFileURL(path.join(SCRIPTS, "browser.mjs")).href) as { chromeCandidates: () => string[] };
      return browser.chromeCandidates().find((file) => { try { return statSync(file).isFile(); } catch { return false; } }) ?? null;
    } catch { return null; }
  })();
}

/** Whether the delivery check can run here (for /api/config). */
export async function cadQaAvailable(): Promise<boolean> {
  return !!(await findChrome());
}

/** The designer as one offline page with this preset (designer/scripts/build.py: drop any preset, ours after <meta charset>). */
function designerPage(preset: Record<string, unknown>): string {
  const body = JSON.stringify(preset);
  const value = { id: createHash("sha1").update(body).digest("hex").slice(0, 12), ...preset };
  const script = `<script id="__preset">window.__PRESET__=${JSON.stringify(value).replace(/</g, "\\u003c")}</script>`;
  const html = readFileSync(TEMPLATE, "utf8").replace(/<script id="__preset">[\s\S]*?<\/script>/, "");
  const anchor = html.match(/<meta charset[^>]*>/i);
  if (!anchor) throw new Error("template.html has no <meta charset>; re-sync the skill");
  return html.replace(anchor[0], `${anchor[0]}${script}`);
}

function run(command: string, args: string[], log: string, timeout: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: SCRIPTS, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
    const timer = setTimeout(() => child.kill(), timeout);
    const write = (chunk: Buffer) => appendFileSync(log, chunk);
    child.stdout.on("data", write);
    child.stderr.on("data", write);
    child.on("error", (error) => { appendFileSync(log, `\n${error.message}\n`); clearTimeout(timer); resolve(-1); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code ?? -1); });
  });
}

async function start(job: Job, preset: Record<string, unknown>) {
  const page = path.join(job.dir, "设计器.html");
  writeFileSync(page, designerPage(preset));
  const qaDir = path.join(job.dir, "qa");
  const pages = await run(process.execPath, [path.join(SCRIPTS, "qa.mjs"), page, qaDir, "--lite", "--quick"], path.join(job.dir, "qa.log"), 1800000);
  // qa.mjs exits 2 when items failed (the report says which); anything else without a report is a broken run.
  if (!existsSync(path.join(qaDir, "report.json"))) {
    Object.assign(job, { state: "failed", error: `qa.mjs exited ${pages} without a report`, finishedAt: Date.now() });
    return;
  }
  const files = await run(pythonCommand(), [path.join(SCRIPTS, "qa_files.py"), qaDir], path.join(job.dir, "files.log"), 300000);
  writeFileSync(path.join(job.dir, "files.json"), JSON.stringify({ ok: files === 0, exit: files }));
  Object.assign(job, { state: "done", finishedAt: Date.now() });
}

type QaResult = { name: string; ok: boolean; msg?: string; shot?: string; unverified?: boolean };
const tail = (file: string, lines: number) => existsSync(file) ? readFileSync(file, "utf8").trim().split(/\r?\n/).slice(-lines).join("\n") : "";

function status(job: Job) {
  const qaDir = path.join(job.dir, "qa");
  const base = { jobId: job.id, state: job.state, error: job.error, seconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000) };
  if (job.state !== "done") {
    const shots = existsSync(path.join(qaDir, "shots")) ? readdirSync(path.join(qaDir, "shots")).length : 0;
    return { ...base, shots, log: tail(path.join(job.dir, "qa.log"), 3) };
  }
  const report = JSON.parse(readFileSync(path.join(qaDir, "report.json"), "utf8")) as { results: QaResult[]; errors: string[]; soft?: boolean };
  const files = JSON.parse(readFileSync(path.join(job.dir, "files.json"), "utf8")) as { ok: boolean };
  return {
    ...base,
    total: report.results.length,
    failed: report.results.filter((item) => !item.ok).map(({ name, msg, shot }) => ({ name, msg, shot })),
    unverified: report.results.filter((item) => item.unverified).map(({ name, shot }) => ({ name, shot })),
    shots: report.results.filter((item) => item.shot).map((item) => item.shot as string),
    pageErrors: report.errors.slice(0, 10),
    soft: !!report.soft,
    files: { ok: files.ok, summary: tail(path.join(job.dir, "files.log"), 12) },
    report: path.relative(ROOT, path.join(qaDir, "report.md")),
  };
}

function getJob(id: string): Job | undefined {
  const known = jobs.get(id);
  if (known || !/^[\w-]+$/.test(id)) return known;
  // After a dev-server reload: rebuild from the run directory (the qa process itself outlived the reload).
  const dir = path.join(RUNS, id);
  if (!existsSync(dir)) return undefined;
  const done = existsSync(path.join(dir, "files.json"));
  const job: Job = { id, dir, state: done ? "done" : "running", error: "", startedAt: statSync(dir).birthtimeMs, finishedAt: done ? statSync(path.join(dir, "files.json")).mtimeMs : 0 };
  // A run whose log has been quiet longer than qa.mjs's own time limit died with the server.
  const log = path.join(dir, "qa.log");
  const quiet = Date.now() - (existsSync(log) ? statSync(log).mtimeMs : job.startedAt);
  if (!done && quiet > 1800000) Object.assign(job, { state: "failed", error: "The delivery check stopped without a result", finishedAt: Date.now() });
  jobs.set(id, job);
  return job;
}

const bodySchema = z.union([
  z.object({ action: z.literal("start"), preset: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("status"), jobId: z.string() }),
]);

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Expected {action:'start', preset} or {action:'status', jobId}" }, { status: 400 });
  const body = parsed.data;
  if (body.action === "status") {
    const job = getJob(body.jobId);
    return job ? Response.json(status(job)) : Response.json({ error: "Unknown job" }, { status: 404 });
  }
  if (!(await findChrome())) return Response.json({ error: "The delivery check needs the skill's designer and Chrome / Edge on the server" }, { status: 501 });
  const preset = body.preset;
  if (!preset.plan && !preset.spec) return Response.json({ error: "preset needs plan or spec" }, { status: 400 });
  const busy = [...jobs.values()].find((job) => job.state === "running");
  if (busy) return Response.json({ error: "A delivery check is already running", jobId: busy.id }, { status: 409 });
  const id = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const job: Job = { id, dir: path.join(RUNS, id), state: "running", error: "", startedAt: Date.now(), finishedAt: 0 };
  mkdirSync(job.dir, { recursive: true });
  jobs.set(id, job);
  void start(job, preset).catch((error) => Object.assign(job, { state: "failed", error: String((error as Error).message ?? error), finishedAt: Date.now() }));
  return Response.json({ jobId: id, state: job.state });
}

/** A step screenshot of a run: /api/cad/qa/shot?jobId=…&name=….png */
export async function GET_SHOT(req: Request) {
  const url = new URL(req.url);
  const job = getJob(url.searchParams.get("jobId") || "");
  const name = url.searchParams.get("name") || "";
  if (!job || !/^[^\\/]+\.png$/.test(name) || name.includes("..")) return new Response("Not found", { status: 404 });
  const file = path.join(job.dir, "qa", "shots", name);
  if (!existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(readFileSync(file), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
}
