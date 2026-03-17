import React, { useState, useRef, useEffect } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChatMessage, generateChatMessage, generatePptProxyChatMessage, ChatMessage, getAIConfig } from '@/lib/ai-client';
import { DRAWIO_SYSTEM_PROMPT } from '@/lib/system-prompts';
import { ButtonWithTooltip } from '@/workspaces/ppt/chat/components/button-with-tooltip';
import { ChatInput } from '@/workspaces/ppt/chat/ChatInput';
import { ChatMessageDisplay, UIMessage } from '@/workspaces/ppt/chat/ChatMessageDisplay';
import { STORAGE_GLOBAL_CONSTRAINTS_KEY } from '@/workspaces/ppt/chat/global-constraints-dialog';
import { HistoryDialog, HistoryItem } from '@/workspaces/ppt/chat/history-dialog';
import { ResetWarningModal } from '@/workspaces/ppt/chat/reset-warning-modal';
import { useFileProcessor } from '@/lib/use-file-processor';
import { buildCadBomMessages, buildCadImagesMasterMessages, buildCadImagesSheetMessages, buildCadTasksSystemContent } from '@/lib/cad-tasks';
import { CAD_PLAN_AGENT_PROMPT } from '@/lib/cad-agents';
import flowPatchAgentPrompt from "../../../../agent/flow/patch.md?raw";
import flowReplaceAgentPrompt from "../../../../agent/flow/replace.md?raw";
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";

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
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  pptDraftSlides?: Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
  onRemovePptDraftSlide?: (id: string) => void;
  onClearPptDraftSlides?: () => void;
  onCodeAction?: (code: string, type: 'flow' | 'cad' | 'ppt') => MaybePromise<void | CodeActionResult>;
  systemPrompt?: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
  chatModel?: string;
  workspaceId?: string;
  mode?: 'text' | 'ppt_image';
  hideHistoryButton?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  collapseLocked?: boolean;
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
  flowContext?: {
    xml?: string;
  };
  onClearWorkspace?: () => void;
}

const STORAGE_KEY_PREFIX = 'chat_history_v2_';
const PPT_WORKSPACE_STORAGE_KEY = "CanvasAnvil-ppt-state-v1";
const STORAGE_MESSAGE_LIMIT = 40;
const STORAGE_CONTENT_LIMIT = 4000;

// Convert internal ChatMessage to UIMessage
const toUIMessage = (msg: ChatMessage, index: number): UIMessage => ({
    id: `msg-${index}-${Date.now()}`,
    role: msg.role as any,
    content: msg.content,
    parts: [{ type: 'text', text: msg.content }]
});

const compactMessageContent = (value: unknown) => {
  const text = String(value || "");
  const withoutImageTags = text.replace(/\[\[IMAGE\|([^|\]]*)\|data:image\/[\s\S]*?\]\]/gi, "[[IMAGE|$1|[image-data]]]");
  const withoutDataUrls = withoutImageTags.replace(/data:image\/[^)\s]+/gi, "[image-data]");
  if (withoutDataUrls.length <= STORAGE_CONTENT_LIMIT) return withoutDataUrls;
  return `${withoutDataUrls.slice(0, STORAGE_CONTENT_LIMIT)}\n...[truncated]`;
};

const getMessagesForStorage = (messages: ChatMessage[]) =>
  messages.slice(-STORAGE_MESSAGE_LIMIT).map((message) => ({
    role: message.role,
    content: compactMessageContent(message.content),
  }));

const getChatErrorText = (
  error: unknown,
  trText: (zhText: string, enText: string) => string
) => {
  const raw = String((error as any)?.message || error || "");

  if (/input token count exceeds|maximum number of tokens allowed|too many tokens|context length/i.test(raw)) {
    return trText(
      "本次请求内容过长，通常是图片或附件内容过大。请重试；如果仍失败，请减少附件数量或缩小单个附件内容。",
      "This request is too large, usually because an image or attachment expanded the input too much. Retry once; if it still fails, reduce the number or size of attachments."
    );
  }

  if (/api key|invalid api key|incorrect api key|unauthorized|401/i.test(raw)) {
    return trText(
      "API 配置无效，请检查 API key 或服务配置。",
      "The API configuration is invalid. Check the API key or provider settings."
    );
  }

  if (/400|bad request/i.test(raw)) {
    return trText(
      "请求格式无效，请检查本次输入或附件内容。",
      "The request payload is invalid. Check this input or its attachments."
    );
  }

  return trText(
    "抱歉，请求失败，请稍后重试。",
    "Sorry, the request failed. Please try again."
  );
};

export function ChatPanel({ 
    className, 
    attachments = [],
    onRemoveAttachment,
    pptDraftSlides = [],
    onRemovePptDraftSlide,
    onClearPptDraftSlides,
    onCodeAction,
    systemPrompt = DRAWIO_SYSTEM_PROMPT,
    initialMessages = [],
    onMessagesChange,
    chatModel,
    workspaceId = 'default',
    mode = 'text',
    hideHistoryButton = false,
    collapsed = false,
    onToggleCollapse,
    collapseLocked = false,
    title,
    inputPlaceholder,
    history = [],
    onRestore,
    onClearVersionHistory,
    onClearAttachments,
    cadContext,
    flowContext,
    onClearWorkspace
}: ChatPanelProps) {
  const uiLang = useUiLanguage();
  const trText = (zhText: string, enText: string) => (uiLang === "zh" ? zhText : enText);
  const resolvedTitle = title || t(uiLang, "workspace.default.title");
  // Persistence key
  const storageKey = `${STORAGE_KEY_PREFIX}${workspaceId}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse chat history", e);
            }
        }
    }
    return initialMessages.length > 0 ? initialMessages : [];
  });

  const [input, setInput] = useState('');
  const [pptInputSegments, setPptInputSegments] = useState<Array<{ type: "text"; text: string } | { type: "ppt"; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" }>>([
    { type: "text", text: "" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const flowAutoRetryCountRef = useRef(0);
  const MAX_FLOW_AUTO_RETRY = 3;
  
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

  const getPptLabel = (slideId: string, title: string) => {
    const m = String(slideId || "").match(/(\d+)/);
    const n = m ? Number(m[1]) : NaN;
    if (!Number.isNaN(n)) {
      return title ? `Slide ${n}: ${title}` : `Slide ${n}`;
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

  const pumpPptInsertQueue = () => {
    if (pptInsertBusyRef.current) return;
    const next = pptInsertQueueRef.current.shift();
    if (!next) return;
    pptInsertBusyRef.current = true;
    const tag = getPptTag(next.slideId, next.title, next.kind);
    setPptInsertToken({ key: Date.now() + Math.random(), slideId: next.slideId, label: next.label, tag, tokenKind: next.kind });
  };

  const enqueuePptToken = (slideId: string, title: string, kind: "outline" | "slide_image") => {
    const label = getPptLabel(slideId, title);
    pptInsertQueueRef.current.push({ slideId, title, label, kind });
    pumpPptInsertQueue();
  };

  useEffect(() => {
    if (workspaceId !== "ppt") return;
    const prev = prevPptDraftCountRef.current;
    const next = pptDraftSlides.length;
    prevPptDraftCountRef.current = next;
    if (next > prev) {
      setPptInputFocusTick((x) => x + 1);
    }
  }, [workspaceId, pptDraftSlides.length]);

  useEffect(() => {
    if (workspaceId !== "ppt") return;
    const prevIds = prevPptDraftIdsRef.current;
    const nextIds = new Set(pptDraftSlides.map((s) => s.id));
    const added = pptDraftSlides.filter((s) => !prevIds.has(s.id));
    prevPptDraftIdsRef.current = nextIds;
    if (added.length === 0) return;
    for (const s of added) enqueuePptToken(s.slideId, s.title, s.kind);
  }, [workspaceId, pptDraftSlides, setInput]);

  const parseMarkdownBomTable = (text: string) => {
    const normalized = String(text || "");
    const lines = normalized.split(/\r?\n/);
    for (let i = 0; i < lines.length - 2; i += 1) {
      const header = lines[i];
      const sep = lines[i + 1];
      if (!header.includes("|")) continue;
      if (!/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(sep)) continue;

      const parseRow = (line: string) => {
        const trimmed = line
          .trim()
          .replace(/^[-*+]\s+/, "")
          .replace(/^\d+\.\s+/, "");
        const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
        const body2 = body.endsWith("|") ? body.slice(0, -1) : body;
        return body2.split("|").map((c) => c.trim());
      };

      const columns = parseRow(header).filter((c) => c);
      if (columns.length === 0) continue;

      const rows: any[] = [];
      for (let j = i + 2; j < lines.length; j += 1) {
        const rowLine = lines[j];
        if (!rowLine.includes("|")) break;
        const row = parseRow(rowLine);
        if (row.every((c) => !String(c || "").trim())) break;
        const fixed = row.slice(0, columns.length);
        while (fixed.length < columns.length) fixed.push("");
        rows.push(fixed);
      }

      if (rows.length === 0) continue;
      return { type: "cad_bom", columns, rows };
    }
    return null;
  };

  const sanitizeAssistantContentForDisplay = (content: string) => {
    if (workspaceId !== "cad") return content;
    if (!content) return content;
    let next = content.replace(
      /```(?:python|py|python3)\s*[\s\S]*?```/g,
      trText("（已在后台处理完成）", "(Processed in the background)")
    );
    next = next
      .split("\n")
      .filter((line) => !/freecad/i.test(line))
      .join("\n");
    next = next.replace(/(?:^|\n)1\.\s*FreeCAD[\s\S]*?(?=\n\d+\.\s|$)/gi, "\n");
    return next.replace(/```json\s*([\s\S]*?)```/g, (full, inner) => {
      const text = String(inner || "").trim();
      if (!text) return full;
      if (text.includes('"type"') && text.includes('"cad_images"')) {
        return trText("（已提交装修图生成任务）", "(CAD drawing generation task submitted)");
      }
      if (text.includes('"type"') && text.includes('"cad_plan"')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.type !== "cad_plan") return full;
          const plan = parsed?.plan || {};
          const summary = typeof plan?.summary === "string" ? plan.summary : "";
          const style = typeof plan?.style === "string" ? plan.style : "";
          const assumptions = Array.isArray(plan?.assumptions) ? plan.assumptions.map((x: any) => String(x)).filter(Boolean) : [];
          const constraints = Array.isArray(plan?.constraints) ? plan.constraints.map((x: any) => String(x)).filter(Boolean) : [];
          const rooms = Array.isArray(plan?.rooms) ? plan.rooms : [];

          const lines: string[] = [];
          if (summary) lines.push(trText(`Summary: ${summary}`, `Summary: ${summary}`));
          if (style) lines.push(trText(`Style: ${style}`, `Style: ${style}`));
          if (rooms.length > 0) {
            const roomNames = rooms.map((r: any) => String(r?.name || r?.type || "")).filter(Boolean);
            lines.push(trText(`Spaces: ${roomNames.join(", ")}`, `Spaces: ${roomNames.join(", ")}`));
          }
          if (assumptions.length > 0) lines.push(trText(`Assumptions: ${assumptions.join("; ")}`, `Assumptions: ${assumptions.join("; ")}`));
          if (constraints.length > 0) lines.push(trText(`Constraints: ${constraints.join("; ")}`, `Constraints: ${constraints.join("; ")}`));
          return lines.length > 0 ? lines.join("\\n") : trText("(Plan generated)", "(Plan generated)");
        } catch {
          return trText("(Plan generated)", "(Plan generated)");
        }
      }
      return full;
    });
  };

  const scheduleFrame = (cb: () => void) => {
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
    if (typeof window !== "undefined") return window.setTimeout(cb, 16);
    return 0;
  };

  const cancelFrame = (id: number) => {
    if (!id) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else if (typeof window !== "undefined") window.clearTimeout(id);
  };

  const updateLastAssistant = (content: string) => {
    const display = sanitizeAssistantContentForDisplay(content);
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content: display }];
      }
      return [...prev, { role: 'assistant', content: display }];
    });
  };

  const createThrottledAssistantUpdater = () => {
    let latest = '';
    let frameId: number | null = null;
    return {
      push: (chunk: string) => {
        latest = chunk;
        if (frameId !== null) return;
        frameId = scheduleFrame(() => {
          frameId = null;
          updateLastAssistant(latest);
        });
      },
      flush: () => {
        if (frameId !== null) {
          cancelFrame(frameId);
          frameId = null;
        }
        updateLastAssistant(latest);
      }
    };
  };

  // Persist messages
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(getMessagesForStorage(messages)));
    } catch (error) {
      console.warn("Failed to persist chat history", error);
      try {
        localStorage.removeItem(storageKey);
      } catch {
      }
    }
    onMessagesChange?.(messages);
  }, [messages, storageKey, onMessagesChange]);

  const clearHistory = () => {
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
    }
    setMessages([]);
    setShowResetWarning(false);
  };

  const startNewChat = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setInput('');
    setPptInputSegments([{ type: "text", text: "" }]);
    setFiles([]);
    onClearAttachments?.();
    const newMsgs: ChatMessage[] = [
      { role: 'assistant', content: t(uiLang, "chat.newChat") }
    ];
    setMessages(newMsgs);
    try {
      localStorage.removeItem(storageKey);
    } catch {
    }
  };

  const runCodeAction = async (code: string, type: 'flow' | 'cad' | 'ppt') => {
    const result = await Promise.resolve(onCodeAction?.(code, type));
    if (!result || typeof result !== "object") return { ok: true } as CodeActionResult;
    const r = result as any;
    if (typeof r.ok === "boolean") {
      return { ok: r.ok, retry: !!r.retry, error: typeof r.error === "string" ? r.error : undefined } as CodeActionResult;
    }
    return { ok: true } as CodeActionResult;
  };

  const handleAssistantResponse = async (fullResponse: string) => {
    if (!fullResponse) return { flowPatchFound: false, flowRetryError: null as string | null };

    const pyMatch = fullResponse.match(/```python\n([\s\S]*?)\n```/);
    if (pyMatch && pyMatch[1] && workspaceId !== "cad") {
      await runCodeAction(pyMatch[1], 'cad');
    }

    if (workspaceId === "cad") {
      const jsMatch = fullResponse.match(/```(javascript|js)\n([\s\S]*?)\n```/);
      if (jsMatch && jsMatch[2]) {
        await runCodeAction(jsMatch[2], 'cad');
      }
    }

    const svgMatch = fullResponse.match(/```svg\n([\s\S]*?)\n```/);
    if (svgMatch && svgMatch[1]) {
      await runCodeAction(svgMatch[1], 'cad');
    }

    let flowPatchFound = false;
    let flowRetryError: string | null = null;

    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = jsonRegex.exec(fullResponse))) {
      const jsonText = String(m[1] || "").trim();
      if (!jsonText) continue;

      if (workspaceId === 'ppt') {
        try {
          const parsed = JSON.parse(jsonText);
          if (lastUploadedImagesRef.current.length > 0) {
            parsed.uploadedImages = lastUploadedImagesRef.current;
            await runCodeAction(JSON.stringify(parsed), 'ppt');
          } else {
            await runCodeAction(jsonText, 'ppt');
          }
        } catch {
          await runCodeAction(jsonText, 'ppt');
        }
        continue;
      }

      if (workspaceId === 'flow') {
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed?.type === "flow_patch") flowPatchFound = true;
        } catch {
        }
        const r = await runCodeAction(jsonText, 'flow');
        if (!r.ok && r.retry) {
          flowRetryError = r.error || "Unknown error";
        }
        continue;
      }

      await runCodeAction(jsonText, workspaceId === "cad" ? 'cad' : 'ppt');
    }

    if (workspaceId === "flow" && !flowPatchFound) {
      const xmlMatch = fullResponse.match(/```xml\n([\s\S]*?)\n```/);
      if (xmlMatch && xmlMatch[1]) {
        const r = await runCodeAction(xmlMatch[1], 'flow');
        if (!r.ok && r.retry) {
          flowRetryError = r.error || "Unknown error";
        }
      }
    }

    return { flowPatchFound, flowRetryError };
  };

  const buildFlowRetryPrompt = (errorText: string, forceReplace: boolean) => {
    const err = String(errorText || "").slice(0, 600);
    if (uiLang === "en") {
      return [
        `The previous flow_patch could not be applied to the current diagram. Reason: ${err}`,
        "",
        "Please retry and strictly follow:",
        "- Output exactly one ```json``` code block with type=flow_patch",
        forceReplace
          ? "- This time you MUST use mode=replace and output the full <mxGraphModel>...</mxGraphModel> (do not output patch)"
          : "- If the patch cannot precisely match the Current diagram XML, use mode=replace and output the full <mxGraphModel>...</mxGraphModel>",
      ].join("\n");
    }
    return [
      `Previous flow_patch could not be applied to current diagram: ${err}`,
      "",
      "Please retry and strictly follow:",
      "- Output exactly one ```json``` code block with type=flow_patch",
      forceReplace
        ? "- This time you MUST use mode=replace and output the full <mxGraphModel>...</mxGraphModel> (do not output patch)"
        : "- If the patch cannot precisely match the Current diagram XML, use mode=replace and output the full <mxGraphModel>...</mxGraphModel>",
    ].join("\\n");
  };

  const handleSend = async () => {
    const isPpt = workspaceId === "ppt";
    const rawInput = isPpt
      ? pptInputSegments
          .map((s) => (s.type === "text" ? s.text : s.tag))
          .join("")
      : input;
    if ((!rawInput.trim() && files.length === 0 && attachments.length === 0 && pptDraftSlides.length === 0) || isLoading) return;
    flowAutoRetryCountRef.current = 0;

    const normalizedInput = rawInput.trim();
    const referencedPptSlideIds = isPpt
      ? new Set(
          pptInputSegments
            .filter((s): s is { type: "ppt"; slideId: string; label: string; tag: string; tokenKind: "outline" | "slide_image" } => s.type === "ppt")
            .map((s) => s.slideId)
        )
      : new Set<string>();
    const loadAllOutlineSlides = () => {
      if (!isPpt || typeof window === "undefined") return [] as Array<{ slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
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
    const pptDraftSlidesSnapshotAll = isPpt ? pptDraftSlides.slice(0, 24) : [];
    const pptAllOutlineSlides = loadAllOutlineSlides();
    const mergedAllSlides = isPpt
      ? (() => {
          const byId = new Map<string, { slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>();
          for (const s of pptAllOutlineSlides) byId.set(s.slideId, s);
          for (const s of pptDraftSlidesSnapshotAll) byId.set(s.slideId, s);
          return Array.from(byId.values());
        })()
      : [];
    const pptDraftSlidesSnapshot =
      isPpt && referencedPptSlideIds.size > 0
        ? mergedAllSlides.filter((s) => referencedPptSlideIds.has(s.slideId))
        : mergedAllSlides;
    const hasPptTagInInput = /\[\[PPT_SLIDE\|/.test(rawInput);
    const autoPptTags =
      isPpt && !hasPptTagInInput && pptDraftSlidesSnapshot.length > 0
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
             const { extractPdfText, extractTextFileContent, isPdfFile } = await import('@/lib/pdf-utils');
             try {
                 let content = "";
                 if (isPdfFile(file)) {
                     try {
                         const { getPdfDocumentFromUrl, renderPdfPageToCanvas } = await import("@/lib/pdf-utils");
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

    const flowContextText =
      workspaceId === "flow" && typeof flowContext?.xml === "string" && flowContext.xml.trim()
        ? `Current diagram XML:\n\n\`\`\`xml\n${flowContext.xml}\n\`\`\``
        : "";

    const cadContextText =
      workspaceId === "cad"
        ? [
            cadContext?.plan ? `Current CAD plan:\n\n\`\`\`json\n${JSON.stringify(cadContext.plan, null, 2)}\n\`\`\`` : "",
            typeof cadContext?.svg2d === "string" && cadContext.svg2d.trim()
              ? `Current 2D SVG:\n\n\`\`\`svg\n${cadContext.svg2d}\n\`\`\``
              : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "";

    const promptParts = [
      inputWithAutoTags,
      fileTexts.length > 0 ? fileTexts.join("\n\n") : "",
      pptDraftContextText,
      contextAttachmentsText,
      flowContextText,
      cadContextText
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
    if (isPpt) setPptInputSegments([{ type: "text", text: "" }]);
    else setInput('');
    if (isPpt) setPptClearTick((x) => x + 1);
    setFiles([]); 
    if (workspaceId === "ppt") onClearPptDraftSlides?.();

    if (workspaceId === "cad" && mode === "text" && /(cad_ready_for_export|一键\s*(出图|生成)|one[- ]?click)/i.test(normalizedInput)) {
      const svg2d = cadContext?.svg2d || "";
      const planJson = cadContext?.plan ? JSON.stringify(cadContext.plan) : "";

      let bomEmitted = false;

      const emitCadJson = (text: string) => {
        const match = text.match(/```json\s*([\s\S]*?)```/);
        const jsonText = match ? match[1].trim() : text.trim();
        if (!jsonText.startsWith("{")) return;
        try {
          const parsed = JSON.parse(jsonText);
          if (parsed?.type === "cad_bom") bomEmitted = true;
        } catch {
        }
        onCodeAction?.(jsonText, 'cad');
      };

      const config = getAIConfig();
      const constraintsKey = workspaceId ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}` : STORAGE_GLOBAL_CONSTRAINTS_KEY;
      const globalConstraints = typeof window !== 'undefined' ? localStorage.getItem(constraintsKey) || '' : '';
      const globalSystemPrompt = config.systemPrompt || '';
      const systemContent = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), `UI language: ${uiLang}`]
        .filter(Boolean)
        .join("\n\n");
      const bomMessages: ChatMessage[] = buildCadBomMessages({ systemContent, planJson, svg2d });
      const masterMessages: ChatMessage[] = buildCadImagesMasterMessages({ systemContent, planJson, svg2d });

      setIsLoading(true);
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const updater = createThrottledAssistantUpdater();
      let bomFull = '';
      let imagesFull = '';

      const bomTask = (async () => {
        await streamChatMessage(bomMessages, (chunk) => {
          bomFull = chunk;
          updater.push(chunk);
        }, chatModel, controller.signal);
        updater.flush();
        if (bomFull) {
          emitCadJson(bomFull);
          if (!bomEmitted) {
            const fallback = parseMarkdownBomTable(bomFull);
            if (fallback) {
              bomEmitted = true;
              onCodeAction?.(JSON.stringify(fallback), "cad");
            }
          }
        }
      })();

      const imagesTask = (async () => {
        const extractJsonText = (text: string) => {
          const match = String(text || "").match(/```json\s*([\s\S]*?)```/);
          return match ? match[1].trim() : String(text || "").trim();
        };

        const tryParseJson = (text: string) => {
          const normalized = extractJsonText(text);
          try {
            return JSON.parse(normalized);
          } catch {
            const start = normalized.indexOf("{");
            const end = normalized.lastIndexOf("}");
            if (start >= 0 && end > start) {
              try {
                return JSON.parse(normalized.slice(start, end + 1));
              } catch {
              }
            }
            return null;
          }
        };

        const fallbackTitlesForOutput = [
          trText("Renovation Plan Layout", "Renovation Plan Layout"),
          trText("Floor Finish Plan", "Floor Finish Plan"),
          trText("Reflected Ceiling Plan", "Reflected Ceiling Plan"),
          trText("Wall Setting-Out Plan", "Wall Setting-Out Plan"),
          trText("MEP Plan (Electrical + Low Voltage + Plumbing)", "MEP Plan (Electrical + Low Voltage + Plumbing)"),
          trText("Elevation Index Plan + Interior Elevations", "Elevation Index Plan + Interior Elevations"),
          trText("Detail Drawings", "Detail Drawings"),
        ];
        const fallbackTitlesForPromptEnglish = [
          "Renovation Plan Layout",
          "Floor Finish Plan",
          "Reflected Ceiling Plan",
          "Wall Setting-Out Plan",
          "MEP Plan (Electrical + Low Voltage + Plumbing)",
          "Elevation Index Plan + Interior Elevations",
          "Detail Drawings",
        ];

        let masterSchemeJson = "";
        try {
          const masterText = await generateChatMessage(masterMessages, chatModel, { signal: controller.signal, timeoutMs: 120000 });
          const parsedMaster = tryParseJson(masterText);
          if (parsedMaster?.type === "renovation_scheme_master" && parsedMaster?.global_scheme) {
            masterSchemeJson = JSON.stringify(parsedMaster, null, 2);
          }
        } catch {
        }

        const imagesSheetMessages = buildCadImagesSheetMessages({ systemContent, planJson, svg2d, masterSchemeJson });

        const settled = await Promise.allSettled(
          imagesSheetMessages.map((s) =>
            generateChatMessage(s.messages, chatModel, { signal: controller.signal, timeoutMs: 120000 })
          )
        );

        const prompts = settled.map((r, idx) => {
          const fallbackTitleForOutput = fallbackTitlesForOutput[idx] || trText("Drawing", "Drawing");
          const fallbackTitleForPrompt = fallbackTitlesForPromptEnglish[idx] || "Drawing";
          const onSheetLanguageRule =
            uiLang === "zh"
              ? "All on-sheet labels/notes/title block text must be in Simplified Chinese."
              : "All on-sheet labels/notes/title block text must be in English.";
          const fallbackPrompt = `Generate an orthographic 2D technical construction drawing sheet: ${fallbackTitleForPrompt}. Include border, bottom-right title block, scale/units, legend/symbols, key annotations and dimensions, consistent with the provided plan JSON and 2D SVG. ${onSheetLanguageRule}`;

          if (r.status !== "fulfilled") return { title: fallbackTitleForOutput, prompt: fallbackPrompt };
          const text = String(r.value || "").trim();
          const parsed = tryParseJson(text);

          if (parsed?.type === "cad_images_sheet" && typeof parsed?.title === "string" && typeof parsed?.prompt === "string") {
            const p = parsed.prompt.trim();
            return { title: parsed.title, prompt: p || fallbackPrompt };
          }

          if (parsed?.type === "cad_images" && Array.isArray(parsed?.prompts) && parsed.prompts.length > 0) {
            const first = parsed.prompts[0];
            const title = typeof first?.title === "string" ? first.title : fallbackTitleForOutput;
            const prompt = typeof first?.prompt === "string" ? first.prompt.trim() : "";
            return { title, prompt: prompt || fallbackPrompt };
          }

          return { title: fallbackTitleForOutput, prompt: fallbackPrompt };
        });

        imagesFull = JSON.stringify({ type: "cad_images", prompts }, null, 2);
        emitCadJson(imagesFull);
      })();

      try {
        await Promise.allSettled([bomTask, imagesTask]);
        if (controller.signal.aborted) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role !== 'assistant') return prev;
            const abortedText = trText("(Aborted)", "(Aborted)");
            const next = last.content ? `${last.content}\n\n${abortedText}` : abortedText;
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          });
        }
      } catch {
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
      return;
    }
    
    setIsLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Get Global Config
      const config = getAIConfig();
      // Load global constraints from storage (scoped by workspaceId)
      const constraintsKey = workspaceId ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}` : STORAGE_GLOBAL_CONSTRAINTS_KEY;
      const globalConstraints = typeof window !== 'undefined' ? localStorage.getItem(constraintsKey) || '' : '';
      const globalSystemPrompt = config.systemPrompt || '';
      
      const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join('\n\n');

      const apiMessages: ChatMessage[] =
        workspaceId === "ppt"
          ? [
              { role: 'system', content: systemContent },
              { role: 'user', content: promptContent }
            ]
          : [
              { role: 'system', content: systemContent },
              ...messages,
              { role: 'user', content: promptContent }
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
      
      let flowRoutedBaseMessages: ChatMessage[] | null = null;
      let flowSelectedAgent: "patch" | "replace" | null = null;

      if (fullResponse && workspaceId === "flow") {
        const resolveFlowAgentFromRouteText = (text: string): "patch" | "replace" | null => {
          const trimmed = String(text || "").trim();
          if (!trimmed) return null;

          let content = trimmed;
          const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
          if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
          content = content.replace(/\s+/g, "");

          if (!/^[1-2]$/.test(content)) return null;
          return content === "1" ? "patch" : "replace";
        };

        const agentFromText = resolveFlowAgentFromRouteText(fullResponse);
        if (agentFromText) {
          flowSelectedAgent = agentFromText;

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: "" }];
            return prev;
          });

          const agentPrompt = flowSelectedAgent === "patch" ? flowPatchAgentPrompt : flowReplaceAgentPrompt;
          const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join("\n\n");
          const routedMessages: ChatMessage[] = [
            { role: "system", content: routedSystemContent },
            { role: "user", content: promptContent }
          ];

          let routedFull = "";
          const routedUpdater = createThrottledAssistantUpdater();
          await streamChatMessage(routedMessages, (chunk) => {
            routedFull = chunk;
            routedUpdater.push(chunk);
          }, chatModel, controller.signal);
          routedUpdater.flush();

          flowRoutedBaseMessages = routedMessages;
          fullResponse = routedFull;
        }
      }

      if (fullResponse && workspaceId === "cad") {
        let route: { agent?: string } | null = null;

        const resolveCadAgentFromRouteText = (text: string): string | null => {
          const trimmed = String(text || "").trim();
          if (!trimmed) return null;

          let content = trimmed;
          const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
          if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
          content = content.replace(/\s+/g, "");

          if (!/^[1-5]$/.test(content)) return null;

          return content === "1"
            ? "cad_plan_agent"
            : content === "2"
              ? "cad_svg_generate_agent"
              : content === "3"
                ? "cad_svg_patch_agent"
                : content === "4"
                  ? "cad_bom_agent"
                  : "cad_images_agent";
        };

        const routeJsonRegex = /```json\s*([\s\S]*?)```/g;
        let rm: RegExpExecArray | null;
        while ((rm = routeJsonRegex.exec(fullResponse))) {
          const jsonText = String(rm[1] || "").trim();
          if (!jsonText) continue;
          try {
            const parsed = JSON.parse(jsonText);
            if (parsed?.type === "cad_route" && typeof parsed?.agent === "string") {
              route = { agent: parsed.agent };
              break;
            }
          } catch {
          }
        }

        if (!route?.agent) {
          const agentFromText = resolveCadAgentFromRouteText(fullResponse);
          if (agentFromText) route = { agent: agentFromText };
        }

        if (route?.agent) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: "" }];
            return prev;
          });

          const buildCadNextStepGuide = (args: {
            agent: string;
            beforeHasPlan: boolean;
            beforeHasSvg2d: boolean;
            producedHasPlan: boolean;
            producedHasSvg2d: boolean;
            producedHasImages: boolean;
            producedHasBom: boolean;
          }) => {
            if (args.producedHasPlan && !args.beforeHasPlan) {
              return trText(
                "The plan is ready. If it looks good, reply \"Generate 2D floorplan\". If not, tell me what to change.",
                "The plan is ready. If it looks good, reply \"Generate 2D floorplan\". If not, tell me what to change."
              );
            }
            if (args.producedHasSvg2d && !args.beforeHasSvg2d) {
              return trText(
                "The 2D floorplan is generated. Tell me edits if needed; otherwise reply \"Generate renders\".",
                "The 2D floorplan is generated. Tell me edits if needed; otherwise reply \"Generate renders\"."
              );
            }
            if (args.producedHasImages) {
              return trText(
                "Renders are being generated or updated. Next, reply \"Generate BOM\".",
                "Renders are being generated or updated. Next, reply \"Generate BOM\"."
              );
            }
            if (args.producedHasBom) {
              return trText(
                "BOM is generated. You can refine the plan, 2D, or style, or export files.",
                "BOM is generated. You can refine the plan, 2D, or style, or export files."
              );
            }
            if (args.agent === "cad_svg_patch_agent") {
              return trText(
                "2D has been patched. If OK, reply \"Generate renders\"; otherwise describe more edits.",
                "2D has been patched. If OK, reply \"Generate renders\"; otherwise describe more edits."
              );
            }
            return "";
          };

          const runCadTaskMessages = async (taskMessages: ChatMessage[]) => {
            let taskFull = "";
            const taskUpdater = createThrottledAssistantUpdater();
            await streamChatMessage(taskMessages, (chunk) => {
              taskFull = chunk;
              taskUpdater.push(chunk);
            }, chatModel, controller.signal);
            taskUpdater.flush();
            return taskFull;
          };

          const emitCadJson = (text: string) => {
            const match = text.match(/```json\s*([\s\S]*?)```/);
            const jsonText = match ? match[1].trim() : text.trim();
            if (!jsonText.startsWith("{")) return;
            onCodeAction?.(jsonText, "cad");
          };

          const agent = String(route.agent || "").trim();
          const beforeHasPlan = !!cadContext?.plan;
          const beforeHasSvg2d = !!(typeof cadContext?.svg2d === "string" && cadContext.svg2d.trim());
          const planJson = cadContext?.plan ? JSON.stringify(cadContext.plan) : "";
          const svg2d = cadContext?.svg2d || "";

          if (agent === "cad_bom_agent") {
            const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), `UI language: ${uiLang}`]
              .filter(Boolean)
              .join("\n\n");
            const taskMessages = buildCadBomMessages({ systemContent: systemContentTasks, planJson, svg2d });

            const taskFull = await runCadTaskMessages(taskMessages);
            if (taskFull) {
              emitCadJson(taskFull);
              const fallback = parseMarkdownBomTable(taskFull);
              if (fallback) onCodeAction?.(JSON.stringify(fallback), "cad");

              const producedHasPlan = /"type"\s*:\s*"cad_plan"/.test(taskFull);
              const producedHasSvg2d = /```svg[\s\S]*?```/.test(taskFull);
              const producedHasImages = /"type"\s*:\s*"cad_images"/.test(taskFull);
              const producedHasBom = /"type"\s*:\s*"cad_bom"/.test(taskFull);
              const guide = buildCadNextStepGuide({
                agent,
                beforeHasPlan,
                beforeHasSvg2d,
                producedHasPlan,
                producedHasSvg2d,
                producedHasImages,
                producedHasBom,
              });
              if (guide) updateLastAssistant(`${taskFull}\n\n${guide}`);
            }
            return;
          }

          if (agent === "cad_images_agent") {
            const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), `UI language: ${uiLang}`]
              .filter(Boolean)
              .join("\n\n");
            const masterMessages: ChatMessage[] = buildCadImagesMasterMessages({ systemContent: systemContentTasks, planJson, svg2d });

            updateLastAssistant(trText("Generating drawing prompts...", "Generating drawing prompts..."));

            const extractJsonText = (text: string) => {
              const match = String(text || "").match(/```json\s*([\s\S]*?)```/);
              return match ? match[1].trim() : String(text || "").trim();
            };

            const tryParseJson = (text: string) => {
              const normalized = extractJsonText(text);
              try {
                return JSON.parse(normalized);
              } catch {
                const start = normalized.indexOf("{");
                const end = normalized.lastIndexOf("}");
                if (start >= 0 && end > start) {
                  try {
                    return JSON.parse(normalized.slice(start, end + 1));
                  } catch {
                  }
                }
                return null;
              }
            };

            const fallbackTitlesForOutput = [
              trText("Renovation Plan Layout", "Renovation Plan Layout"),
              trText("Floor Finish Plan", "Floor Finish Plan"),
              trText("Reflected Ceiling Plan", "Reflected Ceiling Plan"),
              trText("Wall Setting-Out Plan", "Wall Setting-Out Plan"),
              trText("MEP Plan (Electrical + Low Voltage + Plumbing)", "MEP Plan (Electrical + Low Voltage + Plumbing)"),
              trText("Elevation Index Plan + Interior Elevations", "Elevation Index Plan + Interior Elevations"),
              trText("Detail Drawings", "Detail Drawings"),
            ];
            const fallbackTitlesForPromptEnglish = [
              "Renovation Plan Layout",
              "Floor Finish Plan",
              "Reflected Ceiling Plan",
              "Wall Setting-Out Plan",
              "MEP Plan (Electrical + Low Voltage + Plumbing)",
              "Elevation Index Plan + Interior Elevations",
              "Detail Drawings",
            ];

            let masterSchemeJson = "";
            try {
              const masterText = await generateChatMessage(masterMessages, chatModel, { signal: controller.signal, timeoutMs: 120000 });
              const parsedMaster = tryParseJson(masterText);
              if (parsedMaster?.type === "renovation_scheme_master" && parsedMaster?.global_scheme) {
                masterSchemeJson = JSON.stringify(parsedMaster, null, 2);
              }
            } catch {
            }

            const imagesSheetMessages = buildCadImagesSheetMessages({
              systemContent: systemContentTasks,
              planJson,
              svg2d,
              masterSchemeJson,
            });

            const settled = await Promise.allSettled(
              imagesSheetMessages.map((s) =>
                generateChatMessage(s.messages, chatModel, { signal: controller.signal, timeoutMs: 120000 })
              )
            );

            const prompts = settled.map((r, idx) => {
              const fallbackTitleForOutput = fallbackTitlesForOutput[idx] || trText("Drawing", "Drawing");
              const fallbackTitleForPrompt = fallbackTitlesForPromptEnglish[idx] || "Drawing";
              const onSheetLanguageRule =
                uiLang === "zh"
                  ? "All on-sheet labels/notes/title block text must be in Simplified Chinese."
                  : "All on-sheet labels/notes/title block text must be in English.";
              const fallbackPrompt = `Generate an orthographic 2D technical construction drawing sheet: ${fallbackTitleForPrompt}. Include border, bottom-right title block, scale/units, legend/symbols, key annotations and dimensions, consistent with the provided plan JSON and 2D SVG. ${onSheetLanguageRule}`;

              if (r.status !== "fulfilled") return { title: fallbackTitleForOutput, prompt: fallbackPrompt };
              const text = String(r.value || "").trim();
              const parsed = tryParseJson(text);

              if (parsed?.type === "cad_images_sheet" && typeof parsed?.title === "string" && typeof parsed?.prompt === "string") {
                const p = parsed.prompt.trim();
                return { title: parsed.title, prompt: p || fallbackPrompt };
              }

              if (parsed?.type === "cad_images" && Array.isArray(parsed?.prompts) && parsed.prompts.length > 0) {
                const first = parsed.prompts[0];
                const title = typeof first?.title === "string" ? first.title : fallbackTitleForOutput;
                const prompt = typeof first?.prompt === "string" ? first.prompt.trim() : "";
                return { title, prompt: prompt || fallbackPrompt };
              }

              return { title: fallbackTitleForOutput, prompt: fallbackPrompt };
            });

            const payload = JSON.stringify({ type: "cad_images", prompts }, null, 2);
            onCodeAction?.(payload, "cad");

            const guide = buildCadNextStepGuide({
              agent,
              beforeHasPlan,
              beforeHasSvg2d,
              producedHasPlan: false,
              producedHasSvg2d: false,
              producedHasImages: true,
              producedHasBom: false,
            });
            updateLastAssistant(guide || trText("Drawing tasks generated.", "Drawing tasks generated."));
            return;
          }

          const agentPrompt =
            agent === "cad_plan_agent"
              ? CAD_PLAN_AGENT_PROMPT
              : "";

          if (!agentPrompt) {
            updateLastAssistant(trText(`未识别的 CAD 子智能体：${agent}`, `Unrecognized CAD sub-agent: ${agent}`));
            return;
          }

          const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join("\n\n");
          const routedMessages: ChatMessage[] = [
            { role: "system", content: routedSystemContent },
            { role: "user", content: promptContent }
          ];

          let routedFull = "";
          const routedUpdater = createThrottledAssistantUpdater();
          await streamChatMessage(routedMessages, (chunk) => {
            routedFull = chunk;
            routedUpdater.push(chunk);
          }, chatModel, controller.signal);
          routedUpdater.flush();

          if (routedFull) {
            const svgMatch = routedFull.match(/```svg\n([\s\S]*?)\n```/);
            if (svgMatch && svgMatch[1]) onCodeAction?.(svgMatch[1], "cad");

            const jsonRegex = /```json\s*([\s\S]*?)```/g;
            let jm: RegExpExecArray | null;
            while ((jm = jsonRegex.exec(routedFull))) {
              const jsonText = String(jm[1] || "").trim();
              if (!jsonText) continue;
              onCodeAction?.(jsonText, "cad");
            }

            const producedHasPlan = /"type"\s*:\s*"cad_plan"/.test(routedFull);
            const producedHasSvg2d = /```svg[\s\S]*?```/.test(routedFull);
            const producedHasImages = /"type"\s*:\s*"cad_images"/.test(routedFull);
            const producedHasBom = /"type"\s*:\s*"cad_bom"/.test(routedFull);
            const guide = buildCadNextStepGuide({
              agent,
              beforeHasPlan,
              beforeHasSvg2d,
              producedHasPlan,
              producedHasSvg2d,
              producedHasImages,
              producedHasBom,
            });
            if (guide) updateLastAssistant(`${routedFull}\n\n${guide}`);
          }
          return;
        }
      }

      if (fullResponse) {
        let { flowPatchFound, flowRetryError } =
          await handleAssistantResponse(fullResponse);

        let flowRetryMessagesBase: ChatMessage[] = flowRoutedBaseMessages ? [...flowRoutedBaseMessages] : apiMessages;
        let flowRetryAgent: "patch" | "replace" | null = flowSelectedAgent;

        while (
          workspaceId === "flow" &&
          flowPatchFound &&
          flowRetryError &&
          !controller.signal.aborted &&
          flowAutoRetryCountRef.current < MAX_FLOW_AUTO_RETRY
        ) {
          flowAutoRetryCountRef.current += 1;
          const forceReplace = flowAutoRetryCountRef.current >= MAX_FLOW_AUTO_RETRY;

          if (forceReplace && flowRetryAgent === "patch") {
            flowRetryAgent = "replace";
            const routedSystemContent = [flowReplaceAgentPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join("\n\n");
            flowRetryMessagesBase = [
              { role: "system", content: routedSystemContent },
              { role: "user", content: promptContent }
            ];
          }

          const retryPrompt = buildFlowRetryPrompt(flowRetryError, forceReplace);
          const retryMessages: ChatMessage[] = [
            ...flowRetryMessagesBase,
            { role: "assistant", content: fullResponse },
            { role: "user", content: retryPrompt },
          ];

          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

          let retryFull = "";
          const retryUpdater = createThrottledAssistantUpdater();
          await streamChatMessage(
            retryMessages,
            (chunk) => {
              retryFull = chunk;
              retryUpdater.push(chunk);
            },
            chatModel,
            controller.signal,
          );
          retryUpdater.flush();

          fullResponse = retryFull;
          flowRetryMessagesBase = retryMessages;
          const processed = await handleAssistantResponse(fullResponse);
          flowPatchFound = processed.flowPatchFound;
          flowRetryError = processed.flowRetryError;
        }
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
    const constraintsKey = workspaceId ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}` : STORAGE_GLOBAL_CONSTRAINTS_KEY;
    const globalConstraints = typeof window !== 'undefined' ? localStorage.getItem(constraintsKey) || '' : '';
    const globalSystemPrompt = config.systemPrompt || '';
    const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join('\n\n');
    const lastUserText = String(baseMessages[baseMessages.length - 1]?.content || "");
    const flowContextText =
      workspaceId === "flow" && typeof flowContext?.xml === "string" && flowContext.xml.trim()
        ? `Current diagram XML:\n\n\`\`\`xml\n${flowContext.xml}\n\`\`\``
        : "";
    const promptContent = [lastUserText, flowContextText].filter(Boolean).join("\n\n");

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
        let flowRoutedBaseMessages: ChatMessage[] | null = null;
        let flowSelectedAgent: "patch" | "replace" | null = null;

        if (workspaceId === "flow") {
          const resolveFlowAgentFromRouteText = (text: string): "patch" | "replace" | null => {
            const trimmed = String(text || "").trim();
            if (!trimmed) return null;

            let content = trimmed;
            const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
            if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
            content = content.replace(/\s+/g, "");

            if (!/^[1-2]$/.test(content)) return null;
            return content === "1" ? "patch" : "replace";
          };

          const agentFromText = resolveFlowAgentFromRouteText(fullResponse);
          if (agentFromText) {
            flowSelectedAgent = agentFromText;

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: "" }];
              return prev;
            });

            const agentPrompt = flowSelectedAgent === "patch" ? flowPatchAgentPrompt : flowReplaceAgentPrompt;
            const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join("\n\n");
            const routedMessages: ChatMessage[] = [
              { role: "system", content: routedSystemContent },
              { role: "user", content: promptContent }
            ];

            let routedFull = "";
            const routedUpdater = createThrottledAssistantUpdater();
            await streamChatMessage(routedMessages, (chunk) => {
              routedFull = chunk;
              routedUpdater.push(chunk);
            }, chatModel, controller.signal);
            routedUpdater.flush();

            flowRoutedBaseMessages = routedMessages;
            fullResponse = routedFull;
          }
        }

        let { flowPatchFound, flowRetryError } =
          await handleAssistantResponse(fullResponse);

        let flowRetryMessagesBase: ChatMessage[] = flowRoutedBaseMessages ? [...flowRoutedBaseMessages] : apiMessages;
        let flowRetryAgent: "patch" | "replace" | null = flowSelectedAgent;

        while (
          workspaceId === "flow" &&
          flowPatchFound &&
          flowRetryError &&
          !controller.signal.aborted &&
          flowAutoRetryCountRef.current < MAX_FLOW_AUTO_RETRY
        ) {
          flowAutoRetryCountRef.current += 1;
          const forceReplace = flowAutoRetryCountRef.current >= MAX_FLOW_AUTO_RETRY;

          if (forceReplace && flowRetryAgent === "patch") {
            flowRetryAgent = "replace";
            const routedSystemContent = [flowReplaceAgentPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join("\n\n");
            flowRetryMessagesBase = [
              { role: "system", content: routedSystemContent },
              { role: "user", content: promptContent }
            ];
          }

          const retryPrompt = buildFlowRetryPrompt(flowRetryError, forceReplace);
          const retryMessages: ChatMessage[] = [
            ...flowRetryMessagesBase,
            { role: "assistant", content: fullResponse },
            { role: "user", content: retryPrompt },
          ];

          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

          let retryFull = "";
          const retryUpdater = createThrottledAssistantUpdater();
          await streamChatMessage(
            retryMessages,
            (chunk) => {
              retryFull = chunk;
              retryUpdater.push(chunk);
            },
            chatModel,
            controller.signal,
          );
          retryUpdater.flush();

          fullResponse = retryFull;
          flowRetryMessagesBase = retryMessages;
          const processed = await handleAssistantResponse(fullResponse);
          flowPatchFound = processed.flowPatchFound;
          flowRetryError = processed.flowRetryError;
        }
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
    flowAutoRetryCountRef.current = 0;
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
    flowAutoRetryCountRef.current = 0;
    await runTextChat(base);
  };

  const uiMessages: UIMessage[] = messages.map((msg, idx) => ({
      id: `msg-${idx}`,
      role: msg.role as any,
      content: msg.content,
      parts: [{ type: 'text', text: msg.content }] 
  }));

  if (collapsed) {
      return (
          <div className={cn("h-full flex flex-col items-center pt-4 bg-card border border-border/30 rounded-xl", className)}>
              <ButtonWithTooltip
                tooltipContent={t(uiLang, "chat.expand")}
                variant="ghost"
                size="icon"
                onClick={onToggleCollapse}
                className="hover:bg-accent transition-colors"
              >
                  <PanelRightOpen className="h-5 w-5 text-muted-foreground" />
              </ButtonWithTooltip>
          </div>
      );
  }

  return (
    <div className={cn("h-full flex flex-col bg-card shadow-soft animate-slide-in-right rounded-xl border border-border/30 relative", className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight whitespace-nowrap">{resolvedTitle}</span>
          </div>
          <div className="flex items-center gap-1">
            {onToggleCollapse && (
                <ButtonWithTooltip
                  tooltipContent={collapseLocked ? t(uiLang, "chat.collapseLocked") : t(uiLang, "chat.collapse")}
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  disabled={collapseLocked}
                  className="hover:bg-accent transition-colors rounded-md"
                >
                    <PanelRightClose className="w-4 h-4 text-muted-foreground" />
                </ButtonWithTooltip>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 w-full overflow-hidden">
          <ChatMessageDisplay 
            messages={uiMessages} 
            setInput={setInput} 
            status={isLoading ? "streaming" : "idle"}
            onDisplayChart={(xml) => onCodeAction?.(xml, 'flow')}
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditAndResend}
          />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50 bg-card/50">
        <ChatInput 
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
                uploadMode={workspaceId === "ppt" ? "imagesOnly" : workspaceId === "cad" ? "filesOnly" : "all"}
            placeholder={inputPlaceholder}
            focusKey={workspaceId === "ppt" ? pptInputFocusTick : undefined}
            clearKey={workspaceId === "ppt" ? pptClearTick : undefined}
            richSegments={workspaceId === "ppt" ? pptInputSegments : undefined}
            onRichSegmentsChange={workspaceId === "ppt" ? setPptInputSegments : undefined}
            insertPptToken={workspaceId === "ppt" ? pptInsertToken : null}
            onInsertPptTokenHandled={workspaceId === "ppt" ? () => {
              pptInsertBusyRef.current = false;
              setPptInsertToken(null);
              pumpPptInsertQueue();
            } : undefined}
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
