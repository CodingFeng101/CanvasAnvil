import React, { useState, useRef, useEffect } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChatMessage, generateChatMessage, ChatMessage, getAIConfig } from '@/lib/ai-client';
import { DRAWIO_SYSTEM_PROMPT } from '@/lib/system-prompts';
import { ButtonWithTooltip } from '@/workspaces/cad/chat/components/button-with-tooltip';
import { ChatInput } from '@/workspaces/cad/chat/ChatInput';
import { ChatMessageDisplay, UIMessage } from '@/workspaces/cad/chat/ChatMessageDisplay';
import { STORAGE_GLOBAL_CONSTRAINTS_KEY } from '@/workspaces/cad/chat/global-constraints-dialog';
import { HistoryDialog, HistoryItem } from '@/workspaces/cad/chat/history-dialog';
import { ResetWarningModal } from '@/workspaces/cad/chat/reset-warning-modal';
import { useFileProcessor } from '@/lib/use-file-processor';
import {
  buildCadAnalysisMessages,
  buildCadBomMessages,
  buildCadImagesMasterMessages,
  buildCadImagesSheetMessages,
  buildCadTasksSystemContent,
} from '@/lib/cad-tasks';
import {
  CAD_PLAN_AGENT_PROMPT,
  CAD_SVG_AGENT_ROUTER_PROMPT,
  CAD_SVG_FLOW_PATCH_AGENT_PROMPT,
  CAD_SVG_FLOW_REPLACE_AGENT_PROMPT,
} from '@/lib/cad-agents';
import { getCadRenderFallbackTitle, getCadRenderSlotTitles } from "@/lib/cad-render-titles";
import flowPatchAgentPrompt from "../../../../agent/flow/patch.md?raw";
import flowReplaceAgentPrompt from "../../../../agent/flow/replace.md?raw";
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";
import { toast } from "sonner";

interface Attachment {
  id: string;
  type: 'xml' | 'python' | 'json' | 'image' | 'text';
  content: string;
  name: string;
}

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string; svg?: string };
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
    analysisImages?: Array<{ title: string; url: string }>;
  };
  flowContext?: {
    xml?: string;
  };
  onClearWorkspace?: () => void;
}

const STORAGE_KEY_PREFIX = 'chat_history_v2_';
const CAD_STORAGE_TRUNCATE_SUFFIX = "\n...[truncated]";
const CAD_STORAGE_DEFAULT_LIMITS = {
  maxMessages: 50,
  maxMessageChars: 24000,
  maxTotalChars: 240000,
};
const CAD_STORAGE_FALLBACK_LIMITS = [
  CAD_STORAGE_DEFAULT_LIMITS,
  { maxMessages: 30, maxMessageChars: 12000, maxTotalChars: 120000 },
  { maxMessages: 16, maxMessageChars: 6000, maxTotalChars: 60000 },
  { maxMessages: 8, maxMessageChars: 3000, maxTotalChars: 30000 },
];
const CAD_ROUTER_HISTORY_LIMITS = {
  maxMessages: 12,
  maxMessageChars: 3000,
  maxTotalChars: 18000,
};

const normalizeStoredChatMessages = (raw: any): ChatMessage[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => m && typeof m === "object")
    .map((m: any) => {
      const roleRaw = String(m.role || "");
      const role: ChatMessage["role"] =
        roleRaw === "user" || roleRaw === "assistant" || roleRaw === "system"
          ? roleRaw
          : "user";
      const content = typeof m.content === "string" ? m.content : String(m.content ?? "");
      return { role, content };
    })
    .filter((m: ChatMessage) => !!m.content);
};

const truncateForStorage = (text: string, maxChars: number) => {
  const value = String(text || "");
  if (maxChars <= 0) return "";
  if (value.length <= maxChars) return value;
  if (maxChars <= CAD_STORAGE_TRUNCATE_SUFFIX.length) {
    return value.slice(0, maxChars);
  }
  return value.slice(0, maxChars - CAD_STORAGE_TRUNCATE_SUFFIX.length) + CAD_STORAGE_TRUNCATE_SUFFIX;
};

const buildCadRouterHistoryContext = (source: ChatMessage[]) => {
  if (!Array.isArray(source) || source.length === 0) return "";

  const recent = source
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .slice(-CAD_ROUTER_HISTORY_LIMITS.maxMessages);
  if (recent.length === 0) return "";

  let totalChars = 0;
  const lines: string[] = [];
  for (const m of recent) {
    const raw = truncateForStorage(String(m.content || ""), CAD_ROUTER_HISTORY_LIMITS.maxMessageChars);
    if (!raw) continue;

    const remaining = CAD_ROUTER_HISTORY_LIMITS.maxTotalChars - totalChars;
    if (remaining <= 0) break;

    const clipped = raw.length > remaining ? truncateForStorage(raw, remaining) : raw;
    const roleLabel = m.role === "assistant" ? "Assistant" : "User";
    lines.push(`[${roleLabel}] ${clipped}`);
    totalChars += clipped.length;
  }

  if (lines.length === 0) return "";
  return `Recent chat history (for intent continuity):\n\n${lines.join("\n\n")}`;
};

const compactCadMessagesForStorage = (
  source: ChatMessage[],
  limits: { maxMessages: number; maxMessageChars: number; maxTotalChars: number },
): ChatMessage[] => {
  const maxMessages = Math.max(1, Number(limits.maxMessages) || 1);
  const maxMessageChars = Math.max(256, Number(limits.maxMessageChars) || 256);
  const maxTotalChars = Math.max(1024, Number(limits.maxTotalChars) || 1024);

  const normalized = normalizeStoredChatMessages(source).slice(-maxMessages).map((m) => ({
    role: m.role,
    content: truncateForStorage(m.content, maxMessageChars),
  }));

  let totalChars = normalized.reduce((sum, m) => sum + m.content.length, 0);
  while (normalized.length > 1 && totalChars > maxTotalChars) {
    const removed = normalized.shift();
    totalChars -= removed?.content.length || 0;
  }

  if (normalized.length === 1 && normalized[0].content.length > maxTotalChars) {
    normalized[0] = {
      role: normalized[0].role,
      content: truncateForStorage(normalized[0].content, maxTotalChars),
    };
  }

  return normalized;
};

const persistCadMessagesWithFallback = (storageKey: string, source: ChatMessage[]) => {
  for (const limits of CAD_STORAGE_FALLBACK_LIMITS) {
    try {
      const compacted = compactCadMessagesForStorage(source, limits);
      localStorage.setItem(storageKey, JSON.stringify(compacted));
      return true;
    } catch {
    }
  }
  return false;
};

// Convert internal ChatMessage to UIMessage
const toUIMessage = (msg: ChatMessage, index: number): UIMessage => ({
    id: `msg-${index}-${Date.now()}`,
    role: msg.role as any,
    content: msg.content,
    parts: [{ type: 'text', text: msg.content }]
});

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
  const panelTitle = title || trText("AI 助手", "AI Assistant");
  const cadOutputLanguage = uiLang === "zh" ? "Simplified Chinese (zh-CN)" : "English (en)";
  const cadOutputLanguageInstruction =
    workspaceId === "cad"
      ? `Output language: ${cadOutputLanguage}`
      : "";
  const cadRenderFallbackTitles = getCadRenderSlotTitles(uiLang);
  const cadRenderPromptTitlesEn = getCadRenderSlotTitles("en");
  const getCadAnalysisImageRefs = () => {
    if (workspaceId !== "cad") return [] as Array<{ title: string; url: string }>;
    const items = Array.isArray(cadContext?.analysisImages) ? cadContext.analysisImages : [];
    return items
      .map((item, idx) => ({
        title:
          typeof item?.title === "string" && item.title.trim()
            ? item.title.trim()
            : uiLang === "zh"
              ? `分析图${idx + 1}`
              : `Analysis ${idx + 1}`,
        url: String(item?.url || "").trim(),
      }))
      .filter((item) => !!item.url && (/^data:image\//i.test(item.url) || /^https?:\/\//i.test(item.url)))
      .slice(0, 2);
  };
  const buildCadSvgUserContent = (baseText: string) => {
    const refs = getCadAnalysisImageRefs();
    if (refs.length === 0) return baseText;
    const refList = refs.map((ref, idx) => `${idx + 1}. ${ref.title}`).join("\n");
    const text = [
      baseText,
      trText(
        `分析图参考（生成2D平面图时必须参考以下图片中的空间关系、功能分区和重点策略；不要照搬图片文字）：\n${refList}`,
        `Analysis image references (when generating the 2D floorplan, you must reference spatial relationships, functional zoning, and key strategies from the following images; do not copy text labels verbatim):\n${refList}`,
      ),
    ]
      .filter(Boolean)
      .join("\n\n");
    return [
      { type: "text", text },
      ...refs.map((ref) => ({ type: "image_url", image_url: { url: ref.url } })),
    ];
  };
  // Persistence key
  const storageKey = `${STORAGE_KEY_PREFIX}${workspaceId}`;

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                if (workspaceId === "cad") {
                  const parsed = normalizeStoredChatMessages(JSON.parse(saved));
                  return compactCadMessagesForStorage(parsed, CAD_STORAGE_DEFAULT_LIMITS);
                }
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse chat history", e);
            }
        }
    }
    return initialMessages.length > 0 ? initialMessages : [];
  });

  const [input, setInput] = useState('');
  const [pptInputSegments, setPptInputSegments] = useState<Array<{ type: "text"; text: string } | { type: "ppt"; slideId: string; label: string; tag: string }>>([
    { type: "text", text: "" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  const flowAutoRetryCountRef = useRef(0);
  const MAX_FLOW_AUTO_RETRY = 3;
  const cadSvgAutoRetryCountRef = useRef(0);
  const MAX_CAD_SVG_AUTO_RETRY = 3;
  const cadApprovedPlanRef = useRef<any | null>(null);
  
  const [files, setFiles] = useState<File[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pptInputFocusTick, setPptInputFocusTick] = useState(0);
  const prevPptDraftCountRef = useRef(0);
  const prevPptDraftIdsRef = useRef<Set<string>>(new Set());
  const [pptInsertToken, setPptInsertToken] = useState<{ key: number; slideId: string; label: string; tag: string } | null>(null);
  const pptInsertQueueRef = useRef<Array<{ slideId: string; title: string; label: string }>>([]);
  const pptInsertBusyRef = useRef(false);
  const [pptClearTick, setPptClearTick] = useState(0);
  const lastUploadedImagesRef = useRef<string[]>([]);

  const getPptLabel = (slideId: string, title: string) => {
    const m = String(slideId || "").match(/(\\d+)/);
    const n = m ? Number(m[1]) : NaN;
    if (!Number.isNaN(n)) {
      return title ? trText(`第 ${n} 页：${title}`, `Slide ${n}: ${title}`) : trText(`第 ${n} 页`, `Slide ${n}`);
    }
    return title || slideId;
  };

  const getPptTag = (slideId: string, title: string) => {
    const m = String(slideId || "").match(/(\\d+)/);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isNaN(n)) return "";
    const safeTitle = String(title || "").split("|").join(",").split("]]").join("");
    return `[[PPT_SLIDE|${n}|${safeTitle}]]`;
  };

  const pumpPptInsertQueue = () => {
    if (pptInsertBusyRef.current) return;
    const next = pptInsertQueueRef.current.shift();
    if (!next) return;
    pptInsertBusyRef.current = true;
    const tag = getPptTag(next.slideId, next.title);
    setPptInsertToken({ key: Date.now() + Math.random(), slideId: next.slideId, label: next.label, tag });
  };

  const enqueuePptToken = (slideId: string, title: string) => {
    const label = getPptLabel(slideId, title);
    pptInsertQueueRef.current.push({ slideId, title, label });
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
    for (const s of added) enqueuePptToken(s.slideId, s.title);
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
    const bomUpdatedText = trText("（已更新物料清单）", "(BOM updated)");
    const formatCadPlanForDisplay = (parsed: any) => {
      if (parsed?.type !== "cad_plan") return null;
      const plan = parsed?.plan || {};
      const summary = typeof plan?.summary === "string" ? plan.summary.trim() : "";
      const style = typeof plan?.style === "string" ? plan.style.trim() : "";
      const assumptions = Array.isArray(plan?.assumptions) ? plan.assumptions.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      const constraints = Array.isArray(plan?.constraints) ? plan.constraints.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      const rooms = Array.isArray(plan?.rooms) ? plan.rooms : [];

      const lines: string[] = [];
      lines.push(trText("### 方案概览", "### Plan Overview"));
      if (summary) lines.push(summary);
      if (style) lines.push(trText(`- 设计风格：${style}`, `- Style: ${style}`));

      if (rooms.length > 0) {
        lines.push("");
        lines.push(trText("### 空间清单", "### Space Program"));
        rooms.forEach((r: any, i: number) => {
          const name = String(r?.name || r?.type || "").trim() || trText(`空间${i + 1}`, `Space ${i + 1}`);
          const size = String(r?.size || "").trim();
          const notes = String(r?.notes || "").trim();
          const head = size ? `${i + 1}. **${name}**（${size}）` : `${i + 1}. **${name}**`;
          lines.push(head);
          if (notes) lines.push(`   ${notes}`);
        });
      }

      if (assumptions.length > 0) {
        lines.push("");
        lines.push(trText("### 设计假设", "### Assumptions"));
        assumptions.forEach((a: string) => lines.push(`- ${a}`));
      }

      if (constraints.length > 0) {
        lines.push("");
        lines.push(trText("### 关键约束", "### Constraints"));
        constraints.forEach((c: string) => lines.push(`- ${c}`));
      }

      return lines.join("\n").trim();
    };

    const tryParseCadPlanJson = (text: string) => {
      const raw = String(text || "").trim();
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return formatCadPlanForDisplay(parsed);
      } catch {
      }
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          const parsed = JSON.parse(raw.slice(start, end + 1));
          return formatCadPlanForDisplay(parsed);
        } catch {
        }
      }
      return null;
    };

    let next = content.replace(
      /```(?:python|py|python3)\s*[\s\S]*?```/g,
      trText("（已在后台处理完成）", "(Processed in the background)")
    );
    next = next
      .split("\n")
      .filter((line) => !/freecad/i.test(line))
      .join("\n");
    next = next.replace(/(?:^|\n)1\.\s*FreeCAD[\s\S]*?(?=\n\d+\.\s|$)/gi, "\n");
    next = next.replace(/```json\s*([\s\S]*?)```/g, (full, inner) => {
      const text = String(inner || "").trim();
      if (!text) return full;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.type === "cad_patch" && parsed?.target === "2d_svg") {
          const mode = String(parsed?.mode || "");
          if (mode === "replace" && typeof parsed?.full === "string" && parsed.full.trim().startsWith("<svg")) {
            return `\`\`\`svg\n${parsed.full.trim()}\n\`\`\``;
          }
          if (mode === "patch") {
            // Keep patch JSON for structured diff rendering in chat UI.
            return full;
          }
        }
        if (parsed?.type === "cad_bom") {
          return bomUpdatedText;
        }
      } catch {
      }
      if (text.includes('"type"') && text.includes('"cad_images"')) {
        return trText("（已提交装修图生成任务）", "(CAD drawing generation task submitted)");
      }
      if (text.includes('"type"') && text.includes('"cad_analysis_images"')) {
        return trText("（已提交分析图生成任务）", "(Analysis image generation task submitted)");
      }
      if (text.includes('"type"') && text.includes('"cad_plan"')) {
        const pretty = tryParseCadPlanJson(text);
        return pretty || trText("（已生成方案）", "(Plan generated)");
      }
      return full;
    });

    const seenSvgBlocks = new Set<string>();
    next = next.replace(/```svg\s*([\s\S]*?)```/gi, (full, inner) => {
      const rawSvg = String(inner || "").trim();
      if (!rawSvg) return full;
      const normalized = normalizeSvgMarkup(rawSvg) || rawSvg;
      if (seenSvgBlocks.has(normalized)) return "";
      seenSvgBlocks.add(normalized);
      return `\`\`\`svg\n${normalized}\n\`\`\``;
    });

    // Fallback: if whole message is raw cad_plan JSON (not wrapped in code fences), render as readable text.
    const prettyWhole = tryParseCadPlanJson(next);
    if (prettyWhole) return prettyWhole;
    try {
      const parsedWhole = JSON.parse(String(next || "").trim());
      if (
        parsedWhole?.type === "cad_patch" &&
        parsedWhole?.target === "2d_svg" &&
        String(parsedWhole?.mode || "") === "patch" &&
        Array.isArray(parsedWhole?.edits)
      ) {
        return `\`\`\`json\n${JSON.stringify(parsedWhole, null, 2)}\n\`\`\``;
      }
      if (parsedWhole?.type === "cad_bom") return bomUpdatedText;
    } catch {
    }
    return next;
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
    if (typeof window !== "undefined") {
      if (workspaceId === "cad") {
        const ok = persistCadMessagesWithFallback(storageKey, messages);
        if (!ok) {
          console.error("Failed to persist CAD chat history after fallback trimming.");
        }
      } else {
        localStorage.setItem(storageKey, JSON.stringify(messages));
      }
    }
    onMessagesChange?.(messages);
  }, [messages, storageKey, onMessagesChange, workspaceId]);

  const clearHistory = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    cadApprovedPlanRef.current = null;
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
    cadApprovedPlanRef.current = null;
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
      return {
        ok: r.ok,
        retry: !!r.retry,
        error: typeof r.error === "string" ? r.error : undefined,
        svg: typeof r.svg === "string" ? r.svg : undefined,
      } as CodeActionResult;
    }
    return { ok: true } as CodeActionResult;
  };

  const extractJsonPayloadText = (text: string) => {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return String(fenced[1]).trim();
    return raw;
  };

  const extractCadPlanPayload = (text: string): any | null => {
    const raw = String(text || "");
    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let jm: RegExpExecArray | null;
    while ((jm = jsonRegex.exec(raw))) {
      const jsonText = String(jm[1] || "").trim();
      if (!jsonText) continue;
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed?.type === "cad_plan" && parsed?.plan) return parsed;
      } catch {
      }
    }
    const fallback = extractJsonPayloadText(raw);
    try {
      const parsed = JSON.parse(fallback);
      if (parsed?.type === "cad_plan" && parsed?.plan) return parsed;
    } catch {
    }
    return null;
  };

  const normalizeAnalysisPromptText = (text: string, fallback: string) => {
    const raw = String(text || "").trim();
    if (!raw) return fallback;
    const fenced = raw.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    const content = fenced?.[1] ? String(fenced[1]).trim() : raw;
    if (!content) return fallback;
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed?.prompt === "string" && parsed.prompt.trim()) return parsed.prompt.trim();
    } catch {
    }
    const line = content.replace(/\r?\n+/g, " ").trim();
    return line || fallback;
  };

  const runCadAutoAnalysisImages = async (args: {
    planDesign: string;
    globalSystemPrompt: string;
    globalConstraints: string;
    controller: AbortController;
  }) => {
    const planDesignVar = String(args.planDesign || "").trim();
    if (!planDesignVar) return false;

    const systemContentTasks = [buildCadTasksSystemContent({
      globalSystemPrompt: args.globalSystemPrompt,
      globalConstraints: args.globalConstraints,
    }), cadOutputLanguageInstruction]
      .filter(Boolean)
      .join("\n\n");

    const analysisMessages = buildCadAnalysisMessages({
      systemContent: systemContentTasks,
      planDesign: planDesignVar,
      outputLanguage: cadOutputLanguage,
    });
    const fallbackTitles = [
      uiLang === "zh" ? "整体方案图" : "Overall Scheme",
      uiLang === "zh" ? "重点策略图" : "Key Strategy",
    ];
    const fallbackPrompts = [
      uiLang === "zh"
        ? "室内装修整体分析图板，展示项目目标、空间范围、功能分区、风格方向、用户核心诉求、已知约束与待确认项。采用清晰的模块分区、箭头关系、色块、标签、图标和关键词注释，突出前期方案沟通，不是 CAD 施工图，不包含施工节点与细部做法。"
        : "Interior renovation overall analysis board, showing project goals, spatial scope, functional zoning, style direction, core user needs, known constraints, and pending confirmations. Clear structure with blocks, arrows, color zones, labels, icons, and keyword callouts. Early-stage design communication style, not a CAD drawing, no construction-detail elements.",
      uiLang === "zh"
        ? "室内装修重点策略图板，展示 3 到 7 个核心策略及其主次关系与执行顺序，包括空间利用、动线优化、收纳、风格统一、采光通透、局部改造优先级与预算控制。使用图标、箭头、关系图与色块表达策略，不是 CAD 图，不包含施工细节。"
        : "Interior renovation key strategy board, showing 3-7 core strategies and their priorities/relations, including space utilization, circulation optimization, storage, style consistency, daylight and openness, local renovation priorities, and budget control. Use icons, arrows, relationship diagrams, and color blocks. Professional communication style, not a CAD drawing, no construction-detail elements.",
    ];

    const settled = await Promise.allSettled(
      analysisMessages.map((entry) =>
        generateChatMessage(entry.messages, chatModel, { signal: args.controller.signal, timeoutMs: 120000 }),
      ),
    );

    const prompts = analysisMessages.map((entry, idx) => {
      const title = fallbackTitles[idx] || (entry.imageId === "overall_analysis" ? "Overall Scheme" : "Key Strategy");
      const fallbackPrompt = fallbackPrompts[idx] || fallbackPrompts[0];
      const response = settled[idx];
      if (response?.status !== "fulfilled") {
        return { title, prompt: fallbackPrompt };
      }
      return {
        title,
        prompt: normalizeAnalysisPromptText(response.value, fallbackPrompt),
      };
    });

    const payload = JSON.stringify({ type: "cad_analysis_images", prompts }, null, 2);
    await runCodeAction(payload, "cad");
    return true;
  };

  const applyCodeFromMessage = async (code: string, language?: string) => {
    const text = String(code || "").trim();
    if (!text) return false;
    if (workspaceId === "cad") {
      const lang = String(language || "").toLowerCase();
      const hasSvgLanguageHint = lang === "svg" || lang === "xml";
      const expectsCanvasChange =
        hasSvgLanguageHint ||
        /<svg[\s/>]/i.test(text) ||
        /"type"\s*:\s*"cad_patch"/i.test(text);
      let parsedType = "";
      if (text.startsWith("{")) {
        try {
          const parsed = JSON.parse(text);
          parsedType = String(parsed?.type || "").trim().toLowerCase();
        } catch {
        }
      }
      const r = await runCodeAction(text, "cad");
      if (!r.ok) {
        toast.error(r.error || (uiLang === "zh" ? "应用失败" : "Apply failed"));
        return false;
      }
      if (expectsCanvasChange && !r.svg) {
        toast.error(uiLang === "zh" ? "未检测到画布更新，请检查补丁内容是否匹配当前SVG。" : "No canvas update detected. Check whether patch matches current SVG.");
        return false;
      }
      if (r.svg) {
        toast.success(uiLang === "zh" ? "已应用到 2D 画布" : "Applied to 2D canvas");
        return true;
      }
      if (parsedType === "cad_plan") {
        toast.success(uiLang === "zh" ? "已应用方案数据" : "Plan applied");
        return true;
      }
      if (parsedType === "cad_bom") {
        toast.success(uiLang === "zh" ? "已应用物料清单" : "BOM applied");
        return true;
      }
      if (parsedType === "cad_images") {
        toast.success(uiLang === "zh" ? "已应用装修图任务" : "Render task applied");
        return true;
      }
      if (parsedType === "cad_analysis_images") {
        toast.success(uiLang === "zh" ? "已应用分析图任务" : "Analysis task applied");
        return true;
      }
      toast.error(uiLang === "zh" ? "未检测到可应用内容" : "No applicable CAD payload detected");
      return false;
    }
    if (workspaceId === "flow") {
      const r = await runCodeAction(text, "flow");
      return !!r.ok;
    }
    const r = await runCodeAction(text, "ppt");
    return !!r.ok;
  };

  const normalizeSvgMarkup = (text: string): string => {
    const decodeBasicHtmlEntities = (value: string) =>
      String(value || "")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&amp;/gi, "&");

    const original = String(text || "").trim();
    const raw = !/<svg[\s/>]/i.test(original) && /&lt;\s*svg[\s\S]*&gt;/i.test(original)
      ? decodeBasicHtmlEntities(original).trim()
      : original;
    if (!raw) return "";
    const start = raw.search(/<svg[\s/>]/i);
    if (start < 0) return "";
    const tail = raw.slice(start);
    const end = tail.toLowerCase().lastIndexOf("</svg>");
    if (end >= 0) return tail.slice(0, end + "</svg>".length).trim();
    return tail.trim();
  };

  const extractSvgCodeBlock = (text: string): string => {
    const raw = String(text || "");
    const re = /```svg\s*([\s\S]*?)```/gi;
    let m: RegExpExecArray | null;
    let last = "";
    while ((m = re.exec(raw))) {
      const candidate = normalizeSvgMarkup(m?.[1] || "");
      if (candidate) last = candidate;
    }
    return last;
  };

  const extractRawSvgBlock = (text: string): string => {
    const raw = String(text || "");
    const re = /<svg[\s\S]*?<\/svg>/gi;
    let m: RegExpExecArray | null;
    let last = "";
    while ((m = re.exec(raw))) {
      const candidate = normalizeSvgMarkup(m?.[0] || "");
      if (candidate) last = candidate;
    }
    return last;
  };

  const extractReplaceSvgFromCadPatchText = (text: string): string => {
    const raw = String(text || "");
    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = jsonRegex.exec(raw))) {
      const jsonText = String(m[1] || "").trim();
      if (!jsonText) continue;
      try {
        const parsed = JSON.parse(jsonText);
        const full = normalizeSvgMarkup(parsed?.full || "");
        if (parsed?.type === "cad_patch" && parsed?.target === "2d_svg" && parsed?.mode === "replace" && full) {
          return full;
        }
      } catch {
      }
    }
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        const full = normalizeSvgMarkup(parsed?.full || "");
        if (parsed?.type === "cad_patch" && parsed?.target === "2d_svg" && parsed?.mode === "replace" && full) {
          return full;
        }
      } catch {
      }
    }
    return "";
  };

  const hasCadPatchPayloadInText = (text: string): boolean => {
    const raw = String(text || "");
    if (!raw.trim()) return false;

    const isCadPatchPayload = (value: any) =>
      value &&
      typeof value === "object" &&
      String(value?.type || "").trim().toLowerCase() === "cad_patch" &&
      String(value?.target || "").trim().toLowerCase() === "2d_svg";

    const jsonRegex = /```json\s*([\s\S]*?)```/g;
    let jm: RegExpExecArray | null;
    while ((jm = jsonRegex.exec(raw))) {
      const jsonText = String(jm[1] || "").trim();
      if (!jsonText) continue;
      try {
        const parsed = JSON.parse(jsonText);
        if (isCadPatchPayload(parsed)) return true;
      } catch {
      }
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (isCadPatchPayload(parsed)) return true;
      } catch {
      }
    }

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (isCadPatchPayload(parsed)) return true;
      } catch {
      }
    }

    return /"type"\s*:\s*"cad_patch"/i.test(raw) && /"target"\s*:\s*"2d_svg"/i.test(raw);
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

    if (workspaceId === "cad") {
      const hasCadPatchPayload = hasCadPatchPayloadInText(fullResponse);
      const svgCandidate =
        extractReplaceSvgFromCadPatchText(fullResponse) ||
        extractSvgCodeBlock(fullResponse) ||
        extractRawSvgBlock(fullResponse);
      if (!hasCadPatchPayload && svgCandidate) {
        await runCodeAction(svgCandidate, "cad");
      }
    } else {
      const svgText = extractSvgCodeBlock(fullResponse);
      if (svgText) {
        await runCodeAction(svgText, "cad");
      }
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

  const buildCadSvgRetryPrompt = (errorText: string, forceReplace: boolean) => {
    const err = String(errorText || "").slice(0, 600);
    if (uiLang === "en") {
      return [
        `The previous cad_patch could not be applied to the current 2D SVG. Reason: ${err}`,
        "",
        "Please retry and strictly follow:",
        "- Output exactly one ```json``` code block with type=cad_patch and target=2d_svg",
        forceReplace
          ? "- This time you MUST use mode=replace and output one complete <svg ...>...</svg> in the full field"
          : "- If exact patch matching is unsafe, use mode=replace and output one complete <svg ...>...</svg> in the full field",
      ].join("\n");
    }
    return [
      `Previous cad_patch could not be applied to current 2D SVG: ${err}`,
      "",
      "Please retry and strictly follow:",
      "- Output exactly one ```json``` code block with type=cad_patch and target=2d_svg",
      forceReplace
        ? "- This time you MUST use mode=replace and output one complete <svg ...>...</svg> in the full field"
        : "- If exact patch matching is unsafe, use mode=replace and output one complete <svg ...>...</svg> in the full field",
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
    cadSvgAutoRetryCountRef.current = 0;

    const normalizedInput = rawInput.trim();
    const referencedPptSlideIds = isPpt
      ? new Set(
          pptInputSegments
            .filter((s): s is { type: "ppt"; slideId: string; label: string; tag: string } => s.type === "ppt")
            .map((s) => s.slideId)
        )
      : new Set<string>();
    const pptDraftSlidesSnapshotAll = isPpt ? pptDraftSlides.slice(0, 12) : [];
    const pptDraftSlidesSnapshot =
      isPpt && referencedPptSlideIds.size > 0
        ? pptDraftSlidesSnapshotAll.filter((s) => referencedPptSlideIds.has(s.slideId))
        : [];
    
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
                 // We embed the image directly in the prompt using Markdown syntax.
                 // This allows the Agent (if it's a VLM) to see it, or at least we provide the Data URL string
                 // which the Agent can echo back in the JSON for the frontend to use.
                 fileTexts.push(`![${file.name}](${dataUrl})`);
                 fileTexts.push(`[Image Attachment: ${file.name}]`);
                 currentUploadedImages.push(dataUrl);
                 currentUploadedImageItems.push({ name: file.name, url: dataUrl });
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

    const effectiveCadPlan = cadApprovedPlanRef.current ?? cadContext?.plan;
    const cadContextText =
      workspaceId === "cad"
        ? [
            effectiveCadPlan ? `Current CAD plan:\n\n\`\`\`json\n${JSON.stringify(effectiveCadPlan, null, 2)}\n\`\`\`` : "",
            typeof cadContext?.svg2d === "string" && cadContext.svg2d.trim()
              ? `Current 2D SVG:\n\n\`\`\`svg\n${cadContext.svg2d}\n\`\`\``
              : "",
            (() => {
              const refs = getCadAnalysisImageRefs();
              if (refs.length === 0) return "";
              return `Current analysis image references:\n${refs.map((ref, idx) => `${idx + 1}. ${ref.title}`).join("\n")}`;
            })(),
          ]
            .filter(Boolean)
            .join("\n\n")
        : "";
    const cadHistoryContextText =
      workspaceId === "cad"
        ? buildCadRouterHistoryContext(messages)
        : "";

    const promptParts = [
      rawInput,
      fileTexts.length > 0 ? fileTexts.join("\n\n") : "",
      pptDraftContextText,
      contextAttachmentsText,
      flowContextText,
      cadContextText,
      cadHistoryContextText,
    ].filter(Boolean);
    const promptContent = promptParts.join("\n\n");
    lastUploadedImagesRef.current = currentUploadedImages;

    const safeTagText = (text: string) =>
      String(text || "").split("|").join(",").split("]]").join("").replace(/\r?\n/g, " ");
    const imageTags = currentUploadedImageItems
      .map((it) => `[[IMAGE|${safeTagText(it.name)}|${it.url}]]`)
      .join("\n");
    const displayParts = [
      imageTags,
      rawInput,
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
      const systemContent = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), cadOutputLanguageInstruction]
        .filter(Boolean)
        .join("\n\n");
      const bomMessages: ChatMessage[] = buildCadBomMessages({ systemContent, planJson, svg2d, outputLanguage: cadOutputLanguage });
      const masterMessages: ChatMessage[] = buildCadImagesMasterMessages({ systemContent, planJson, svg2d, outputLanguage: cadOutputLanguage });

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

        const fallbackTitlesForOutput = cadRenderFallbackTitles;
        const fallbackTitlesForPromptEnglish = cadRenderPromptTitlesEn;

        let masterSchemeJson = "";
        try {
          const masterText = await generateChatMessage(masterMessages, chatModel, { signal: controller.signal, timeoutMs: 120000 });
          const parsedMaster = tryParseJson(masterText);
          if (parsedMaster?.type === "renovation_scheme_master" && parsedMaster?.global_scheme) {
            masterSchemeJson = JSON.stringify(parsedMaster, null, 2);
          }
        } catch {
        }

        const imagesSheetMessages = buildCadImagesSheetMessages({ systemContent, planJson, svg2d, masterSchemeJson, outputLanguage: cadOutputLanguage });

        const settled = await Promise.allSettled(
          imagesSheetMessages.map((s) =>
            generateChatMessage(s.messages, chatModel, { signal: controller.signal, timeoutMs: 120000 })
          )
        );

        const prompts = settled.map((r, idx) => {
          const fallbackTitleForOutput = fallbackTitlesForOutput[idx] || getCadRenderFallbackTitle(uiLang, idx);
          const fallbackTitleForPrompt = fallbackTitlesForPromptEnglish[idx] || "Drawing";
          const onSheetLanguageRule = "All on-sheet labels/notes/title block text must be in English.";
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
            const abortedText = trText("（已中止）", "(Aborted)");
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
      
      const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join('\n\n');

      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...messages,
        { role: 'user', content: promptContent }
      ];

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let fullResponse = '';
      const updater = createThrottledAssistantUpdater();
      await streamChatMessage(apiMessages, (chunk) => {
        fullResponse = chunk;
        updater.push(chunk);
      }, chatModel, controller.signal);
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

          if (content === "1") return "cad_plan_agent";
          if (content === "2") return "cad_svg_agent";
          if (content === "3") return "cad_bom_agent";
          if (content === "4") return "cad_images_agent";
          return "cad_images_agent";
        };

        const normalizeCadAgentName = (name: string | undefined | null): string | null => {
          const n = String(name || "").trim();
          if (!n) return null;
          if (n === "cad_svg_generate_agent" || n === "cad_svg_patch_agent") return "cad_svg_agent";
          if (n === "cad_plan_agent" || n === "cad_svg_agent" || n === "cad_bom_agent" || n === "cad_images_agent") return n;
          return null;
        };

        const routeJsonRegex = /```json\s*([\s\S]*?)```/g;
        let rm: RegExpExecArray | null;
        while ((rm = routeJsonRegex.exec(fullResponse))) {
          const jsonText = String(rm[1] || "").trim();
          if (!jsonText) continue;
          try {
            const parsed = JSON.parse(jsonText);
            if (parsed?.type === "cad_route" && typeof parsed?.agent === "string") {
              const normalized = normalizeCadAgentName(parsed.agent);
              if (normalized) route = { agent: normalized };
              break;
            }
          } catch {
          }
        }

        if (!route?.agent) {
          const agentFromText = resolveCadAgentFromRouteText(fullResponse);
          const normalized = normalizeCadAgentName(agentFromText);
          if (normalized) route = { agent: normalized };
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
                "方案已生成。若满意请回复“生成2D平面图”；不满意请直接说明需要修改的点。",
                "The plan is ready. If it looks good, reply \"Generate 2D floorplan\". If not, tell me what to change."
              );
            }
            if (args.producedHasSvg2d && !args.beforeHasSvg2d) {
              return trText(
                "2D 平面图已生成。如需修改请直接说明；满意请回复“生成装修图”。",
                "The 2D floorplan is generated. Tell me edits if needed; otherwise reply \"Generate renders\"."
              );
            }
            if (args.producedHasImages) {
              return trText(
                "装修图正在生成或更新。下一步可回复“生成BOM清单”。",
                "Renders are being generated or updated. Next, reply \"Generate BOM\"."
              );
            }
            if (args.producedHasBom) {
              return trText(
                "BOM 已生成。你可以继续优化方案、2D或风格，或直接导出文件。",
                "BOM is generated. You can refine the plan, 2D, or style, or export files."
              );
            }
            if (args.agent === "cad_svg_agent" && args.producedHasSvg2d) {
              return trText(
                "2D 已更新。若满意请回复“生成装修图”；否则继续描述要修改的内容。",
                "2D has been updated. If OK, reply \"Generate renders\"; otherwise describe more edits."
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
          const effectiveCadPlan = cadApprovedPlanRef.current ?? cadContext?.plan;
          const planJson = effectiveCadPlan ? JSON.stringify(effectiveCadPlan) : "";
          const svg2d = cadContext?.svg2d || "";

          if (agent === "cad_bom_agent") {
            const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), cadOutputLanguageInstruction]
              .filter(Boolean)
              .join("\n\n");
            const taskMessages = buildCadBomMessages({ systemContent: systemContentTasks, planJson, svg2d, outputLanguage: cadOutputLanguage });

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
            const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), cadOutputLanguageInstruction]
              .filter(Boolean)
              .join("\n\n");
            const masterMessages: ChatMessage[] = buildCadImagesMasterMessages({ systemContent: systemContentTasks, planJson, svg2d, outputLanguage: cadOutputLanguage });

            updateLastAssistant(trText("正在生成图纸提示词...", "Generating drawing prompts..."));

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

            const fallbackTitlesForOutput = cadRenderFallbackTitles;
            const fallbackTitlesForPromptEnglish = cadRenderPromptTitlesEn;

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
              outputLanguage: cadOutputLanguage,
            });

            const settled = await Promise.allSettled(
              imagesSheetMessages.map((s) =>
                generateChatMessage(s.messages, chatModel, { signal: controller.signal, timeoutMs: 120000 })
              )
            );

            const prompts = settled.map((r, idx) => {
              const fallbackTitleForOutput = fallbackTitlesForOutput[idx] || getCadRenderFallbackTitle(uiLang, idx);
              const fallbackTitleForPrompt = fallbackTitlesForPromptEnglish[idx] || "Drawing";
              const onSheetLanguageRule = "All on-sheet labels/notes/title block text must be in English.";
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
            updateLastAssistant(guide || trText("图纸任务已生成。", "Drawing tasks generated."));
            return;
          }

          if (agent === "cad_svg_agent") {
            if (!cadApprovedPlanRef.current && cadContext?.plan) {
              cadApprovedPlanRef.current = cadContext.plan;
            }
            const resolveCadSvgToolFromRouteText = (text: string): "patch" | "replace" | null => {
              const trimmed = String(text || "").trim();
              if (!trimmed) return null;

              let content = trimmed;
              const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
              if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
              content = content.replace(/\s+/g, "");

              if (!/^[1-2]$/.test(content)) return null;
              return content === "1" ? "patch" : "replace";
            };

            const cadSvgRouterSystemContent = [CAD_SVG_AGENT_ROUTER_PROMPT, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction]
              .filter(Boolean)
              .join("\n\n");
            const cadSvgRouterMessages: ChatMessage[] = [
              { role: "system", content: cadSvgRouterSystemContent },
              { role: "user", content: promptContent }
            ];

            let cadSvgRouteFull = "";
            const cadSvgRouteUpdater = createThrottledAssistantUpdater();
            await streamChatMessage(cadSvgRouterMessages, (chunk) => {
              cadSvgRouteFull = chunk;
              cadSvgRouteUpdater.push(chunk);
            }, chatModel, controller.signal);
            cadSvgRouteUpdater.flush();

            let cadSvgSelectedTool: "patch" | "replace" | null = resolveCadSvgToolFromRouteText(cadSvgRouteFull);
            if (!cadSvgSelectedTool) {
              cadSvgSelectedTool = beforeHasSvg2d ? "patch" : "replace";
            }

            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: "" }];
              return prev;
            });

            const runCadSvgTool = async (messages: ChatMessage[]) => {
              let toolFull = "";
              const toolUpdater = createThrottledAssistantUpdater();
              await streamChatMessage(messages, (chunk) => {
                toolFull = chunk;
                toolUpdater.push(chunk);
              }, chatModel, controller.signal);
              toolUpdater.flush();

              let cadPatchFound = false;
              let cadPatchRetryError: string | null = null;
              let producedHasSvg2d = false;
              let appliedSvg = "";

              const jsonRegex = /```json\s*([\s\S]*?)```/g;
              let jm: RegExpExecArray | null;
              while ((jm = jsonRegex.exec(toolFull))) {
                const jsonText = String(jm[1] || "").trim();
                if (!jsonText) continue;

                let parsed: any = null;
                try {
                  parsed = JSON.parse(jsonText);
                } catch {
                }

                const isCadPatch = parsed?.type === "cad_patch" && parsed?.target === "2d_svg";
                if (isCadPatch) cadPatchFound = true;

                const result = await runCodeAction(jsonText, "cad");
                  if (isCadPatch && result.ok) {
                    producedHasSvg2d = true;
                    const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                    if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                  }
                if (isCadPatch && !result.ok && result.retry) {
                  cadPatchRetryError = result.error || "Unknown error";
                }
              }

              if (!cadPatchFound) {
                const trimmed = String(toolFull || "").trim();
                if (trimmed.startsWith("{")) {
                  try {
                    const rawParsed = JSON.parse(trimmed);
                    if (rawParsed?.type === "cad_patch" && rawParsed?.target === "2d_svg") {
                      cadPatchFound = true;
                      const result = await runCodeAction(trimmed, "cad");
                        if (result.ok) {
                          producedHasSvg2d = true;
                          const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                          if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                        }
                      if (!result.ok && result.retry) cadPatchRetryError = result.error || "Unknown error";
                    }
                  } catch {
                  }
                }
              }

              if (!cadPatchFound) {
                const start = toolFull.indexOf("{");
                const end = toolFull.lastIndexOf("}");
                if (start >= 0 && end > start) {
                  const maybeJson = toolFull.slice(start, end + 1).trim();
                  try {
                    const rawParsed = JSON.parse(maybeJson);
                    if (rawParsed?.type === "cad_patch" && rawParsed?.target === "2d_svg") {
                      cadPatchFound = true;
                      const result = await runCodeAction(maybeJson, "cad");
                        if (result.ok) {
                          producedHasSvg2d = true;
                          const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                          if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                        }
                      if (!result.ok && result.retry) cadPatchRetryError = result.error || "Unknown error";
                    }
                  } catch {
                  }
                }
              }

              if (!cadPatchFound) {
                const svgText = extractSvgCodeBlock(toolFull) || extractRawSvgBlock(toolFull);
                if (svgText) {
                  const r = await runCodeAction(svgText, "cad");
                    if (r.ok) {
                      producedHasSvg2d = true;
                      appliedSvg = normalizeSvgMarkup(r.svg || "") || svgText;
                    }
                  if (!r.ok && r.retry) cadPatchRetryError = r.error || "Unknown error";
                }
              }

              if (!producedHasSvg2d && !cadPatchFound) {
                const fallbackSvg = extractReplaceSvgFromCadPatchText(toolFull) || extractSvgCodeBlock(toolFull) || extractRawSvgBlock(toolFull);
                if (fallbackSvg) {
                  const r = await runCodeAction(fallbackSvg, "cad");
                    if (r.ok) {
                      producedHasSvg2d = true;
                      appliedSvg = normalizeSvgMarkup(r.svg || "") || fallbackSvg;
                    }
                  if (!r.ok && r.retry) cadPatchRetryError = r.error || "Unknown error";
                }
              }

              return { toolFull, cadPatchFound, cadPatchRetryError, producedHasSvg2d, appliedSvg };
            };

            const getCadSvgToolPrompt = (tool: "patch" | "replace") =>
              tool === "patch" ? CAD_SVG_FLOW_PATCH_AGENT_PROMPT : CAD_SVG_FLOW_REPLACE_AGENT_PROMPT;

            let cadSvgToolMessagesBase: ChatMessage[] = [
              { role: "system", content: [getCadSvgToolPrompt(cadSvgSelectedTool), globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n") },
              { role: "user", content: buildCadSvgUserContent(promptContent) as any }
            ];

            let cadSvgRun = await runCadSvgTool(cadSvgToolMessagesBase);
            let cadSvgToolFull = cadSvgRun.toolFull;
            let cadSvgPatchFound = cadSvgRun.cadPatchFound;
            let cadSvgRetryError = cadSvgRun.cadPatchRetryError;
            let producedHasSvg2d = cadSvgRun.producedHasSvg2d;
            let appliedSvg = cadSvgRun.appliedSvg;

            while (
              cadSvgSelectedTool === "patch" &&
              cadSvgPatchFound &&
              cadSvgRetryError &&
              !controller.signal.aborted &&
              cadSvgAutoRetryCountRef.current < MAX_CAD_SVG_AUTO_RETRY
            ) {
              cadSvgAutoRetryCountRef.current += 1;
              const forceReplace = cadSvgAutoRetryCountRef.current >= MAX_CAD_SVG_AUTO_RETRY;

              if (forceReplace && cadSvgSelectedTool === "patch") {
                cadSvgSelectedTool = "replace";
                cadSvgToolMessagesBase = [
                  { role: "system", content: [getCadSvgToolPrompt("replace"), globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n") },
                  { role: "user", content: buildCadSvgUserContent(promptContent) as any }
                ];
              }

              const retryPrompt = buildCadSvgRetryPrompt(cadSvgRetryError, forceReplace);
              const retryMessages: ChatMessage[] = [
                ...cadSvgToolMessagesBase,
                { role: "assistant", content: cadSvgToolFull },
                { role: "user", content: retryPrompt },
              ];

              setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
              cadSvgRun = await runCadSvgTool(retryMessages);
              cadSvgToolFull = cadSvgRun.toolFull;
              cadSvgPatchFound = cadSvgRun.cadPatchFound;
              cadSvgRetryError = cadSvgRun.cadPatchRetryError;
              producedHasSvg2d = cadSvgRun.producedHasSvg2d;
              appliedSvg = cadSvgRun.appliedSvg;
              cadSvgToolMessagesBase = retryMessages;
            }

            const guide = buildCadNextStepGuide({
              agent,
              beforeHasPlan,
              beforeHasSvg2d,
              producedHasPlan: false,
              producedHasSvg2d,
              producedHasImages: false,
              producedHasBom: false,
            });
            let assistantOutput = cadSvgToolFull;
            const hasSvgFence = /```svg\s*[\s\S]*?```/i.test(assistantOutput);
            const hasCadPatchJson = /```json\s*[\s\S]*?"type"\s*:\s*"cad_patch"[\s\S]*?```/i.test(assistantOutput);
            if (producedHasSvg2d && !hasSvgFence && !hasCadPatchJson) {
                const svgForDisplay = normalizeSvgMarkup(appliedSvg)
                  ? normalizeSvgMarkup(appliedSvg)
                  : extractReplaceSvgFromCadPatchText(cadSvgToolFull) || extractRawSvgBlock(cadSvgToolFull);
              if (svgForDisplay) assistantOutput = `${assistantOutput}\n\n\`\`\`svg\n${svgForDisplay}\n\`\`\``;
            }
            if (guide) updateLastAssistant(`${assistantOutput}\n\n${guide}`);
            else updateLastAssistant(assistantOutput);
            return;
          }

          const agentPrompt = agent === "cad_plan_agent" ? CAD_PLAN_AGENT_PROMPT : "";

          if (!agentPrompt) {
            updateLastAssistant(trText(`未识别的 CAD 子智能体：${agent}`, `Unrecognized CAD sub-agent: ${agent}`));
            return;
          }

          const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n");
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
            const jsonRegex = /```json\s*([\s\S]*?)```/g;
            let jm: RegExpExecArray | null;
            while ((jm = jsonRegex.exec(routedFull))) {
              const jsonText = String(jm[1] || "").trim();
              if (!jsonText) continue;
              await runCodeAction(jsonText, "cad");
            }

            let producedHasSvg2d = false;
            const hasCadPatchPayload = hasCadPatchPayloadInText(routedFull);
            const svgCandidate =
              extractReplaceSvgFromCadPatchText(routedFull) ||
              extractSvgCodeBlock(routedFull) ||
              extractRawSvgBlock(routedFull);
            if (!hasCadPatchPayload && svgCandidate) {
              const svgResult = await runCodeAction(svgCandidate, "cad");
              producedHasSvg2d = !!svgResult.ok;
            }

            const producedHasPlan = /"type"\s*:\s*"cad_plan"/.test(routedFull);
            const producedHasImages = /"type"\s*:\s*"cad_images"/.test(routedFull);
            const producedHasBom = /"type"\s*:\s*"cad_bom"/.test(routedFull);
            let autoAnalysisRan = false;
            if (agent === "cad_plan_agent" && producedHasPlan && !controller.signal.aborted) {
              cadApprovedPlanRef.current = null;
              const latestPlanPayload = extractCadPlanPayload(routedFull);
              const latestPlanJson = latestPlanPayload ? JSON.stringify(latestPlanPayload) : planJson;
              if (latestPlanJson) {
                updateLastAssistant(
                  `${routedFull}\n\n${trText("方案已更新，正在并发生成整体分析图和重点策略图...", "Plan updated. Generating overall analysis and key strategy images in parallel...")}`,
                );
                autoAnalysisRan = await runCadAutoAnalysisImages({
                  planDesign: latestPlanJson,
                  globalSystemPrompt,
                  globalConstraints,
                  controller,
                });
              }
            }
            const guide = buildCadNextStepGuide({
              agent,
              beforeHasPlan,
              beforeHasSvg2d,
              producedHasPlan,
              producedHasSvg2d,
              producedHasImages,
              producedHasBom,
            });
            const autoAnalysisGuide =
              autoAnalysisRan
                ? trText(
                    "分析图已按最新方案并发更新。若满意请回复“生成2D平面图”；不满意请继续提出修改意见。",
                    "Analysis images are refreshed from the latest plan. If satisfied, reply \"Generate 2D floorplan\"; otherwise continue refining requirements.",
                  )
                : "";
            const mergedGuide = [guide, autoAnalysisGuide].filter(Boolean).join("\n\n");
            if (mergedGuide) updateLastAssistant(`${routedFull}\n\n${mergedGuide}`);
            else updateLastAssistant(routedFull);
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
            const abortedText = trText("（已中止）", "(Aborted)");
            const next = last.content ? `${last.content}\n\n${abortedText}` : abortedText;
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          }
          return [...prev, { role: 'assistant', content: trText("（已中止）", "(Aborted)") }];
        });
        return;
      }
      setMessages(prev => {
        const last = prev[prev.length - 1];
        const errorText = trText("抱歉，发生错误。请检查 API Key 设置。", "Sorry, an error occurred. Please check API key settings.");
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
    const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join('\n\n');
    const lastUserText = String(baseMessages[baseMessages.length - 1]?.content || "");
    const flowContextText =
      workspaceId === "flow" && typeof flowContext?.xml === "string" && flowContext.xml.trim()
        ? `Current diagram XML:\n\n\`\`\`xml\n${flowContext.xml}\n\`\`\``
        : "";
    const effectiveCadPlan = cadApprovedPlanRef.current ?? cadContext?.plan;
    const cadContextText =
      workspaceId === "cad"
        ? [
            effectiveCadPlan ? `Current CAD plan:\n\n\`\`\`json\n${JSON.stringify(effectiveCadPlan, null, 2)}\n\`\`\`` : "",
            typeof cadContext?.svg2d === "string" && cadContext.svg2d.trim()
              ? `Current 2D SVG:\n\n\`\`\`svg\n${cadContext.svg2d}\n\`\`\``
              : "",
            (() => {
              const refs = getCadAnalysisImageRefs();
              if (refs.length === 0) return "";
              return `Current analysis image references:\n${refs.map((ref, idx) => `${idx + 1}. ${ref.title}`).join("\n")}`;
            })(),
          ]
            .filter(Boolean)
            .join("\n\n")
        : "";
    const cadHistoryContextText =
      workspaceId === "cad"
        ? buildCadRouterHistoryContext(baseMessages.slice(0, -1))
        : "";
    const promptContent = [lastUserText, flowContextText, cadContextText, cadHistoryContextText].filter(Boolean).join("\n\n");

    const apiMessages: ChatMessage[] = [
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
      await streamChatMessage(apiMessages, (chunk) => {
        fullResponse = chunk;
        updater.push(chunk);
      }, chatModel, controller.signal);
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
            const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n");
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

            if (content === "1") return "cad_plan_agent";
            if (content === "2") return "cad_svg_agent";
            if (content === "3") return "cad_bom_agent";
            if (content === "4") return "cad_images_agent";
            return "cad_images_agent";
          };

          const normalizeCadAgentName = (name: string | undefined | null): string | null => {
            const n = String(name || "").trim();
            if (!n) return null;
            if (n === "cad_svg_generate_agent" || n === "cad_svg_patch_agent") return "cad_svg_agent";
            if (n === "cad_plan_agent" || n === "cad_svg_agent" || n === "cad_bom_agent" || n === "cad_images_agent") return n;
            return null;
          };

          const routeJsonRegex = /```json\s*([\s\S]*?)```/g;
          let rm: RegExpExecArray | null;
          while ((rm = routeJsonRegex.exec(fullResponse))) {
            const jsonText = String(rm[1] || "").trim();
            if (!jsonText) continue;
            try {
              const parsed = JSON.parse(jsonText);
              if (parsed?.type === "cad_route" && typeof parsed?.agent === "string") {
                const normalized = normalizeCadAgentName(parsed.agent);
                if (normalized) route = { agent: normalized };
                break;
              }
            } catch {
            }
          }

          if (!route?.agent) {
            const agentFromText = resolveCadAgentFromRouteText(fullResponse);
            const normalized = normalizeCadAgentName(agentFromText);
            if (normalized) route = { agent: normalized };
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
                  "方案已生成。若满意请回复“生成2D平面图”；不满意请直接说明需要修改的点。",
                  "The plan is ready. If it looks good, reply \"Generate 2D floorplan\". If not, tell me what to change."
                );
              }
              if (args.producedHasSvg2d && !args.beforeHasSvg2d) {
                return trText(
                  "2D 平面图已生成。如需修改请直接说明；满意请回复“生成装修图”。",
                  "The 2D floorplan is generated. Tell me edits if needed; otherwise reply \"Generate renders\"."
                );
              }
              if (args.producedHasImages) {
                return trText(
                  "装修图正在生成或更新。下一步可回复“生成BOM清单”。",
                  "Renders are being generated or updated. Next, reply \"Generate BOM\"."
                );
              }
              if (args.producedHasBom) {
                return trText(
                  "BOM 已生成。你可以继续优化方案、2D或风格，或直接导出文件。",
                  "BOM is generated. You can refine the plan, 2D, or style, or export files."
                );
              }
              if (args.agent === "cad_svg_agent" && args.producedHasSvg2d) {
                return trText(
                  "2D 已更新。若满意请回复“生成装修图”；否则继续描述要修改的内容。",
                  "2D has been updated. If OK, reply \"Generate renders\"; otherwise describe more edits."
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
            const effectiveCadPlan = cadApprovedPlanRef.current ?? cadContext?.plan;
            const planJson = effectiveCadPlan ? JSON.stringify(effectiveCadPlan) : "";
            const svg2d = cadContext?.svg2d || "";

            if (agent === "cad_bom_agent") {
              const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), cadOutputLanguageInstruction]
                .filter(Boolean)
                .join("\n\n");
              const taskMessages = buildCadBomMessages({ systemContent: systemContentTasks, planJson, svg2d, outputLanguage: cadOutputLanguage });

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
              const systemContentTasks = [buildCadTasksSystemContent({ globalSystemPrompt, globalConstraints }), cadOutputLanguageInstruction]
                .filter(Boolean)
                .join("\n\n");
              const masterMessages: ChatMessage[] = buildCadImagesMasterMessages({ systemContent: systemContentTasks, planJson, svg2d, outputLanguage: cadOutputLanguage });

              updateLastAssistant(trText("正在生成图纸提示词...", "Generating drawing prompts..."));

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

              const fallbackTitlesForOutput = cadRenderFallbackTitles;
              const fallbackTitlesForPromptEnglish = cadRenderPromptTitlesEn;

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
                outputLanguage: cadOutputLanguage,
              });

              const settled = await Promise.allSettled(
                imagesSheetMessages.map((s) =>
                  generateChatMessage(s.messages, chatModel, { signal: controller.signal, timeoutMs: 120000 })
                )
              );

              const prompts = settled.map((r, idx) => {
                const fallbackTitleForOutput = fallbackTitlesForOutput[idx] || getCadRenderFallbackTitle(uiLang, idx);
                const fallbackTitleForPrompt = fallbackTitlesForPromptEnglish[idx] || "Drawing";
                const onSheetLanguageRule = "All on-sheet labels/notes/title block text must be in English.";
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
              updateLastAssistant(guide || trText("图纸任务已生成。", "Drawing tasks generated."));
              return;
            }

            if (agent === "cad_svg_agent") {
              if (!cadApprovedPlanRef.current && cadContext?.plan) {
                cadApprovedPlanRef.current = cadContext.plan;
              }
              const resolveCadSvgToolFromRouteText = (text: string): "patch" | "replace" | null => {
                const trimmed = String(text || "").trim();
                if (!trimmed) return null;

                let content = trimmed;
                const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
                if (fenceMatch && fenceMatch[1]) content = fenceMatch[1].trim();
                content = content.replace(/\s+/g, "");

                if (!/^[1-2]$/.test(content)) return null;
                return content === "1" ? "patch" : "replace";
              };

              const cadSvgRouterSystemContent = [CAD_SVG_AGENT_ROUTER_PROMPT, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction]
                .filter(Boolean)
                .join("\n\n");
              const cadSvgRouterMessages: ChatMessage[] = [
                { role: "system", content: cadSvgRouterSystemContent },
                { role: "user", content: promptContent }
              ];

              let cadSvgRouteFull = "";
              const cadSvgRouteUpdater = createThrottledAssistantUpdater();
              await streamChatMessage(cadSvgRouterMessages, (chunk) => {
                cadSvgRouteFull = chunk;
                cadSvgRouteUpdater.push(chunk);
              }, chatModel, controller.signal);
              cadSvgRouteUpdater.flush();

              let cadSvgSelectedTool: "patch" | "replace" | null = resolveCadSvgToolFromRouteText(cadSvgRouteFull);
              if (!cadSvgSelectedTool) {
                cadSvgSelectedTool = beforeHasSvg2d ? "patch" : "replace";
              }

              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") return [...prev.slice(0, -1), { role: "assistant", content: "" }];
                return prev;
              });

              const runCadSvgTool = async (messages: ChatMessage[]) => {
                let toolFull = "";
                const toolUpdater = createThrottledAssistantUpdater();
                await streamChatMessage(messages, (chunk) => {
                  toolFull = chunk;
                  toolUpdater.push(chunk);
                }, chatModel, controller.signal);
                toolUpdater.flush();

                let cadPatchFound = false;
                let cadPatchRetryError: string | null = null;
                let producedHasSvg2d = false;
                let appliedSvg = "";

                const jsonRegex = /```json\s*([\s\S]*?)```/g;
                let jm: RegExpExecArray | null;
                while ((jm = jsonRegex.exec(toolFull))) {
                  const jsonText = String(jm[1] || "").trim();
                  if (!jsonText) continue;

                  let parsed: any = null;
                  try {
                    parsed = JSON.parse(jsonText);
                  } catch {
                  }

                  const isCadPatch = parsed?.type === "cad_patch" && parsed?.target === "2d_svg";
                  if (isCadPatch) cadPatchFound = true;

                  const result = await runCodeAction(jsonText, "cad");
                  if (isCadPatch && result.ok) {
                    producedHasSvg2d = true;
                    const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                    if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                  }
                  if (isCadPatch && !result.ok && result.retry) {
                    cadPatchRetryError = result.error || "Unknown error";
                  }
                }

                if (!cadPatchFound) {
                  const trimmed = String(toolFull || "").trim();
                  if (trimmed.startsWith("{")) {
                    try {
                      const rawParsed = JSON.parse(trimmed);
                      if (rawParsed?.type === "cad_patch" && rawParsed?.target === "2d_svg") {
                        cadPatchFound = true;
                        const result = await runCodeAction(trimmed, "cad");
                      if (result.ok) {
                        producedHasSvg2d = true;
                        const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                        if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                      }
                        if (!result.ok && result.retry) cadPatchRetryError = result.error || "Unknown error";
                      }
                    } catch {
                    }
                  }
                }

                if (!cadPatchFound) {
                  const start = toolFull.indexOf("{");
                  const end = toolFull.lastIndexOf("}");
                  if (start >= 0 && end > start) {
                    const maybeJson = toolFull.slice(start, end + 1).trim();
                    try {
                      const rawParsed = JSON.parse(maybeJson);
                      if (rawParsed?.type === "cad_patch" && rawParsed?.target === "2d_svg") {
                        cadPatchFound = true;
                        const result = await runCodeAction(maybeJson, "cad");
                      if (result.ok) {
                        producedHasSvg2d = true;
                        const normalizedAppliedSvg = normalizeSvgMarkup(result.svg || "");
                        if (normalizedAppliedSvg) appliedSvg = normalizedAppliedSvg;
                      }
                        if (!result.ok && result.retry) cadPatchRetryError = result.error || "Unknown error";
                      }
                    } catch {
                    }
                  }
                }

                if (!cadPatchFound) {
                  const svgText = extractSvgCodeBlock(toolFull) || extractRawSvgBlock(toolFull);
                  if (svgText) {
                    const r = await runCodeAction(svgText, "cad");
                  if (r.ok) {
                    producedHasSvg2d = true;
                    appliedSvg = normalizeSvgMarkup(r.svg || "") || svgText;
                  }
                    if (!r.ok && r.retry) cadPatchRetryError = r.error || "Unknown error";
                  }
                }

                if (!producedHasSvg2d && !cadPatchFound) {
                  const fallbackSvg = extractReplaceSvgFromCadPatchText(toolFull) || extractSvgCodeBlock(toolFull) || extractRawSvgBlock(toolFull);
                  if (fallbackSvg) {
                    const r = await runCodeAction(fallbackSvg, "cad");
                  if (r.ok) {
                    producedHasSvg2d = true;
                    appliedSvg = normalizeSvgMarkup(r.svg || "") || fallbackSvg;
                  }
                    if (!r.ok && r.retry) cadPatchRetryError = r.error || "Unknown error";
                  }
                }

                return { toolFull, cadPatchFound, cadPatchRetryError, producedHasSvg2d, appliedSvg };
              };

              const getCadSvgToolPrompt = (tool: "patch" | "replace") =>
                tool === "patch" ? CAD_SVG_FLOW_PATCH_AGENT_PROMPT : CAD_SVG_FLOW_REPLACE_AGENT_PROMPT;

              let cadSvgToolMessagesBase: ChatMessage[] = [
                { role: "system", content: [getCadSvgToolPrompt(cadSvgSelectedTool), globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n") },
                { role: "user", content: buildCadSvgUserContent(promptContent) as any }
              ];

              let cadSvgRun = await runCadSvgTool(cadSvgToolMessagesBase);
              let cadSvgToolFull = cadSvgRun.toolFull;
              let cadSvgPatchFound = cadSvgRun.cadPatchFound;
              let cadSvgRetryError = cadSvgRun.cadPatchRetryError;
              let producedHasSvg2d = cadSvgRun.producedHasSvg2d;
              let appliedSvg = cadSvgRun.appliedSvg;

              while (
                cadSvgSelectedTool === "patch" &&
                cadSvgPatchFound &&
                cadSvgRetryError &&
                !controller.signal.aborted &&
                cadSvgAutoRetryCountRef.current < MAX_CAD_SVG_AUTO_RETRY
              ) {
                cadSvgAutoRetryCountRef.current += 1;
                const forceReplace = cadSvgAutoRetryCountRef.current >= MAX_CAD_SVG_AUTO_RETRY;

                if (forceReplace && cadSvgSelectedTool === "patch") {
                  cadSvgSelectedTool = "replace";
                  cadSvgToolMessagesBase = [
                    { role: "system", content: [getCadSvgToolPrompt("replace"), globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n") },
                    { role: "user", content: buildCadSvgUserContent(promptContent) as any }
                  ];
                }

                const retryPrompt = buildCadSvgRetryPrompt(cadSvgRetryError, forceReplace);
                const retryMessages: ChatMessage[] = [
                  ...cadSvgToolMessagesBase,
                  { role: "assistant", content: cadSvgToolFull },
                  { role: "user", content: retryPrompt },
                ];

                setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
                cadSvgRun = await runCadSvgTool(retryMessages);
                cadSvgToolFull = cadSvgRun.toolFull;
                cadSvgPatchFound = cadSvgRun.cadPatchFound;
                cadSvgRetryError = cadSvgRun.cadPatchRetryError;
                producedHasSvg2d = cadSvgRun.producedHasSvg2d;
                appliedSvg = cadSvgRun.appliedSvg;
                cadSvgToolMessagesBase = retryMessages;
              }

              const guide = buildCadNextStepGuide({
                agent,
                beforeHasPlan,
                beforeHasSvg2d,
                producedHasPlan: false,
                producedHasSvg2d,
                producedHasImages: false,
                producedHasBom: false,
              });
              let assistantOutput = cadSvgToolFull;
              const hasSvgFence = /```svg\s*[\s\S]*?```/i.test(assistantOutput);
              const hasCadPatchJson = /```json\s*[\s\S]*?"type"\s*:\s*"cad_patch"[\s\S]*?```/i.test(assistantOutput);
              if (producedHasSvg2d && !hasSvgFence && !hasCadPatchJson) {
              const svgForDisplay = normalizeSvgMarkup(appliedSvg)
                ? normalizeSvgMarkup(appliedSvg)
                : extractReplaceSvgFromCadPatchText(cadSvgToolFull) || extractRawSvgBlock(cadSvgToolFull);
                if (svgForDisplay) assistantOutput = `${assistantOutput}\n\n\`\`\`svg\n${svgForDisplay}\n\`\`\``;
              }
              if (guide) updateLastAssistant(`${assistantOutput}\n\n${guide}`);
              else updateLastAssistant(assistantOutput);
              return;
            }

            const agentPrompt = agent === "cad_plan_agent" ? CAD_PLAN_AGENT_PROMPT : "";

            if (!agentPrompt) {
              updateLastAssistant(trText(`未识别的 CAD 子智能体：${agent}`, `Unrecognized CAD sub-agent: ${agent}`));
              return;
            }

            const routedSystemContent = [agentPrompt, globalSystemPrompt, globalConstraints, cadOutputLanguageInstruction].filter(Boolean).join("\n\n");
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
              const jsonRegex = /```json\s*([\s\S]*?)```/g;
              let jm: RegExpExecArray | null;
              while ((jm = jsonRegex.exec(routedFull))) {
                const jsonText = String(jm[1] || "").trim();
                if (!jsonText) continue;
                await runCodeAction(jsonText, "cad");
              }

              let producedHasSvg2d = false;
              const hasCadPatchPayload = hasCadPatchPayloadInText(routedFull);
              const svgCandidate =
                extractReplaceSvgFromCadPatchText(routedFull) ||
                extractSvgCodeBlock(routedFull) ||
                extractRawSvgBlock(routedFull);
              if (!hasCadPatchPayload && svgCandidate) {
                const svgResult = await runCodeAction(svgCandidate, "cad");
                producedHasSvg2d = !!svgResult.ok;
              }

              const producedHasPlan = /"type"\s*:\s*"cad_plan"/.test(routedFull);
              const producedHasImages = /"type"\s*:\s*"cad_images"/.test(routedFull);
              const producedHasBom = /"type"\s*:\s*"cad_bom"/.test(routedFull);
              let autoAnalysisRan = false;
              if (agent === "cad_plan_agent" && producedHasPlan && !controller.signal.aborted) {
                cadApprovedPlanRef.current = null;
                const latestPlanPayload = extractCadPlanPayload(routedFull);
                const latestPlanJson = latestPlanPayload ? JSON.stringify(latestPlanPayload) : planJson;
                if (latestPlanJson) {
                  updateLastAssistant(
                    `${routedFull}\n\n${trText("方案已更新，正在并发生成整体分析图和重点策略图...", "Plan updated. Generating overall analysis and key strategy images in parallel...")}`,
                  );
                  autoAnalysisRan = await runCadAutoAnalysisImages({
                    planDesign: latestPlanJson,
                    globalSystemPrompt,
                    globalConstraints,
                    controller,
                  });
                }
              }
              const guide = buildCadNextStepGuide({
                agent,
                beforeHasPlan,
                beforeHasSvg2d,
                producedHasPlan,
                producedHasSvg2d,
                producedHasImages,
                producedHasBom,
              });
              const autoAnalysisGuide =
                autoAnalysisRan
                  ? trText(
                      "分析图已按最新方案并发更新。若满意请回复“生成2D平面图”；不满意请继续提出修改意见。",
                      "Analysis images are refreshed from the latest plan. If satisfied, reply \"Generate 2D floorplan\"; otherwise continue refining requirements.",
                    )
                  : "";
              const mergedGuide = [guide, autoAnalysisGuide].filter(Boolean).join("\n\n");
              if (mergedGuide) updateLastAssistant(`${routedFull}\n\n${mergedGuide}`);
              else updateLastAssistant(routedFull);
            }
            return;
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

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), { role: 'assistant', content: "Sorry, an error occurred. Please check API key settings." }];
        }
        return [...prev, { role: 'assistant', content: "Sorry, an error occurred. Please check API key settings." }];
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
    cadSvgAutoRetryCountRef.current = 0;
    cadApprovedPlanRef.current = null;
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
      if (/^\[\[IMAGE\|([^|]*)\|([\s\S]+)\]\]$/.test(line) || /^\[\[PPT_SLIDE\|(\d+)\|(.*)\]\]$/.test(line)) {
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
    cadSvgAutoRetryCountRef.current = 0;
    cadApprovedPlanRef.current = null;
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
            <span className="text-base font-semibold tracking-tight whitespace-nowrap">{panelTitle}</span>
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
            onApplyCode={applyCodeFromMessage}
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
                                  title={trText("移除附件", "Remove attachment")}
                                  aria-label={trText("移除附件", "Remove attachment")}
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
      {!hideHistoryButton && (
        <HistoryDialog 
          showHistory={showHistory} 
          onToggleHistory={setShowHistory} 
          history={history}
          onRestore={(item) => onRestore && onRestore(item)}
          onClear={() => {
            onClearVersionHistory?.();
          }}
        />
      )}
      <ResetWarningModal
        open={showResetWarning}
        onOpenChange={setShowResetWarning}
        onClear={clearHistory}
      />
    </div>
  );
}

