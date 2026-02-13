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
import type { HistoryItem } from "@/workspaces/cad/chat/history-dialog";

type Attachment = {
  id: string;
  type: "xml" | "python" | "json";
  content: string;
  name: string;
};

type CodeActionResult = { ok: boolean; retry?: boolean; error?: string; svg?: string };

const CAD_WORKSPACE_STORAGE_KEY = "unified-ai-workspace-cad-state-v1";
const CAD_RENDERS_STORAGE_KEY = "unified-ai-workspace-cad-renders-v1";
const CAD_HISTORY_STORAGE_KEY = "unified-ai-workspace-history-cad-v1";
const CAD_CHAT_STORAGE_KEY = "chat_history_v2_cad";
const CAD_RENDER_SLOT_TITLES = [
  "Renovation Plan Layout",
  "Floor Finish Plan",
  "Reflected Ceiling Plan",
  "Wall Setting-Out Plan",
  "MEP Plan (Electrical + Low Voltage + Plumbing)",
  "Elevation Index Plan + Interior Elevations",
  "Detail Drawings",
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

const normalizeSvgMarkup = (text: string) => {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const start = raw.search(/<svg[\s/>]/i);
  if (start < 0) return "";
  const tail = raw.slice(start);
  const end = tail.toLowerCase().lastIndexOf("</svg>");
  if (end >= 0) return tail.slice(0, end + "</svg>".length).trim();
  return tail.trim();
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
  const [versionHistory, setVersionHistory] = useState<HistoryItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CAD_HISTORY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const cadImageObjectUrlsRef = useRef<string[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);

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
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(CAD_HISTORY_STORAGE_KEY, JSON.stringify(versionHistory));
    } catch {
    }
  }, [versionHistory]);

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
    if (!Array.isArray(chatHistory) || chatHistory.length === 0) return;

    for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
      const msg = chatHistory[i];
      if (!msg || msg.role !== "assistant" || typeof msg.content !== "string") continue;
      const svg = extractLatestSvgFromText(msg.content);
      if (!svg) continue;

      const current = normalizeSvgMarkup(String(cad2dSvg || ""));
      if (svg === current) return;
      setCad2dSvg(svg);
      setCadFocusPanel("2d");
      addToHistory(svg, "svg");
      return;
    }
  }, [chatHistory, cad2dSvg]);

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

  const addToHistory = (content: string, type: HistoryItem["type"]) => {
    const item: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      content,
      type,
    };
    setVersionHistory((prev) => [...prev, item]);
  };

  const handleRestore = (item: HistoryItem) => {
    if (item.type === "svg") {
      setCad2dSvg(item.content);
      return;
    }
    if (item.type === "json") {
      try {
        const parsed = JSON.parse(item.content);
        if (parsed?.type === "cad_plan") setCadPlan(parsed);
        if (parsed?.type === "cad_bom") setCadBom({ columns: parsed.columns || [], rows: parsed.rows || [] });
        if (parsed?.type === "cad_images") {
          const next = Array.isArray(parsed.prompts)
            ? parsed.prompts
                .slice(0, 7)
                .map((p: any, idx: number) => ({
                  title: typeof p?.title === "string" ? p.title : CAD_RENDER_SLOT_TITLES[idx] || "Drawing",
                  url: typeof p?.url === "string" ? p.url : "",
                }))
            : [];
          if (next.length > 0) setCadImages(next);
        }
      } catch {
      }
    }
  };

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

    const isDirectSvgPayload = /^(?:<\?xml[\s\S]*?\?>\s*)?<svg[\s/>]/i.test(trimmed);
    const normalizedRawSvg = isDirectSvgPayload ? normalizeSvgMarkup(raw) : "";
    if (isDirectSvgPayload && normalizedRawSvg) {
      setCad2dSvg(normalizedRawSvg);
      setCadFocusPanel("2d");
      addToHistory(normalizedRawSvg, "svg");
      return { ok: true, svg: normalizedRawSvg };
    }

    if (!trimmed.startsWith("{")) return { ok: true };
    const parsed = tryParseJson(trimmed);
    if (!parsed) return { ok: false, retry: false, error: "Invalid JSON" };

    if (parsed?.type === "cad_plan") {
      setCadPlan(parsed);
      addToHistory(JSON.stringify(parsed), "json");
      return { ok: true };
    }

    if (parsed?.type === "cad_bom") {
      const fallbackColumns = ["Category", "Name", "Spec", "Qty", "Unit", "Note"];
      const columns =
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns.map((x: any) => String(x))
          : fallbackColumns;
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      setCadBom({ columns, rows });
      setCadFocusPanel("bom");
      addToHistory(JSON.stringify({ type: "cad_bom", columns, rows }), "json");
      return { ok: true };
    }

    if (parsed?.type === "cad_images") {
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
          title: items[idx]?.title || CAD_RENDER_SLOT_TITLES[idx] || `Drawing ${idx + 1}`,
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
        const batchSize = 3;
        for (let i = 0; i < list.length; i += batchSize) {
          const batch = list.slice(i, i + batchSize);
          const settled = await Promise.allSettled(
            batch.map(async (p) => {
              const fullPrompt = [
                presetRenderPrompt,
                "",
                "Plan:",
                planShort,
                "",
                "2D SVG:",
                svgShort,
                "",
                "Sheet:",
                p.prompt,
              ]
                .filter(Boolean)
                .join("\n");
              const url = await generateImage({ prompt: fullPrompt });
              return url ? { title: p.title, url, prompt: p.prompt } : null;
            }),
          );
          for (let bi = 0; bi < settled.length; bi += 1) {
            const s = settled[bi];
            const globalIdx = i + bi;
            if (s.status === "fulfilled" && s.value?.url) results[globalIdx] = s.value;
          }
        }

        const final = Array.from({ length: 7 }).map((_, idx) => ({
          title: items[idx]?.title || CAD_RENDER_SLOT_TITLES[idx] || `Drawing ${idx + 1}`,
          url: results[idx]?.url || "",
        }));
        setCadImages(final);
        addToHistory(JSON.stringify({ type: "cad_images", prompts: final }, null, 2), "json");
      } catch (e) {
        console.error("CAD image generation failed", e);
        toast.error("CAD image generation failed");
        setCadImages(
          Array.from({ length: 7 }).map((_, idx) => ({
            title: items[idx]?.title || CAD_RENDER_SLOT_TITLES[idx] || `Drawing ${idx + 1}`,
            url: "",
          })),
        );
      } finally {
        setCadImagesLoading(false);
        setCadFocusPanel("renders");
      }
      return { ok: true };
    }

    if (parsed?.type === "cad_patch" && parsed?.target === "2d_svg") {
      const mode = parsed?.mode;
      if (mode === "replace" && typeof parsed.full === "string") {
        const normalizedFull = normalizeSvgMarkup(parsed.full);
        if (!normalizedFull) return { ok: false, retry: false, error: "Invalid replace svg" };
        setCad2dSvg(normalizedFull);
        setCadFocusPanel("2d");
        addToHistory(normalizedFull, "svg");
        return { ok: true, svg: normalizedFull };
      }
      if (mode === "patch" && Array.isArray(parsed.edits)) {
        try {
          const next = applyStringEdits(cad2dSvg || "", parsed.edits);
          const normalizedNext = normalizeSvgMarkup(next);
          if (!normalizedNext) return { ok: false, retry: true, error: "Patch result is not valid svg" };
          setCad2dSvg(normalizedNext);
          setCadFocusPanel("2d");
          addToHistory(normalizedNext, "svg");
          return { ok: true, svg: normalizedNext };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast.error(`Patch apply failed: ${msg}`);
          return { ok: false, retry: true, error: msg };
        }
      }
    }

    return { ok: true };
  };

  const clearWorkspace = () => {
    setCad2dSvg(undefined);
    setCadPlan(null);
    setCadImages([]);
    setCadImagesLoading(false);
    setCadBom(null);
    setCadFocusPanel(null);
    setAttachments([]);
    setVersionHistory([]);
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
            svg2d={cad2dSvg}
            onSvgChange={(nextSvg) => {
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
            key="cad"
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
            history={versionHistory}
            onRestore={handleRestore}
            onClearVersionHistory={() => setVersionHistory([])}
            cadContext={{ plan: cadPlan, svg2d: cad2dSvg }}
            onCodeAction={handleCadCodeAction}
          />
        </ResizablePanel>
      </>
    </ResizablePanelGroup>
  );
}
