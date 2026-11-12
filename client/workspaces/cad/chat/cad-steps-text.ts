/** The text side of the interior-design steps: the marker lines, the plan decisions and picks, and the stream summaries (see CadSteps.tsx). */
import { catalogName } from "../lib/design/catalog";


export const CAD_CONFIRM = "[[CAD_CONFIRM]]";
const IMAGES = "[[CAD_IMAGES]]";
const CHOICES = "[[CAD_CHOICES]]";
export const PICKS = "[[CAD_PICKS]]";

/** One open question of the plan (air conditioning, floor heating, smart home…) with clickable answers. */
export type PlanDecision = { group?: string; topic: string; question?: string; options: string[]; choice?: string | string[]; multi?: boolean };
export const validDecisions = (value: unknown): PlanDecision[] =>
  Array.isArray(value)
    ? value.filter((item): item is PlanDecision => !!item && typeof item.topic === "string" && Array.isArray(item.options) && item.options.length > 0)
        .map((item) => ({ ...item, options: item.options.map(String) }))
    : [];
export const chosen = (decision: PlanDecision) => (Array.isArray(decision.choice) ? decision.choice : decision.choice ? [decision.choice] : []).map(String).filter((option) => decision.options.includes(option));

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
