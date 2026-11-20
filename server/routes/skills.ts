import { cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";

/**
 * Settings → Skills & plugins: the skills under `skill/`, as a zip to download
 * or copied straight into the agent's skills folder on this computer.
 *
 * Installing writes into the home folder of the machine running the server, so
 * it is offered only when the page is opened from that machine (localhost).
 */

const ROOT = path.join(process.cwd(), "skill");
export const SKILL_NAMES = ["diagram-skill", "cad-skill", "ppt-skill", "canvas-skill"] as const;
type SkillName = (typeof SKILL_NAMES)[number];

/** Where each agent looks for personal skills. */
export const SKILL_TARGETS = {
  claude: path.join(".claude", "skills"),
  codex: path.join(".codex", "skills"),
} as const;
type Target = keyof typeof SKILL_TARGETS;

/** Never shipped: dependencies and the user's own provider keys. */
const SKIP_DIRS = new Set(["node_modules", ".git", "__pycache__"]);
const SKIP_FILES = new Set([path.join("config", "image-provider.json"), path.join("config", "file-parser.json")]);

export function shouldSkip(relative: string): boolean {
  const parts = relative.split(/[\\/]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  return SKIP_FILES.has(parts.join(path.sep));
}

async function* walk(dir: string, base = dir): AsyncGenerator<{ abs: string; rel: string }> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(base, abs);
    if (shouldSkip(rel)) continue;
    if (entry.isDirectory()) yield* walk(abs, base);
    else if (entry.isFile()) yield { abs, rel };
  }
}

/** The request came from this computer: only then may the server write into its home folder. */
export function isLocalRequest(request: Request): boolean {
  const host = (request.headers.get("host") || new URL(request.url).host).replace(/:\d+$/, "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost");
}

const skillDir = (name: SkillName) => path.join(ROOT, name);
const targetDir = (target: Target, name: SkillName) => path.join(os.homedir(), SKILL_TARGETS[target], name);

async function sizeOf(name: SkillName): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  for await (const { abs } of walk(skillDir(name))) {
    files += 1;
    bytes += (await stat(abs)).size;
  }
  return { files, bytes };
}

export async function GET(request: Request): Promise<Response> {
  const local = isLocalRequest(request);
  const skills = await Promise.all(
    SKILL_NAMES.filter((name) => existsSync(skillDir(name))).map(async (name) => ({
      name,
      ...(await sizeOf(name)),
      installed: local
        ? Object.fromEntries((Object.keys(SKILL_TARGETS) as Target[]).map((t) => [t, existsSync(path.join(targetDir(t, name), "SKILL.md"))]))
        : {},
    })),
  );
  return Response.json({ local, skills });
}

const nameSchema = z.enum(SKILL_NAMES);

/** GET /api/skills/zip?name=diagram-skill: the skill folder as `diagram-skill.zip` (one top folder inside). */
export async function GET_ZIP(request: Request): Promise<Response> {
  const parsed = nameSchema.safeParse(new URL(request.url).searchParams.get("name"));
  if (!parsed.success || !existsSync(skillDir(parsed.data))) return Response.json({ error: "Unknown skill" }, { status: 404 });
  const name = parsed.data;
  const zip = new JSZip();
  for await (const { abs, rel } of walk(skillDir(name))) {
    zip.file(`${name}/${rel.split(path.sep).join("/")}`, await readFile(abs));
  }
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return new Response(body as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

const installSchema = z.object({ name: nameSchema, target: z.enum(["claude", "codex"]) });

/** POST /api/skills/install {name, target}: copy the skill into ~/.claude/skills or ~/.codex/skills (replacing an older copy). */
export async function POST_INSTALL(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return Response.json({ error: "Install from the computer running CanvasAnvil (localhost)" }, { status: 403 });
  const parsed = installSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { name, target } = parsed.data;
  if (!existsSync(skillDir(name))) return Response.json({ error: "Unknown skill" }, { status: 404 });
  const dest = targetDir(target, name);
  // The user's own provider keys in an older copy are kept.
  const keep: { rel: string; data: Buffer }[] = [];
  for (const rel of SKIP_FILES) {
    const file = path.join(dest, rel);
    if (existsSync(file)) keep.push({ rel, data: await readFile(file) });
  }
  await rm(dest, { recursive: true, force: true });
  await cp(skillDir(name), dest, {
    recursive: true,
    filter: (src) => !shouldSkip(path.relative(skillDir(name), src)),
  });
  for (const { rel, data } of keep) await writeFile(path.join(dest, rel), data);
  return Response.json({ ok: true, path: dest });
}
