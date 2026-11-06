import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * Editable PPTX export: the slide-alchemy agent pipeline, run as a job.
 *
 * The pipeline (scripts/slide-agent/pipeline.ts) needs Python, the skill's
 * scripts and PowerPoint for previews, so it runs here rather than in the
 * browser, as a child process on the same server -- no extra port. A run takes
 * minutes, so the client creates a job, uploads the slides one request each
 * (each stays well under the body limit), starts it, then polls for the
 * pipeline's progress events and fetches the finished file. Intermediate
 * pictures the events point at are served from the job's run directory.
 *
 * One job at a time: every run drives the same PowerPoint for its previews.
 */

type JobState = "uploading" | "running" | "done" | "failed";

/** One "@@event" line from the pipeline: stage, line or artifact (see pipeline.ts). */
type ProgressEvent = Record<string, unknown> & { type: string };

interface Job {
  id: string;
  dir: string;
  count: number;
  qaRounds: number;
  received: Set<number>;
  state: JobState;
  events: ProgressEvent[];
  error: string;
  startedAt: number;
  finishedAt: number;
}

const jobs = new Map<string, Job>();
const ROOT = process.cwd();
const PIPELINE = path.join(ROOT, "scripts", "slide-agent", "pipeline.ts");
const RUNS = path.join(ROOT, "runs", "editable-export");
const OUTPUT = path.join("out", "editable.pptx");
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const createSchema = z.object({
  action: z.literal("create"),
  count: z.number().int().min(1).max(60),
  // The app asks for at least three check-and-fix rounds per page.
  qaRounds: z.number().int().min(3).max(10),
});
const slideSchema = z.object({
  action: z.literal("slide"),
  jobId: z.string(),
  index: z.number().int().min(0),
  dataUrl: z.string().startsWith("data:image/png;base64,"),
});
const startSchema = z.object({ action: z.literal("start"), jobId: z.string() });
const statusSchema = z.object({ action: z.literal("status"), jobId: z.string(), after: z.number().int().min(0).default(0) });
const bodySchema = z.union([createSchema, slideSchema, startSchema, statusSchema]);

const EVENTS = "events.jsonl";
const FINISHED = "console.txt";

/**
 * A job by id, from memory or, after a server restart (the dev server reloads
 * whenever server code changes), rebuilt from its run directory: the events
 * it logged so far, done once the deck exists, failed once the run ended
 * without one. The pipeline process itself outlives the reload.
 */
function getJob(id: string): Job | undefined {
  const known = jobs.get(id);
  if (known || !/^[\w-]+$/.test(id)) return known;
  const dir = path.join(RUNS, id);
  if (!existsSync(path.join(dir, "job.json"))) return undefined;
  const meta = JSON.parse(readFileSync(path.join(dir, "job.json"), "utf8"));
  const events = existsSync(path.join(dir, EVENTS))
    ? readFileSync(path.join(dir, EVENTS), "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try {
          return [JSON.parse(line) as ProgressEvent];
        } catch {
          return [];
        }
      })
    : [];
  const done = existsSync(path.join(dir, OUTPUT));
  const ended = existsSync(path.join(dir, FINISHED));
  const job: Job = {
    id,
    dir,
    count: meta.count,
    qaRounds: meta.qaRounds,
    received: new Set(Array.from({ length: meta.count }, (_, i) => i)),
    state: done ? "done" : ended ? "failed" : "running",
    events,
    error: !done && ended ? "导出中断，详见任务目录 console.txt" : "",
    startedAt: meta.startedAt || statSync(path.join(dir, "job.json")).mtimeMs,
    finishedAt: done || ended ? Date.now() : 0,
  };
  // Not cached while running: the next poll reads the newer events and state.
  if (job.state !== "running") jobs.set(id, job);
  return job;
}

const slidePath = (job: Job, index: number) => path.join(job.dir, "input", `slide_${String(index + 1).padStart(3, "0")}.png`);

/** The job's state plus the events after the `after`-th, so each poll sends only what is new. */
function status(job: Job, after = 0) {
  return {
    jobId: job.id,
    state: job.state,
    error: job.error,
    seconds: Math.round(((job.finishedAt || Date.now()) - job.startedAt) / 1000),
    events: job.events.slice(after),
    total: job.events.length,
  };
}

function start(job: Job) {
  const inputs = Array.from({ length: job.count }, (_, i) => slidePath(job, i));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", PIPELINE, "--run", job.dir, "--qa-rounds", String(job.qaRounds), ...inputs],
    { cwd: ROOT, windowsHide: true },
  );
  job.state = "running";
  job.startedAt = Date.now();

  let tail = "";
  let buffered = "";
  const onOutput = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    tail = (tail + text).slice(-4000);
    buffered += text;
    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("@@event ")) continue;
      try {
        job.events.push(JSON.parse(line.slice(8)));
        appendFileSync(path.join(job.dir, EVENTS), line.slice(8) + "\n");
      } catch {
        // A torn line is one lost event, not a failed run.
      }
    }
  };
  child.stdout.on("data", onOutput);
  child.stderr.on("data", onOutput);
  writeFileSync(path.join(job.dir, "job.json"), JSON.stringify({ count: job.count, qaRounds: job.qaRounds, startedAt: job.startedAt }, null, 2));

  child.on("close", (code) => {
    job.finishedAt = Date.now();
    writeFileSync(path.join(job.dir, FINISHED), tail);
    if (code === 0 && existsSync(path.join(job.dir, OUTPUT))) {
      job.state = "done";
      return;
    }
    job.state = "failed";
    // The last error line the pipeline printed says more than an exit code.
    const errorLine = tail.split(/\r?\n/).reverse().find((line) => /^\s*Error\b|Error:/.test(line));
    job.error = (errorLine || `pipeline exited with code ${code}`).trim().slice(0, 500);
  });
  child.on("error", (error) => {
    job.state = "failed";
    job.finishedAt = Date.now();
    job.error = error.message;
  });
}

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  if (body.action === "create") {
    if ([...jobs.values()].some((job) => job.state === "uploading" || job.state === "running")) {
      return Response.json({ error: "busy" }, { status: 409 });
    }
    const id = `${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const dir = path.join(RUNS, id);
    mkdirSync(path.join(dir, "input"), { recursive: true });
    const job: Job = {
      id,
      dir,
      count: body.count,
      qaRounds: body.qaRounds,
      received: new Set(),
      state: "uploading",
      events: [],
      error: "",
      startedAt: Date.now(),
      finishedAt: 0,
    };
    jobs.set(id, job);
    return Response.json({ jobId: id });
  }

  const job = getJob(body.jobId);
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });

  if (body.action === "slide") {
    if (job.state !== "uploading" || body.index >= job.count) {
      return Response.json({ error: "Not accepting slides" }, { status: 409 });
    }
    writeFileSync(slidePath(job, body.index), Buffer.from(body.dataUrl.slice(body.dataUrl.indexOf(",") + 1), "base64"));
    job.received.add(body.index);
    return Response.json({ received: job.received.size });
  }

  if (body.action === "start") {
    if (job.state !== "uploading") return Response.json(status(job));
    if (job.received.size !== job.count) {
      return Response.json({ error: `Only ${job.received.size}/${job.count} slides uploaded` }, { status: 409 });
    }
    start(job);
    return Response.json(status(job));
  }

  return Response.json(status(job, body.after));
}

/** GET /api/editable-export/file?job=<id>: the finished deck. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("job") || "";
  const job = getJob(id);
  if (!job || job.state !== "done") return Response.json({ error: "Not ready" }, { status: 404 });
  const file = readFileSync(path.join(job.dir, OUTPUT));
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="editable-${job.id}.pptx"`,
    },
  });
}

/**
 * GET /api/editable-export/artifact?job=<id>&path=<run-relative path>: an
 * intermediate picture. Only images, and only inside that job's directory.
 */
export async function GET_ARTIFACT(req: Request) {
  const params = new URL(req.url).searchParams;
  const job = getJob(params.get("job") || "");
  if (!job) return Response.json({ error: "Unknown job" }, { status: 404 });
  const file = path.resolve(job.dir, params.get("path") || "");
  const inside = path.relative(job.dir, file);
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()];
  if (!type || inside.startsWith("..") || path.isAbsolute(inside) || !existsSync(file)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(readFileSync(file)), {
    headers: { "content-type": type, "cache-control": "private, max-age=3600" },
  });
}
