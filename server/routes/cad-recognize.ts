import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pythonCommand, pythonReady } from "./cad-python";

/**
 * Floorplan upload: runs server/recognizer/recognize.py (the designer's recognition scripts, routed by
 * input) on the uploaded drawing and answers with its JSON. No separate service: the scripts run on this
 * server, which needs Python with server/recognizer/requirements.txt (/api/config `cadRecognizer`).
 */

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, "server", "recognizer", "recognize.py");
const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT = 10 * 60 * 1000;

/** Whether uploads can be recognized here (for /api/config). */
export async function cadRecognizerAvailable(): Promise<boolean> {
  return existsSync(SCRIPT) && (await pythonReady());
}

const field = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : "";
};
/** A plain file name with its extension, safe on any file system. */
const safeName = (prefix: string, file: File) => `${prefix}${path.extname(file.name || "").toLowerCase().replace(/[^.\w]/g, "")}`;

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(pythonCommand(), [SCRIPT, ...args], {
      cwd: ROOT,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONWARNINGS: "ignore" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    const timer = setTimeout(() => child.kill(), TIMEOUT);
    child.on("error", (error) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: error.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

export async function POST(req: Request) {
  if (!(await cadRecognizerAvailable())) {
    return Response.json({ error: "Floorplan recognition needs Python with server/recognizer/requirements.txt on the server" }, { status: 501 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return Response.json({ error: "Expected multipart form data with a file" }, { status: 400 });
  const file2 = form.get("file2");
  const files = [file, ...(file2 instanceof File ? [file2] : [])];
  if (files.some((item) => item.size > MAX_BYTES)) return Response.json({ error: "文件超过 25MB" }, { status: 413 });

  const dir = await mkdtemp(path.join(os.tmpdir(), "cad-recognize-"));
  try {
    const first = path.join(dir, safeName("input", file));
    await writeFile(first, Buffer.from(await file.arrayBuffer()));
    const args = ["--file", first];
    if (file2 instanceof File) {
      const second = path.join(dir, safeName("layout", file2));
      await writeFile(second, Buffer.from(await file2.arrayBuffer()));
      args.push("--file2", second);
    }
    for (const [name, flag] of [["route", "--route"], ["totalWidth", "--total-width"], ["totalHeight", "--total-height"], ["scale", "--scale"], ["names", "--names"]] as const) {
      const value = field(form, name);
      if (value) args.push(flag, value);
    }
    const result = await run(args);
    const line = result.stdout.trim().split(/\r?\n/).pop() || "";
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(line); } catch { /* the script broke before its answer */ }
    if (!body) {
      const tail = result.stderr.trim().split(/\r?\n/).slice(-3).join(" | ");
      return Response.json({ error: `识别失败（exit ${result.code}）${tail ? `：${tail}` : ""}` }, { status: 500 });
    }
    if (typeof body.error === "string") return Response.json({ error: body.error }, { status: Number(body.status) || 422 });
    return Response.json(body);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
