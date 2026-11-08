import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Home, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  streamChatText,
  generateChatMessage as generateChatMessageOnce,
  type GenerateChatMessageOptions,
  getAIConfig,
  type ChatMessage,
} from "@/ai/client";
import {
  ChatInput,
  ChatEmptyState,
  ButtonWithTooltip,
  ResetWarningModal,
  STORAGE_GLOBAL_CONSTRAINTS_KEY,
} from "@/shared/chat";
import { ChatMessageDisplay, type UIMessage } from "./ChatMessageDisplay";
import { DesignHistoryDialog } from "./DesignHistoryDialog";
import { CAD_CONFIRM, applyPicks, describeSpecStream, generateMessage, parsePartialJson, planMessage, stripCadMarkers, takePicks, validDecisions } from "./CadSteps";
import { useUiLanguage } from "@/shared/i18n";
import {
  chatStorageKey,
  loadChatHistory,
  saveChatHistory,
} from "@/shared/chat/chat-storage";
import {
  CAD_PLAN_AGENT_PROMPT,
  CAD_DESIGN_CREATE_PROMPT,
  CAD_DESIGN_EDIT_PROMPT,
  CAD_DESIGN_FIX_PROMPT,
  designerReferences,
} from "../lib/agents";
import { retryCadTextRequest } from "../lib/design/model-request";
import { describeJsonError, parseCadPayload } from "../lib/design/model-output";
import { catalogPromptTable } from "../lib/design/catalog";
import { elecPrefsFromDecisions } from "@/workspaces/cad/lib/design/elec-prefs";
import { layoutToSpec } from "../lib/design/layout";
import type { CadDesignSession, MepRun } from "../lib/design/design-session";
import {
  buildImageTags,
  buildContextAttachments,
  type Attachment,
} from "../lib/chat-prompt";
import { extractImageTags } from "@/shared/chat/ppt-message-tags";
import { cadStore } from "../storage";

/** Chat history drops inline images on save; images saved by earlier versions are kept here by id and put back on load. */
const CHAT_IMAGE_PREFIX = "chat-image:";
const CHAT_IMAGE_TAG = /\[\[IMAGE\|([^|\]]*#([a-z0-9]{8}))\|\[image-data\]\]\]/gi;
const generateChatMessage = (messages: ChatMessage[], model?: string, options?: GenerateChatMessageOptions) =>
  retryCadTextRequest(() => generateChatMessageOnce(messages, model, options), options?.signal);

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string };
type MaybePromise<T> = T | Promise<T>;



interface ChatPanelProps {
  className?: string;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  onCodeAction?: (
    code: string,
    type: "diagram" | "cad" | "ppt",
  ) => MaybePromise<void | CodeActionResult>;
  /** Unused since the LLM router was removed; kept so callers compile. */
  systemPrompt?: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  chatModel?: string;
  /** Only ever "cad": the CAD shell is this panel's single caller. */
  workspaceId?: "cad";
  mode?: "text" | "ppt_image";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  collapseLocked?: boolean;
  title?: string;
  inputPlaceholder?: string;
  onClearAttachments?: () => void;
  cadContext?: {
    plan?: any;
  };
  onClearWorkspace?: () => void;
  designSession: CadDesignSession;
  composerRequest?: { id: number; text: string; send?: boolean };
}

export function ChatPanel(props: ChatPanelProps) {
  const {
    designSession: session,
    cadContext,
    onCodeAction,
    onMessagesChange,
    chatModel,
    workspaceId = "cad",
    attachments = [],
  } = props;
  const language = useUiLanguage();
  const tr = (zh: string, en: string) => (language === "zh" ? zh : en);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadChatHistory(chatStorageKey(workspaceId), props.initialMessages ?? []),
  );
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const abortRef = useRef<AbortController>();
  const busyRef = useRef(false);
  const composerHandled = useRef<number>();
  useEffect(() => {
    const ids = Array.from(new Set(messages.flatMap((message) =>
      typeof message.content === "string" ? Array.from(message.content.matchAll(CHAT_IMAGE_TAG), (match) => match[2]) : [],
    )));
    if (!ids.length) return;
    let cancelled = false;
    void Promise.all(ids.map(async (id) => [id, await cadStore.read<string>(CHAT_IMAGE_PREFIX + id).catch(() => null)] as const)).then((found) => {
      const urls = new Map(found.filter((entry): entry is readonly [string, string] => !!entry[1]));
      if (cancelled || !urls.size) return;
      setMessages((previous) => previous.map((message) => typeof message.content !== "string" ? message : {
        ...message,
        content: message.content.replace(CHAT_IMAGE_TAG, (tag, name, id) => urls.has(id) ? `[[IMAGE|${name}|${urls.get(id)}]]` : tag),
      }));
    });
    return () => { cancelled = true; };
    // Restore once on mount; new images arrive with their data already inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    saveChatHistory(chatStorageKey(workspaceId), messages);
    onMessagesChange?.(messages);
  }, [messages, workspaceId, onMessagesChange]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const updateAssistant = (content: string) =>
    setMessages((previous) => [
      ...previous.slice(0, -1),
      { role: "assistant", content },
    ]);
  const applyArtifact = async (
    payload: any,
    retry: (feedback: string, summary: string) => Promise<unknown>,
    options: { signal?: AbortSignal; allowReplace?: boolean } = {},
  ) => {
    if (payload.type === "cad_spec" || payload.type === "cad_ops" || payload.type === "cad_spec_patch")
      return await session.applyModelOutput(payload, retry, options);
    const result = await onCodeAction?.(JSON.stringify(payload), "cad");
    if (result && !result.ok)
      throw new Error(result.error || "CAD application failed");
    return null;
  };
  const run = async (text: string, history = messages, uploadFiles = files) => {
    if (busyRef.current || !text.trim()) return;
    busyRef.current = true;
    setLoading(true);
    setInput("");
    setFiles([]);
    const controller = new AbortController();
    abortRef.current = controller;
    const display: ChatMessage[] = [
      ...history,
      { role: "user", content: text },
    ];
    setMessages([...display, { role: "assistant", content: "" }]);
    // The floorplan step's finished stages; the catch block below shows a failure inside the same step.
    let generateLog: string[] | null = null;
    try {
      const design = await session.sync();
      const blocked = tr(
        "请先在设计器里点“确认户型”，再导出报价单和施工图。",
        "Confirm the floorplan in the designer first, then export the quote and drawings.",
      );
      const global = getAIConfig();
      const constraints =
        localStorage.getItem(
          `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}`,
        ) ?? "";
      const system = [
        global.systemPrompt,
        constraints,
        `Output language: ${language === "zh" ? "Simplified Chinese" : "English"}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const context = JSON.stringify({
        hasPlan: !!cadContext?.plan,
        hasDesign: !!design,
        designStatus: design?.status ?? "draft",
        cad_plan: cadContext?.plan,
        designSummary: session.summary(),
      });
      const content: any[] = [
        {
          type: "text",
          text: [
            stripCadMarkers(extractImageTags(text).rest),
            context,
            buildContextAttachments(attachments),
          ].join("\n\n"),
        },
      ];
      const uploadedImages = extractImageTags(text).images;
      const uploadedTexts: string[] = [];
      for (const image of uploadedImages)
        content.push({ type: "image_url", image_url: { url: image.url } });
      for (const file of uploadFiles) {
        if (file.type.startsWith("image/")) {
          const url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          content.push({ type: "image_url", image_url: { url } });
          uploadedImages.push({ name: file.name, url });
        } else {
          const { extractPdfText, extractTextFileContent, isPdfFile } =
            await import("@/shared/files");
          const extracted = isPdfFile(file)
            ? await extractPdfText(file)
            : await extractTextFileContent(file);
          const fileText = `[File: ${file.name}]\n${extracted}`;
          content.push({ type: "text", text: fileText });
          uploadedTexts.push(fileText);
        }
      }
      const visibleText = [
        buildImageTags(
          uploadedImages.map((image) => ({
            name: image.name ?? "image",
            url: image.url,
          })),
        ),
        extractImageTags(text).rest,
        ...uploadedTexts,
      ]
        .filter(Boolean)
        .join("\n\n");
      setMessages([
        ...history,
        { role: "user", content: visibleText },
        { role: "assistant", content: "" },
      ]);
      const user: ChatMessage = { role: "user", content: content as any };
      const call = async (
        prompt: string,
        request: ChatMessage[] = [user],
        stream: boolean | ((chunk: string) => void) = false,
      ) => {
        const modelMessages: ChatMessage[] = [
          { role: "system", content: [prompt, system].join("\n\n") },
          ...request,
        ];
        const show = typeof stream === "function" ? stream : stream ? updateAssistant : () => {};
        // A full floorplan JSON is long; when the model runs out of output tokens ("length"),
        // ask it to carry on from where it stopped and join the pieces instead of starting over.
        return await retryCadTextRequest(async () => {
          let total = "";
          let messagesForPart = modelMessages;
          let dropped = 0;
          for (let part = 0; part < 6; part++) {
            const before = total;
            const { text: piece, finish, error } = await streamChatText(
              messagesForPart,
              (text) => show(before + text),
              chatModel,
              { signal: controller.signal, timeoutMs: 300000 },
            );
            controller.signal.throwIfAborted();
            total = before + piece;
            if (finish === "interrupted") {
              // The connection to the model was cut ("terminated"): keep what arrived and resume,
              // or start over when nothing did. Give up after three drops.
              dropped++;
              console.warn(`[CAD] Model stream interrupted after ${total.length} characters: ${error}`);
              if (dropped > 3) throw new Error(tr(`与模型的连接多次中断（${error}），请稍后重试。`, `The connection to the model kept dropping (${error}); please try again.`));
              if (!total) continue;
              try { parseCadPayload(total); break; } catch { /* incomplete: resume below */ }
            } else if (finish !== "length") break;
            else console.warn(`[CAD] Model output cut off at ${total.length} characters; asking it to continue`);
            messagesForPart = [
              ...modelMessages,
              { role: "assistant", content: total },
              { role: "user", content: "输出因长度被截断。请紧接着上面最后一个字符继续输出剩余内容，不要重复已输出的部分，不要加任何解释或新的代码块开头。 / Output was cut off; continue exactly from the last character, no repetition, no preamble." },
            ];
          }
          return total;
        }, controller.signal);
      };
      const callPayload = async (
        prompt: string,
        request: ChatMessage[] = [user],
        show: boolean | ((chunk: string) => void) = true,
      ) => {
        const response = await call(prompt, request, show);
        try { return { payload: parseCadPayload(response), text: response, repairRounds: 0 }; }
        catch {
          controller.signal.throwIfAborted();
          const why = describeJsonError(response);
          // Kept whole for debugging: the console only shows the two ends.
          (window as unknown as { __cadLastRaw?: string }).__cadLastRaw = response;
          console.error(`[CAD] Unparsable model output (${response.length} chars): ${why}`, response.slice(0, 400), "…", response.slice(-400));
          const textOnlyRequest = request.map(message => ({
            ...message,
            content: Array.isArray(message.content)
              ? message.content.filter(part => part.type === 'text').map(part => part.text).join('\n\n')
              : message.content,
          }));
          const repaired = await call(prompt, [
            ...textOnlyRequest,
            { role: 'assistant', content: response || '(empty model response)' },
            { role: 'user', content: `上次返回内容不是合法 JSON，解析报错：\n${why}\n请改正这一处（以及同类错误），保持原需求，完整重发一个指定类型的 CAD JSON 对象，不要解释，不要省略字段，不要输出注释，坐标只写数字不要写算式。 / Your last answer is not valid JSON (see the error above). Fix it and return one complete valid CAD JSON payload for the same request; numbers only, no expressions or comments.` },
          ], show);
          return { payload: parseCadPayload(repaired), text: repaired, repairRounds: 1 };
        }
      };
      const retry = async (feedback: string, summary: string) =>
        parseCadPayload(
          await call(
            [CAD_DESIGN_FIX_PROMPT, catalogPromptTable(), designerReferences(`${text}\n${feedback}`)].join("\n\n"),
            [
              {
                role: "user",
                content: `用户本次要求\n${stripCadMarkers(extractImageTags(text).rest)}\n校验反馈\n${feedback}\n当前相关户型摘要\n${summary}\n当前设计的 HouseSpec（designSpec，cad_spec_patch 的路径指向这里）\n${session.spec()}`,
              },
            ],
          ),
        );
      // No LLM router: the next step follows from the current state.
      const plain = stripCadMarkers(extractImageTags(text).rest);
      // The plan block's confirm button: always a request to generate, never a delivery or plan request.
      const confirming = text.startsWith(CAD_CONFIRM);
      const wantsDeliver = !confirming && /BOM|物料|材料清单|清单|报价|效果图|装修图|施工图|渲染|出图|导出|bill of materials|quote|render|export/i.test(plain);
      const wantsPlan = !confirming && /重新(?:出|做|生成|规划|设计)?(?:一[个版份])?方案|重新规划|修改方案|调整方案|改方案|new plan|revise (?:the )?plan/i.test(plain);
      // The floorplan is only generated once the user confirms the plan (button or words).
      const wantsGenerate = confirming || /生成户型|画户型|出户型|根据.*方案.*生成|按(?:新)?方案(?:重新)?(?:生成|画|出)|确认方案|方案(?:没问题|可以|确认|ok)|就按(?:这个|这版)|generate (?:a |the )?floorplan|confirm (?:the )?plan/i.test(plain);
      const current = await session.sync();
      let plan = cadContext?.plan ?? null;
      // Options clicked in the plan block become the plan's decisions, so a retry or a later edit keeps them.
      const { picks } = takePicks(text);
      if (picks && plan) {
        plan = applyPicks(plan, picks);
        await applyArtifact({ type: "cad_plan", plan }, retry);
      }
      const designRequest = (planValue: unknown, designValue: typeof current) => {
        const parts: any[] = [
          {
            type: "text",
            text: [
              plain,
              JSON.stringify({
                hasDesign: !!designValue,
                designStatus: designValue?.status ?? "draft",
                cad_plan: planValue ?? undefined,
                designSummary: designValue ? session.summary() : undefined,
                // The design in the designer's own format: every field spec-format.md describes can be patched.
                designSpec: designValue ? JSON.parse(session.spec() || "null") : undefined,
              }),
              buildContextAttachments(attachments),
              ...uploadedTexts,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
          ...content.filter((part) => part.type === "image_url"),
        ];
        return { role: "user", content: parts as any } as ChatMessage;
      };
      const generateDesign = async (
        planValue: unknown,
        options: { replace?: boolean; prefix?: string } = {},
      ) => {
        const designValue = await session.sync();
        const editing = !!designValue && !options.replace;
        const prefix = options.prefix ? `${options.prefix}\n\n` : "";
        const progress = editing
          ? tr("正在修改户型…", "Updating the floorplan…")
          : tr("正在生成户型…", "Generating the floorplan…");
        // Finished stages stay listed above the one in progress, so the block reads as a log.
        const log: string[] = [];
        generateLog = log;
        const showStage = (stage: string, detail = "") =>
          updateAssistant(generateMessage("running", [prefix + [...log, stage].join("\n\n"), detail].filter(Boolean).join("\n\n")));
        showStage(progress);
        const prompt = [
          editing ? CAD_DESIGN_EDIT_PROMPT : CAD_DESIGN_CREATE_PROMPT,
          catalogPromptTable(),
          ...(editing ? [designerReferences(plain)] : []),
        ].join("\n\n");
        // Edits refer back to the conversation ("阳台加一个窗花" after "阳台没有窗户啊"), so the last turns go along as text.
        const recent: ChatMessage[] = editing
          ? history.slice(-6).flatMap((message) => {
              const raw = typeof message.content === "string" ? message.content : "";
              const body = stripCadMarkers(extractImageTags(raw).rest).trim();
              return body ? [{ role: message.role, content: body.length > 800 ? `${body.slice(0, 800)}…` : body } as ChatMessage] : [];
            })
          : [];
        const request = [...recent, designRequest(planValue, editing ? designValue : null)];
        const streamed = (text: string) => showStage(progress, describeSpecStream(text, language === "zh"));
        const response = await callPayload(prompt, request, streamed);
        let payload = response.payload;
        // The model describes the layout; the program computes walls, openings and furniture positions.
        let layoutNotes: string[] = [];
        for (let attempt = 0; payload.type === "cad_layout"; attempt++) {
          try {
            const converted = layoutToSpec(payload.layout);
            layoutNotes = converted.notes;
            payload = { type: "cad_spec", spec: converted.spec };
          } catch (reason) {
            const problem = reason instanceof Error ? reason.message : String(reason);
            if (attempt >= 1) throw new Error(tr(`布局说明有问题：${problem}`, `The layout is invalid: ${problem}`));
            showStage(progress, tr(`布局说明有问题，让 AI 改：${problem}`, `Asking the model to fix the layout: ${problem}`));
            payload = (await callPayload(prompt, [
              ...request,
              { role: "assistant", content: JSON.stringify(payload) },
              { role: "user", content: `这份布局说明无法生成户型：\n${problem}\n请改正后完整重发 cad_layout。 / This layout cannot be built (see above); fix it and send the whole cad_layout again.` },
            ], streamed)).payload;
          }
        }
        if (options.replace && payload.type === "cad_spec") payload = { ...payload, replace: true };
        const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";
        if ((payload.type === "cad_ops" && (!Array.isArray(payload.ops) || !payload.ops.length)) || (payload.type === "cad_spec_patch" && (!Array.isArray(payload.patch) || !payload.patch.length))) {
          // Nothing to change: say why instead of reporting "0 changes".
          updateAssistant(generateMessage("done", `${prefix}${reply || tr(
            "这次没有改动户型：AI 没能把这句话对应到具体的墙、门窗或家具。可以说得具体些，例如“在阳台南面外墙加一扇 1.5 米的窗”。",
            "Nothing changed: the model could not map this to a wall, opening or piece of furniture. Try being more specific, e.g. \"add a 1.5 m window on the balcony's south wall\".",
          )}`));
          return null;
        }
        log.push(`✓ ${editing ? tr("修改内容已写好", "Changes written") : tr("户型已画好", "Floorplan drawn")}：${describeSpecStream(JSON.stringify(payload), language === "zh").split("\n\n")[0].replace(/^- /gm, "").replace(/\n/g, tr("；", "; "))}`);
        if (layoutNotes.length) log.push(`${tr("程序摆放时的调整", "Adjusted while placing")}：\n${layoutNotes.map((note) => `- ${note}`).join("\n")}`);
        const checking = tr("设计器自检中（自动推开碰撞家具，必要时让 AI 修复）…", "Checking in the designer (nudging colliding furniture, asking the model to fix the rest)…");
        showStage(checking);
        let repairRound = 0;
        const loggedRetry = async (feedback: string, summary: string) => {
          repairRound++;
          showStage(checking, tr(`AI 修复第 ${repairRound} 轮…`, `Model repair round ${repairRound}…`));
          return await retry(feedback, summary);
        };
        const result = await session.applyModelOutput(payload, loggedRetry, {
          signal: controller.signal,
          initialRepairRounds: response.repairRounds,
          allowReplace:
            !!options.replace ||
            /整体重画|重新绘制全|重画全部|redraw|start over/i.test(plain),
        });
        log.push(`✓ ${tr("自检完成", "Checked")}${repairRound ? tr(`（AI 修复 ${repairRound} 轮）`, ` (${repairRound} repair rounds)`) : ""}`);
        showStage(tr("布置水电点位…", "Laying out MEP points…"));
        // After walls, openings or furniture moved, the designer lays out MEP again (unless the points were edited by hand).
        const mepRun = await session.autoMep({
          relayout: result.touched.layout || result.touched.relayoutElec,
          force: result.touched.relayoutElec,
        }).catch((reason): MepRun => { console.error('[CAD] Auto MEP failed', reason); return { placed: 0 }; });
        const mep = mepRun.placed;
        // Then the wiring preferences picked in the plan (more sockets, network points, where the boxes go…).
        const elecNotes = mep
          ? await session.applyElecPrefs(elecPrefsFromDecisions((planValue as { decisions?: unknown } | null)?.decisions)).catch((reason) => { console.error('[CAD] Wiring preferences failed', reason); return [] as string[]; })
          : [];
        const mepLine = mep
          ? tr(`已${editing ? "按新户型重新" : "自动"}布置 ${mep} 个水电点位${elecNotes.length ? `，并按你的水电偏好调整：${elecNotes.join("；")}` : ""}。`, ` ${mep} MEP points laid out ${editing ? "again for the new layout" : "automatically"}${elecNotes.length ? `; adjusted to your wiring preferences: ${elecNotes.join("; ")}` : ""}.`)
          : mepRun.skipped === "manual"
            ? tr("水电点位之前手动调过，这次没有重新布置；要按新户型重新布置，就说“重新布置水电”。", " MEP points were edited by hand, so they were not laid out again; say \"redo the MEP layout\" to start them over.")
            : "";
        // The room-by-room MEP audit; what it finds goes back to the model once or twice as MEP operations.
        let mepFixed = 0;
        if ((mep || result.touched.elec) && session.getSnapshot().audit?.problems.length) {
          showStage(tr(`水电审计发现 ${session.getSnapshot().audit!.problems.length} 个问题，让 AI 修…`, "Asking the model to fix the MEP audit problems…"));
          const repair = await session.repairMep((problems, summary) => retry(
            `水电逐房间审计问题（只用 add_elec / move_elec / link_elec / remove 点位id 修，不动墙、门窗和家具）：\n${problems.map((item) => `- ${item}`).join("\n")}`,
            summary,
          )).catch((reason) => { console.error('[CAD] MEP audit repair failed', reason); return null; });
          mepFixed = repair?.fixed ?? 0;
        }
        // The room-by-room MEP audit: say what is wrong, not just how many.
        const audit = mep || result.touched.elec ? session.getSnapshot().audit : null;
        const fixedLine = mepFixed ? tr(`AI 已修好 ${mepFixed} 个水电审计问题。`, `The model fixed ${mepFixed} MEP audit problems.`) : "";
        const auditList = audit?.problems.map((item) => `- ${item}`).join("\n") ?? "";
        const auditLine = !audit
          ? ""
          : audit.problems.length
            ? tr(
                `水电审计发现 ${audit.problems.length} 个问题（可在设计器「水电」里调整）：\n${auditList}`,
                `The MEP audit found ${audit.problems.length} problems (adjust them under MEP in the designer):\n${auditList}`,
              )
            : tr("水电审计通过：灯、开关、插座、安装高度和门边开关都符合常规。", "The MEP audit passed: lights, switches, sockets, heights and door switches follow common practice.");
        const summaryLine = editing
          ? tr(
              `户型已修改 ${result.applied} 处，${result.errors} 个错误，${result.warnings} 个警告。`,
              `Floorplan updated: ${result.applied} changes, ${result.errors} errors, ${result.warnings} warnings.`,
            )
          : tr(
              `户型已生成：${result.errors} 个错误，${result.warnings} 个警告。可以在设计器里查看、直接拖动修改，或继续告诉我要改哪里；满意后点“确认户型”。`,
              `Floorplan generated: ${result.errors} errors, ${result.warnings} warnings. Review it in the designer, drag to adjust, or tell me what to change; press Confirm design when you are happy.`,
            );
        updateAssistant(generateMessage("done", `${prefix}${[...log, reply, `**${summaryLine}${mepLine}**`, fixedLine, auditLine].filter(Boolean).join("\n\n")}`));
        return result;
      };
      const generatePlan = async () => {
        const drafting = tr("正在理解需求、整理设计方案…", "Reading the brief and drafting the plan…");
        updateAssistant(planMessage("drafting", drafting));
        const planRequest: ChatMessage = {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                plain,
                JSON.stringify({
                  cad_plan: plan ?? undefined,
                  designSummary: current ? session.summary() : undefined,
                }),
                buildContextAttachments(attachments),
                ...uploadedTexts,
              ]
                .filter(Boolean)
                .join("\n\n"),
            },
            ...content.filter((part) => part.type === "image_url"),
          ] as any,
        };
        const response = await callPayload(CAD_PLAN_AGENT_PROMPT, [
          // Earlier analysis boards are for the user; send the model their text only.
          ...history.slice(-8).map((message) => typeof message.content === "string" ? { ...message, content: stripCadMarkers(extractImageTags(message.content).rest) } : message),
          planRequest,
        ], (chunk) => {
          // Show the plan as readable text while the model is still writing its JSON.
          const partial = parsePartialJson(chunk);
          updateAssistant(planMessage("drafting", partial?.plan && typeof partial.plan === "object" ? planText(partial.plan) : drafting));
        });
        const payload = response.payload;
        if (payload.type !== "cad_plan") throw new Error("Expected cad_plan");
        controller.signal.throwIfAborted();
        await applyArtifact(payload, retry);
        return { plan: payload.plan, text: response.text };
      };
      const planText = (planValue: any) => {
        const list = (value: unknown) => (Array.isArray(value) ? value.filter(Boolean).join("、") : "");
        const rooms = Array.isArray(planValue?.rooms)
          ? planValue.rooms.map((room: any) => {
              const facts = [
                room.area ? `${room.area}㎡` : "",
                room.orientation ? tr(`朝${room.orientation}`, `faces ${room.orientation}`) : "",
                list(room.adjacent) ? tr(`挨着${list(room.adjacent)}`, `next to ${list(room.adjacent)}`) : "",
              ].filter(Boolean).join("，");
              const must = list(room.mustHave);
              return `- **${room.name}**${facts ? `（${facts}）` : ""}${must ? `：${must}` : ""}${room.notes ? `。${room.notes}` : ""}`;
            })
          : [];
        return [
          `### ${tr("设计方案", "Design plan")}`,
          planValue?.summary ?? "",
          [
            planValue?.totalArea ? `${tr("总面积", "Total area")} ${planValue.totalArea}㎡` : "",
            planValue?.height ? `${tr("层高", "Ceiling")} ${planValue.height}mm` : "",
            planValue?.style ? `${tr("风格", "Style")}：${planValue.style}` : "",
          ].filter(Boolean).join(" · "),
          planValue?.household ? `**${tr("居住情况", "Household")}**：${planValue.household}` : "",
          planValue?.zoning ? `**${tr("分区与动线", "Zoning")}**：${planValue.zoning}` : "",
          planValue?.entry ? `**${tr("入户", "Entry")}**：${planValue.entry}` : "",
          rooms.length ? `**${tr("房间", "Rooms")}**\n${rooms.join("\n")}` : "",
          list(planValue?.constraints) ? `**${tr("约束", "Constraints")}**：${list(planValue.constraints)}` : "",
          list(planValue?.assumptions) ? `**${tr("假设（请核对）", "Assumptions (please check)")}**：${list(planValue.assumptions)}` : "",
          validDecisions(planValue?.decisions).length
            ? `**${tr("已定事项（当前选择）", "Decisions (current choice)")}**：${validDecisions(planValue.decisions).map((decision) => `${decision.topic} ${[decision.choice].flat().filter(Boolean).join("、") || tr("未定", "open")}`).join(" · ")}`
            : "",
        ].filter(Boolean).join("\n\n");
      };
      // The plan goes straight to confirmation: no analysis boards (slow, and they did not help the floorplan).
      const showPlan = (drafted: { plan: any }, regenerate: boolean) => {
        updateAssistant(planMessage("ready", planText(drafted.plan), "", regenerate, validDecisions(drafted.plan?.decisions)));
      };

      if (wantsDeliver && !wantsPlan) {
        updateAssistant(
          current?.status === "confirmed"
            ? tr("户型已确认。报价单、施工图 PDF、DXF、彩平图和 3D 效果图都在设计器顶栏的导出按钮里，直接下载即可。", "The design is confirmed. The quote, drawing PDF, DXF, colour plan and 3D render are in the designer's export buttons.")
            : blocked,
        );
      } else if (!current) {
        if (plan && wantsGenerate) await generateDesign(plan);
        else {
          showPlan(await generatePlan(), false);
        }
      } else if (wantsPlan) {
        showPlan(await generatePlan(), true);
      } else if (wantsGenerate && plan && /重新|新方案|regenerate|new plan/i.test(plain)) {
        await generateDesign(plan, { replace: true });
      } else {
        await generateDesign(plan);
      }
    } catch (reason) {
      const message = controller.signal.aborted ? tr("已停止", "Stopped") : readableError(reason);
      // A failed floorplan stays in its step block (a bare JSON array here used to render as PPT slides).
      updateAssistant(generateLog ? generateMessage("error", [...generateLog, message].join("\n\n")) : message);
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };
  /** Validation and rejected-operation errors arrive as JSON; list them as sentences. */
  const readableError = (reason: unknown) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    try {
      const parsed = JSON.parse(message);
      const items: any[] | null = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.issues) ? parsed.issues : null;
      if (items?.length) {
        const lines = items.slice(0, 8).map((item) => `- ${item?.msg ?? item?.message ?? item?.reason ?? JSON.stringify(item)}`);
        return [
          tr("户型没通过校验，AI 修了几轮还是没解决：", "The floorplan failed validation and the model could not fix it:"),
          lines.join("\n"),
          tr("可以点下面的“重新生成户型”重试，或者告诉我怎么调整方案。", "Press \"Generate again\" below to retry, or tell me how to adjust the plan."),
        ].join("\n\n");
      }
    } catch { /* plain text */ }
    return message;
  };
  const sendRef = useRef(run);
  sendRef.current = run;
  useEffect(() => {
    const request = props.composerRequest;
    if (!request || request.id === composerHandled.current) return;
    composerHandled.current = request.id;
    if (request.send) void sendRef.current(request.text);
    else {
      setInput(request.text);
      setFocusTick((value) => value + 1);
    }
  }, [props.composerRequest]);
  const applyCode = async (code: string) => {
    try {
      const retry = async (feedback: string, summary: string) =>
        parseCadPayload(
          await generateChatMessage(
            [
              {
                role: "system",
                content: [CAD_DESIGN_FIX_PROMPT, catalogPromptTable(), designerReferences(feedback)].join(
                  "\n\n",
                ),
              },
              { role: "user", content: `${feedback}\n${summary}\n当前设计的 HouseSpec（designSpec）\n${session.spec()}` },
            ],
            chatModel,
          ),
        );
      await applyArtifact(parseCadPayload(code), retry);
      return true;
    } catch (reason) {
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: String(reason) },
      ]);
      return false;
    }
  };
  if (props.collapsed)
    return (
      <div className="h-full flex justify-center pt-4">
        <ButtonWithTooltip
          tooltipContent={tr("展开", "Expand")}
          onClick={props.onToggleCollapse}
        >
          <PanelRightOpen />
        </ButtonWithTooltip>
      </div>
    );
  return (
    <div
      className={cn("h-full flex flex-col bg-card", props.className)}
      data-testid="cad-chat-panel"
    >
      <div className="flex items-center justify-between border-b p-4">
        <strong>{props.title ?? tr("AI 助手", "AI Assistant")}</strong>
        <button
          onClick={props.onToggleCollapse}
          disabled={props.collapseLocked}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      {loading && (
        <span data-testid="cad-chat-busy" className="sr-only">
          busy
        </span>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {messages.length ? (
          <ChatMessageDisplay
            messages={
              messages.map((message, index) => ({
                id: `cad-${index}`,
                role: message.role,
                content: message.content,
              })) as UIMessage[]
            }
            status={loading ? "streaming" : "idle"}
            onApplyCode={applyCode}
            onRegenerate={(index) => {
              const history = messages.slice(0, index);
              const user = [...history]
                .reverse()
                .find((message) => message.role === "user");
              if (user && typeof user.content === "string")
                void run(
                  user.content,
                  history.slice(0, history.lastIndexOf(user)),
                  [],
                );
            }}
            onEditMessage={(index, text) =>
              void run(text, messages.slice(0, index), [])
            }
            onCadAction={(text) => void run(text)}
          />
        ) : (
          <ChatEmptyState
            icon={Home}
            title={tr("从需求开始", "Start with your requirements")}
            description={tr(
              "描述户型、面积和生活方式",
              "Describe your rooms, area and lifestyle",
            )}
            examplesLabel={tr("试试这些需求", "Try a request")}
            examples={["两室一厅 80㎡，三口之家"]}
            onPickExample={setInput}
          />
        )}
      </div>
      {snapshot.lastResult && (
        <div
          className="border-t p-2 text-xs"
          data-testid="cad-chat-design-result"
          data-rounds={snapshot.lastResult.rounds}
        >
          {(() => {
            // Say what the remaining problems are, not just how many: errors first, then warnings.
            const open = snapshot.issues.filter((issue) => issue.level === "error" || issue.level === "warn")
              .sort((a, b) => (a.level === "error" ? 0 : 1) - (b.level === "error" ? 0 : 1));
            const errors = open.filter((issue) => issue.level === "error").length;
            if (!open.length) return <div>{tr("设计器检查通过，没有错误和警告。", "The designer check passed: no errors or warnings.")}</div>;
            return (
              <details open={errors > 0}>
                <summary className="cursor-pointer">
                  {tr(
                    `设计器检查：${errors} 个错误，${open.length - errors} 个警告（点开看具体是什么，可以直接让我改）`,
                    `Designer check: ${errors} errors, ${open.length - errors} warnings (expand to see them; ask me to fix any)`,
                  )}
                </summary>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">
                  {open.map((issue, index) => (
                    <li key={`${issue.code}-${index}`} className={issue.level === "error" ? "text-destructive" : "text-muted-foreground"}>
                      {issue.room ? `${issue.room}：` : ""}{issue.msg}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })()}
          {snapshot.audit && (snapshot.audit.problems.length > 0 || snapshot.audit.notes.length > 0) && (
            <details className="mt-1" data-testid="cad-chat-elec-audit">
              <summary className="cursor-pointer">
                {tr(
                  `水电审计：${snapshot.audit.problems.length} 个问题，${snapshot.audit.notes.length} 条提示（可在设计器「水电」里调整）`,
                  `MEP audit: ${snapshot.audit.problems.length} problems, ${snapshot.audit.notes.length} notes (adjust under MEP in the designer)`,
                )}
              </summary>
              <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-4">
                {snapshot.audit.problems.map((item) => <li key={`p-${item}`} className="text-destructive">{item}</li>)}
                {snapshot.audit.notes.map((item) => <li key={`n-${item}`} className="text-muted-foreground">{item}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      <div className="border-t p-4" data-testid="cad-chat-composer">
        <ChatInput
          workspaceId="cad"
          input={input}
          setInput={setInput}
          files={files}
          onFilesChange={setFiles}
          isLoading={loading}
          onSubmit={() => void run(input)}
          onStop={() => abortRef.current?.abort()}
          onClearChat={() => setShowReset(true)}
          onToggleHistory={() => setShowHistory(true)}
          focusKey={focusTick}
          placeholder={props.inputPlaceholder}
          uploadMode="filesOnly"
          bottomChips={
            <div className="flex gap-2">
              {attachments.map((item) => (
                <button
                  key={item.id}
                  onClick={() => props.onRemoveAttachment?.(item.id)}
                >
                  {item.name} ×
                </button>
              ))}
            </div>
          }
        />
      </div>
      <DesignHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        session={session}
        zh={language === "zh"}
      />
      <ResetWarningModal
        open={showReset}
        onOpenChange={setShowReset}
        onClear={() => {
          abortRef.current?.abort();
          setMessages([]);
          props.onClearAttachments?.();
          props.onClearWorkspace?.();
        }}
      />
    </div>
  );
}
