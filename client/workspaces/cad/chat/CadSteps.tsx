/**
 * The interior-design flow shown in the chat as a chain of steps:
 *
 *   plan     — the design plan the model drafted (collapsed, one line of summary)
 *   boards   — the two analysis boards as thumbnails (click to enlarge)
 *   confirm  — open: write changes right here, or confirm and move on
 *   generate — a separate block for generating / editing the floorplan
 *   check    — after a floorplan upload: what was recognized and the 待确认清单 (the designer's GUIDE section 0)
 *              as clickable options; confirming completes the draft
 *
 * Messages carry their step state in a marker line so it survives the saved chat:
 *   [[CAD_STEPS|plan|drafting|images|ready(|regen)]]  …plan markdown…  [[CAD_IMAGES]]  …image tags…
 *   [[CAD_STEPS|generate|running|done]]  …progress or result…
 *   [[CAD_STEPS|check|ready]]  …recognition summary…  [[CAD_CHOICES]]…
 * Pressing confirm sends a user message starting with [[CAD_CONFIRM]], which the chat hides.
 * Open decisions travel after the plan body as one line, [[CAD_CHOICES]] + JSON, and show as clickable options;
 * the confirm message carries the user's picks as [[CAD_PICKS]] + JSON.
 */
import { type ReactNode, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Check, ChevronDown, ClipboardList, Home, ImageIcon } from "lucide-react";
import { MessageImage, Shimmer } from "@/shared/chat";
import { extractImageTags } from "@/shared/chat/ppt-message-tags";
import { useUiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { catalogName } from "../lib/design/catalog";

export const CAD_CONFIRM = "[[CAD_CONFIRM]]";
const IMAGES = "[[CAD_IMAGES]]";
const CHOICES = "[[CAD_CHOICES]]";
const PICKS = "[[CAD_PICKS]]";

/** One open question of the plan (air conditioning, floor heating, smart home…) with clickable answers. */
export type PlanDecision = { group?: string; topic: string; question?: string; options: string[]; choice?: string | string[]; multi?: boolean };
export const validDecisions = (value: unknown): PlanDecision[] =>
  Array.isArray(value)
    ? value.filter((item): item is PlanDecision => !!item && typeof item.topic === "string" && Array.isArray(item.options) && item.options.length > 0)
        .map((item) => ({ ...item, options: item.options.map(String) }))
    : [];
const chosen = (decision: PlanDecision) => (Array.isArray(decision.choice) ? decision.choice : decision.choice ? [decision.choice] : []).map(String).filter((option) => decision.options.includes(option));

/** Split the user's picks off a confirm message: {topic: [options]}. */
export function takePicks(text: string): { text: string; picks: Record<string, string[]> | null } {
  const at = text.indexOf(PICKS);
  if (at < 0) return { text, picks: null };
  try { return { text: text.slice(0, at).trimEnd(), picks: JSON.parse(text.slice(at + PICKS.length).split("\n")[0]) }; }
  catch { return { text: text.slice(0, at).trimEnd(), picks: null }; }
}
/** The plan with the user's picks written into its decisions. */
export function applyPicks(plan: any, picks: Record<string, string[]>): any {
  return { ...plan, decisions: validDecisions(plan?.decisions).map((decision) => (picks[decision.topic] ? { ...decision, choice: decision.multi ? picks[decision.topic] : picks[decision.topic][0] ?? "" } : decision)) };
}
const HEADER = /^\[\[CAD_STEPS\|(plan|generate|check)\|(\w+)(\|regen)?\]\]\n?/;

export type PlanState = "drafting" | "images" | "ready";
export const planMessage = (state: PlanState, body: string, images = "", regen = false, decisions: PlanDecision[] = []) =>
  `[[CAD_STEPS|plan|${state}${regen ? "|regen" : ""}]]\n${body}${state !== "drafting" && decisions.length ? `\n${CHOICES}${JSON.stringify(decisions)}` : ""}${state === "drafting" ? "" : `\n${IMAGES}\n${images}`}`;
export const generateMessage = (state: "running" | "done" | "error", body: string) => `[[CAD_STEPS|generate|${state}]]\n${body}`;
/** After a floorplan upload: what was recognized, then the 待确认清单 as clickable options. */
export const checkMessage = (body: string, decisions: PlanDecision[]) =>
  `[[CAD_STEPS|check|ready]]\n${body}${decisions.length ? `\n${CHOICES}${JSON.stringify(decisions)}` : ""}`;
/** The 「图上符号 → 建模」 list and the items still to confirm, as markdown (after completing a draft and at delivery). */
export function recognitionLines(recognition: { symbols?: Array<{ symbol: string; where?: string; count?: number; model: string }>; confirm?: string[] } | undefined): string {
  if (!recognition) return "";
  const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  const symbols = recognition.symbols?.length
    ? ["**图上符号 → 建模**", "", "| 图上符号 | 位置 | 数量 | 建模 |", "|---|---|---|---|", ...recognition.symbols.map((row) => `| ${cell(row.symbol)} | ${cell(row.where)} | ${cell(row.count ?? "")} | ${cell(row.model)} |`)].join("\n")
    : "";
  const confirm = recognition.confirm?.length ? `**待确认**\n${recognition.confirm.map((item) => `- ${item}`).join("\n")}` : "";
  return [symbols, confirm].filter(Boolean).join("\n\n");
}
/** The confirm text that completes a recognized draft (the chat routes on it). */
export const CHECK_CONFIRM_ZH = "按待确认清单补全户型";
export const CHECK_CONFIRM_EN = "Complete the floorplan with these answers";

/** Readable live summary of a floorplan JSON (cad_spec or cad_ops) while the model is still writing it. */
export function describeSpecStream(text: string, zh: boolean): string {
  const after = (key: string) => { const at = text.indexOf(`"${key}"`); return at < 0 ? "" : text.slice(at); };
  const count = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;
  const recent = (names: string[]) => names.slice(-6).join(zh ? "、" : ", ");
  const lines: string[] = [];
  const ops = [...text.matchAll(/"op"\s*:\s*"(\w+)"[^{}]*?(?:"(?:key|name)"\s*:\s*"([^"]+)")?/g)];
  if (ops.length) {
    const verbs: Record<string, string> = zh
      ? { add_furniture: "添加", move_furniture: "移动", resize_furniture: "调整尺寸", replace_furniture: "更换", remove: "删除", add_opening: "加门窗", update_opening: "改门窗", add_wall: "加墙", move_node: "移墙", update_wall: "改墙", set_room: "房间", set_plan: "户型信息", set_finish: "材质", set_look: "3D 风格", add_elec: "加点位", move_elec: "挪点位", link_elec: "关联开关", relayout_elec: "重新布置水电", add: "新增", replace: "修改", move: "移动", copy: "复制" }
      : {};
    lines.push(zh ? `修改操作 ${ops.length} 条` : `${ops.length} operations`);
    lines.push(`${zh ? "最近" : "Latest"}：${recent(ops.map(([, op, target]) => `${verbs[op] ?? op}${target ? (zh ? " " : " ") + catalogName(target) : ""}`))}`);
  }
  // A layout (grid + intent) while it streams: the grid size, then doors and windows.
  const chain = (key: string) => (new RegExp(`"${key}"\\s*:\\s*\\[([\\d\\s,.]*)\\]`).exec(text)?.[1] ?? "").split(",").map(Number).filter(value => value > 0);
  const cols = chain("cols"), gridRows = chain("rows");
  if (cols.length && gridRows.length) {
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    lines.push(zh ? `网格 ${cols.length} 列 × ${gridRows.length} 行，总开间 ${sum(cols)} × 进深 ${sum(gridRows)}mm` : `${cols.length} × ${gridRows.length} grid, ${sum(cols)} × ${sum(gridRows)}mm overall`);
  }
  const doorCount = count(after("doors").split(/"(?:windows|furniture)"/)[0], /"(?:between|entry)"\s*:/g);
  const windowCount = count(after("windows").split(/"furniture"/)[0], /"side"\s*:/g);
  if (doorCount || windowCount) lines.push(zh ? `门 ${doorCount} 扇，窗 ${windowCount} 扇` : `${doorCount} doors, ${windowCount} windows`);
  const wallText = after("walls").split(/"(?:rooms|furniture)"/)[0];
  const walls = count(wallText, /"a"\s*:\s*\[/g);
  if (walls) {
    const openings = count(wallText, /"from"\s*:/g);
    lines.push(zh ? `墙体 ${walls} 面${openings ? `，门窗 ${openings} 处` : ""}` : `${walls} walls${openings ? `, ${openings} openings` : ""}`);
  }
  const rooms = [...after("rooms").split(/"(?:furniture|structs|elec)"/)[0].matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(match => match[1]);
  if (rooms.length) lines.push(`${zh ? "房间" : "Rooms"}：${rooms.join(zh ? "、" : ", ")}`);
  const furniture = [...after("furniture").matchAll(/"key"\s*:\s*"([^"]+)"/g)].map(match => catalogName(match[1]));
  if (furniture.length) lines.push(zh ? `家具家电 ${furniture.length} 件，最近：${recent(furniture)}` : `${furniture.length} furniture items, latest: ${recent(furniture)}`);
  return lines.map(line => `- ${line}`).join("\n");
}

/**
 * Parse a JSON object the model is still writing: close the open string, arrays and objects,
 * dropping a dangling key or comma, so a half-written plan can be shown as it streams.
 */
export function parsePartialJson(text: string): any {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let body = text.slice(start);
  for (let attempt = 0; attempt < 8 && body; attempt++) {
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    let end = body.length;
    for (let index = 0; index < body.length; index++) {
      const character = body[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{" || character === "[") stack.push(character === "{" ? "}" : "]");
      else if (character === "}" || character === "]") {
        stack.pop();
        if (!stack.length) { end = index + 1; break; }
      }
    }
    const candidate = (body.slice(0, end) + (quoted ? '"' : "")).replace(/[,:\s]+$/, "");
    try { return JSON.parse(candidate + stack.reverse().join("")); }
    catch { body = body.slice(0, Math.max(body.lastIndexOf(",", body.length - 2), 0)); }
  }
  return null;
}

/** The text a model should see: markers removed. */
export const stripCadMarkers = (text: string) =>
  text.replace(HEADER, "").replace(IMAGES, "").replace(CAD_CONFIRM, "").replace(/\[\[CAD_(?:CHOICES|PICKS)\]\][^\n]*/g, "");

export function parseCadSteps(text: string) {
  const match = text.match(HEADER);
  if (!match) return null;
  const rest = text.slice(match[0].length);
  const at = rest.indexOf(IMAGES);
  let body = at < 0 ? rest : rest.slice(0, at);
  let decisions: PlanDecision[] = [];
  const choicesAt = body.indexOf(CHOICES);
  if (choicesAt >= 0) {
    try { decisions = validDecisions(JSON.parse(body.slice(choicesAt + CHOICES.length).split("\n")[0])); } catch { /* leave the plan without options */ }
    body = body.slice(0, choicesAt);
  }
  return {
    kind: match[1] as "plan" | "generate" | "check",
    state: match[2],
    regen: !!match[3],
    decisions,
    body: body.trim(),
    images: at < 0 ? "" : rest.slice(at + IMAGES.length).trim(),
  };
}

type StepState = "running" | "done" | "pending" | "error";

function Step({ icon, title, meta, state, last, defaultOpen, children }: {
  icon: ReactNode; title: ReactNode; meta?: ReactNode; state: StepState; last: boolean; defaultOpen: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = Boolean(children);
  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {!last && <span aria-hidden className="absolute left-[11px] top-7 bottom-0 w-px bg-border" />}
      <span className={cn(
        "relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background",
        state === "running" ? "border-primary/50 text-primary-strong" : state === "error" ? "border-destructive/50 text-destructive" : state === "pending" ? "border-dashed border-border text-muted-foreground/60" : "border-border text-muted-foreground",
      )}>
        {state === "running" ? <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" /> : icon}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <button type="button" disabled={!hasBody} onClick={() => setOpen(!open)} aria-expanded={open}
          className="flex w-full min-w-0 items-center gap-2 text-left enabled:hover:opacity-80">
          <span className="shrink-0 text-sm font-medium text-foreground/85">{title}</span>
          {meta && <span className="min-w-0 truncate text-xs text-muted-foreground">{meta}</span>}
          {hasBody && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
        </button>
        {hasBody && open && <div className="mt-1.5">{children}</div>}
      </div>
    </li>
  );
}

const Markdown = ({ children }: { children: string }) => (
  <div className="prose prose-sm max-w-none break-words text-foreground/85 [overflow-wrap:anywhere] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>
);

export function CadSteps({ text, followUp, canAct, onAction }: {
  text: string;
  /** What the user did after this message: nothing yet, confirmed, or wrote changes. */
  followUp: "none" | "confirmed" | "feedback";
  canAct: boolean;
  onAction?(text: string): void;
}) {
  const lang = useUiLanguage();
  const tr = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const [feedback, setFeedback] = useState("");
  // Options the user clicked, by decision index; untouched decisions keep the plan's recommendation.
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const parsed = parseCadSteps(text);
  if (!parsed) return null;

  if (parsed.kind === "generate") {
    const running = parsed.state === "running";
    const failed = parsed.state === "error";
    return (
      <ol className="my-1 w-full list-none pl-0">
        <Step icon={failed ? <AlertTriangle className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />} state={running ? "running" : failed ? "error" : "done"} last defaultOpen
          title={running ? <Shimmer duration={1}>{tr("生成户型", "Floorplan")}</Shimmer> : tr("生成户型", "Floorplan")}
          meta={failed ? tr("没有完成", "Did not finish") : undefined}>
          <Markdown>{parsed.body}</Markdown>
          {failed && followUp === "none" && (
            <button type="button" disabled={!canAct} onClick={() => { if (canAct && onAction) onAction(`${CAD_CONFIRM}${tr("确认方案，根据当前方案生成户型", "Confirm plan: generate the floorplan from the current plan")}`); }}
              className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {tr("重新生成户型", "Generate again")}
            </button>
          )}
        </Step>
      </ol>
    );
  }

  const drafting = parsed.state === "drafting";
  const ready = parsed.state === "ready";
  const { images, rest: imageNote } = extractImageTags(parsed.images);
  const summary = parsed.body.split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#")) ?? "";
  const send = (value: string) => { if (canAct && onAction) onAction(value); };
  const decisions = parsed.decisions;
  const pickOf = (index: number) => picked[index] ?? chosen(decisions[index]);
  const toggle = (index: number, option: string) => {
    const decision = decisions[index], current = pickOf(index);
    const next = decision.multi ? (current.includes(option) ? current.filter((item) => item !== option) : [...current, option]) : [option];
    setPicked({ ...picked, [index]: next });
  };
  const changed = decisions.some((decision, index) => picked[index] && [...picked[index]].sort().join("|") !== [...chosen(decision)].sort().join("|"));
  const picksLine = decisions.map((decision, index) => `${decision.topic}：${pickOf(index).join("、") || tr("都不要", "none")}`).join(tr("；", "; "));
  const submitFeedback = () => {
    const value = feedback.trim();
    if (!value && !changed) return;
    setFeedback("");
    send([value ? tr(`修改方案：${value}`, `Revise the plan: ${value}`) : tr("修改方案：按我选的更新待定事项", "Revise the plan with my choices"), changed ? tr(`已定事项：${picksLine}`, `Decisions: ${picksLine}`) : ""].filter(Boolean).join("\n"));
  };
  const checking = parsed.kind === "check";
  const confirmText = checking
    ? tr(CHECK_CONFIRM_ZH, CHECK_CONFIRM_EN)
    : parsed.regen
    ? tr("按新方案重新生成户型", "Regenerate the floorplan from the new plan")
    : tr("确认方案，根据当前方案生成户型", "Confirm plan: generate the floorplan from the current plan");
  const picksPayload = decisions.length ? `\n${PICKS}${JSON.stringify(Object.fromEntries(decisions.map((decision, index) => [decision.topic, pickOf(index)])))}` : "";

  const hasBoards = parsed.state === "images" || images.length > 0 || !!imageNote;
  const asking = ready && followUp === "none";
  const confirmBlock = asking ? (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-sm text-muted-foreground">
        {checking
          ? tr("开工前先确认这几项（已按常规预选，点一下就能改）。还有要说明的写在下面，然后点确认，AI 会读原图补全房间、门窗、家具和水电。", "Confirm these first (common choices are preselected; click to change). Add any notes below, then confirm: the model reads the drawing and completes rooms, openings, furniture and MEP.")
          : parsed.regen
          ? tr("方案已按你的意见更新。还有要改的直接写在下面；没问题就重新生成户型（会替换当前户型）。", "The plan is updated. Write any further changes below, or regenerate the floorplan (replaces the current one).")
          : tr("方案有没有要改的？有就直接写在下面；没有就点确认，进入下一步生成户型。", "Anything to change in the plan? Write it below, or confirm to generate the floorplan.")}
      </p>
      {decisions.length > 0 && (
        <div className="space-y-2.5 rounded-lg bg-muted/40 p-2.5" data-testid="cad-plan-decisions">
          <p className="text-xs font-medium text-foreground/85">{checking ? tr("待确认清单", "To confirm") : tr("待定事项：已按推荐预选，点一下就能改", "Open decisions: the recommendation is preselected; click to change")}</p>
          {decisions.map((decision, index) => (
            <div key={`${decision.topic}-${index}`}>
              {/* A small heading where a new group starts (布局 / 硬装 / 设备 / 电器 / 智能). */}
              {decision.group && decision.group !== decisions[index - 1]?.group && (
                <div className={cn("mb-1.5 border-b pb-0.5 text-[11px] font-semibold tracking-wide text-foreground/70", index > 0 && "mt-3")}>{decision.group}</div>
              )}
              <div className="mb-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">{decision.topic}</span>
                {decision.question && decision.question !== decision.topic ? ` · ${decision.question}` : ""}
                {decision.multi ? tr("（可多选）", " (pick any)") : ""}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {decision.options.map((option) => {
                  const on = pickOf(index).includes(option);
                  return (
                    <button type="button" key={option} disabled={!canAct} aria-pressed={on} onClick={() => toggle(index, option)}
                      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60",
                        on ? "border-primary bg-primary/10 text-primary-strong" : "border-border bg-background hover:bg-muted")}>
                      {on && <Check className="h-3 w-3" />}{option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <textarea value={feedback} disabled={!canAct} rows={2}
        onChange={event => setFeedback(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submitFeedback(); } }}
        placeholder={checking ? tr("例如：层高 2750，次卧那个圆圈是地漏，三口之家要书房", "e.g. ceiling 2750, the circle in the second bedroom is a floor drain, we need a study") : tr("例如：主卧再大一点，厨房改成开放式", "e.g. a bigger main bedroom, an open kitchen")}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60" />
      <div className="flex flex-wrap gap-2">
        {!checking && <button type="button" disabled={!canAct || (!feedback.trim() && !changed)} onClick={submitFeedback}
          className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{tr("提交意见", "Send changes")}</button>}
        <button type="button" disabled={!canAct} onClick={() => send(`${CAD_CONFIRM}${confirmText}${checking && feedback.trim() ? `${tr("：", ": ")}${feedback.trim()}` : ""}${picksPayload}`)}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {checking ? tr("确认，补全户型", "Confirm and complete") : parsed.regen ? tr("按新方案重新生成户型", "Regenerate floorplan") : tr("确认方案，生成户型", "Confirm and generate")}
        </button>
      </div>
    </div>
  ) : null;
  const status = followUp === "confirmed" ? tr("已确认", "Confirmed") : followUp === "feedback" ? tr("已提出修改意见", "Changes requested") : "";

  return (
    <ol className="my-1 w-full list-none pl-0">
      {/* Open while the plan streams in and while it waits for the user's answer (confirm sits at its bottom);
          folded to one line once confirmed or revised (the key remounts it). */}
      <Step key={drafting ? "plan-drafting" : asking ? "plan-asking" : "plan-done"} icon={!drafting && followUp === "confirmed" ? <Check className="h-3.5 w-3.5" /> : <ClipboardList className="h-3.5 w-3.5" />}
        state={drafting ? "running" : "done"} last={!hasBoards} defaultOpen={drafting || asking}
        title={checking ? tr("识别结果与待确认清单", "Recognized plan and questions") : drafting ? <Shimmer duration={1}>{tr("设计方案", "Design plan")}</Shimmer> : tr(parsed.regen ? "设计方案（已更新）" : "设计方案", "Design plan")}
        meta={drafting ? tr("正在输出…", "Writing…") : [status, summary].filter(Boolean).join(" · ")}>
        <Markdown>{parsed.body}</Markdown>
        {confirmBlock}
      </Step>
      {/* Analysis boards are no longer drawn; the step only shows for older chats that have them. */}
      {hasBoards && <Step icon={<ImageIcon className="h-3.5 w-3.5" />} state={drafting ? "pending" : ready ? "done" : "running"} last defaultOpen
        title={!drafting && !ready ? <Shimmer duration={1}>{tr("分析图", "Analysis boards")}</Shimmer> : tr("分析图", "Analysis boards")}
        meta={!drafting && !ready ? tr("正在生成…", "Drawing…") : ready && images.length ? tr(`${images.length} 张，点击放大`, `${images.length}, click to enlarge`) : undefined}>
        {ready && (images.length || imageNote) ? (
          <div className="space-y-1.5">
            {images.length > 0 && (
              <div className="grid max-w-[360px] grid-cols-2 gap-2 [&>button_img]:h-28 [&>button_img]:max-h-28 [&>button_img]:object-cover">
                {images.map((image, index) => <MessageImage key={index} src={image.url} alt={image.name?.split("#")[0] || "image"} />)}
              </div>
            )}
            {imageNote && <p className="text-xs text-muted-foreground">{imageNote}</p>}
          </div>
        ) : undefined}
      </Step>}
    </ol>
  );
}
