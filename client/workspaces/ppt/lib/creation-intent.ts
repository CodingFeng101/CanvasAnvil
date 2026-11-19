/**
 * What the first chat message of a deck is asking for.
 *
 * The start screen has no mode tabs: the user writes a topic, pastes an
 * outline or drops a PDF into the chat, and the kind is read off what they
 * gave. The chat shows the reading next to the input so a wrong one can be
 * switched before sending.
 */
export type CreationKind = "idea" | "outline" | "beautify";

export interface CreationRequest {
  kind: CreationKind;
  text: string;
  /** Reference documents for idea / outline; the PDF to restyle for beautify. */
  files: File[];
}

export interface CreationResult {
  ok: boolean;
  error?: string;
  /** Slides planned (idea / outline) or pages restyled (beautify). */
  count?: number;
  /** Pages that could not be restyled. */
  failed?: number;
}

export const isPdfName = (name: string) => /\.pdf$/i.test(String(name || "").trim());

const RESTYLE_WORDS = /美化|翻新|换.{0,4}(风格|模板|皮肤)|重新(设计|排版)|优化.{0,4}(排版|版式|设计)|beautif|restyle|redesign|polish/i;

/** A PDF is restyled when nothing else is said, or when the words ask for it; otherwise it is reference material. */
export function detectCreationKind(text: string, fileNames: string[]): CreationKind {
  const body = String(text || "").trim();
  if (fileNames.some(isPdfName) && (!body || RESTYLE_WORDS.test(body))) return "beautify";
  return body.split(/\r?\n/).filter((line) => line.trim()).length >= 3 ? "outline" : "idea";
}

/** The other reading the user can switch to, if there is one. */
export function alternativeKind(kind: CreationKind, text: string): CreationKind | null {
  if (kind === "beautify") return String(text || "").trim() ? "idea" : null;
  if (kind === "idea") return "outline";
  return "idea";
}

/** A few words naming what the deck is about, for the "fits ..." row of the style library. */
export function topicOf(text: string): string {
  const first = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  return first
    .replace(/^\s*(?:[一二三四五六七八九十]+[、.]|\d+[、.)]|[-*#]+)\s*/, "")
    .split(/[，,。；;：:]/)[0]
    .trim()
    .slice(0, 14);
}

const CATEGORY_WORDS: Array<[categoryId: string, words: RegExp]> = [
  ["report", /复盘|汇报|总结|周报|月报|季报|年报|述职|季度|年终|report|review|recap/i],
  ["finance", /融资|财务|预算|投资|理财|金融|财报|finance|budget|invest/i],
  ["academic", /课程|教学|论文|答辩|开题|研究|学术|培训|讲座|lecture|thesis|research|course|training/i],
  ["medical", /医疗|医院|健康|诊疗|护理|药|medical|health/i],
  ["marketing", /营销|发布会|推广|品牌|新品|活动策划|增长|marketing|launch|campaign|brand/i],
  ["data", /数据|指标|分析|看板|统计|data|metric|analytics|dashboard/i],
  ["tech", /技术|架构|系统|平台|算法|产品|研发|AI|人工智能|云|tech|architecture|product|software/i],
  ["resume", /简历|求职|面试|自我介绍|resume|interview/i],
  ["festival", /节日|庆典|年会|晚会|婚礼|生日|festival|party|celebration/i],
  ["nature", /环保|生态|自然|绿色|碳|nature|ecolog|sustainab/i],
  ["culture", /文化|艺术|展览|历史|博物馆|非遗|culture|art|exhibition|history/i],
  ["creative", /创意|插画|设计提案|灵感|creative|illustration/i],
  ["business", /商业|方案|计划书|公司|企业|团队|战略|客户|business|proposal|strategy|company/i],
];

/** The template category a topic points at, by its wording alone (no model call). */
export function recommendCategoryId(text: string): string | null {
  const body = String(text || "");
  if (!body.trim()) return null;
  return CATEGORY_WORDS.find(([, words]) => words.test(body))?.[0] ?? null;
}
