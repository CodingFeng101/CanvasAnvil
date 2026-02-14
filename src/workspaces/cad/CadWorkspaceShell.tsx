import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  type PanelImperativeHandle,
} from "@/workspaces/cad/ui/resizable";
import { CAD_SYSTEM_PROMPT } from "@/lib/system-prompts";
import type { ChatMessage } from "@/lib/ai-client";
import { generateImage } from "@/lib/ai-client";
import { CadWorkspace } from "@/workspaces/cad/workspace/CadWorkspace";
import { ChatPanel as CadChatPanel } from "@/workspaces/cad/chat/ChatPanel";

type Attachment = {
  id: string;
  type: "xml" | "python" | "json";
  content: string;
  name: string;
};

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string; svg?: string };

const CAD_WORKSPACE_STORAGE_KEY = "unified-ai-workspace-cad-state-v1";
const CAD_RENDERS_STORAGE_KEY = "unified-ai-workspace-cad-renders-v1";
const CAD_CHAT_STORAGE_KEY = "chat_history_v2_cad";
const CAD_RENDER_SLOT_TITLES = [
  "装修平面布置图",
  "地面铺装图",
  "顶面布置图",
  "墙体定位图",
  "机电点位图（强弱电+给排水）",
  "立面索引图+室内立面图",
  "节点大样图",
];

const tryParseJson = (text: string) => {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
      }
    }
    return null;
  }
};

const decodeBasicHtmlEntities = (text: string) =>
  String(text || "")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

const normalizeSvgMarkup = (text: string) => {
  const original = String(text || "").trim();
  let raw = original;
  if (!/<svg[\s/>]/i.test(raw) && /&lt;\s*svg[\s\S]*&gt;/i.test(raw)) {
    raw = decodeBasicHtmlEntities(raw).trim();
  }
  if (!raw) return "";
  const start = raw.search(/<svg[\s/>]/i);
  if (start < 0) return "";
  const tail = raw.slice(start);
  const end = tail.toLowerCase().lastIndexOf("</svg>");
  if (end >= 0) return tail.slice(0, end + "</svg>".length).trim();
  return tail.trim();
};

const isValidSvgMarkup = (text: string) => {
  const normalized = normalizeSvgMarkup(text);
  if (!normalized) return false;
  if (typeof DOMParser === "undefined") return /^<svg[\s/>]/i.test(normalized);
  try {
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    if (doc.querySelector("parsererror")) return false;
    return String(doc.documentElement?.nodeName || "").toLowerCase() === "svg";
  } catch {
    return false;
  }
};

const hasDrawableSvgContent = (text: string) => {
  const normalized = normalizeSvgMarkup(text);
  if (!normalized) return false;
  if (typeof DOMParser === "undefined") return true;
  try {
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    if (doc.querySelector("parsererror")) return false;
    const root = doc.documentElement;
    if (!root || String(root.nodeName || "").toLowerCase() !== "svg") return false;
    const drawable = root.querySelector(
      "path,rect,circle,ellipse,line,polyline,polygon,text,image,use,foreignObject",
    );
    return !!drawable;
  } catch {
    return false;
  }
};

function applyStringEdits(source: string, edits: { search: string; replace: string }[]) {
  if (!Array.isArray(edits) || edits.length === 0) throw new Error("Empty patch edits");
  let out = source;
  for (const edit of edits) {
    if (!edit || typeof edit.search !== "string" || typeof edit.replace !== "string") {
      throw new Error("Invalid patch edit item");
    }
    if (!edit.search) throw new Error("Empty search pattern in patch edit");
    if (!out.includes(edit.search)) throw new Error("Search pattern not found in current content");
    out = out.replace(edit.search, edit.replace);
  }
  return out;
}

const extractLatestSvgFromText = (text: string) => {
  const raw = String(text || "");
  let latest = "";

  const svgFence = /```svg\s*([\s\S]*?)```/gi;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = svgFence.exec(raw))) {
    const normalized = normalizeSvgMarkup(String(fenceMatch[1] || ""));
    if (normalized) latest = normalized;
  }

  if (latest) return latest;

  const rawSvg = /<svg[\s\S]*?<\/svg>/gi;
  let svgMatch: RegExpExecArray | null;
  while ((svgMatch = rawSvg.exec(raw))) {
    const normalized = normalizeSvgMarkup(String(svgMatch[0] || ""));
    if (normalized) latest = normalized;
  }

  if (latest) return latest;

  const jsonFence = /```json\s*([\s\S]*?)```/gi;
  let jsonMatch: RegExpExecArray | null;
  while ((jsonMatch = jsonFence.exec(raw))) {
    try {
      const parsed = JSON.parse(String(jsonMatch[1] || ""));
      const normalized = normalizeSvgMarkup(String(parsed?.full || ""));
      if (parsed?.type === "cad_patch" && parsed?.target === "2d_svg" && normalized) {
        latest = normalized;
      }
    } catch {
    }
  }

  return latest;
};

export function CadWorkspaceShell() {
  const uiLang = useUiLanguage();
  const initialCadState = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(CAD_WORKSPACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as any;
    } catch {
      return null;
    }
  })();

  const [cad2dSvg, setCad2dSvg] = useState<string | undefined>(() => {
    const v = initialCadState?.cad2dSvg;
    return typeof v === "string" ? v : undefined;
  });
  const [cadPlan, setCadPlan] = useState<any>(() => initialCadState?.cadPlan ?? null);
  const [cadImages, setCadImages] = useState<{ title: string; url: string }[]>(() => {
    const v = initialCadState?.cadImages;
    return Array.isArray(v)
      ? v
          .filter((x: any) => x && typeof x.title === "string" && typeof x.url === "string")
          .map((x: any) => ({ title: x.title, url: x.url }))
      : [];
  });
  const [cadImagesLoading, setCadImagesLoading] = useState(false);
  const [cadBom, setCadBom] = useState<{ columns: string[]; rows: any[] } | null>(() => {
    const v = initialCadState?.cadBom;
    if (!v || typeof v !== "object") return null;
    const columns = Array.isArray((v as any).columns)
      ? (v as any).columns.filter((c: any) => typeof c === "string")
      : [];
    const rows = Array.isArray((v as any).rows) ? (v as any).rows : [];
    return { columns, rows };
  });
  const [cadFocusPanel, setCadFocusPanel] = useState<"2d" | "renders" | "bom" | null>(() => {
    const v = initialCadState?.cadFocusPanel;
    return v === "2d" || v === "renders" || v === "bom" ? v : null;
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const cadImageObjectUrlsRef = useRef<string[]>([]);
  const suppressChatSvgSyncRef = useRef(false);
  const cad2dSvgRef = useRef<string | undefined>(typeof initialCadState?.cad2dSvg === "string" ? initialCadState.cad2dSvg : undefined);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [cadResetTick, setCadResetTick] = useState(0);
  const [cadApplyTick, setCadApplyTick] = useState(0);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);

  useEffect(() => {
    cad2dSvgRef.current = cad2dSvg;
  }, [cad2dSvg]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        CAD_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          cad2dSvg: typeof cad2dSvg === "string" ? cad2dSvg : null,
          cadPlan: cadPlan ?? null,
          cadImages,
          cadBom,
          cadFocusPanel,
          updatedAt: Date.now(),
        }),
      );
    } catch {
    }
  }, [cad2dSvg, cadPlan, cadImages, cadBom, cadFocusPanel]);

  useEffect(() => {
    const nextObjectUrls = cadImages
      .map((x) => x?.url)
      .filter((u): u is string => typeof u === "string" && u.startsWith("blob:"));
    const prevObjectUrls = cadImageObjectUrlsRef.current;
    for (const u of prevObjectUrls) {
      if (!nextObjectUrls.includes(u)) {
        try {
          URL.revokeObjectURL(u);
        } catch {
        }
      }
    }
    cadImageObjectUrlsRef.current = nextObjectUrls;
  }, [cadImages]);

  useEffect(() => {
    if (suppressChatSvgSyncRef.current) {
      if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
        suppressChatSvgSyncRef.current = false;
      }
      return;
    }
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return;

    // Only recover from chat history when canvas has no SVG yet.
    const current = normalizeSvgMarkup(String(cad2dSvgRef.current || ""));
    if (current) return;

    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      const msg = chatHistory[i];
      if (!msg || msg.role !== "assistant" || typeof msg.content !== "string") continue;
      const svg = extractLatestSvgFromText(msg.content);
      if (!svg) continue;
      cad2dSvgRef.current = svg;
      setCad2dSvg(svg);
      setCadFocusPanel("2d");
      addToHistory(svg, "svg");
      return;
    }
  }, [chatHistory]);

  const toggleCollapse = () => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    try {
      if (panel.isCollapsed?.() || isChatCollapsed) {
        panel.expand();
        setIsChatCollapsed(false);
      } else {
        panel.collapse();
        setIsChatCollapsed(true);
      }
    } catch {
      setIsChatCollapsed(false);
    }
  };

  const addToHistory = (_content: string, _type: "svg" | "json") => {};

  const handleAddToChat = (payload: string) => {
    const trimmed = String(payload || "").trim();
    if (!trimmed) return;
    if (trimmed.startsWith("<svg")) {
      setAttachments((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), type: "xml", content: payload, name: "plan.svg" },
      ]);
      return;
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      setAttachments((prev) => [
        ...prev,
        { id: Math.random().toString(36).slice(2), type: "json", content: payload, name: "cad.json" },
      ]);
      return;
    }
    setAttachments((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), type: "python", content: payload, name: "script.py" },
    ]);
  };

  const handleCadCodeAction = async (
    code: string,
    type: "flow" | "cad" | "ppt",
  ): Promise<CodeActionResult> => {
    if (type !== "cad") return { ok: true };

    const raw = String(code || "");
    const trimmed = raw.trim();
    if (!trimmed) return { ok: false, retry: false, error: "Empty input" };

    const normalizedRawSvg = !trimmed.startsWith("{") ? normalizeSvgMarkup(raw) : "";
    if (normalizedRawSvg) {
      if (!isValidSvgMarkup(normalizedRawSvg)) {
        toast.warning("SVG may contain XML issues, trying to load anyway");
      }
      if (!hasDrawableSvgContent(normalizedRawSvg)) {
        toast.error("SVG has no drawable content");
        return { ok: false, retry: false, error: "SVG has no drawable content" };
      }
      const current = normalizeSvgMarkup(String(cad2dSvgRef.current || ""));
      if (normalizedRawSvg === current) {
        // Keep "Apply" idempotent: same SVG still forces editor remount to recover stale iframe state.
        setCadFocusPanel("2d");
        setCadApplyTick((x) => x + 1);
        return { ok: true, svg: current || normalizedRawSvg };
      }
      cad2dSvgRef.current = normalizedRawSvg;
      setCad2dSvg(normalizedRawSvg);
      setCadFocusPanel("2d");
      addToHistory(normalizedRawSvg, "svg");
      setCadApplyTick((x) => x + 1);
      return { ok: true, svg: normalizedRawSvg };
    }

    if (!trimmed.startsWith("{")) return { ok: false, retry: false, error: "No SVG found in input" };
    const parsed = tryParseJson(trimmed);
    if (!parsed) return { ok: false, retry: false, error: "Invalid JSON" };
    const parsedType = String(parsed?.type || "").trim().toLowerCase();
    const parsedTarget = String(parsed?.target || "").trim().toLowerCase();
    const parsedMode = String(parsed?.mode || "").trim().toLowerCase();

    if (parsedType === "cad_plan") {
      setCadPlan(parsed);
      addToHistory(JSON.stringify(parsed), "json");
      return { ok: true };
    }

    if (parsedType === "cad_bom") {
      const fallbackColumns = ["Category", "Name", "Spec", "Qty", "Unit", "Note"];
      const columns =
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns.map((x: any) => String(x))
          : fallbackColumns;
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      setCadBom({ columns, rows });
      setCadFocusPanel("bom");
      return { ok: true };
    }

    if (parsedType === "cad_images") {
      const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      const items = prompts
        .map((p: any) => ({
          title: typeof p?.title === "string" ? p.title : "View",
          prompt: typeof p?.prompt === "string" ? p.prompt : "",
        }))
        .filter((p: any) => p.prompt)
        .slice(0, 7);

      setCadFocusPanel("renders");
      setCadImagesLoading(true);
      setCadImages(
        Array.from({ length: 7 }).map((_, idx) => ({
          title: CAD_RENDER_SLOT_TITLES[idx] || `鍥剧焊 ${idx + 1}`,
          url: "",
        })),
      );
      try {
        const results: Array<{ title: string; url: string; prompt: string } | null> = new Array(items.length).fill(null);
        const presetRenderPrompt = [
          "orthographic 2D technical construction drawing sheet, CAD-like linework",
          "black and white printing, clean readable annotations, clear dimension text",
          "include drawing border/frame and bottom-right title block",
          "no perspective, no 3D, no photorealism",
          "no watermark, no logo, no decorative typography",
        ].join(", ");

        const planText = cadPlan ? JSON.stringify(cadPlan) : "";
        const svgText = typeof cad2dSvg === "string" ? cad2dSvg : "";
        const planShort = planText.length > 6000 ? planText.slice(0, 6000) : planText;
        const svgShort = svgText.length > 6000 ? svgText.slice(0, 6000) : svgText;

        const list = items.slice(0, 7);
        const buildFullPrompt = (sheetPrompt: string) =>
          [
            presetRenderPrompt,
            "",
            "Plan:",
            planShort,
            "",
            "2D SVG:",
            svgShort,
            "",
            "Sheet:",
            sheetPrompt,
          ]
            .filter(Boolean)
            .join("\n");

        const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        const generateWithRetry = async (fullPrompt: string, maxRetries: number, retryDelayMs: number) => {
          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
              const url = await generateImage({ prompt: fullPrompt });
              if (url) return url;
            } catch (err) {
              if (attempt >= maxRetries) {
                console.error("CAD image generation attempt failed", err);
              }
            }
            if (attempt < maxRetries) {
              await wait(retryDelayMs * (attempt + 1));
            }
          }
          return "";
        };

        const syncPartialImages = () => {
          setCadImages(
            Array.from({ length: 7 }).map((_, idx) => ({
              title: CAD_RENDER_SLOT_TITLES[idx] || `鍥剧焊 ${idx + 1}`,
              url: results[idx]?.url || "",
            })),
          );
        };

        const runPass = async (indices: number[], batchSize: number, maxRetriesPerItem: number, retryDelayMs: number) => {
          for (let i = 0; i < indices.length; i += batchSize) {
            const batch = indices.slice(i, i + batchSize);
            const settled = await Promise.allSettled(
              batch.map(async (idx) => {
                const p = list[idx];
                if (!p?.prompt) return null;
                const url = await generateWithRetry(buildFullPrompt(p.prompt), maxRetriesPerItem, retryDelayMs);
                return url ? { idx, value: { title: p.title, url, prompt: p.prompt } } : null;
              }),
            );
            for (const s of settled) {
              if (s.status === "fulfilled" && s.value?.idx !== undefined && s.value?.value?.url) {
                results[s.value.idx] = s.value.value;
              }
            }
            syncPartialImages();
          }
        };

        const allIndices = list.map((_, idx) => idx);
        await runPass(allIndices, 3, 1, 1200);
        const failedAfterConcurrent = allIndices.filter((idx) => !results[idx]?.url);
        if (failedAfterConcurrent.length > 0) {
          await runPass(failedAfterConcurrent, 1, 2, 1800);
        }

        const final = Array.from({ length: 7 }).map((_, idx) => ({
          title: CAD_RENDER_SLOT_TITLES[idx] || `鍥剧焊 ${idx + 1}`,
          url: results[idx]?.url || "",
        }));
        setCadImages(final);
        const failedCount = list.filter((_, idx) => !results[idx]?.url).length;
        if (failedCount > 0) {
          toast.warning(`${failedCount} render image(s) failed after retries. Please run generation again.`);
        }
        addToHistory(JSON.stringify({ type: "cad_images", prompts: final }, null, 2), "json");
      } catch (e) {
        console.error("CAD image generation failed", e);
        toast.error("CAD image generation failed");
        setCadImages(
          Array.from({ length: 7 }).map((_, idx) => ({
            title: CAD_RENDER_SLOT_TITLES[idx] || `鍥剧焊 ${idx + 1}`,
            url: "",
          })),
        );
      } finally {
        setCadImagesLoading(false);
        setCadFocusPanel("renders");
      }
      return { ok: true };
    }

    if (parsedType === "cad_patch" && parsedTarget === "2d_svg") {
      if (parsedMode === "replace" && typeof parsed.full === "string") {
        const normalizedFull = normalizeSvgMarkup(parsed.full);
        if (!normalizedFull) {
          toast.error("Invalid replace svg");
          return { ok: false, retry: false, error: "Invalid replace svg" };
        }
        if (!isValidSvgMarkup(normalizedFull)) {
          toast.warning("Replace svg may contain XML issues, trying to load anyway");
        }
        if (!hasDrawableSvgContent(normalizedFull)) {
          toast.error("Replace svg has no drawable content");
          return { ok: false, retry: false, error: "Replace svg has no drawable content" };
        }
        const current = normalizeSvgMarkup(String(cad2dSvgRef.current || ""));
        if (normalizedFull === current) {
          setCadFocusPanel("2d");
          setCadApplyTick((x) => x + 1);
          return { ok: true, svg: current || normalizedFull };
        }
        cad2dSvgRef.current = normalizedFull;
        setCad2dSvg(normalizedFull);
        setCadFocusPanel("2d");
        addToHistory(normalizedFull, "svg");
        setCadApplyTick((x) => x + 1);
        return { ok: true, svg: normalizedFull };
      }
      if (parsedMode === "patch" && Array.isArray(parsed.edits)) {
        try {
          const current = normalizeSvgMarkup(String(cad2dSvgRef.current || ""));
          if (!current) {
            toast.error("Current 2D SVG is empty, cannot apply patch");
            return { ok: false, retry: true, error: "Current 2D SVG is empty, cannot apply patch" };
          }
          const next = applyStringEdits(current, parsed.edits);
          const normalizedNext = normalizeSvgMarkup(next);
          if (!normalizedNext) {
            toast.error("Patch result is not valid svg");
            return { ok: false, retry: true, error: "Patch result is not valid svg" };
          }
          if (!isValidSvgMarkup(normalizedNext)) {
            toast.warning("Patch result may contain XML issues, trying to load anyway");
          }
          if (!hasDrawableSvgContent(normalizedNext)) {
            toast.error("Patch result has no drawable content");
            return { ok: false, retry: true, error: "Patch result has no drawable content" };
          }
          if (normalizedNext === current) {
            toast.warning("Patch produced no visible SVG change");
            return { ok: false, retry: true, error: "Patch produced no visible SVG change" };
          }
          cad2dSvgRef.current = normalizedNext;
          setCad2dSvg(normalizedNext);
          setCadFocusPanel("2d");
          addToHistory(normalizedNext, "svg");
          setCadApplyTick((x) => x + 1);
          return { ok: true, svg: normalizedNext };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`Patch apply failed: ${msg}`);
          return { ok: false, retry: true, error: msg };
        }
      }
      toast.error(`Unsupported cad_patch mode: ${String(parsedMode || "") || "unknown"}`);
      return { ok: false, retry: false, error: `Unsupported cad_patch mode: ${String(parsedMode || "") || "unknown"}` };
    }

    return { ok: true };
  };

  const clearWorkspace = () => {
    suppressChatSvgSyncRef.current = true;
    cad2dSvgRef.current = undefined;
    setCad2dSvg(undefined);
    setCadPlan(null);
    setCadImages([]);
    setCadImagesLoading(false);
    setCadBom(null);
    setCadFocusPanel(null);
    setChatHistory([]);
    setAttachments([]);
    try {
      localStorage.removeItem(CAD_WORKSPACE_STORAGE_KEY);
    } catch {
    }
    try {
      localStorage.removeItem(CAD_RENDERS_STORAGE_KEY);
    } catch {
    }
    try {
      localStorage.removeItem(CAD_CHAT_STORAGE_KEY);
    } catch {
    }
    try {
      localStorage.removeItem("unified-ai-workspace-history-cad-v1");
    } catch {
    }
    setCadResetTick((x) => x + 1);
  };

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full" style={{ height: "100%" }}>
      <ResizablePanel
        defaultSize="68%"
        minSize="30%"
        className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
      >
        <div className="h-full w-full relative bg-muted/20">
          <CadWorkspace
            key={`cad-ws-${cadResetTick}-${cadApplyTick}`}
            svg2d={cad2dSvg}
            onSvgChange={(nextSvg) => {
              cad2dSvgRef.current = nextSvg;
              setCad2dSvg(nextSvg);
              addToHistory(nextSvg, "svg");
            }}
            plan={cadPlan}
            images={cadImages}
            imagesLoading={cadImagesLoading}
            bom={cadBom}
            focusPanel={cadFocusPanel}
            onAddToChat={handleAddToChat}
          />
        </div>
      </ResizablePanel>

      <>
        <ResizableHandle withHandle className="bg-border/50 hover:bg-primary/50 transition-colors w-1.5" />
        <ResizablePanel
          id="cad-chat"
          panelRef={chatPanelRef}
          defaultSize="32%"
          minSize="20%"
          maxSize="70%"
          collapsible
          collapsedSize="56px"
          onResize={(panelSize) => setIsChatCollapsed(panelSize.inPixels <= 80)}
          className={cn("transition-[flex-grow,flex-basis] duration-300 ease-in-out will-change-[flex-grow,flex-basis]")}
        >
          <CadChatPanel
            key={`cad-chat-${cadResetTick}`}
            systemPrompt={CAD_SYSTEM_PROMPT}
            initialMessages={chatHistory}
            onMessagesChange={setChatHistory}
            attachments={attachments}
            workspaceId="cad"
            mode="text"
            collapsed={isChatCollapsed}
            title={t(uiLang, "workspace.cad.title")}
            inputPlaceholder={t(uiLang, "workspace.cad.placeholder")}
            onToggleCollapse={toggleCollapse}
            onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            onClearAttachments={() => setAttachments([])}
            onClearWorkspace={clearWorkspace}
            hideHistoryButton
            cadContext={{ plan: cadPlan, svg2d: cad2dSvg }}
            onCodeAction={handleCadCodeAction}
          />
        </ResizablePanel>
      </>
    </ResizablePanelGroup>
  );
}

