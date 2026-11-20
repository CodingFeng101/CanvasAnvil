import { useCallback, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/*
 * Settings → Skills & plugins: the skills under `skill/`, each installable
 * three ways — one click (when the page runs on this computer), a command,
 * or a zip to unpack by hand — plus the Codex plugin.
 */

export const SKILL_REPO = "CodingFeng101/CanvasAnvil";

export type SkillTarget = "claude" | "codex";
export type SkillName = "diagram-skill" | "cad-skill" | "ppt-skill" | "canvas-skill";

export const SKILLS: { name: SkillName; zh: string; en: string }[] = [
  { name: "diagram-skill", zh: "在对话里画 draw.io 图表，可手动改、导出 drawio / SVG / PNG。", en: "Draw.io diagrams from the conversation, editable by hand, exported as drawio / SVG / PNG." },
  { name: "cad-skill", zh: "室内设计：户型重建、布局、水电、检查，导出报价单和施工图。", en: "Interior design: rebuild a plan, lay out, MEP, checks, quotes and drawing sets." },
  { name: "ppt-skill", zh: "和网站同一套流程做演示稿：模板、大纲审阅、并发出图、导出 PPTX / PDF。", en: "Decks the way the site makes them: templates, outline review, all slides at once, PPTX / PDF." },
  { name: "canvas-skill", zh: "Excalidraw 白板生图与标注修改；也带着图表和室内设计两个画布。", en: "Excalidraw canvas for images and marked-up edits; also carries the diagram and interior canvases." },
];

export const TARGET_DIR: Record<SkillTarget, string> = { claude: ".claude/skills", codex: ".codex/skills" };
export const TARGET_NAME: Record<SkillTarget, string> = { claude: "Claude Code", codex: "Codex" };

/** One line that fetches just this folder from GitHub into the agent's skills folder (`$HOME` works in bash, zsh and PowerShell). */
export const installCommand = (name: SkillName, target: SkillTarget) => `npx degit ${SKILL_REPO}/skill/${name} "$HOME/${TARGET_DIR[target]}/${name}" --force`;

/** The same without npm: a shallow sparse clone, then a copy. */
export const gitCommands = (name: SkillName, target: SkillTarget) => [
  `git clone --depth 1 --filter=blob:none --sparse https://github.com/${SKILL_REPO}.git canvasanvil-skills`,
  `git -C canvasanvil-skills sparse-checkout set skill/${name}`,
  `cp -r canvasanvil-skills/skill/${name} "$HOME/${TARGET_DIR[target]}/"`,
];

export const CODEX_PLUGIN_COMMANDS = [`codex plugin marketplace add ${SKILL_REPO} --ref main`, "codex plugin add canvasanvil-canvas@canvasanvil"];

export type SkillsInfo = {
  local: boolean;
  skills: { name: SkillName; files: number; bytes: number; installed: Partial<Record<SkillTarget, boolean>> }[];
};

/** What the server has: sizes, and (from localhost) what is already installed. Loaded while `active`. */
export function useSkillsInfo(active: boolean) {
  const [info, setInfo] = useState<SkillsInfo | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    fetch("/api/skills")
      .then((r) => (r.ok ? (r.json() as Promise<SkillsInfo>) : Promise.reject(new Error(String(r.status)))))
      .then((next) => {
        setInfo(next);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    if (active) reload();
  }, [active, reload]);
  return { info, failed, reload };
}

export async function installSkill(name: SkillName, target: SkillTarget): Promise<string> {
  const response = await fetch("/api/skills/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, target }),
  });
  const data = (await response.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.path ?? "";
}

/** Commands in a mono block with a copy button. */
export function CommandBlock({ lines, zh }: { lines: string[]; zh: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n");
  return (
    <div className="group relative rounded-lg border border-border/70 bg-foreground/[0.035]">
      <pre className="overflow-x-auto px-3 py-2.5 pr-11 font-mono text-[12px] leading-[1.6] text-foreground/85">{text}</pre>
      <button
        type="button"
        aria-label={zh ? "复制命令" : "Copy command"}
        title={zh ? "复制" : "Copy"}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        className={cn(
          "absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground",
          copied && "text-foreground",
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
