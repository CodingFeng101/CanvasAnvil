/**
 * Experimental: a minimal agent loop that runs the slide-alchemy skill
 * against any OpenAI-compatible chat model with tool calling and vision.
 *
 *   npx tsx scripts/slide-agent/agent.ts --run <dir> <slide.png> [<slide.png> ...]
 *
 * Environment (keys never go on the command line):
 *   SLIDE_AGENT_API_KEY / SLIDE_AGENT_BASE_URL / SLIDE_AGENT_MODEL   the driving model
 *   SLIDE_ALCHEMY_IMAGE_API_KEY / _BASE_URL / _MODEL                 read by the skill's generate_image.py
 *   SLIDE_ALCHEMY_DIR   skill folder (default ~/.claude/skills/slide-alchemy)
 *   SLIDE_AGENT_MAX_STEPS (default 200), SLIDE_AGENT_QA_ROUNDS (default 3),
 *   SLIDE_AGENT_COMPACT_AT (prompt tokens, default 60000)
 *
 * By default the model can only run the skill's own scripts. Setting
 * SLIDE_AGENT_ALLOW_PYTHON=1 adds run_python, which executes model-written code
 * in the run directory: local experiments only, a product needs a sandbox.
 */
import { spawn } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

// ---------- config ----------
// Keys may live in a git-ignored scripts/slide-agent/.env.local (KEY=value per line);
// variables already set in the environment win.
const envFile = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const args = process.argv.slice(2);
const runIdx = args.indexOf("--run");
if (runIdx < 0 || !args[runIdx + 1]) {
  console.error("usage: agent.ts --run <dir> <slide.png> [...]");
  process.exit(1);
}
const RUN = resolve(args[runIdx + 1]);
const SOURCES = args.filter((_, i) => i !== runIdx && i !== runIdx + 1).map((p) => resolve(p));
const SKILL = resolve(process.env.SLIDE_ALCHEMY_DIR || join(homedir(), ".claude", "skills", "slide-alchemy"));
const API_KEY = process.env.SLIDE_AGENT_API_KEY || "";
const BASE_URL = (process.env.SLIDE_AGENT_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODEL = process.env.SLIDE_AGENT_MODEL || "";
const MAX_STEPS = Number(process.env.SLIDE_AGENT_MAX_STEPS || 200);
const PYTHON = process.env.PYTHON || "python";
const QA_MAX_ROUNDS = Number(process.env.SLIDE_AGENT_QA_ROUNDS || 3);
/** Rebuild the context from a progress note once a request's prompt grows past this. */
const COMPACT_AT = Number(process.env.SLIDE_AGENT_COMPACT_AT || 60000);
const QA_SCRIPT = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "qa_check.py");
const qa = { rounds: 0, ranSinceExport: false, passedSinceExport: false, lastReport: "" };

if (!API_KEY || !MODEL) {
  console.error("Set SLIDE_AGENT_API_KEY and SLIDE_AGENT_MODEL (and SLIDE_AGENT_BASE_URL for non-OpenAI gateways).");
  process.exit(1);
}
if (!existsSync(join(SKILL, "SKILL.md"))) {
  console.error(`slide-alchemy not found at ${SKILL}`);
  process.exit(1);
}

// A run directory holding more than the sources is a resumed run.
const RESUMING = existsSync(RUN) && readdirSync(RUN).some((f) => !["source", "agent_log.jsonl", ".view"].includes(f));
mkdirSync(join(RUN, "source"), { recursive: true });
SOURCES.forEach((src, i) => {
  copyFileSync(src, join(RUN, "source", `slide_${String(i + 1).padStart(3, "0")}${extname(src) || ".png"}`));
});
const LOG = join(RUN, "agent_log.jsonl");
const log = (entry: unknown) => appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...(entry as object) }) + "\n");

// ---------- path guards ----------
function inside(root: string, p: string) {
  const r = relative(root, p);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}
function runPath(p: string) {
  const abs = resolve(RUN, p);
  if (!inside(RUN, abs)) throw new Error(`path escapes the run directory: ${p}`);
  return abs;
}
function readablePath(p: string) {
  const fromRun = resolve(RUN, p);
  if (inside(RUN, fromRun) && existsSync(fromRun)) return fromRun;
  const fromSkill = resolve(SKILL, p);
  if (inside(SKILL, fromSkill) && existsSync(fromSkill)) return fromSkill;
  throw new Error(`not found in run or skill directory: ${p}`);
}

// ---------- process helper ----------
function exec(cmd: string, argv: string[], opts: { cwd: string; timeoutMs: number; stdin?: string }) {
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
const clip = (s: string, n = 6000) => (s.length > n ? `${s.slice(0, n / 2)}\n...[${s.length - n} chars cut]...\n${s.slice(-n / 2)}` : s);

// ---------- tools ----------
type ToolResult = { text: string; image?: { path: string; dataUrl: string } };

const SCRIPTS = new Set(readdirSync(join(SKILL, "scripts")).filter((f) => f.endsWith(".py")));

const tools: Record<string, { description: string; parameters: object; run: (a: any) => Promise<ToolResult> }> = {
  read_file: {
    description: "Read a text file from the run directory or the skill directory (SKILL.md, references/*.md, scripts/*.py, JSON outputs).",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    run: async ({ path }) => ({ text: clip(readFileSync(readablePath(path), "utf8"), 30000) }),
  },
  list_dir: {
    description: "List files under a directory of the run directory (recursive, max 300 entries).",
    parameters: { type: "object", properties: { path: { type: "string", default: "." } } },
    run: async ({ path = "." }) => {
      const root = runPath(path);
      const lines: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          if (lines.length >= 300) return;
          const p = join(d, f);
          const st = statSync(p);
          if (st.isDirectory()) walk(p);
          else lines.push(`${relative(RUN, p).replace(/\\/g, "/")}  ${st.size}B`);
        }
      };
      walk(root);
      return { text: lines.join("\n") || "(empty)" };
    },
  },
  write_file: {
    description: "Write a text file (JSON, SVG, prompt .txt, crop spec) inside the run directory. Creates folders.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    run: async ({ path, content }) => {
      const abs = runPath(path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      return { text: `wrote ${relative(RUN, abs)} (${content.length} chars)` };
    },
  },
  run_script: {
    description: `Run one of the skill's bundled scripts with the run directory as cwd. Available: ${[...SCRIPTS].join(", ")}. Pass --help first if unsure of arguments. Long prompts go in a file passed as @file.txt.`,
    parameters: {
      type: "object",
      properties: { script: { type: "string" }, args: { type: "array", items: { type: "string" } } },
      required: ["script"],
    },
    run: async ({ script, args: argv = [] }) => {
      const name = basename(String(script));
      if (!SCRIPTS.has(name)) throw new Error(`unknown script ${script}`);
      const r = await exec(PYTHON, [join(SKILL, "scripts", name), ...argv.map(String)], { cwd: RUN, timeoutMs: 15 * 60_000 });
      return { text: `exit ${r.code}\n${clip(r.out)}` };
    },
  },
  run_python: {
    description:
      "Run a short Python snippet with the run directory as cwd (Pillow, numpy, opencv, python-pptx available). Use for glue work the bundled scripts do not cover: resizing, measuring pixels, building crop specs. Not for drawing assets or reading text.",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    run: async ({ code }) => {
      const r = await exec(PYTHON, ["-"], { cwd: RUN, timeoutMs: 5 * 60_000, stdin: String(code) });
      return { text: `exit ${r.code}\n${clip(r.out)}` };
    },
  },
  view_image: {
    description: "Look at an image from the run directory (downscaled). Use it to inspect sources, bases, asset sheets, contact sheets and compare images.",
    parameters: { type: "object", properties: { path: { type: "string" }, max_side: { type: "number", default: 1280 } }, required: ["path"] },
    run: async ({ path, max_side = 1280 }) => {
      const abs = readablePath(path);
      // The JPEG goes through a file, not stdout: base64 of a large page would overrun exec's output cap.
      const cache = join(RUN, ".view");
      mkdirSync(cache, { recursive: true });
      const tmp = join(cache, "view.jpg");
      const side = Math.min(Number(max_side) || 1280, 1600);
      const code = `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGBA")\nw,h=im.size\ns=min(1,${side}/max(w,h))\nim=im.resize((max(1,int(w*s)),max(1,int(h*s))))\nbg=Image.new("RGBA",im.size,(200,200,200,255))\nbg.alpha_composite(im)\nbg.convert("RGB").save(sys.argv[2],"JPEG",quality=85)\nprint(f"{w}x{h}")`;
      const r = await exec(PYTHON, ["-c", code, abs, tmp], { cwd: RUN, timeoutMs: 60_000 });
      if (r.code !== 0) throw new Error(r.out);
      const size = r.out.trim().split(/\r?\n/).pop();
      const b64 = readFileSync(tmp).toString("base64");
      const rel = relative(RUN, abs).replace(/\\/g, "/");
      return { text: `image ${rel}, original size ${size} (transparent areas shown grey)`, image: { path: rel, dataUrl: `data:image/jpeg;base64,${b64}` } };
    },
  },
  export_preview: {
    description: "Export every slide of a PPTX in the run directory to PNG files with PowerPoint (out/preview/slide_001.png ...).",
    parameters: { type: "object", properties: { pptx: { type: "string", default: "out/editable.pptx" }, out_dir: { type: "string", default: "out/preview" }, width: { type: "number", default: 1672 } } },
    run: async ({ pptx = "out/editable.pptx", out_dir = "out/preview", width = 1672 }) => {
      const src = runPath(pptx);
      const dst = runPath(out_dir);
      mkdirSync(dst, { recursive: true });
      const ps = `$ErrorActionPreference='Stop'
$pp = New-Object -ComObject PowerPoint.Application
$p = $pp.Presentations.Open('${src.replace(/'/g, "''")}', $true, $false, $false)
$ratio = $p.PageSetup.SlideHeight / $p.PageSetup.SlideWidth
$i = 1
foreach ($s in $p.Slides) { $s.Export((Join-Path '${dst.replace(/'/g, "''")}' ('slide_{0:D3}.png' -f $i)), 'PNG', ${Number(width)}, [int](${Number(width)} * $ratio)); $i++ }
$p.Close(); $pp.Quit()
"exported $($i-1) slides"`;
      const r = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { cwd: RUN, timeoutMs: 5 * 60_000 });
      qa.ranSinceExport = false;
      qa.passedSinceExport = false;
      return { text: `exit ${r.code}\n${clip(r.out, 3000)}\nNext: run qa_check.` };
    },
  },
  qa_check: {
    description:
      "Deterministic QA of out/preview against source/: similarity, hot regions (missing/misplaced/discoloured non-text elements, as source-pixel bboxes), chroma-key green spill, and OCR text checks (missing, moved, wrong size). Writes out/qa/qa_report.json and out/qa/slide_XXX_qa.png (source | preview, red boxes = hot regions). Run after every export_preview.",
    parameters: { type: "object", properties: {} },
    run: async () => {
      const r = await exec(PYTHON, [QA_SCRIPT, RUN, "--skill", SKILL], { cwd: RUN, timeoutMs: 10 * 60_000 });
      const passed = /^QA PASS/m.test(r.out);
      qa.rounds++;
      qa.passedSinceExport = passed;
      qa.ranSinceExport = true;
      qa.lastReport = clip(r.out, 3000);
      const left = QA_MAX_ROUNDS - qa.rounds;
      const tail = passed
        ? "\nQA passed. You may finish."
        : left > 0
          ? `\nQA failed: rework round ${qa.rounds}/${QA_MAX_ROUNDS}. View out/qa/slide_XXX_qa.png for failing slides, find the cause of each problem in your artifacts (compose_spec bboxes, missing elements, slicing tolerance/edge-px, a regenerated asset), fix it, recompose, export_preview and run qa_check again.`
          : "\nQA failed and the rework budget is spent. Finish now and list every remaining problem in the summary.";
      return { text: `exit ${r.code}\n${clip(r.out, 5000)}${tail}` };
    },
  },
  finish: {
    description: "Call once the PPTX is composed, previews exported and qa_check passed (or the rework budget is spent). Summarise what is editable and the known defects.",
    parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    run: async ({ summary }) => {
      if (!qa.ranSinceExport) throw new Error("finish refused: run export_preview and then qa_check first.");
      if (!qa.passedSinceExport && qa.rounds < QA_MAX_ROUNDS)
        throw new Error(`finish refused: the last qa_check failed and ${QA_MAX_ROUNDS - qa.rounds} rework round(s) remain. Fix the reported problems.`);
      return { text: summary };
    },
  },
};

// Model-written code only runs when the person running the experiment opts in.
if (process.env.SLIDE_AGENT_ALLOW_PYTHON !== "1") delete tools.run_python;

// ---------- prompt ----------
const skillMd = readFileSync(join(SKILL, "SKILL.md"), "utf8");
const system = `You are an agent that executes the slide-alchemy skill with tools. The skill text follows; it is your operating manual and its rules are binding.

<skill>
${skillMd}
</skill>

Environment:
- Run directory (cwd for every tool, paths are relative to it): already contains source/slide_XXX.png, the rendered source pages. Step 1 is done.
- Skill directory: references/* and scripts/* are readable with read_file using paths like "references/workflow.md".
- There is no built-in image tool: use run_script generate_image.py (configured through the environment already). Put prompts in prompts/*.txt and pass them as @prompts/x.txt.
- Preview export: use the export_preview tool (PowerPoint), then compare_preview.py.
- Quality gate: after every export_preview, run qa_check. finish is refused until qa_check passes or ${QA_MAX_ROUNDS} QA rounds are spent. Treat each reported problem as a defect to fix, not to note: a hot region means an element is missing, misplaced, mis-sized or the wrong colour (compare the boxed areas in out/qa/slide_XXX_qa.png and fix the matching compose_spec entry or asset); green spill means re-slice with a larger --edge-px / --tolerance or regenerate the sheet; a text problem means fix that text's box, size or content in the compose spec. Ink the OCR missed (e.g. a gradient-coloured word next to dark text) must become text too.
- Keep analysis/progress.md current at milestones (steps done, artifacts, decisions, open defects, next step): the context may be compacted to it.
- Images you view do not survive a compaction; record conclusions in text or files.
- Work step by step. Read a reference right before the step that needs it. Check script --help before first use.
- When a step fails, consult references/failure-decision-tree.md, fix and retry; do not skip the step.

The user has explicitly requested: run unattended, full automatic run, no intermediate confirmation (不要中途确认). Make the base-grouping and base-preview decisions yourself, note them in analysis/decisions.md, and continue.`;

const user = `Rebuild the ${SOURCES.length} source page(s) in source/ into an editable PPTX at out/editable.pptx, following the skill workflow end to end. Finish with the finish tool.${
  RESUMING
    ? "\n\nThis is a resumed run: an earlier attempt stopped part-way (a network failure, not a judgement on its work). List the run directory and read analysis/decisions.md and the JSON files first, look at the existing bases and asset sheets, keep artifacts that are sound, and continue from the first step whose required artifact is missing or defective."
    : ""
}`;

// ---------- loop ----------
type Msg = { role: string; content?: any; tool_calls?: any[]; tool_call_id?: string; name?: string };
const messages: Msg[] = [
  { role: "system", content: system },
  { role: "user", content: user },
];
const toolSpecs = Object.entries(tools).map(([name, t]) => ({ type: "function", function: { name, description: t.description, parameters: t.parameters } }));
const usage = { prompt: 0, cached: 0, completion: 0, requests: 0, compactions: 0 };

function account(resp: any) {
  usage.requests++;
  usage.prompt += resp.usage?.prompt_tokens || 0;
  usage.cached += resp.usage?.prompt_tokens_details?.cached_tokens || 0;
  usage.completion += resp.usage?.completion_tokens || 0;
}

/**
 * History is append-only between compactions so a gateway's prefix cache keeps
 * hitting; when a request grows past COMPACT_AT the model writes a progress
 * note and the conversation restarts from it.
 */
async function compact(step: number) {
  messages.push({
    role: "user",
    content:
      "CONTEXT COMPACTION. Reply with plain text only, no tool calls. Write the progress note that will replace this whole conversation: workflow steps completed with their artifact paths; decisions taken and why; the current QA state and every open defect with its location; facts learned about script arguments or failures; the exact next actions. Be complete but terse.",
  });
  const resp = await chat("none");
  account(resp);
  const note = String(resp.choices?.[0]?.message?.content || "").trim();
  usage.compactions++;
  const notePath = join(RUN, "analysis", `compaction_${usage.compactions}.md`);
  mkdirSync(dirname(notePath), { recursive: true });
  writeFileSync(notePath, note, "utf8");
  const qaState = qa.rounds
    ? `\n\nQA state from the harness: ${qa.rounds}/${QA_MAX_ROUNDS} rounds used; last report:\n${qa.lastReport}`
    : "";
  messages.length = 0;
  messages.push(
    { role: "system", content: system },
    {
      role: "user",
      content: `${user}\n\nThe context was compacted at step ${step}. Your own progress note:\n\n${note}${qaState}\n\nContinue from the next action. Re-read files or re-view images only if you need them.`,
    },
  );
  console.log(`[${step}] == context compacted (${note.length} chars note) ==`);
  log({ step, compaction: usage.compactions, note });
}

async function chat(toolChoice: "auto" | "none" = "auto"): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tools: toolSpecs, tool_choice: toolChoice }),
      });
    } catch (err: any) {
      // Dropped connections and TLS resets: the request never got an answer.
      console.error(`[model] network error: ${err?.cause?.message || err?.message || err}`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    console.error(`[model] HTTP ${res.status}: ${text.slice(0, 400)}`);
    // Gateways report a flaky upstream as 400 "upstream_error"; that one is worth a retry.
    const retryable = res.status >= 500 || res.status === 429 || /upstream/i.test(text);
    if (!retryable) throw new Error(`model request failed: ${res.status}`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  throw new Error("model request failed after retries");
}

const started = Date.now();
let finished = false;
let lastPrompt = 0;
for (let step = 1; step <= MAX_STEPS && !finished; step++) {
  if (lastPrompt > COMPACT_AT) await compact(step);
  const resp = await chat();
  account(resp);
  lastPrompt = resp.usage?.prompt_tokens || 0;
  const msg = resp.choices?.[0]?.message;
  if (!msg) throw new Error(`empty model response: ${JSON.stringify(resp).slice(0, 300)}`);
  messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
  if (msg.content) console.log(`\n[${step}] ${String(msg.content).slice(0, 600)}`);
  log({ step, assistant: msg.content, tool_calls: msg.tool_calls?.map((c: any) => ({ name: c.function.name, args: c.function.arguments.slice(0, 2000) })) });

  if (!msg.tool_calls?.length) {
    messages.push({ role: "user", content: "Continue with the workflow using tools. Call finish only when out/editable.pptx and its previews exist and QA is done." });
    continue;
  }
  const images: ToolResult["image"][] = [];
  for (const call of msg.tool_calls) {
    const name = call.function.name;
    let result: ToolResult;
    try {
      const a = JSON.parse(call.function.arguments || "{}");
      console.log(`[${step}] -> ${name} ${clip(call.function.arguments || "", 240).replace(/\s+/g, " ")}`);
      if (!tools[name]) throw new Error(`unknown tool ${name}`);
      result = await tools[name].run(a);
      if (name === "finish") finished = true;
    } catch (err: any) {
      result = { text: `ERROR: ${err?.message || err}` };
    }
    console.log(`[${step}] <- ${clip(result.text, 300).replace(/\s+/g, " ")}`);
    log({ step, tool: name, result: clip(result.text, 4000) });
    messages.push({ role: "tool", tool_call_id: call.id, content: result.text });
    if (result.image) images.push(result.image);
  }
  // Images go in a user turn: many OpenAI-compatible gateways reject images inside tool messages.
  for (const img of images) {
    messages.push({ role: "user", content: [{ type: "text", text: `Viewed ${img!.path}` }, { type: "image_url", image_url: { url: img!.dataUrl } }] });
  }
}

const summary = {
  finished,
  minutes: ((Date.now() - started) / 60000).toFixed(1),
  usage,
  model: MODEL,
  qa: { rounds: qa.rounds, passed: qa.passedSinceExport, last: qa.lastReport },
};
console.log("\n=== done ===", summary);
log({ done: summary });
writeFileSync(join(RUN, "agent_summary.json"), JSON.stringify(summary, null, 2));
