/**
 * Shared plumbing for the slide-alchemy experiments: config, processes,
 * images for the model, OpenAI-compatible chat, and a small agent-node runner.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// Keys may live in a git-ignored .env.local next to this file; the environment wins.
const envFile = join(HERE, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const SKILL = resolve(process.env.SLIDE_ALCHEMY_DIR || join(homedir(), ".claude", "skills", "slide-alchemy"));
export const PYTHON = process.env.PYTHON || "python";
const API_KEY = process.env.SLIDE_AGENT_API_KEY || "";
const BASE_URL = (process.env.SLIDE_AGENT_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export const MODEL = process.env.SLIDE_AGENT_MODEL || "";

export function requireConfig() {
  if (!API_KEY || !MODEL) {
    console.error("Set SLIDE_AGENT_API_KEY and SLIDE_AGENT_MODEL (and SLIDE_AGENT_BASE_URL) in the environment or scripts/slide-agent/.env.local.");
    process.exit(1);
  }
  if (!existsSync(join(SKILL, "SKILL.md"))) {
    console.error(`slide-alchemy not found at ${SKILL}`);
    process.exit(1);
  }
}

export const clip = (s: string, n = 6000) => (s.length > n ? `${s.slice(0, n / 2)}\n...[${s.length - n} chars cut]...\n${s.slice(-n / 2)}` : s);
export const skillRef = (name: string) => readFileSync(join(SKILL, "references", name), "utf8");

export function exec(cmd: string, argv: string[], opts: { cwd: string; timeoutMs: number; stdin?: string }) {
  return new Promise<{ code: number | null; out: string }>((done) => {
    const child = spawn(cmd, argv, { cwd: opts.cwd, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let out = "";
    const add = (b: Buffer) => {
      out += b.toString("utf8");
      if (out.length > 200_000) out = out.slice(-200_000);
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const timer = setTimeout(() => {
      child.kill();
      out += `\n[killed after ${opts.timeoutMs / 1000}s]`;
    }, opts.timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, out });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      done({ code: -1, out: String(err) });
    });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
  });
}

export const script = (name: string, argv: string[], cwd: string, timeoutMs = 15 * 60_000) =>
  exec(PYTHON, [join(SKILL, "scripts", name), ...argv], { cwd, timeoutMs });

/** One mutex per shared resource (PowerPoint's COM server handles one export at a time). */
export function mutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}

/** A downscaled JPEG of any image, as a chat content part. */
export async function imagePart(path: string, maxSide = 1280, label?: string) {
  const tmp = join(tmpdir(), `slide-agent-${randomUUID()}.jpg`);
  const code = `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGBA")\nw,h=im.size\ns=min(1,${maxSide}/max(w,h))\nim=im.resize((max(1,int(w*s)),max(1,int(h*s))))\nbg=Image.new("RGBA",im.size,(200,200,200,255))\nbg.alpha_composite(im)\nbg.convert("RGB").save(sys.argv[2],"JPEG",quality=85)\nprint(f"{w}x{h}")`;
  const r = await exec(PYTHON, ["-c", code, path, tmp], { cwd: HERE, timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(r.out);
  const size = r.out.trim().split(/\r?\n/).pop();
  const b64 = readFileSync(tmp).toString("base64");
  return [
    { type: "text", text: `${label || path} (original ${size}; transparent areas shown grey)` },
    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
  ];
}

// ---------- model ----------
export const usage = { prompt: 0, cached: 0, completion: 0, requests: 0, modelSeconds: 0 };

export async function chat(body: Record<string, unknown>): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, ...body }),
      });
    } catch (err: any) {
      console.error(`[model] network error: ${err?.cause?.message || err?.message || err}`);
      await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    usage.modelSeconds += (Date.now() - t0) / 1000;
    if (res.ok) {
      const json = JSON.parse(text);
      usage.requests++;
      usage.prompt += json.usage?.prompt_tokens || 0;
      usage.cached += json.usage?.prompt_tokens_details?.cached_tokens || 0;
      usage.completion += json.usage?.completion_tokens || 0;
      return json;
    }
    console.error(`[model] HTTP ${res.status}: ${text.slice(0, 300)}`);
    const retryable = res.status >= 500 || res.status === 429 || /upstream/i.test(text);
    if (!retryable) throw new Error(`model request failed: ${res.status} ${text.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  throw new Error("model request failed after retries");
}

/** Pull the first JSON object out of a model reply (bare or fenced). */
export function parseJsonReply(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in reply");
  return JSON.parse(body.slice(start, end + 1));
}

// ---------- agent node ----------
export type ToolResult = { text: string; images?: any[][] };
export type Tool = { description: string; parameters: object; run: (a: any) => Promise<ToolResult> };

/**
 * A short, focused agent: fixed system prompt and inputs, a small tool set,
 * tool calls of one turn run concurrently. Ends when a tool returns
 * `{ done: true }` through the `isDone` hook, or after maxSteps.
 */
export async function runNode(opts: {
  name: string;
  system: string;
  user: any[];
  tools: Record<string, Tool>;
  maxSteps: number;
  isDone: () => boolean;
  logFile: string;
}) {
  const messages: any[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.user },
  ];
  const specs = Object.entries(opts.tools).map(([name, t]) => ({ type: "function", function: { name, description: t.description, parameters: t.parameters } }));
  const log = (e: object) => appendFileSync(opts.logFile, JSON.stringify({ t: new Date().toISOString(), node: opts.name, ...e }) + "\n");
  mkdirSync(dirname(opts.logFile), { recursive: true });
  for (let step = 1; step <= opts.maxSteps; step++) {
    const resp = await chat({ messages, tools: specs, tool_choice: "auto", parallel_tool_calls: true });
    const msg = resp.choices?.[0]?.message;
    if (!msg) throw new Error(`[${opts.name}] empty response`);
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    log({ step, assistant: msg.content, calls: msg.tool_calls?.map((c: any) => ({ name: c.function.name, args: c.function.arguments.slice(0, 1500) })) });
    if (!msg.tool_calls?.length) {
      messages.push({ role: "user", content: "Use the tools to continue; call done when finished." });
      continue;
    }
    const results = await Promise.all(
      msg.tool_calls.map(async (call: any): Promise<ToolResult> => {
        const name = call.function.name;
        console.log(`[${opts.name}#${step}] -> ${name} ${clip(call.function.arguments || "", 160).replace(/\s+/g, " ")}`);
        try {
          if (!opts.tools[name]) throw new Error(`unknown tool ${name}`);
          return await opts.tools[name].run(JSON.parse(call.function.arguments || "{}"));
        } catch (err: any) {
          return { text: `ERROR: ${err?.message || err}` };
        }
      }),
    );
    const extraImages: any[] = [];
    msg.tool_calls.forEach((call: any, i: number) => {
      const r = results[i];
      console.log(`[${opts.name}#${step}] <- ${call.function.name}: ${clip(r.text, 220).replace(/\s+/g, " ")}`);
      log({ step, tool: call.function.name, result: clip(r.text, 4000) });
      messages.push({ role: "tool", tool_call_id: call.id, content: r.text });
      for (const img of r.images || []) extraImages.push(...img);
    });
    // Images go in a user turn: many gateways reject images inside tool messages.
    if (extraImages.length) messages.push({ role: "user", content: extraImages });
    if (opts.isDone()) return step;
  }
  return opts.maxSteps;
}
