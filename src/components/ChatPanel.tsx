import React, { useState, useRef, useEffect } from 'react';
import { Bot, Trash2, History, Settings2, SidebarClose, SidebarOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChatMessage, ChatMessage, getAIConfig } from '@/lib/ai-client';
import { DRAWIO_SYSTEM_PROMPT } from '@/lib/system-prompts';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessageDisplay, UIMessage } from '@/components/ChatMessageDisplay';
import { GlobalConstraintsDialog, STORAGE_GLOBAL_CONSTRAINTS_KEY } from '@/components/global-constraints-dialog';
import { HistoryDialog, HistoryItem } from '@/components/history-dialog';
import { ResetWarningModal } from '@/components/reset-warning-modal';
import { useFileProcessor } from '@/lib/use-file-processor';
import { buildCadBomMessages, buildCadImagesMessages, buildCadTasksSystemContent } from '@/lib/cad-tasks';

interface Attachment {
  id: string;
  type: 'xml' | 'python' | 'json' | 'image' | 'text';
  content: string;
  name: string;
}

interface ChatPanelProps {
  className?: string;
  attachments?: Attachment[];
  onRemoveAttachment?: (id: string) => void;
  pptDraftSlides?: Array<{ id: string; slideId: string; title: string; json: string; kind: "outline" | "slide_image"; imageUrl?: string }>;
  onRemovePptDraftSlide?: (id: string) => void;
  onClearPptDraftSlides?: () => void;
  onCodeAction?: (code: string, type: 'flow' | 'cad' | 'ppt') => void;
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
}

const STORAGE_KEY_PREFIX = 'chat_history_v2_';

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
    title = "AI 助手",
    inputPlaceholder,
    history = [],
    onRestore,
    onClearVersionHistory,
    onClearAttachments,
    cadContext
}: ChatPanelProps) {
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
    return initialMessages.length > 0 ? initialMessages : [
        { role: 'assistant', content: '你好！我是你的 AI 助手。请告诉我你的需求。' }
    ];
  });

  const [input, setInput] = useState('');
  const [pptInputSegments, setPptInputSegments] = useState<Array<{ type: "text"; text: string } | { type: "ppt"; slideId: string; label: string; tag: string }>>([
    { type: "text", text: "" }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showGlobalConstraints, setShowGlobalConstraints] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  
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
    const m = String(slideId || "").match(/(\d+)/);
    const n = m ? Number(m[1]) : NaN;
    if (!Number.isNaN(n)) return title ? `第 ${n} 页：${title}` : `第 ${n} 页`;
    return title || slideId;
  };

  const getPptTag = (slideId: string, title: string) => {
    const m = String(slideId || "").match(/(\d+)/);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isNaN(n)) return "";
    const safeTitle = String(title || "").split("|").join("／").split("]]").join("】");
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
    const normalized = String(text || "").replace(/[｜]/g, "|");
    const lines = normalized.split(/\r?\n/);
    for (let i = 0; i < lines.length - 2; i += 1) {
      const header = lines[i];
      const sep = lines[i + 1];
      if (!header.includes("|")) continue;
      if (!/^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(sep)) continue;

      const parseRow = (line: string) => {
        const trimmed = line.trim();
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
    let next = content.replace(/```(?:python|py|python3)\s*[\s\S]*?```/g, "（已在后台推导完成）");
    next = next
      .split("\n")
      .filter((line) => !/freecad/i.test(line))
      .join("\n");
    next = next.replace(/(?:^|\n)1\.\s*FreeCAD[\s\S]*?(?=\n\d+\.\s|$)/gi, "\n");
    return next.replace(/```json\s*([\s\S]*?)```/g, (full, inner) => {
      const text = String(inner || "").trim();
      if (!text) return full;
      if (text.includes('"type"') && text.includes('"cad_images"')) {
        return "（已提交装修图生成任务）";
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
          if (summary) lines.push(`方案概述：${summary}`);
          if (style) lines.push(`风格：${style}`);
          if (rooms.length > 0) lines.push(`空间：${rooms.map((r: any) => String(r?.name || r?.type || "")).filter(Boolean).join("、")}`);
          if (assumptions.length > 0) lines.push(`假设：${assumptions.join("；")}`);
          if (constraints.length > 0) lines.push(`约束：${constraints.join("；")}`);
          return lines.length > 0 ? lines.join("\n") : "（已生成方案）";
        } catch {
          return "（已生成方案）";
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
    localStorage.setItem(storageKey, JSON.stringify(messages));
    onMessagesChange?.(messages);
  }, [messages, storageKey, onMessagesChange]);

  const clearHistory = () => {
    const newMsgs: ChatMessage[] = [
        { role: 'assistant', content: '你好！对话记录已清空。' }
    ];
    setMessages(newMsgs);
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
      { role: 'assistant', content: '你好！新对话已开始。请告诉我你的需求。' }
    ];
    setMessages(newMsgs);
    try {
      localStorage.removeItem(storageKey);
    } catch {
    }
  };

  const handleSend = async () => {
    const isPpt = workspaceId === "ppt";
    const rawInput = isPpt
      ? pptInputSegments
          .map((s) => (s.type === "text" ? s.text : s.tag))
          .join("")
      : input;
    if ((!rawInput.trim() && files.length === 0 && attachments.length === 0 && pptDraftSlides.length === 0) || isLoading) return;

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
      rawInput,
      fileTexts.length > 0 ? fileTexts.join("\n\n") : "",
      pptDraftContextText,
      contextAttachmentsText
    ].filter(Boolean);
    const promptContent = promptParts.join("\n\n");
    lastUploadedImagesRef.current = currentUploadedImages;

    const safeTagText = (text: string) =>
      String(text || "").split("|").join("／").split("]]").join("】").replace(/\r?\n/g, " ");
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

    if (workspaceId === "cad" && mode === "text" && /确认\s*2d|满意|生成\s*装修|生成\s*物料|cad_ready_for_export/i.test(normalizedInput)) {
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
      const systemContent = buildCadTasksSystemContent({ systemPrompt, globalSystemPrompt, globalConstraints });
      const bomMessages: ChatMessage[] = buildCadBomMessages({ systemContent, planJson, svg2d });
      const imagesMessages: ChatMessage[] = buildCadImagesMessages({ systemContent, planJson, svg2d });

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
        await streamChatMessage(imagesMessages, (chunk) => {
          imagesFull = chunk;
        }, chatModel, controller.signal);
        if (imagesFull) emitCadJson(imagesFull);
      })();

      try {
        await Promise.allSettled([bomTask, imagesTask]);
        if (controller.signal.aborted) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role !== 'assistant') return prev;
            const next = last.content ? `${last.content}\n\n（已中断）` : "（已中断）";
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
      
      if (fullResponse) {
        // Match XML
        const xmlMatch = fullResponse.match(/```xml\n([\s\S]*?)\n```/);
        if (xmlMatch && xmlMatch[1]) {
          const xml = xmlMatch[1];
          onCodeAction?.(xml, 'flow');
        }

        // Match Python (not used by CAD; CAD uses background agents)
        const pyMatch = fullResponse.match(/```python\n([\s\S]*?)\n```/);
        if (pyMatch && pyMatch[1] && workspaceId !== "cad") {
          onCodeAction?.(pyMatch[1], 'cad');
        }

        if (workspaceId === "cad") {
          const jsMatch = fullResponse.match(/```(javascript|js)\n([\s\S]*?)\n```/);
          if (jsMatch && jsMatch[2]) {
            onCodeAction?.(jsMatch[2], 'cad');
          }
        }
        
        // Match SVG (for CAD)
        const svgMatch = fullResponse.match(/```svg\n([\s\S]*?)\n```/);
        if (svgMatch && svgMatch[1]) {
           onCodeAction?.(svgMatch[1], 'cad');
        }

        // Match JSON (PPT/CAD)
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
                      onCodeAction?.(JSON.stringify(parsed), 'ppt');
                  } else {
                      onCodeAction?.(jsonText, 'ppt');
                  }
              } catch {
                  onCodeAction?.(jsonText, 'ppt');
              }
          } else {
             onCodeAction?.(jsonText, workspaceId === "cad" ? 'cad' : 'ppt');
          }
        }
      }

    } catch (error) {
      if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const next = last.content ? `${last.content}\n\n（已中断）` : "（已中断）";
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          }
          return [...prev, { role: 'assistant', content: "（已中断）" }];
        });
        return;
      }
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { role: 'assistant', content: "抱歉，遇到错误。请检查设置中的 API Key 是否正确。" }];
        }
        return [...prev, { role: 'assistant', content: "抱歉，遇到错误。请检查设置中的 API Key 是否正确。" }];
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
    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...baseMessages
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
        const xmlMatch = fullResponse.match(/```xml\n([\s\S]*?)\n```/);
        if (xmlMatch && xmlMatch[1]) onCodeAction?.(xmlMatch[1], 'flow');

        const pyMatch = fullResponse.match(/```python\n([\s\S]*?)\n```/);
        if (pyMatch && pyMatch[1] && workspaceId !== "cad") onCodeAction?.(pyMatch[1], 'cad');

        if (workspaceId === "cad") {
          const jsMatch = fullResponse.match(/```(javascript|js)\n([\s\S]*?)\n```/);
          if (jsMatch && jsMatch[2]) onCodeAction?.(jsMatch[2], 'cad');
        }

        const svgMatch = fullResponse.match(/```svg\n([\s\S]*?)\n```/);
        if (svgMatch && svgMatch[1]) onCodeAction?.(svgMatch[1], 'cad');

        const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) onCodeAction?.(jsonMatch[1], workspaceId === "cad" ? 'cad' : 'ppt');
      }
    } catch (error) {
      if ((error as any)?.name === "AbortError" || (error as any)?.name === "APIUserAbortError") {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            const next = last.content ? `${last.content}\n\n（已中断）` : "（已中断）";
            return [...prev.slice(0, -1), { role: 'assistant', content: next }];
          }
          return [...prev, { role: 'assistant', content: "（已中断）" }];
        });
        return;
      }

      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          return [...prev.slice(0, -1), { role: 'assistant', content: "抱歉，遇到错误。请检查设置中的 API Key 是否正确。" }];
        }
        return [...prev, { role: 'assistant', content: "抱歉，遇到错误。请检查设置中的 API Key 是否正确。" }];
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
          <div className={cn("h-full border-l border-border/60 bg-background/60 backdrop-blur flex flex-col items-center py-4 gap-4 w-full", className)}>
              <Button variant="ghost" size="icon" onClick={onToggleCollapse} title="展开聊天">
                  <SidebarOpen className="w-5 h-5 text-muted-foreground" />
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => setShowGlobalConstraints(true)} title="全局约束">
                  <Settings2 className="w-5 h-5 text-muted-foreground" />
              </Button>
          </div>
      );
  }

  return (
    <div className={cn("flex flex-col h-full bg-background/60 backdrop-blur border-l border-border/60", className)}>
      {/* Header */}
      <div className="h-14 px-5 border-b border-border/60 flex items-center justify-between bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 z-10 shadow-sm">
        <div className="flex items-center gap-2 font-medium">
          <Bot className="w-5 h-5 text-primary" />
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={startNewChat}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="新开对话"
            >
              <Plus className="w-4 h-4" />
            </Button>
            {!hideHistoryButton && (
              <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHistory(true)}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="版本历史"
              >
                  <History className="w-4 h-4" />
              </Button>
            )}
            <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowResetWarning(true)}
                className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                title="清空对话"
            >
                <Trash2 className="w-4 h-4" />
            </Button>
            {onToggleCollapse && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleCollapse}
                  title={collapseLocked ? "PPT 生成完成前不能收起聊天" : "收起聊天"}
                  disabled={collapseLocked}
                >
                    <SidebarClose className="w-4 h-4 text-muted-foreground" />
                </Button>
            )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden relative">
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
      <div className="p-4 bg-background/50 backdrop-blur relative z-20">
        <ChatInput 
            input={input}
            setInput={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
            onStop={handleStop}
            onFilesChange={setFiles}
            files={files}
                uploadMode={workspaceId === "ppt" ? "imagesOnly" : workspaceId === "cad" ? "filesOnly" : "all"}
            onOpenGlobalConstraints={() => setShowGlobalConstraints(true)}
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
      <GlobalConstraintsDialog 
        open={showGlobalConstraints} 
        onOpenChange={setShowGlobalConstraints}
        workspaceId={workspaceId}
      />
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
