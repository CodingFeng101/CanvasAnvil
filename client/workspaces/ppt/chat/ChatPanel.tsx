import { usePendingPrompt } from "@/shared/pending-prompt";
import { peekPendingReference } from "@/shared/references/pending";
import { PptFlowSteps } from "@/workspaces/ppt/chat/PptFlowSteps";
import { PptKindQuestion } from "@/workspaces/ppt/chat/PptKindQuestion";
import {
  IDLE_ACTIVITY,
  applyActivity,
  closeInterrupted,
  flowText,
  latestFlowIndex,
  newFlow,
  readFlow,
  type DeckActivity,
  type DeckFlowSnapshot,
} from "@/workspaces/ppt/lib/deck-flow";
import type { WorkReference } from "@/shared/references/types";
import { reportSourceItems } from "@/workspaces/ppt/canvas/lib/report-images";
import { useReportBusy, useReportLastPrompt } from '@/shared/works/work-context';
import { useSendAfterRender } from '@/shared/chat/use-send-after-render';
import { ChatTitle } from '@/shared/chat/chat-title';
import { constraintsFor } from '@/shared/constraints';
import { CanvasOpenButton, useCanvasPane } from "@/shared/canvas-pane";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Presentation } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { streamChatMessage, generatePptProxyChatMessage, ChatMessage, getAIConfig } from '@/ai/client';

import { StatusSelect } from '@/shared/chat/composer';
import { ChatEmptyState,
  ChatLandingExtras, ChatInput } from '@/shared/chat';
import { chatStorageKey, loadChatHistory, saveChatHistory } from '@/shared/chat/chat-storage';
import { createAssistantUpdater } from '@/shared/chat/assistant-stream';
import { getChatErrorText } from '@/shared/chat/chat-errors';
import { PPT_WORKSPACE_STORAGE_KEY } from '@/workspaces/ppt/storage';
import { ChatMessageDisplay, UIMessage } from '@/workspaces/ppt/chat/ChatMessageDisplay';
import { HistoryDialog, HistoryItem } from '@/shared/chat';
import { ResetWarningModal } from '@/shared/chat';
import { t, useUiLanguage } from "@/shared/i18n";
import {
  askKindText,
  detectCreationKind,
  isPdfName,
  needsKindChoice,
  readAskKind,
  type CreationKind,
  type CreationRequest,
  type CreationResult,
} from "@/workspaces/ppt/lib/creation-intent";

interface Attachment {
  id: string;
  type: 'xml' | 'python' | 'json' | 'image' | 'text';
  content: string;
  name: string;
}

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string };
type MaybePromise<T> = T | Promise<T>;

interface ChatPanelProps {
  className?: string;
  /** What the canvas is doing while a deck is made, folded into the chat's steps. */
  activity?: DeckActivity;
  /** The outline is confirmed in the chat: make the slides with the chosen style. */
  onConfirmOutline?: () => void;
  /** The style is picked from the chat; the canvas opens its picker. */
  onPickStyle?: () => void;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  pptDraftSlides?: Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
  onClearPptDraftSlides?: () => void;
  onCodeAction?: (code: string, type: 'diagram' | 'cad' | 'ppt') => MaybePromise<void | CodeActionResult>;
  systemPrompt: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  chatModel?: string;
  /** Only ever "ppt": the PPT shell is this panel's single caller. */
  workspaceId?: "ppt";
  hideHistoryButton?: boolean;
  title?: string;
  inputPlaceholder?: string;
  // History props
  history?: HistoryItem[];
  onRestore?: (item: HistoryItem) => void;
  onClearVersionHistory?: () => void;
  onClearAttachments?: () => void;
  cadContext?: {
    plan?: any;
    svg2d?: string;
  };
  onClearWorkspace?: () => void;
  /**
   * My works: clearing starts over on a new draft instead of wiping storage
   * (a saved work keeps its chat). When given, it replaces the wipe.
   */
  onStartOver?: () => void;
  /** Where the deck is: before one exists ("start") a message asks for one instead of editing it. */
  stage?: "start" | "outline" | "slides";
  onStartCreation?: (request: CreationRequest) => Promise<CreationResult>;
  /** The style picked on the canvas, shown next to the input. */
  selectedTemplate?: { name: string; previewSrc: string } | null;
  onDraftChange?: (text: string) => void;
  /** The outline streaming in on the canvas, for the working line's token count. */
}

// Convert internal ChatMessage to UIMessage

export function ChatPanel({ 
    className, 
    attachments = [],
    onRemoveAttachment,
    pptDraftSlides = [],
    onClearPptDraftSlides,
    onCodeAction,
    systemPrompt,
    initialMessages = [],
    onMessagesChange,
    chatModel,
    workspaceId = 'ppt',
    hideHistoryButton = false,
    title,
    inputPlaceholder,
    history = [],
    onRestore,
    onClearVersionHistory,
    onClearAttachments,
    onClearWorkspace,
    onStartOver,
    stage = "slides",
    onStartCreation,
    selectedTemplate,
    onDraftChange,
    activity = IDLE_ACTIVITY,
    onConfirmOutline,
    onPickStyle,
}: ChatPanelProps) {
  const uiLang = useUiLanguage();
  const trText = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText);
  const resolvedTitle = title || t(uiLang, "workspace.default.title");
  const storageKey = chatStorageKey(workspaceId);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // A deck's steps saved mid-way (the page was refreshed) did not finish.
    const loaded = loadChatHistory(storageKey, initialMessages).map((m) => {
      const flow = m.role === "assistant" ? readFlow(m.content) : null;
      return flow ? { ...m, content: flowText(closeInterrupted(flow)) } : m;
    });
    // Brought here to make a report from a design: the chat says so, so the panel opens on the
    // conversation (the request waits in the box) rather than on the empty start screen.
    const waiting = peekPendingReference("ppt");
    if (waiting?.intent.kind !== "deck-source") return loaded;
    const name = waiting.reference.workName;
    const note = trText(
      `已带来「${name}」的设计内容，放在下面的输入框里。要求可以改一改，发送后就开始写大纲。`,
      `The design "${name}" came along; it is in the box below. Adjust the request if you like, then send it to start the outline.`,
    );
    return [...loaded, { role: "assistant", content: note }];
  });
  useReportLastPrompt(
    [...messages].reverse().find((m) => m.role === "user" && typeof m.content === "string")?.content as string | undefined,
  );

  const [input, setInput] = useState('');
  const canvasPane = useCanvasPane();
  const [pptInputSegments, setPptInputSegments] = useState<Array<{ type: "text"; text: string } | { type: "ppt"; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" }>>([
    { type: "text", text: "" }
  ]);
  // A sentence written on the portal lands here once, unsent.
  // A design sent here to become a report ("生成汇报 PPT"): its texts and quote ride along as one
  // reference card; the canvas takes the pictures and puts them on slides once the outline exists.
  const [incomingReference] = useState<WorkReference | null>(() => {
    const waiting = peekPendingReference("ppt");
    if (waiting?.intent.kind !== "deck-source") return null;
    const items = reportSourceItems(waiting.reference.items);
    return items.length ? { ...waiting.reference, items } : null;
  });

  usePendingPrompt("ppt", (text) => {
    setInput(text);
    setPptInputSegments([{ type: "text", text }]);
  });
  const [isLoading, setIsLoading] = useState(false);
  // Writing the outline counts as work in progress (no switching away, a chime when done, Settings → Usage).
  useReportBusy(isLoading);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const autoRetryCountRef = useRef(0);
  
  const [files, setFiles] = useState<File[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pptInputFocusTick, setPptInputFocusTick] = useState(0);
  const prevPptDraftCountRef = useRef(0);
  const prevPptDraftIdsRef = useRef<Set<string>>(new Set());
  const [pptInsertToken, setPptInsertToken] = useState<{ key: number; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" } | null>(null);
  const pptInsertQueueRef = useRef<Array<{ slideId: string; title: string; label: string; kind: "outline" | "slide_image" }>>([]);
  const pptInsertBusyRef = useRef(false);
  const [pptClearTick, setPptClearTick] = useState(0);
  const lastUploadedImagesRef = useRef<string[]>([]);
  /**
   * Which image call the next message takes.
   *
   * Always one of the two, never the router's guess: by the time there is a
   * conversation there is a slide on screen with a picture in it, so editing
   * is the safe default and redrawing is the deliberate choice. Leaving it to
   * the router was wrong in the two ways a user notices -- a wording tweak
   * redrawing the whole slide and losing a picture they liked, and a request
   * to change the picture editing the old one instead.
   */
  const [imageMode, setImageMode] = useState<"edit" | "regenerate">("edit");
  const imageModeRef = useRef(imageMode);
  imageModeRef.current = imageMode;

  // Before a deck exists, the message asks for one: what kind is read off the text and the files.
  const starting = stage === "start" && Boolean(onStartCreation);
  const draftText = pptInputSegments.map((s) => (s.type === "text" ? s.text : "")).join("");
  const draftFileNames = files.map((f) => f.name);
  const creationKind = detectCreationKind(draftText, draftFileNames);
  useEffect(() => {
    onDraftChange?.(starting ? draftText : "");
  }, [draftText, starting, onDraftChange]);

const getPptLabel = (slideId: string, title: string, zh: boolean) => {
  const m = String(slideId || "").match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (!Number.isNaN(n)) {
    const page = zh ? `第 ${n} 页` : `Slide ${n}`;
    return title ? `${page} · ${title}` : page;
  }
  return title || slideId;
};

const getPptTag = (slideId: string, title: string, kind: "outline" | "slide_image") => {
  const m = String(slideId || "").match(/(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  if (Number.isNaN(n)) return "";
  const safeTitle = String(title || "").split("|").join(",").split("]]").join("");
  return `[[PPT_SLIDE|${n}|${safeTitle}|${kind}]]`;
};

  const pumpPptInsertQueue = useCallback(() => {
    if (pptInsertBusyRef.current) return;
    const next = pptInsertQueueRef.current.shift();
    if (!next) return;
    pptInsertBusyRef.current = true;
    const tag = getPptTag(next.slideId, next.title, next.kind);
    setPptInsertToken({ key: Date.now() + Math.random(), slideId: next.slideId, label: next.label, tag, tokenKind: next.kind });
  }, []);

  const enqueuePptToken = useCallback((slideId: string, title: string, kind: "outline" | "slide_image") => {
    const label = getPptLabel(slideId, title, uiLang === "zh");
    pptInsertQueueRef.current.push({ slideId, title, label, kind });
    pumpPptInsertQueue();
  }, [pumpPptInsertQueue, uiLang]);

  useEffect(() => {
    const prev = prevPptDraftCountRef.current;
    const next = pptDraftSlides.length;
    prevPptDraftCountRef.current = next;
    if (next > prev) {
      setPptInputFocusTick((x) => x + 1);
    }
  }, [pptDraftSlides.length]);

  useEffect(() => {
    const prevIds = prevPptDraftIdsRef.current;
    const nextIds = new Set(pptDraftSlides.map((s) => s.id));
    const added = pptDraftSlides.filter((s) => !prevIds.has(s.id));
    prevPptDraftIdsRef.current = nextIds;
    if (added.length === 0) return;
    for (const s of added) enqueuePptToken(s.slideId, s.title, s.kind);
  }, [pptDraftSlides, enqueuePptToken]);

  // CAD strips its tool payloads out of the transcript; PPT has none to strip.
  const sanitizeAssistantContentForDisplay = (content: string) => content;
;

  const createThrottledAssistantUpdater = () =>
    createAssistantUpdater(setMessages, sanitizeAssistantContentForDisplay);

  useEffect(() => {
    if (typeof window !== "undefined") saveChatHistory(storageKey, messages);
    onMessagesChange?.(messages);
  }, [messages, storageKey, onMessagesChange]);

  const clearHistory = () => {
    if (onStartOver) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setShowResetWarning(false);
      onStartOver();
      return;
    }
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setInput('');
    setPptInputSegments([{ type: "text", text: "" }]);
    setFiles([]);
    onClearAttachments?.();
    onClearPptDraftSlides?.();
    onClearWorkspace?.();
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    setMessages([]);
    setShowResetWarning(false);
  };

  const runCodeAction = async (code: string, type: 'diagram' | 'cad' | 'ppt') => {
    const result = await Promise.resolve(onCodeAction?.(code, type));
    if (!result || typeof result !== "object") return { ok: true } as CodeActionResult;
    const r = result as any;
    if (typeof r.ok === "boolean") {
      return { ok: r.ok, retry: !!r.retry, error: typeof r.error === "string" ? r.error : undefined } as CodeActionResult;
    }
    return { ok: true } as CodeActionResult;
  };

  /** Applies every ```json block of the answer (a ppt_edit patch) to the deck. */
  const handleAssistantResponse = async (fullResponse: string) => {
    if (!fullResponse) return;

    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = jsonRegex.exec(fullResponse))) {
      const jsonText = String(m[1] || "").trim();
      if (!jsonText) continue;

      // Attach the images this turn uploaded so the workspace can resolve
      // any {{image:...}} references the model emitted.
      try {
        const parsed = JSON.parse(jsonText);
        if (lastUploadedImagesRef.current.length > 0) {
          parsed.uploadedImages = lastUploadedImagesRef.current;
        }
        parsed.imageMode = imageModeRef.current;
        await runCodeAction(JSON.stringify(parsed), 'ppt');
      } catch {
        await runCodeAction(jsonText, 'ppt');
      }
    }
  };

  /**
   * Files sent without a word that include a PDF, waiting for the user to say what they are for
   * (restyle the PDF, or make a deck from them). Only in memory: a reload asks for them again.
   */
  const [kindChoiceFiles, setKindChoiceFiles] = useState<File[] | null>(null);

  /** The first message of a deck: hand it to the canvas and report how it went. */
  const startCreation = async () => {
    const text = draftText.trim();
    if ((!text && files.length === 0) || isLoading || !onStartCreation) return;
    if (needsKindChoice(text, draftFileNames)) {
      // Nothing said: ask rather than guess. The files show as sent (a referenced work as its card).
      const sent = await fileLinesOf(files.filter((f) => !f.type.startsWith("image/")));
      setMessages((prev) => [...prev, { role: "user", content: sent }, { role: "assistant", content: askKindText({}) }]);
      setKindChoiceFiles(files);
      setPptInputSegments([{ type: "text", text: "" }]);
      setPptClearTick((x) => x + 1);
      setFiles([]);
      return;
    }
    if (text && kindChoiceFiles && files.length === 0) {
      // The question answered in words: the waiting files go with them.
      const chosen = kindChoiceFiles;
      const kind = detectCreationKind(text, chosen.map((f) => f.name));
      answerKindQuestion(kind === "beautify" ? "beautify" : "idea");
      await runCreation(kind, text, chosen, "text");
      return;
    }
    await runCreation(creationKind, text, files, "all");
  };

  /** Marks the waiting question with what was picked; the files it held are handed over. */
  const answerKindQuestion = (kind: "beautify" | "idea") => {
    setKindChoiceFiles(null);
    setMessages((prev) => {
      let index = -1;
      prev.forEach((m, i) => {
        const ask = readAskKind(m.content);
        if (ask && !ask.picked) index = i;
      });
      if (index < 0) return prev;
      const next = prev.slice();
      next[index] = { ...prev[index], content: askKindText({ picked: kind }) };
      return next;
    });
  };

  /** The answer to "restyle it or make a deck from it?", by button. */
  const pickKind = (kind: "beautify" | "idea") => {
    const chosen = kindChoiceFiles;
    if (!chosen || isLoading) return;
    answerKindQuestion(kind);
    void runCreation(kind, "", chosen, "none");
  };

  /** Text files go in whole (a referenced work's text carries the marker the transcript shows as a canvas card); a PDF only by name. */
  const fileLinesOf = async (list: File[]) =>
    (
      await Promise.all(
        list.map(async (f) =>
          isPdfName(f.name)
            ? `[PDF: ${f.name}]`
            : f.type === "text/markdown" || f.type === "text/plain"
              ? `[File: ${f.name}]\n${await f.text()}`
              : `[File: ${f.name}]`,
        ),
      )
    ).join("\n\n");

  /**
   * `echo`: what of the request shows as the user's message: all of it, only the words (the files
   * are already there, above the question they answered), or nothing (a button answered it).
   */
  const runCreation = async (requested: CreationKind, text: string, all: File[], echo: "all" | "text" | "none") => {
    if (!onStartCreation) return;
    const pdf = all.find((f) => isPdfName(f.name));
    const kind: CreationKind = requested === "beautify" && !pdf ? "idea" : requested;
    const requestFiles = kind === "beautify" ? [pdf as File] : all.filter((f) => !f.type.startsWith("image/"));
    // A referenced design's pictures: placed on the slides that talk about them once the outline exists.
    const pictures = all.filter((f) => f.type.startsWith("image/"));
    if (!text && requestFiles.length === 0) return;

    const working = {
      idea: trText("正在根据主题写提纲…", "Writing an outline from your topic..."),
      outline: trText("正在把提纲整理成逐页内容…", "Turning your outline into slides..."),
      beautify: trText("正在逐页换风格，文字和数据保持不变…", "Restyling each page; text and numbers stay as they are..."),
    }[kind];
    const userContent = echo === "all" ? [text, await fileLinesOf(requestFiles)].filter(Boolean).join("\n\n") : text;
    // A topic or an outline becomes a deck step by step: one message of steps that follows the canvas.
    const flowStart = kind === "beautify" ? null : flowText(newFlow(kind === "idea" ? requestFiles.length : 0));
    setMessages((prev) => [...prev, ...(echo !== "none" ? [{ role: "user" as const, content: userContent }] : []), { role: "assistant", content: flowStart ?? working }]);
    if (echo !== "none") {
      setPptInputSegments([{ type: "text", text: "" }]);
      setPptClearTick((x) => x + 1);
      setFiles([]);
    }
    setIsLoading(true);

    let result: CreationResult;
    try {
      // Only reference files sent (a design brought here, say): the deck is about them.
      const topic = text || (kind === "beautify" ? "" : trText("根据参考资料做一份汇报 PPT", "A presentation of the reference files"));
      result = await onStartCreation({ kind, text: topic, files: requestFiles, pictures: kind === "beautify" ? [] : pictures });
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (flowStart) {
      updateLatestFlow((flow) => {
        const reading = flow.reading
          ? { ...flow.reading, state: result.ok ? ("done" as const) : flow.reading.state === "running" ? ("error" as const) : flow.reading.state }
          : undefined;
        if (!result.ok) {
          return { ...flow, ...(reading ? { reading } : {}), outline: { ...flow.outline, state: "error", error: result.error || trText("已停止。", "Stopped.") } };
        }
        return { ...flow, ...(reading ? { reading } : {}), outline: { ...flow.outline, state: "done" }, confirm: { state: "waiting" } };
      });
      setIsLoading(false);
      return;
    }
    const style = selectedTemplate?.name
      ? trText(`，用的是「${selectedTemplate.name}」这套风格`, `, in the "${selectedTemplate.name}" style`)
      : "";
    const reply = !result.ok
      ? result.error
        ? trText(`没做成：${result.error}`, `That did not work: ${result.error}`)
        : trText("已停止。", "Stopped.")
      : kind === "beautify"
        ? trText(
            `换好了，一共 ${result.count ?? 0} 页${style}${result.failed ? `，其中 ${result.failed} 页没成功，点左上角的“重试失败页”再试` : ""}。想改哪页直接说。`,
            `Done: ${result.count ?? 0} pages${style}${result.failed ? `, ${result.failed} failed (use "Retry failed" at the top left)` : ""}. Tell me what to change.`,
          )
        : trText(
            `大纲放在右边了，一共 ${result.count ?? 0} 页。想改哪页直接说，也可以在右边直接改；改好后在下面挑一套风格，再点“生成完整 PPT”。`,
            `The outline is on the right: ${result.count ?? 0} slides. Tell me what to change or edit it there; then pick a style at the bottom and press "Generate full deck".`,
          );
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === "assistant" && last.content === working ? [...prev.slice(0, -1), { role: "assistant", content: reply }] : [...prev, { role: "assistant", content: reply }];
    });
    setIsLoading(false);
  };

  /** Rewrites the latest deck-steps message. */
  const updateLatestFlow = useCallback((update: (flow: DeckFlowSnapshot) => DeckFlowSnapshot) => {
    setMessages((prev) => {
      const index = latestFlowIndex(prev);
      const flow = index >= 0 ? readFlow(prev[index].content) : null;
      if (!flow) return prev;
      const nextText = flowText(update(flow));
      if (nextText === prev[index].content) return prev;
      const next = prev.slice();
      next[index] = { ...prev[index], content: nextText };
      return next;
    });
  }, []);

  // The canvas's live work goes into the steps under way: titles as they stream, pages as they are drawn.
  useEffect(() => {
    updateLatestFlow((flow) => applyActivity(flow, activity));
  }, [activity, updateLatestFlow]);

  // Drawing the slides holds the chat (no switching away mid-way); it lets go once they are done.
  const latestFlow = latestFlowIndex(messages);
  const drawing = latestFlow >= 0 && readFlow(messages[latestFlow].content)?.slides.state === "running";
  const wasDrawingRef = useRef(false);
  useEffect(() => {
    if (wasDrawingRef.current && !drawing) setIsLoading(false);
    wasDrawingRef.current = drawing;
  }, [drawing]);

  const confirmOutline = () => {
    if (!onConfirmOutline || isLoading) return;
    updateLatestFlow((flow) => {
      const titles = activity.titles.length ? activity.titles : flow.outline.titles;
      return {
        ...flow,
        outline: { ...flow.outline, titles },
        confirm: { state: "done", ...(selectedTemplate?.name ? { style: selectedTemplate.name } : {}) },
        slides: { state: "running", done: 0, total: titles.length },
      };
    });
    setIsLoading(true);
    onConfirmOutline();
  };

  const renderSpecial = (text: string, index: number) => {
    const ask = readAskKind(text);
    if (ask) {
      return (
        <PptKindQuestion
          state={ask}
          canAct={!!kindChoiceFiles && stage === "start" && !isLoading}
          expired={!kindChoiceFiles}
          onPick={pickKind}
          tr={trText}
        />
      );
    }
    const flow = readFlow(text);
    if (!flow) return null;
    return (
      <PptFlowSteps
        flow={flow}
        canAct={index === latestFlow && stage === "outline" && !isLoading}
        style={selectedTemplate ?? null}
        onPickStyle={() => onPickStyle?.()}
        onGenerate={confirmOutline}
        tr={trText}
      />
    );
  };

  const sendExample = useSendAfterRender(() => void handleSend());
  const handleSend = async () => {
    if (starting) return startCreation();
    const rawInput = pptInputSegments
          .map((s) => (s.type === "text" ? s.text : s.tag))
          .join("");
    if ((!rawInput.trim() && files.length === 0 && attachments.length === 0 && pptDraftSlides.length === 0) || isLoading) return;
    autoRetryCountRef.current = 0;
    canvasPane?.requested();

    const normalizedInput = rawInput.trim();
    const referencedPptSlideIds = new Set(
          pptInputSegments
            .filter((s): s is { type: "ppt"; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" } => s.type === "ppt")
            .map((s) => s.slideId)
        );
    const loadAllOutlineSlides = () => {
      if (typeof window === "undefined") return [] as Array<{ slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
      try {
        const raw = localStorage.getItem(PPT_WORKSPACE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const localSlides = Array.isArray(parsed?.localSlides) ? parsed.localSlides : [];
        return localSlides
          .filter((s: any) => s && typeof s.id === "string")
          .slice(0, 24)
          .map((s: any) => ({
            slideId: String(s.id),
            title: typeof s.title === "string" ? s.title : "",
            json: JSON.stringify({
              id: String(s.id),
              title: typeof s.title === "string" ? s.title : "",
              content: Array.isArray(s.content) ? s.content : [],
              description: typeof s.description === "string" ? s.description : "",
              layout: typeof s.layout === "string" ? s.layout : "",
              note: typeof s.note === "string" ? s.note : "",
            }, null, 2),
            kind: "outline" as const,
          }));
      } catch {
        return [] as Array<{ slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
      }
    };
    const pptDraftSlidesSnapshotAll = pptDraftSlides.slice(0, 24);
    const pptAllOutlineSlides = loadAllOutlineSlides();
    const mergedAllSlides = (() => {
          const byId = new Map<string, { slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>();
          for (const s of pptAllOutlineSlides) byId.set(s.slideId, s);
          for (const s of pptDraftSlidesSnapshotAll) byId.set(s.slideId, s);
          return Array.from(byId.values());
        })();
    const pptDraftSlidesSnapshot =
      referencedPptSlideIds.size > 0
        ? mergedAllSlides.filter((s) => referencedPptSlideIds.has(s.slideId))
        : mergedAllSlides;
    const hasPptTagInInput = /\[\[PPT_SLIDE\|/.test(rawInput);
    const autoPptTags =
      !hasPptTagInInput && pptDraftSlidesSnapshot.length > 0
        ? pptDraftSlidesSnapshot
            .map((s) => getPptTag(s.slideId, s.title, s.kind))
            .filter(Boolean)
            .join("\n")
        : "";
    const inputWithAutoTags = [autoPptTags, rawInput].filter(Boolean).join("\n");
    
    // Process files for prompt
    const fileTexts: string[] = [];
    const currentUploadedImages: string[] = [];
    const currentUploadedImageItems: Array<{ name: string; url: string }> = [];
    
    // Helper to read file as Data URL
    const fileToDataUrl = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    };

    const displayFileTexts: string[] = [];

    for (const file of files) {
        if (file.type.startsWith('image/')) {
             try {
                 const dataUrl = await fileToDataUrl(file);
                 currentUploadedImages.push(dataUrl);
                 currentUploadedImageItems.push({ name: file.name, url: dataUrl });
                 const imageIndex = currentUploadedImageItems.length;
                 fileTexts.push(
                   workspaceId === "ppt"
                     ? `[Uploaded Image ${imageIndex}: ${file.name}]\nThis image is available as an optional material/reference for this turn. Do not use it or route to image editing unless the user explicitly asks to place, reference, replace, or visually use this uploaded image.`
                     : `[Image Attachment ${imageIndex}: ${file.name}]`
                 );
             } catch (e) {
                 console.error("Failed to read image", file.name, e);
                 fileTexts.push(`[Image: ${file.name}] (Failed to read)`);
             }
        } else {
             // Text/PDF
             const { extractPdfText, extractTextFileContent, isPdfFile } = await import('@/shared/files');
             try {
                 let content = "";
                 if (isPdfFile(file)) {
                     try {
                         const { getPdfDocumentFromUrl, renderPdfPageToCanvas } = await import("@/shared/files");
                         const objectUrl = URL.createObjectURL(file);
                         try {
                             const pdf = await getPdfDocumentFromUrl(objectUrl);
                             const canvas = document.createElement("canvas");
                             await renderPdfPageToCanvas({ pdf, pageNumber: 1, canvas, targetWidth: 520 });
                             const previewUrl = canvas.toDataURL("image/png");
                             if (previewUrl && previewUrl.startsWith("data:image")) {
                                 currentUploadedImageItems.push({ name: file.name, url: previewUrl });
                             }
                         } finally {
                             URL.revokeObjectURL(objectUrl);
                         }
                     } catch (e) {
                         console.error("Failed to render PDF preview", file.name, e);
                     }
                     content = await extractPdfText(file);
                 } else {
                     content = await extractTextFileContent(file);
                 }
                 const block = `[${isPdfFile(file) ? 'PDF' : 'File'}: ${file.name}]\n${content}`;
                 fileTexts.push(block);
                 displayFileTexts.push(block);
             } catch (e) {
                 console.error("Failed to read file", file.name, e);
                 const block = `[File: ${file.name}]\n(Failed to read content)`;
                 fileTexts.push(block);
                 displayFileTexts.push(block);
             }
        }
    }

    const contextAttachmentsText = attachments.length > 0
        ? attachments
            .slice(0, 12)
            .map((a, idx) => {
                const header = `[Context ${idx + 1}: ${a.name} | ${a.type}]`;
                const body = String(a.content || "").slice(0, 12000);
                return `${header}\n\`\`\`${a.type}\n${body}\n\`\`\``;
            })
            .join("\n\n")
        : "";

    const pptDraftContextText =
      workspaceId === "ppt" && pptDraftSlidesSnapshot.length > 0
        ? pptDraftSlidesSnapshot
            .map((s, idx) => {
              const header = `[Context ${idx + 1}: ${s.slideId}.json | json]`;
              const body = String(s.json || "").slice(0, 12000);
              return `${header}\n\`\`\`json\n${body}\n\`\`\``;
            })
            .join("\n\n")
        : "";

    const promptParts = [
      inputWithAutoTags,
      fileTexts.length > 0 ? fileTexts.join("\n\n") : "",
      pptDraftContextText,
      contextAttachmentsText
    ].filter(Boolean);
    const promptContent = promptParts.join("\n\n");
    lastUploadedImagesRef.current = currentUploadedImages;

    const safeTagText = (text: string) =>
      String(text || "").split("|").join(",").split("]]").join("").replace(/\r?\n/g, " ");
    const imageTags = currentUploadedImageItems
      .map((it) => `[[IMAGE|${safeTagText(it.name)}|${it.url}]]`)
      .join("\n");
    const displayInput = hasPptTagInInput ? rawInput : normalizedInput;
    const displayParts = [
      imageTags,
      displayInput,
      displayFileTexts.length > 0 ? displayFileTexts.join("\n\n") : "",
    ].filter(Boolean);
    const displayContent = displayParts.join("\n\n");

    const userMessageForDisplay: ChatMessage = { role: 'user', content: displayContent };
    const displayMessages = [...messages, userMessageForDisplay];
    setMessages(displayMessages);
    setPptInputSegments([{ type: "text", text: "" }]);
    setPptClearTick((x) => x + 1);
    setFiles([]); 
    onClearPptDraftSlides?.();

    
    setIsLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Get Global Config
      const config = getAIConfig();
      // Load global constraints from storage (scoped by workspaceId)
      const globalConstraints = constraintsFor('ppt');
      const globalSystemPrompt = config.systemPrompt || '';
      
      const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join('\n\n');

      const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      { role: "user", content: promptContent },
    ];

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let fullResponse = '';
      const updater = createThrottledAssistantUpdater();
      if (workspaceId === "ppt") {
        fullResponse = await generatePptProxyChatMessage(apiMessages, chatModel, { signal: controller.signal });
        updater.push(fullResponse);
      } else {
        await streamChatMessage(apiMessages, (chunk) => {
          fullResponse = chunk;
          updater.push(chunk);
        }, chatModel, controller.signal);
      }
      updater.flush();
      

      if (fullResponse) {
        await handleAssistantResponse(fullResponse);

      }

    } catch (error) {
      if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const abortedText = trText("(Aborted)", "(Aborted)");
            const next = last.content ? `${last.content}\n\n${abortedText}` : abortedText;
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          }
          return [...prev, { role: 'assistant', content: trText("(Aborted)", "(Aborted)") }];
        });
        return;
      }
      const errorText = getChatErrorText(error, trText);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { role: 'assistant', content: errorText }];
        }
        return [...prev, { role: 'assistant', content: errorText }];
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (!isLoading) return;
    abortControllerRef.current?.abort();
  };

  const runTextChat = async (baseMessages: ChatMessage[]) => {
    const config = getAIConfig();
    const globalConstraints = constraintsFor('ppt');
    const globalSystemPrompt = config.systemPrompt || '';
    const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join('\n\n');
    const lastUserText = String(baseMessages[baseMessages.length - 1]?.content || "");
    const promptContent = lastUserText;

    const apiMessages: ChatMessage[] =
      workspaceId === "ppt"
        ? [
            { role: 'system', content: systemContent },
            { role: "user", content: promptContent }
          ]
        : [
            { role: 'system', content: systemContent },
            ...baseMessages.slice(0, -1),
            { role: "user", content: promptContent }
          ];

    setIsLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setMessages([...baseMessages, { role: 'assistant', content: '' }]);

    let fullResponse = '';
    const updater = createThrottledAssistantUpdater();
    try {
      if (workspaceId === "ppt") {
        fullResponse = await generatePptProxyChatMessage(apiMessages, chatModel, { signal: controller.signal });
        updater.push(fullResponse);
      } else {
        await streamChatMessage(apiMessages, (chunk) => {
          fullResponse = chunk;
          updater.push(chunk);
        }, chatModel, controller.signal);
      }
      updater.flush();

      if (fullResponse) {

        await handleAssistantResponse(fullResponse);

      }
    } catch (error) {
      if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const next = last.content ? `${last.content}\n\n(Aborted)` : "(Aborted)";
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          }
          return [...prev, { role: 'assistant', content: "(Aborted)" }];
        });
        return;
      }
      const errorText = getChatErrorText(error, trText);

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), { role: 'assistant', content: errorText }];
        }
        return [...prev, { role: 'assistant', content: errorText }];
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleRegenerate = async (messageIndex: number) => {
    if (messageIndex < 0 || messageIndex >= messages.length) return;
    if (messages[messageIndex].role !== 'assistant') return;
    const base = messages.slice(0, messageIndex);
    if (base.length === 0) return;
    const last = base[base.length - 1];
    if (last.role !== 'user') return;
    autoRetryCountRef.current = 0;
    await runTextChat(base);
  };

  const handleEditAndResend = async (messageIndex: number, newText: string) => {
    if (messageIndex < 0 || messageIndex >= messages.length) return;
    if (messages[messageIndex].role !== 'user') return;

    const original = messages[messageIndex].content || "";
    const lines = original.split(/\r?\n/);
    const prefixTags: string[] = [];
    let i = 0;
    for (; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\[\[IMAGE\|([^|]*)\|([\s\S]+)\]\]$/.test(line) || /^\[\[PPT_SLIDE\|(\d+)\|([^|]*)\|(outline|slide_image)\]\]$/.test(line) || /^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/.test(line)) {
        prefixTags.push(line);
        continue;
      }
      break;
    }
    const rest = lines.slice(i).join("\n");
    const marker = rest.match(/\n\n\[(PDF|File|Context)\b/);
    const preserved = marker && typeof marker.index === "number" ? rest.slice(marker.index) : "";
    const prefix = prefixTags.length > 0 ? `${prefixTags.join("\n")}\n\n` : "";
    const updatedUser: ChatMessage = { role: 'user', content: `${prefix}${newText}${preserved}` };
    const base = [...messages.slice(0, messageIndex), updatedUser];
    setInput("");
    setFiles([]);
    autoRetryCountRef.current = 0;
    await runTextChat(base);
  };

  const uiMessages: UIMessage[] = messages.map((msg, idx) => ({
      id: `msg-${idx}`,
      role: msg.role as any,
      content: msg.content,
      parts: [{ type: 'text', text: msg.content }] 
  }));


  return (
    <div className={cn("h-full flex flex-col bg-transparent animate-fade-in relative", className)}>
      {/* Header */}
      <div className="flex h-12 shrink-0 flex-col justify-center px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChatTitle fallback={resolvedTitle} />
          </div>
          <div className="flex items-center gap-1">
            <CanvasOpenButton />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 w-full overflow-hidden">
        {!isLoading && !uiMessages.some((m) => m.role === "user" || m.role === "assistant") ? (
          <ChatEmptyState
            icon={Presentation}
            title={starting ? trText("从一个题目开始", "Begin with a topic") : t(uiLang, "empty.ppt.title")}
            description={
              starting
                ? trText(
                    "告诉我题目、贴一份提纲，或把旧 PDF 拖进来，换一身衣裳。先出大纲，改好后再挑风格、生成整套。",
                    "Give me a topic, paste an outline, or drop in an old PDF to dress it anew. An outline comes first; then pick a style and make the deck.",
                  )
                : t(uiLang, "empty.ppt.desc")
            }
          />
        ) : (
          <ChatMessageDisplay
            messages={uiMessages}
            status={isLoading ? "streaming" : "idle"}
            onDisplayChart={(xml) => onCodeAction?.(xml, 'diagram')}
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditAndResend}
            renderSpecial={renderSpecial}
          />
        )}
      </div>

      {/* Input */}
      <div className={`chat-measure px-4 pb-4 pt-2${(!isLoading && !uiMessages.some((m) => m.role === "user" || m.role === "assistant")) ? " [--chat-measure:720px]" : ""}`}>
        <ChatInput
          constraintScope="ppt" 
            workspaceId="ppt"
            input={input}
            setInput={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
            onStop={handleStop}
            onClearChat={() => setShowResetWarning(true)}
            onToggleHistory={!hideHistoryButton ? () => setShowHistory(true) : undefined}
            historyDisabled={history.length === 0}
            onFilesChange={setFiles}
            files={files}
            incomingReference={incomingReference}
            // Before the outline only the text model works; once it exists the slides are drawn next,
            // so the image model shows too. Editing or redrawing a picture comes once the deck is made.
            statusChannels={stage === "start" ? ["text"] : ["image", "text"]}
            statusExtras={stage !== "slides" ? undefined : (
              <StatusSelect<"edit" | "regenerate">
                label={trText("改图：保留构图修改当前画面；重画：整页重新生成", "Edit keeps the composition; Redraw starts the slide over")}
                value={imageMode}
                changed={imageMode === "regenerate"}
                onChange={setImageMode}
                options={[
                  { value: "edit", label: trText("改图", "Edit") },
                  { value: "regenerate", label: trText("重画", "Redraw") },
                ]}
              />
            )}
            uploadMode={starting ? "filesOnly" : "imagesOnly"}
            // A referenced design brings its pictures too (they go onto the slides about them).
            referenceAccept={starting ? ["text", "file", "image"] : undefined}
            placeholder={
              starting
                ? trText("写一句主题，贴一份提纲，或者把旧 PDF 拖进来", "A topic, an outline, or a PDF to restyle")
                : inputPlaceholder
            }
            focusKey={pptInputFocusTick}
            clearKey={pptClearTick}
            richSegments={pptInputSegments}
            onRichSegmentsChange={setPptInputSegments}
            insertPptToken={pptInsertToken}
            onInsertPptTokenHandled={() => {
              pptInsertBusyRef.current = false;
              setPptInsertToken(null);
              pumpPptInsertQueue();
            }}
            bottomChips={
              attachments.length > 0
                ? (
                  <div className="space-y-2">
                    {attachments.length > 0 && (
                      <div className="overflow-x-auto">
                        <div className="flex flex-nowrap items-center gap-2">
                          {attachments.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground shrink-0"
                              title={a.name}
                            >
                              <span className="max-w-[240px] truncate">{a.name}</span>
                              {onRemoveAttachment && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveAttachment(a.id)}
                                  className="text-muted-foreground/80 hover:text-foreground transition-colors"
                                  title="Remove attachment"
                                  aria-label="Remove attachment"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
                : null
            }
        />
      </div>
      {(!isLoading && !uiMessages.some((m) => m.role === "user" || m.role === "assistant")) && <ChatLandingExtras icon={Presentation} images={["/examples/portal/ppt-deck-sm.webp", "/examples/portal/ppt-4-sm.webp", "/examples/portal/ppt-2-sm.webp"]} examples={
              // Each request with the deck it made (public/examples/portal).
              [t(uiLang, "empty.ppt.ex1"), t(uiLang, "empty.ppt.ex2"), t(uiLang, "empty.ppt.ex3")]
            } onPickExample={(text) => {
              // Sent as it is, not left in the box.
              setPptInputSegments([{ type: "text", text }]);
              sendExample();
            }} />}

      {/* Dialogs */}
      <HistoryDialog 
        showHistory={showHistory} 
        onToggleHistory={setShowHistory} 
        history={history}
        onRestore={(item) => onRestore && onRestore(item)}
        onClear={() => {
          onClearVersionHistory?.();
        }}
      />
      <ResetWarningModal
        open={showResetWarning}
        onOpenChange={setShowResetWarning}
        onClear={clearHistory}
      />
    </div>
  );
}
