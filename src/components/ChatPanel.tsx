import React, { useState, useRef, useEffect } from 'react';
import { Bot, Trash2, History, Settings2, SidebarClose, SidebarOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { streamChatMessage, generateImage, ChatMessage, getAIConfig } from '@/lib/ai-client';
import { DRAWIO_SYSTEM_PROMPT } from '@/lib/system-prompt';
import { Button } from '@/components/ui/button';
import { ChatInput } from '@/components/ChatInput';
import { ChatMessageDisplay, UIMessage } from '@/components/ChatMessageDisplay';
import { GlobalConstraintsDialog, STORAGE_GLOBAL_CONSTRAINTS_KEY } from '@/components/global-constraints-dialog';
import { HistoryDialog, HistoryItem } from '@/components/history-dialog';
import { ResetWarningModal } from '@/components/reset-warning-modal';
import { useFileProcessor } from '@/lib/use-file-processor';

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
    onRestore
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
  const [isLoading, setIsLoading] = useState(false);
  const [showGlobalConstraints, setShowGlobalConstraints] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showResetWarning, setShowResetWarning] = useState(false);
  
  const [files, setFiles] = useState<File[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  const handleSend = async () => {
    if ((!input.trim() && files.length === 0 && attachments.length === 0) || isLoading) return;

    let fullContent = input;
    
    // Process files for prompt
    const fileTexts: string[] = [];
    for (const file of files) {
        if (file.type.startsWith('image/')) {
             fileTexts.push(`[Image: ${file.name}]`);
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
                 fileTexts.push(`[${isPdfFile(file) ? 'PDF' : 'File'}: ${file.name}]\n${content}`);
             } catch (e) {
                 console.error("Failed to read file", file.name, e);
                 fileTexts.push(`[File: ${file.name}] (Failed to read content)`);
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

    const parts = [fullContent, fileTexts.length > 0 ? fileTexts.join("\n\n") : "", contextAttachmentsText].filter(Boolean);
    fullContent = parts.join("\n\n");

    const userMessage: ChatMessage = { role: 'user', content: fullContent };
    
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setFiles([]); 
    
    setIsLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (mode === 'ppt_image') {
        const parseSlideFromAttachments = () => {
          const jsonAttachments = attachments.filter((a) => a.type === 'json');
          for (let i = jsonAttachments.length - 1; i >= 0; i -= 1) {
            const a = jsonAttachments[i];
            try {
              const parsed = JSON.parse(a.content);
              if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
                return {
                  id: String(parsed.id),
                  title: typeof parsed.title === 'string' ? parsed.title : '',
                  content: Array.isArray(parsed.content) ? parsed.content.map((x: any) => String(x)) : [],
                  description: typeof parsed.description === 'string' ? parsed.description : '',
                  imageUrl: typeof parsed.imageUrl === 'string' ? parsed.imageUrl : ''
                };
              }
            } catch {
            }
          }
          return null;
        };

        const slide = parseSlideFromAttachments();
        if (!slide?.imageUrl) {
        } else {
        const prompt = `Edit a presentation slide image.
${slide ? `Slide id: ${slide.id}\nSlide title: ${slide.title}\nBullets: ${(slide.content || []).join(" | ")}\nExisting description: ${slide.description || ""}\n` : ""}User instruction:
${fullContent}

Rules:
- Keep the slide professional and readable.
- Do not add watermark.
- Avoid long paragraphs of text in the image.
`;

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        const imageUrl = await generateImage(
          { prompt, referenceImageUrl: slide?.imageUrl || undefined },
          controller.signal
        );

        if (imageUrl) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: `![slide](${imageUrl})` }];
            }
            return [...prev, { role: 'assistant', content: `![slide](${imageUrl})` }];
          });

          if (slide?.id) {
            const payload = JSON.stringify({ slides: [{ id: slide.id, imageUrl, instruction: fullContent }] });
            onCodeAction?.(payload, 'ppt');
          }
        } else {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: "未能生成图片，请重试。" }];
            }
            return [...prev, { role: 'assistant', content: "未能生成图片，请重试。" }];
          });
        }

        return;
        }
      }

      // Get Global Config
      const config = getAIConfig();
      // Load global constraints from storage (scoped by workspaceId)
      const constraintsKey = workspaceId ? `${STORAGE_GLOBAL_CONSTRAINTS_KEY}-${workspaceId}` : STORAGE_GLOBAL_CONSTRAINTS_KEY;
      const globalConstraints = typeof window !== 'undefined' ? localStorage.getItem(constraintsKey) || '' : '';
      const globalSystemPrompt = config.systemPrompt || '';
      
      const systemContent = [systemPrompt, globalSystemPrompt, globalConstraints].filter(Boolean).join('\n\n');

      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemContent },
        ...newMessages
      ];

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      let fullResponse = '';
      await streamChatMessage(apiMessages, (chunk) => {
        fullResponse = chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { role: 'assistant', content: chunk }];
          }
          return prev;
        });
      }, chatModel, controller.signal);
      
      if (fullResponse) {
        // Match XML
        const xmlMatch = fullResponse.match(/```xml\n([\s\S]*?)\n```/);
        if (xmlMatch && xmlMatch[1]) {
          const xml = xmlMatch[1];
          onCodeAction?.(xml, 'flow');
        }

        // Match Python
        const pyMatch = fullResponse.match(/```python\n([\s\S]*?)\n```/);
        if (pyMatch && pyMatch[1]) {
           onCodeAction?.(pyMatch[1], 'cad');
        }
        
        // Match SVG (for CAD)
        const svgMatch = fullResponse.match(/```svg\n([\s\S]*?)\n```/);
        if (svgMatch && svgMatch[1]) {
           onCodeAction?.(svgMatch[1], 'cad');
        }

        // Match JSON (PPT)
        const jsonMatch = fullResponse.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
           onCodeAction?.(jsonMatch[1], 'ppt');
        }
      }

    } catch (error) {
      if ((error as any)?.name === "AbortError") {
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

  const uiMessages: UIMessage[] = messages.map((msg, idx) => ({
      id: `msg-${idx}`,
      role: msg.role as any,
      content: msg.content,
      parts: [{ type: 'text', text: msg.content }] 
  }));

  if (collapsed) {
      return (
          <div className={cn("h-full border-l border-border bg-background flex flex-col items-center py-4 gap-4 w-full", className)}>
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
    <div className={cn("flex flex-col h-full bg-background border-l border-border", className)}>
      {/* Header */}
      <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-background/50 backdrop-blur z-10">
        <div className="flex items-center gap-2 font-medium">
          <Bot className="w-5 h-5 text-primary" />
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1">
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
          />
      </div>

      {/* Input */}
      <div className="p-4 bg-background/50 backdrop-blur relative z-20">
        {attachments.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
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
        )}
        <ChatInput 
            input={input}
            setInput={setInput}
            onSubmit={handleSend}
            isLoading={isLoading}
            onStop={handleStop}
            onFilesChange={setFiles}
            files={files}
            onOpenGlobalConstraints={() => setShowGlobalConstraints(true)}
            placeholder={inputPlaceholder}
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
      />
      <ResetWarningModal
        open={showResetWarning}
        onOpenChange={setShowResetWarning}
        onClear={clearHistory}
      />
    </div>
  );
}
