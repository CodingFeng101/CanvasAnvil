import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useUiLanguage } from "@/lib/use-ui-language";
import { getCadRenderFallbackTitle } from "@/lib/cad-render-titles";
import {
  clearPersistedCadWorkspaceItem,
  readPersistedCadWorkspaceItem,
  savePersistedCadWorkspaceItem,
} from "@/lib/cad-persistence";
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

const CAD_WORKSPACE_STORAGE_KEY = "CanvasAnvil-cad-state-v1";
const CAD_RENDERS_STORAGE_KEY = "CanvasAnvil-cad-renders-v1";
const CAD_ANALYSIS_IMAGES_STORAGE_KEY = "CanvasAnvil-cad-analysis-images-v1";
const CAD_CHAT_STORAGE_KEY = "chat_history_v2_cad";
const CAD_PERSISTED_RENDERS_KEY = "renders";
const CAD_PERSISTED_ANALYSIS_IMAGES_KEY = "analysis-images";

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

type CadRenderItem = { title: string; url: string };

const normalizeCadRenderItems = (
  input: any,
  options?: { allowBlob?: boolean; max?: number },
): CadRenderItem[] => {
  const allowBlob = options?.allowBlob === true;
  const max = typeof options?.max === "number" && options.max > 0 ? options.max : 30;
  if (!Array.isArray(input)) return [];
  return input
    .map((x: any) => ({
      title: typeof x?.title === "string" ? x.title : "",
      url: typeof x?.url === "string" ? x.url : "",
    }))
    .filter((x: CadRenderItem) => {
      if (!x.url) return false;
      if (!allowBlob && x.url.startsWith("blob:")) return false;
      return true;
    })
    .slice(0, max);
};

const readPersistedCadRenders = (): CadRenderItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CAD_RENDERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeCadRenderItems(parsed, { allowBlob: false, max: 30 });
  } catch {
    return [];
  }
};

const readPersistedCadAnalysisImages = (): CadRenderItem[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CAD_ANALYSIS_IMAGES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return normalizeCadRenderItems(parsed, { allowBlob: false, max: 2 });
  } catch {
    return [];
  }
};

const blobToDataUrl = async (blob: Blob) =>
  await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve("");
    reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(blob);
  });

const urlToDataUrl = async (url: string) => {
  if (typeof window === "undefined") return "";
  try {
    const resp = await fetch(url);
    if (!resp.ok) return "";
    const blob = await resp.blob();
    return await blobToDataUrl(blob);
  } catch {
    return "";
  }
};

const toPersistableRenderUrl = async (url: string) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image")) return raw;
  if (raw.startsWith("blob:")) {
    const dataUrl = await urlToDataUrl(raw);
    return dataUrl || "";
  }
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const dataUrl = await urlToDataUrl(raw);
    return dataUrl || raw;
  }
  return raw;
};

export function CadWorkspaceShell() {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
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
  const initialCadRenders = (() => {
    const fromWorkspaceState = normalizeCadRenderItems(initialCadState?.cadImages, {
      allowBlob: false,
      max: 30,
    });
    if (fromWorkspaceState.length > 0) return fromWorkspaceState;
    return readPersistedCadRenders();
  })();
  const initialCadAnalysisImages = (() => {
    const fromWorkspaceState = normalizeCadRenderItems(initialCadState?.cadAnalysisImages, {
      allowBlob: false,
      max: 2,
    });
    if (fromWorkspaceState.length > 0) return fromWorkspaceState;
    return readPersistedCadAnalysisImages();
  })();

  const [cad2dSvg, setCad2dSvg] = useState<string | undefined>(() => {
    const v = initialCadState?.cad2dSvg;
    return typeof v === "string" ? v : undefined;
  });
  const [cadPlan, setCadPlan] = useState<any>(() => initialCadState?.cadPlan ?? null);
  const [cadAnalysisImages, setCadAnalysisImages] = useState<{ title: string; url: string }[]>(
    () => initialCadAnalysisImages,
  );
  const [cadAnalysisImagesLoading, setCadAnalysisImagesLoading] = useState(false);
  const [cadImages, setCadImages] = useState<{ title: string; url: string }[]>(() => initialCadRenders);
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
  const [cadFocusPanel, setCadFocusPanel] = useState<"analysis" | "2d" | "renders" | "bom" | null>("analysis");
  const [isCadImagePersistenceHydrated, setIsCadImagePersistenceHydrated] = useState(false);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const cadImageObjectUrlsRef = useRef<string[]>([]);
  const cadStableImagesRef = useRef<CadRenderItem[]>(initialCadRenders);
  const cadStableAnalysisImagesRef = useRef<CadRenderItem[]>(initialCadAnalysisImages);
  const cadRenderPersistenceRunningRef = useRef(false);
  const cadRenderPersistenceRetryRef = useRef(false);
  const cadAnalysisPersistenceRunningRef = useRef(false);
  const cadAnalysisPersistenceRetryRef = useRef(false);
  const suppressChatSvgSyncRef = useRef(false);
  const cad2dSvgRef = useRef<string | undefined>(typeof initialCadState?.cad2dSvg === "string" ? initialCadState.cad2dSvg : undefined);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [cadResetTick, setCadResetTick] = useState(0);
  const [cadApplyTick, setCadApplyTick] = useState(0);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [persistedRenders, persistedAnalysisImages] = await Promise.all([
          readPersistedCadWorkspaceItem<CadRenderItem[]>(CAD_PERSISTED_RENDERS_KEY),
          readPersistedCadWorkspaceItem<CadRenderItem[]>(CAD_PERSISTED_ANALYSIS_IMAGES_KEY),
        ]);
        if (cancelled) return;

        const nextRenders = normalizeCadRenderItems(persistedRenders, { allowBlob: false, max: 30 });
        if (nextRenders.length > 0 && cadStableImagesRef.current.length === 0) {
          cadStableImagesRef.current = nextRenders;
          setCadImages(nextRenders);
        }

        const nextAnalysisImages = normalizeCadRenderItems(persistedAnalysisImages, { allowBlob: false, max: 2 });
        if (nextAnalysisImages.length > 0 && cadStableAnalysisImagesRef.current.length === 0) {
          cadStableAnalysisImagesRef.current = nextAnalysisImages;
          setCadAnalysisImages(nextAnalysisImages);
        }
      } catch (e) {
        console.error("Failed to load persisted CAD images", e);
      } finally {
        if (!cancelled) setIsCadImagePersistenceHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
          cadAnalysisImages: [],
          cadBom,
          cadFocusPanel,
          updatedAt: Date.now(),
        }),
      );
    } catch {
    }
  }, [cad2dSvg, cadPlan, cadAnalysisImages, cadBom, cadFocusPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCadImagePersistenceHydrated) return;
    const stable = normalizeCadRenderItems(cadImages, { allowBlob: false, max: 30 });
    if (stable.length > 0) {
      cadStableImagesRef.current = stable;
      void savePersistedCadWorkspaceItem(CAD_PERSISTED_RENDERS_KEY, stable).catch((e) => {
        console.error("Failed to persist CAD render images", e);
      });
      try {
        localStorage.setItem(CAD_RENDERS_STORAGE_KEY, JSON.stringify(stable));
      } catch (e) {
        console.error("Failed to persist CAD render images snapshot", e);
      }
    }
  }, [cadImages, isCadImagePersistenceHydrated]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCadImagePersistenceHydrated) return;
    const stable = normalizeCadRenderItems(cadAnalysisImages, { allowBlob: false, max: 2 });
    if (stable.length > 0) {
      cadStableAnalysisImagesRef.current = stable;
      void savePersistedCadWorkspaceItem(CAD_PERSISTED_ANALYSIS_IMAGES_KEY, stable).catch((e) => {
        console.error("Failed to persist CAD analysis images", e);
      });
      try {
        localStorage.setItem(CAD_ANALYSIS_IMAGES_STORAGE_KEY, JSON.stringify(stable));
      } catch (e) {
        console.error("Failed to persist CAD analysis image snapshot", e);
      }
    }
  }, [cadAnalysisImages, isCadImagePersistenceHydrated]);

  useEffect(() => {
    if (cadRenderPersistenceRunningRef.current) {
      cadRenderPersistenceRetryRef.current = true;
      return;
    }

    const pending = cadImages.some((item) => {
      const raw = String(item?.url || "").trim();
      return raw.startsWith("blob:") || raw.startsWith("http://") || raw.startsWith("https://");
    });
    if (!pending) return;

    let cancelled = false;
    cadRenderPersistenceRunningRef.current = true;
    cadRenderPersistenceRetryRef.current = false;

    void (async () => {
      try {
        const cache = new Map<string, string>();
        let changed = false;
        const next = await Promise.all(
          cadImages.map(async (item) => {
            const raw = String(item?.url || "").trim();
            if (!raw) return item;
            if (!raw.startsWith("blob:") && !raw.startsWith("http://") && !raw.startsWith("https://")) {
              return item;
            }
            if (!cache.has(raw)) {
              cache.set(raw, await toPersistableRenderUrl(raw));
            }
            const persisted = cache.get(raw) || raw;
            if (persisted && persisted !== raw) {
              changed = true;
              return { ...item, url: persisted };
            }
            return item;
          }),
        );
        if (!cancelled && changed) {
          setCadImages(next);
        }
      } finally {
        cadRenderPersistenceRunningRef.current = false;
        if (!cancelled && cadRenderPersistenceRetryRef.current) {
          cadRenderPersistenceRetryRef.current = false;
          setCadImages((prev) => [...prev]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cadImages]);

  useEffect(() => {
    if (cadAnalysisPersistenceRunningRef.current) {
      cadAnalysisPersistenceRetryRef.current = true;
      return;
    }

    const pending = cadAnalysisImages.some((item) => {
      const raw = String(item?.url || "").trim();
      return raw.startsWith("blob:") || raw.startsWith("http://") || raw.startsWith("https://");
    });
    if (!pending) return;

    let cancelled = false;
    cadAnalysisPersistenceRunningRef.current = true;
    cadAnalysisPersistenceRetryRef.current = false;

    void (async () => {
      try {
        const cache = new Map<string, string>();
        let changed = false;
        const next = await Promise.all(
          cadAnalysisImages.map(async (item) => {
            const raw = String(item?.url || "").trim();
            if (!raw) return item;
            if (!raw.startsWith("blob:") && !raw.startsWith("http://") && !raw.startsWith("https://")) {
              return item;
            }
            if (!cache.has(raw)) {
              cache.set(raw, await toPersistableRenderUrl(raw));
            }
            const persisted = cache.get(raw) || raw;
            if (persisted && persisted !== raw) {
              changed = true;
              return { ...item, url: persisted };
            }
            return item;
          }),
        );
        if (!cancelled && changed) {
          setCadAnalysisImages(next);
        }
      } finally {
        cadAnalysisPersistenceRunningRef.current = false;
        if (!cancelled && cadAnalysisPersistenceRetryRef.current) {
          cadAnalysisPersistenceRetryRef.current = false;
          setCadAnalysisImages((prev) => [...prev]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cadAnalysisImages]);

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
    if (!trimmed) return { ok: false, retry: false, error: tr("输入为空", "Empty input") };

    const normalizedRawSvg = !trimmed.startsWith("{") ? normalizeSvgMarkup(raw) : "";
    if (normalizedRawSvg) {
      if (!isValidSvgMarkup(normalizedRawSvg)) {
        toast.warning(tr("SVG 可能包含 XML 问题，仍将尝试加载", "SVG may contain XML issues, trying to load anyway"));
      }
      if (!hasDrawableSvgContent(normalizedRawSvg)) {
        const msg = tr("SVG 不包含可绘制内容", "SVG has no drawable content");
        toast.error(msg);
        return { ok: false, retry: false, error: msg };
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
      setCadApplyTick((x) => x + 1);
      return { ok: true, svg: normalizedRawSvg };
    }

    if (!trimmed.startsWith("{")) return { ok: false, retry: false, error: tr("输入中未找到 SVG", "No SVG found in input") };
    const parsed = tryParseJson(trimmed);
    if (!parsed) return { ok: false, retry: false, error: tr("JSON 无效", "Invalid JSON") };
    const parsedType = String(parsed?.type || "").trim().toLowerCase();
    const parsedTarget = String(parsed?.target || "").trim().toLowerCase();
    const parsedMode = String(parsed?.mode || "").trim().toLowerCase();

    if (parsedType === "cad_plan") {
      setCadPlan(parsed);
      return { ok: true };
    }

    if (parsedType === "cad_bom") {
      const fallbackColumns =
        uiLang === "zh"
          ? ["类别", "名称", "规格", "数量", "单位", "备注"]
          : ["Category", "Name", "Spec", "Qty", "Unit", "Note"];
      const columns =
        Array.isArray(parsed.columns) && parsed.columns.length > 0
          ? parsed.columns.map((x: any) => String(x))
          : fallbackColumns;
      const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
      setCadBom({ columns, rows });
      setCadFocusPanel("bom");
      return { ok: true };
    }

    if (parsedType === "cad_analysis_images") {
      const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      const defaultTitles = [
        uiLang === "zh" ? "整体方案图" : "Overall Scheme",
        uiLang === "zh" ? "重点策略图" : "Key Strategy",
      ];
      const previousStableAnalysis = normalizeCadRenderItems(cadAnalysisImages, { allowBlob: false, max: 2 });
      const items = prompts
        .map((p: any, idx: number) => ({
          title:
            typeof p?.title === "string" && p.title.trim()
              ? p.title
              : defaultTitles[idx] || (uiLang === "zh" ? `分析图${idx + 1}` : `Analysis ${idx + 1}`),
          prompt: typeof p?.prompt === "string" ? p.prompt : "",
        }))
        .filter((p: any) => p.prompt)
        .slice(0, 2);

      setCadFocusPanel("analysis");
      setCadAnalysisImagesLoading(true);
      setCadAnalysisImages(
        defaultTitles.map((title, idx) => ({
          title: previousStableAnalysis[idx]?.title || title,
          url: previousStableAnalysis[idx]?.url || "",
        })),
      );
      try {
        const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
        const generateWithRetry = async (prompt: string, maxRetries: number, retryDelayMs: number) => {
          for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
            try {
              const url = await generateImage({ prompt });
              if (url) return url;
            } catch (err) {
              if (attempt >= maxRetries) {
                console.error("CAD analysis image generation attempt failed", err);
              }
            }
            if (attempt < maxRetries) {
              await wait(retryDelayMs * (attempt + 1));
            }
          }
          return "";
        };

        const settled = await Promise.allSettled(
          items.map(async (item) => ({
            title: item.title,
            url: await generateWithRetry(item.prompt, 2, 1200),
          })),
        );

        const final = defaultTitles.map((title, idx) => {
          const result = settled[idx];
          if (result?.status === "fulfilled" && result.value?.url) {
            return {
              title: result.value.title || title,
              url: result.value.url,
            };
          }
          return { title, url: "" };
        });

        const persistableFinal = await Promise.all(
          final.map(async (item) => ({
            title: item.title,
            url: await toPersistableRenderUrl(item.url),
          })),
        );
        setCadAnalysisImages(
          defaultTitles.map((title, idx) => ({
            title: persistableFinal[idx]?.title || previousStableAnalysis[idx]?.title || title,
            url: persistableFinal[idx]?.url || previousStableAnalysis[idx]?.url || "",
          })),
        );
        const failedCount = final.filter((x) => !x.url).length;
        if (failedCount > 0) {
          toast.warning(
            uiLang === "zh"
              ? `有 ${failedCount} 张分析图生成失败，请重试。`
              : `${failedCount} analysis image(s) failed. Please retry.`,
          );
        }
      } catch (e) {
        console.error("CAD analysis image generation failed", e);
        toast.error(tr("分析图生成失败", "Analysis image generation failed"));
        setCadAnalysisImages(
          defaultTitles.map((title, idx) => ({
            title: previousStableAnalysis[idx]?.title || title,
            url: previousStableAnalysis[idx]?.url || "",
          })),
        );
      } finally {
        setCadAnalysisImagesLoading(false);
        setCadFocusPanel("analysis");
      }
      return { ok: true };
    }

    if (parsedType === "cad_images") {
      const prompts = Array.isArray(parsed.prompts) ? parsed.prompts : [];
      const previousStableRenders = normalizeCadRenderItems(cadImages, { allowBlob: false, max: 30 });
      const items = prompts
        .map((p: any) => ({
          title: typeof p?.title === "string" ? p.title : tr("视图", "View"),
          prompt: typeof p?.prompt === "string" ? p.prompt : "",
        }))
        .filter((p: any) => p.prompt)
        .slice(0, 7);

      setCadFocusPanel("renders");
      setCadImagesLoading(true);
      setCadImages(
        Array.from({ length: 7 }).map((_, idx) => ({
          title: getCadRenderFallbackTitle(uiLang, idx),
          url: previousStableRenders[idx]?.url || "",
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
              title: getCadRenderFallbackTitle(uiLang, idx),
              url: results[idx]?.url || previousStableRenders[idx]?.url || "",
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
          title: getCadRenderFallbackTitle(uiLang, idx),
          url: results[idx]?.url || "",
        }));
        const persistableFinal = await Promise.all(
          final.map(async (item) => ({
            title: item.title,
            url: await toPersistableRenderUrl(item.url),
          })),
        );
        setCadImages(
          Array.from({ length: 7 }).map((_, idx) => ({
            title: getCadRenderFallbackTitle(uiLang, idx),
            url: persistableFinal[idx]?.url || previousStableRenders[idx]?.url || "",
          })),
        );
        const failedCount = list.filter((_, idx) => !results[idx]?.url).length;
        if (failedCount > 0) {
          toast.warning(
            uiLang === "zh"
              ? `有 ${failedCount} 张装修图在重试后仍失败，请重新生成。`
              : `${failedCount} render image(s) failed after retries. Please run generation again.`,
          );
        }
      } catch (e) {
        console.error("CAD image generation failed", e);
        toast.error(tr("装修图生成失败", "CAD image generation failed"));
        setCadImages(
          Array.from({ length: 7 }).map((_, idx) => ({
            title: getCadRenderFallbackTitle(uiLang, idx),
            url: previousStableRenders[idx]?.url || "",
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
          const msg = tr("replace 模式 SVG 无效", "Invalid replace svg");
          toast.error(msg);
          return { ok: false, retry: false, error: msg };
        }
        if (!isValidSvgMarkup(normalizedFull)) {
          toast.warning(tr("replace SVG 可能包含 XML 问题，仍将尝试加载", "Replace svg may contain XML issues, trying to load anyway"));
        }
        if (!hasDrawableSvgContent(normalizedFull)) {
          const msg = tr("replace SVG 不包含可绘制内容", "Replace svg has no drawable content");
          toast.error(msg);
          return { ok: false, retry: false, error: msg };
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
        setCadApplyTick((x) => x + 1);
        return { ok: true, svg: normalizedFull };
      }
      if (parsedMode === "patch" && Array.isArray(parsed.edits)) {
        try {
          const current = normalizeSvgMarkup(String(cad2dSvgRef.current || ""));
          if (!current) {
            const msg = tr("当前 2D SVG 为空，无法应用补丁", "Current 2D SVG is empty, cannot apply patch");
            toast.error(msg);
            return { ok: false, retry: true, error: msg };
          }
          const next = applyStringEdits(current, parsed.edits);
          const normalizedNext = normalizeSvgMarkup(next);
          if (!normalizedNext) {
            const msg = tr("补丁结果不是有效 SVG", "Patch result is not valid svg");
            toast.error(msg);
            return { ok: false, retry: true, error: msg };
          }
          if (!isValidSvgMarkup(normalizedNext)) {
            toast.warning(tr("补丁结果可能包含 XML 问题，仍将尝试加载", "Patch result may contain XML issues, trying to load anyway"));
          }
          if (!hasDrawableSvgContent(normalizedNext)) {
            const msg = tr("补丁结果不包含可绘制内容", "Patch result has no drawable content");
            toast.error(msg);
            return { ok: false, retry: true, error: msg };
          }
          if (normalizedNext === current) {
            const msg = tr("补丁未产生可见 SVG 变化", "Patch produced no visible SVG change");
            toast.warning(msg);
            return { ok: false, retry: true, error: msg };
          }
          cad2dSvgRef.current = normalizedNext;
          setCad2dSvg(normalizedNext);
          setCadFocusPanel("2d");
          setCadApplyTick((x) => x + 1);
          return { ok: true, svg: normalizedNext };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const err = uiLang === "zh" ? `补丁应用失败：${msg}` : `Patch apply failed: ${msg}`;
          toast.error(err);
          return { ok: false, retry: true, error: msg };
        }
      }
      const mode = String(parsedMode || "") || "unknown";
      const err = uiLang === "zh" ? `不支持的 cad_patch 模式：${mode}` : `Unsupported cad_patch mode: ${mode}`;
      toast.error(err);
      return { ok: false, retry: false, error: err };
    }

    return { ok: true };
  };

  const clearWorkspace = () => {
    suppressChatSvgSyncRef.current = true;
    cad2dSvgRef.current = undefined;
    cadStableImagesRef.current = [];
    cadStableAnalysisImagesRef.current = [];
    setCad2dSvg(undefined);
    setCadPlan(null);
    setCadAnalysisImages([]);
    setCadAnalysisImagesLoading(false);
    setCadImages([]);
    setCadImagesLoading(false);
    setCadBom(null);
    setCadFocusPanel("analysis");
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
      localStorage.removeItem(CAD_ANALYSIS_IMAGES_STORAGE_KEY);
    } catch {
    }
    try {
      localStorage.removeItem(CAD_CHAT_STORAGE_KEY);
    } catch {
    }
    void Promise.all([
      clearPersistedCadWorkspaceItem(CAD_PERSISTED_RENDERS_KEY),
      clearPersistedCadWorkspaceItem(CAD_PERSISTED_ANALYSIS_IMAGES_KEY),
    ]).catch((e) => {
      console.error("Failed to clear persisted CAD images", e);
    });
    try {
      localStorage.removeItem("CanvasAnvil-history-cad-v1");
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
            }}
            plan={cadPlan}
            analysisImages={cadAnalysisImages}
            analysisImagesLoading={cadAnalysisImagesLoading}
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
            cadContext={{ plan: cadPlan, svg2d: cad2dSvg, analysisImages: cadAnalysisImages }}
            onCodeAction={handleCadCodeAction}
          />
        </ResizablePanel>
      </>
    </ResizablePanelGroup>
  );
}
