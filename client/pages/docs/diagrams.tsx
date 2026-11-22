import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowRight, RotateCcw } from "lucide-react";
import type { UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";

/*
 * The figures in the docs, drawn in HTML rather than images so they follow
 * the theme, the language and the page width. A markdown page asks for one
 * with a fenced block:
 *
 *     ```diagram
 *     architecture
 *     ```
 */

type L = { zh: string; en: string };
type Step = { title: L; note?: L; tone?: "model" | "code" | "check" | "user" };

const tint = (v: string) => ({
  borderColor: `color-mix(in srgb, var(${v}) 42%, transparent)`,
  background: `color-mix(in srgb, var(${v}) 8%, transparent)`,
});
const TONE: Record<NonNullable<Step["tone"]>, CSSProperties> = {
  user: { borderColor: "hsl(var(--border))", background: "hsl(var(--card))" },
  model: tint("--viz-input"),
  code: tint("--viz-ppt"),
  check: tint("--viz-canvas"),
};

const LEGEND: { tone: NonNullable<Step["tone"]>; label: L }[] = [
  { tone: "user", label: { zh: "你", en: "You" } },
  { tone: "model", label: { zh: "模型判断", en: "Model judgment" } },
  { tone: "code", label: { zh: "代码计算", en: "Code computes" } },
  { tone: "check", label: { zh: "检查与取舍", en: "Check and choose" } },
];

function Box({ step, lang }: { step: Step; lang: UiLanguage }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border px-3.5 py-3" style={TONE[step.tone ?? "user"]}>
      <div className="font-display text-[15px] leading-snug text-foreground">{step.title[lang]}</div>
      {step.note && <div className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{step.note[lang]}</div>}
    </div>
  );
}

function Figure({ caption, lang, children, legend = true }: { caption: L; lang: UiLanguage; children: ReactNode; legend?: boolean }) {
  return (
    <figure className="not-prose my-8 rounded-2xl border border-border/70 bg-foreground/[0.02] p-4 sm:p-5">
      {children}
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 pt-3 text-[12.5px] text-muted-foreground">
        <span className="aside-voice basis-full">{caption[lang]}</span>
        {legend &&
          LEGEND.map(({ tone, label }) => (
            <span key={tone} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border" style={TONE[tone]} />
              {label[lang]}
            </span>
          ))}
      </figcaption>
    </figure>
  );
}

/** Steps left to right on wide screens, top to bottom on narrow ones; `loop` draws the way back. */
function Flow({ steps, lang, caption, loop }: { steps: Step[]; lang: UiLanguage; caption: L; loop?: L }) {
  return (
    <Figure caption={caption} lang={lang}>
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
        {steps.map((step, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div className="grid shrink-0 place-items-center text-muted-foreground/70">
                <ArrowRight className="hidden size-4 md:block" />
                <ArrowDown className="size-4 md:hidden" />
              </div>
            )}
            <Box step={step} lang={lang} />
          </Fragment>
        ))}
      </div>
      {loop && (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-[12.5px] text-muted-foreground">
          <RotateCcw className="size-3.5 shrink-0" />
          {loop[lang]}
        </div>
      )}
    </Figure>
  );
}

function Layer({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/80 bg-card p-3", className)}>
      <div className="mb-2 font-mono text-[11.5px] uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-foreground/[0.05] px-2 py-1 text-[12.5px] text-foreground">
      {color && <span className="size-2 rounded-full" style={{ background: `var(${color})` }} />}
      {children}
    </span>
  );
}

function Architecture({ lang }: { lang: UiLanguage }) {
  const zh = lang === "zh";
  return (
    <Figure caption={{ zh: "三个程序，一份约定：浏览器里的应用、一个小的 Node 服务，以及两者共享的 contracts。", en: "Three programs and one contract: the browser app, a small Node API, and the contracts they share." }} lang={lang} legend={false}>
      <div className="grid gap-2">
        <Layer title={zh ? "client/ · 浏览器" : "client/ · browser"}>
          <div className="flex flex-wrap gap-1.5">
            <Chip color="--viz-diagram">{zh ? "图表绘制" : "Diagram"}</Chip>
            <Chip color="--viz-cad">{zh ? "室内设计" : "Interior"}</Chip>
            <Chip color="--viz-ppt">PPT</Chip>
            <Chip color="--viz-canvas">{zh ? "自由绘制" : "Free drawing"}</Chip>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-muted-foreground">
            <Chip>app/ {zh ? "外壳与设置" : "shell, settings"}</Chip>
            <Chip>shared/ {zh ? "组件、对话、存储" : "UI, chat, storage"}</Chip>
            <Chip>IndexedDB · localStorage</Chip>
          </div>
        </Layer>
        <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <ArrowDown className="size-3.5" /> /api/chat · /api/ppt-ai · /api/… <span className="hidden sm:inline">— contracts/ AIConfig</span>
        </div>
        <Layer title={zh ? "server/ · Node 服务" : "server/ · Node API"}>
          <div className="flex flex-wrap gap-1.5">
            <Chip>routes/ {zh ? "每个接口一个文件" : "one file per endpoint"}</Chip>
            <Chip>chat/ {zh ? "对话管线" : "chat pipeline"}</Chip>
            <Chip>ai/ {zh ? "OpenAI 协议传输" : "OpenAI transport"}</Chip>
            <Chip>recognizer/ {zh ? "户型识别" : "plan recognition"}</Chip>
          </div>
        </Layer>
        <div className="flex items-center justify-center gap-2 text-[12px] text-muted-foreground">
          <ArrowDown className="size-3.5" /> {zh ? "OpenAI 兼容的 HTTP 接口" : "an OpenAI-compatible HTTP endpoint"}
        </div>
        <Layer title={zh ? "你的模型服务" : "your model provider"} className="border-dashed bg-transparent">
          <div className="flex flex-wrap gap-1.5">
            <Chip>{zh ? "文本通道" : "Text channel"}</Chip>
            <Chip>{zh ? "生图通道" : "Image channel"}</Chip>
          </div>
        </Layer>
      </div>
    </Figure>
  );
}

const FLOWS: Record<string, { caption: L; steps: Step[]; loop?: L }> = {
  stance: {
    caption: { zh: "贯穿四个画布的同一种分工。", en: "The same division of labour in all four canvases." },
    steps: [
      { title: { zh: "你说想要什么", en: "You say what you want" }, tone: "user" },
      { title: { zh: "模型给出意图", en: "The model states intent" }, note: { zh: "结构、关系、取舍", en: "structure, relations, choices" }, tone: "model" },
      { title: { zh: "代码落成确定的结果", en: "Code makes it exact" }, note: { zh: "坐标、尺寸、格式", en: "coordinates, sizes, formats" }, tone: "code" },
      { title: { zh: "检查，只留更好的", en: "Check; keep only what is better" }, note: { zh: "打分不降才采用", en: "adopted only if the score holds" }, tone: "check" },
    ],
    loop: { zh: "检查不过时带着问题回到模型，直到干净或不再进步。", en: "When the check fails, the problems go back to the model until it is clean or stops improving." },
  },
  "diagram-arrange": {
    caption: { zh: "排版是一次比较：原图、整理稿、ELK 稿各打一个分，由你挑一份确定。", en: "Arranging is a comparison: the drawing, the tidy pass and ELK each get a score, and you confirm one." },
    steps: [
      { title: { zh: "模型画出的草稿", en: "The model's sketch" }, note: { zh: "坐标当作意图来读", en: "coordinates read as intent" }, tone: "model" },
      { title: { zh: "整理 tidy", en: "Tidy pass" }, note: { zh: "分行、减交叉、对齐、吸附网格", en: "rows, fewer crossings, align, grid" }, tone: "code" },
      { title: { zh: "ELK 分层布局", en: "ELK layered" }, note: { zh: "按需加载，带着原顺序", en: "lazy, seeded with the order" }, tone: "code" },
      { title: { zh: "layout-lint 打分", en: "layout-lint scores" }, note: { zh: "列出分数，你点选后确定", en: "scores listed, you pick and confirm" }, tone: "check" },
    ],
  },
  "diagram-pipeline": {
    caption: { zh: "一条消息在 /api/chat 里走过的路。", en: "The path one message takes through /api/chat." },
    steps: [
      { title: { zh: "你的消息", en: "Your message" }, note: { zh: "可带图片、PDF、Word", en: "with images, PDF, Word" }, tone: "user" },
      { title: { zh: "整理上下文", en: "Assemble context" }, note: { zh: "摘要旧对话、按需加载图形库", en: "summarise history, load shape libraries" }, tone: "code" },
      { title: { zh: "模型流式作答", en: "Model streams" }, note: { zh: "以工具调用写 XML", en: "writes XML via tool calls" }, tone: "model" },
      { title: { zh: "上画布并排版", en: "Onto the canvas" }, note: { zh: "整理不变差才采用", en: "tidy only if not worse" }, tone: "check" },
    ],
  },
  interior: {
    caption: { zh: "户型由模型描述、由程序绘制，再由检查把关。", en: "A plan is described by the model, drawn by code, and guarded by checks." },
    steps: [
      { title: { zh: "需求与方案", en: "Brief and scheme" }, note: { zh: "待定事项点选确认", en: "pending choices, clicked" }, tone: "user" },
      { title: { zh: "布局意图", en: "Layout intent" }, note: { zh: "网格尺寸链、房间、门窗、家具", en: "grid chains, rooms, doors, furniture" }, tone: "model" },
      { title: { zh: "程序算出几何", en: "Code computes geometry" }, note: { zh: "墙闭合、尺寸相加相等", en: "walls close, dimensions add up" }, tone: "code" },
      { title: { zh: "推开碰撞 · 布水电", en: "Nudge · place MEP" }, note: { zh: "确定性规则", en: "deterministic rules" }, tone: "code" },
      { title: { zh: "自检与水电审计", en: "Self-check, MEP audit" }, tone: "check" },
    ],
    loop: { zh: "有错误就以 JSON Patch 让模型修，直到 0 错 0 警告、不再进步或到达轮数上限。", en: "Errors go back as JSON Patch requests until there are none, no progress is made, or the round limit is reached." },
  },
  ppt: {
    caption: { zh: "先把话说清楚，再让页面好看。", en: "Get the words right first, then make the pages beautiful." },
    steps: [
      { title: { zh: "想法 / 大纲 / 美化", en: "Idea / outline / beautify" }, note: { zh: "从第一句话判断模式", en: "mode read from the first message" }, tone: "model" },
      { title: { zh: "审阅大纲", en: "Review the outline" }, note: { zh: "增删改页、调顺序", en: "add, cut, reorder" }, tone: "user" },
      { title: { zh: "选模板", en: "Pick a template" }, note: { zh: "定整套风格与配色", en: "style and palette" }, tone: "user" },
      { title: { zh: "逐页并发出图", en: "Pages in parallel" }, note: { zh: "默认同时 5 页（设置里可改），失败重试", en: "5 at a time by default (Settings), retried" }, tone: "code" },
      { title: { zh: "单页修改与导出", en: "Edit a page, export" }, note: { zh: "PDF · 图片版 PPTX · 可编辑 PPTX", en: "PDF · image PPTX · editable PPTX" }, tone: "check" },
    ],
  },
  "canvas-edit": {
    caption: { zh: "圈哪里改哪里：标注先变成话，再变成改动。", en: "Circle it and only it changes: marks become words, then an edit." },
    steps: [
      { title: { zh: "在图上圈画、写字", en: "Mark up the image" }, tone: "user" },
      { title: { zh: "按几何收集标注", en: "Gather marks by geometry" }, note: { zh: "以原图分辨率合成", en: "composited at the image's resolution" }, tone: "code" },
      { title: { zh: "视觉模型读懂改动", en: "Vision model reads it" }, note: { zh: "写成一句明确的指令", en: "into one clear instruction" }, tone: "model" },
      { title: { zh: "图片编辑", en: "Image edit" }, tone: "model" },
      { title: { zh: "新版本放在旁边", en: "New version alongside" }, note: { zh: "共享谱系 id，从不覆盖", en: "shared lineage id, never overwritten" }, tone: "check" },
    ],
  },
  works: {
    caption: { zh: "屏幕上的就是保存下来的：没有「保存」按钮，像 claude.ai 的对话一样。", en: "What is on screen is what is kept: no Save button, as with a chat on claude.ai." },
    steps: [
      { title: { zh: "你在画布上工作", en: "You work on the canvas" }, tone: "user" },
      { title: { zh: "每次改动写入实时副本", en: "Each change writes the live copy" }, note: { zh: "work:<id>:<key>，存于 IndexedDB", en: "work:<id>:<key>, in IndexedDB" }, tone: "code" },
      { title: { zh: "有内容即列入「我的作品」", en: "Listed in My works once it has content" }, note: { zh: "空草稿离开时丢弃", en: "an empty draft is dropped on leaving" }, tone: "code" },
      { title: { zh: "切换作品", en: "Switching works" }, note: { zh: "卸下、交换、重新挂载", en: "unmount, swap, remount" }, tone: "check" },
    ],
  },
};

export function Diagram({ name, lang }: { name: string; lang: UiLanguage }) {
  if (name === "architecture") return <Architecture lang={lang} />;
  const flow = FLOWS[name];
  if (!flow) return null;
  return <Flow {...flow} lang={lang} />;
}
