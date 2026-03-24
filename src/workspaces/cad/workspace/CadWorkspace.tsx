import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageSquarePlus, Box, Image as ImageIcon, Table2, Download } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/workspaces/cad/ui/context-menu";
import { Button } from "@/workspaces/cad/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/workspaces/cad/ui/dialog";
import { PDFDocument } from "pdf-lib";
import { useUiLanguage } from "@/lib/use-ui-language";
import { toast } from "sonner";
import { getCadRenderSlotTitles } from "@/lib/cad-render-titles";

interface CadWorkspaceProps {
  onAddToChat?: (code: string) => void;
  onSvgChange?: (svg: string) => void;
  svg2d?: string;
  plan?: any;
  analysisImages?: { title: string; url: string }[];
  analysisImagesLoading?: boolean;
  images?: { title: string; url: string }[];
  imagesLoading?: boolean;
  bom?: { columns: string[]; rows: any[] } | null;
  focusPanel?: "analysis" | "2d" | "renders" | "bom" | null;
}

type ViewMode = "analysis" | "2d" | "renders" | "bom";

const EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"></svg>`;
const EMPTY_SENTINEL = "__EMPTY_SVG__";
const ENABLE_EDITOR_AUTOSYNC = false;
const SVG_EDITOR_IFRAME_PATH = "/svg-editor.html";

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

const unwrapMarkdownStrong = (text: string) => {
  let out = String(text || "").trim();
  for (let i = 0; i < 3; i += 1) {
    const fromAsterisks = out.replace(/^\*\*\s*([\s\S]*?)\s*\*\*$/u, "$1").trim();
    if (fromAsterisks !== out) {
      out = fromAsterisks;
      continue;
    }
    const fromUnderscores = out.replace(/^__\s*([\s\S]*?)\s*__$/u, "$1").trim();
    if (fromUnderscores !== out) {
      out = fromUnderscores;
      continue;
    }
    break;
  }
  return out;
};

const readBomCellText = (row: any, columns: string[], columnIndex: number) => {
  const raw = Array.isArray(row) ? row[columnIndex] : row?.[columns[columnIndex]];
  const text = String(raw ?? "").trim();
  if (columnIndex === 0) return unwrapMarkdownStrong(text);
  return text;
};

const NON_CONTENT_PARENTS = new Set([
  "defs",
  "marker",
  "pattern",
  "clippath",
  "mask",
  "symbol",
]);

const DRAWABLE_SELECTOR = [
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "image",
  "use",
  "foreignObject",
].join(",");

const isEffectivelyEmptySvg = (text: string) => {
  const normalized = normalizeSvgMarkup(text);
  if (!normalized) return true;
  if (
    normalized === normalizeSvgMarkup(EMPTY_SVG) ||
    /^<svg\b[^>]*>\s*<\/svg>$/i.test(normalized)
  ) {
    return true;
  }

  if (typeof DOMParser === "undefined") return false;
  try {
    const doc = new DOMParser().parseFromString(normalized, "image/svg+xml");
    if (doc.querySelector("parsererror")) return false;
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") return false;

    const nodes = svg.querySelectorAll(DRAWABLE_SELECTOR);
    for (const node of Array.from(nodes)) {
      let parent = node.parentElement;
      let inNonContent = false;
      while (parent) {
        const name = parent.tagName.toLowerCase();
        if (NON_CONTENT_PARENTS.has(name)) {
          inNonContent = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!inNonContent) return false;
    }
    return true;
  } catch {
    return false;
  }
};

export function CadWorkspace({
  onAddToChat,
  onSvgChange,
  svg2d,
  plan,
  analysisImages = [],
  analysisImagesLoading = false,
  images = [],
  imagesLoading = false,
  bom,
  focusPanel,
}: CadWorkspaceProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isSvgEditorReady, setIsSvgEditorReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [localImages, setLocalImages] = useState<Array<{ title: string; url: string }>>(() => {
    if (!Array.isArray(images)) return [];
    return images
      .filter((x: any) => x && typeof x.url === "string")
      .map((x: any) => ({
        title: typeof x.title === "string" ? x.title : "",
        url: String(x.url),
      }))
      .slice(0, 30);
  });

  const uiLang = useUiLanguage();
  const svgEditorIframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestLoadedSvgRef = useRef<string>("");
  const desiredSvgRef = useRef<string>("");
  const svgEditorRequestSeedRef = useRef(0);
  const svgEditorPendingRef = useRef<Map<string, (svg: string) => void>>(new Map());
  const lastCanvasRecoverAtRef = useRef(0);
  const externalSvgApplyAtRef = useRef(0);
  const EXTERNAL_APPLY_GUARD_MS = 2500;

  useEffect(() => {
    if (typeof svg2d === "string") {
      const normalized = normalizeSvgMarkup(svg2d);
      setSvgContent(normalized || null);
      desiredSvgRef.current = normalized;
      externalSvgApplyAtRef.current = Date.now();
      if (normalized) {
        loadSvgToEditorWithRetry(normalized);
        latestLoadedSvgRef.current = normalized;
      } else {
        postToSvgEditor({ type: "cad_svg_editor_clear" });
        latestLoadedSvgRef.current = EMPTY_SENTINEL;
      }
      return;
    }
    setSvgContent(null);
    desiredSvgRef.current = "";
    postToSvgEditor({ type: "cad_svg_editor_clear" });
    latestLoadedSvgRef.current = EMPTY_SENTINEL;
  }, [svg2d]);

  const postToSvgEditor = (payload: Record<string, unknown>) => {
    const win = svgEditorIframeRef.current?.contentWindow;
    if (!win) return false;
    win.postMessage(payload, window.location.origin);
    return true;
  };

  const handleSvgEditorIframeLoad = () => {
    setIsSvgEditorReady(false);
    const iframe = svgEditorIframeRef.current;
    const win = iframe?.contentWindow;
    if (!iframe || !win) return;
    try {
      const href = String(win.location.href || "");
      if (!href) return;
      const url = new URL(href, window.location.origin);
      const path = String(url.pathname || "");
      if (path !== SVG_EDITOR_IFRAME_PATH) {
        iframe.src = SVG_EDITOR_IFRAME_PATH;
        return;
      }
      const next = String(desiredSvgRef.current || "").trim();
      if (next) {
        loadSvgToEditorWithRetry(next);
        latestLoadedSvgRef.current = next;
      } else {
        postToSvgEditor({ type: "cad_svg_editor_clear" });
        latestLoadedSvgRef.current = EMPTY_SENTINEL;
      }
    } catch {
    }
  };

  const loadSvgToEditorWithRetry = (svg: string) => {
    const normalized = normalizeSvgMarkup(svg);
    if (!normalized) return false;
    const sent = postToSvgEditor({ type: "cad_svg_editor_load", svg: normalized });
    if (!sent) return false;
    const retryDelays = [120, 420, 1000, 2000, 3500, 5000];
    for (const delay of retryDelays) {
      window.setTimeout(() => {
        postToSvgEditor({ type: "cad_svg_editor_load", svg: normalized });
      }, delay);
    }
    return true;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const type = String((data as any).type || "");

      if (type === "cad_svg_editor_ready") {
        setIsSvgEditorReady(true);
        const next = String(desiredSvgRef.current || "").trim();
        if (next) {
          loadSvgToEditorWithRetry(next);
          latestLoadedSvgRef.current = next;
        } else {
          postToSvgEditor({ type: "cad_svg_editor_clear" });
          latestLoadedSvgRef.current = EMPTY_SENTINEL;
        }
        return;
      }

      if (type === "cad_svg_editor_export_response") {
        const requestId = String((data as any).requestId || "");
        const resolver = svgEditorPendingRef.current.get(requestId);
        if (!resolver) return;
        svgEditorPendingRef.current.delete(requestId);
        resolver(String((data as any).svg || ""));
        return;
      }

      if (type === "cad_svg_editor_load_result") {
        const ok = Boolean((data as any).ok);
        if (ok) return;
        const reason = String((data as any).reason || "").trim();
        if (reason) {
          toast.error(uiLang === "zh" ? `SVG加载失败：${reason}` : `SVG load failed: ${reason}`);
        } else {
          toast.error(uiLang === "zh" ? "SVG加载失败" : "SVG load failed");
        }
        const next = String(desiredSvgRef.current || "").trim();
        if (!next) return;
        window.setTimeout(() => {
          loadSvgToEditorWithRetry(next);
        }, 100);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      svgEditorPendingRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const next = normalizeSvgMarkup(typeof svgContent === "string" ? svgContent : "");
    desiredSvgRef.current = next;
    if (next) {
      if (latestLoadedSvgRef.current === next) return;
      if (loadSvgToEditorWithRetry(next)) {
        latestLoadedSvgRef.current = next;
      }
      return;
    }

    if (latestLoadedSvgRef.current === EMPTY_SENTINEL) return;
    if (postToSvgEditor({ type: "cad_svg_editor_clear" })) {
      latestLoadedSvgRef.current = EMPTY_SENTINEL;
    }
  }, [svgContent]);

  useEffect(() => {
    if (!Array.isArray(images) || images.length === 0) {
      setLocalImages([]);
      setPreviewImage(null);
      return;
    }
    let cancelled = false;

    const blobUrlToDataUrl = async (objectUrl: string) => {
      if (typeof window === "undefined") return "";
      if (!objectUrl || !objectUrl.startsWith("blob:")) return objectUrl;
      try {
        const resp = await fetch(objectUrl);
        const blob = await resp.blob();
        return await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onerror = () => resolve("");
          reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.readAsDataURL(blob);
        });
      } catch {
        return "";
      }
    };

    void (async () => {
      const mapped = await Promise.all(
        images.map(async (it) => {
          const rawUrl = typeof (it as any)?.url === "string" ? String((it as any).url) : "";
          if (!rawUrl) {
            return {
              title: typeof (it as any)?.title === "string" ? String((it as any).title) : "",
              url: "",
            };
          }
          const title = typeof (it as any)?.title === "string" ? String((it as any).title) : "";
          if (rawUrl.startsWith("blob:")) {
            const dataUrl = await blobUrlToDataUrl(rawUrl);
            return { title, url: dataUrl || "" };
          }
          return { title, url: rawUrl };
        })
      );
      if (cancelled) return;
      setLocalImages(mapped.slice(0, 7));
    })();

    return () => {
      cancelled = true;
    };
  }, [images]);

  useEffect(() => {
    if (!focusPanel) return;
    setViewMode(focusPanel);
  }, [focusPanel]);

  useEffect(() => {
    const emptyImages = !Array.isArray(images) || images.length === 0;
    const emptyBom = !bom || !Array.isArray(bom.columns) || bom.columns.length === 0;
    if (!plan && !svg2d && emptyImages && emptyBom && !focusPanel) {
      setViewMode("2d");
    }
  }, [plan, svg2d, images, bom, focusPanel]);

  const requestSvgFromEditor = async (opts?: { preferFallbackOnEmpty?: boolean }) => {
    const fallback = normalizeSvgMarkup(String(svgContent || svg2d || ""));
    if (!isSvgEditorReady) return fallback;

    const requestId = `cad-svg-export-${Date.now()}-${svgEditorRequestSeedRef.current++}`;
    return await new Promise<string>((resolve) => {
      const timer = window.setTimeout(() => {
        svgEditorPendingRef.current.delete(requestId);
        resolve(fallback);
      }, 2500);

      svgEditorPendingRef.current.set(requestId, (svg: string) => {
        window.clearTimeout(timer);
        const text = normalizeSvgMarkup(svg || "");
        if (opts?.preferFallbackOnEmpty) {
          if (text && isEffectivelyEmptySvg(text) && fallback) {
            resolve(fallback);
            return;
          }
          resolve(text || fallback);
          return;
        }
        resolve(text);
      });

      const posted = postToSvgEditor({ type: "cad_svg_editor_export_request", requestId });
      if (!posted) {
        window.clearTimeout(timer);
        svgEditorPendingRef.current.delete(requestId);
        resolve(fallback);
      }
    });
  };

  useEffect(() => {
    if (!ENABLE_EDITOR_AUTOSYNC) return;
    if (!isSvgEditorReady || viewMode !== "2d") return;
    const timer = window.setInterval(() => {
      void (async () => {
        // Workspace has been externally cleared: do not rehydrate stale SVG from iframe autosync.
        const propSvg = normalizeSvgMarkup(typeof svg2d === "string" ? svg2d : "");
        const current = normalizeSvgMarkup(typeof svgContent === "string" ? svgContent : "");
        if (!propSvg && !current) {
          if (latestLoadedSvgRef.current !== EMPTY_SENTINEL) {
            postToSvgEditor({ type: "cad_svg_editor_clear" });
            latestLoadedSvgRef.current = EMPTY_SENTINEL;
          }
          return;
        }

        const next = String(await requestSvgFromEditor({ preferFallbackOnEmpty: false }) || "").trim();
        if (!normalizeSvgMarkup(next)) return;
        const isEmptyCanvas = isEffectivelyEmptySvg(next);
        const desired = normalizeSvgMarkup(String(desiredSvgRef.current || ""));
        const now = Date.now();
        const inExternalApplyGuardWindow = now - externalSvgApplyAtRef.current < EXTERNAL_APPLY_GUARD_MS;
        if (inExternalApplyGuardWindow && desired && next !== desired) {
          // Ignore stale readback briefly after external SVG apply.
          loadSvgToEditorWithRetry(desired);
          return;
        }
        if (isEmptyCanvas && !current) {
          return;
        }
        if (isEmptyCanvas && current) {
          const now = Date.now();
          if (now - lastCanvasRecoverAtRef.current > 1000) {
            lastCanvasRecoverAtRef.current = now;
            loadSvgToEditorWithRetry(current);
          }
          return;
        }
        if (next === String(svgContent || "").trim()) return;
        setSvgContent(next);
        latestLoadedSvgRef.current = next;
        onSvgChange?.(next);
      })();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [isSvgEditorReady, viewMode, svgContent, svg2d, onSvgChange]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const exportSvg = async () => {
    const source = await requestSvgFromEditor({ preferFallbackOnEmpty: true });
    if (!source || isExporting) return;
    setIsExporting(true);
    try {
      const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      downloadBlob(blob, `floorplan-${Date.now()}.svg`);
    } finally {
      setIsExporting(false);
    }
  };

  const svgToPngDataUrl = async (svg: string, targetWidth = 1600) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      const load = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = url;
      await load;

      const vb = svg.match(/viewBox\s*=\s*"([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)"/i);
      const vbW = vb ? Number(vb[3]) : NaN;
      const vbH = vb ? Number(vb[4]) : NaN;
      const ratio =
        Number.isFinite(vbW) && Number.isFinite(vbH) && vbW > 0 && vbH > 0
          ? vbH / vbW
          : img.naturalHeight > 0 && img.naturalWidth > 0
            ? img.naturalHeight / img.naturalWidth
            : 9 / 16;
      const width = targetWidth;
      const height = Math.max(1, Math.round(width * ratio));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const exportSvgAsJpg = async () => {
    const source = await requestSvgFromEditor({ preferFallbackOnEmpty: true });
    if (!source || isExporting) return;
    setIsExporting(true);
    try {
      const pngDataUrl = await svgToPngDataUrl(source, 1600);
      if (!pngDataUrl) return;
      const img = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = pngDataUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 1600;
      canvas.height = img.naturalHeight || 900;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpgDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const base64 = jpgDataUrl.split(",")[1] || "";
      if (!base64) return;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      downloadBlob(new Blob([bytes], { type: "image/jpeg" }), `floorplan-${Date.now()}.jpg`);
    } catch (e) {
      console.error("Export SVG->JPG failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  const exportRendersPdf = async () => {
    const downloadable = localImages.filter((x) => x?.url);
    if (downloadable.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.create();
      for (const it of downloadable) {
        const res = await fetch(it.url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const contentType = String(res.headers.get("content-type") || "");
        const isJpg = contentType.includes("jpeg") || contentType.includes("jpg");
        const embedded = isJpg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
        const pageW = 960;
        const pageH = 540;
        const page = pdfDoc.addPage([pageW, pageH]);
        const scale = Math.min(pageW / embedded.width, pageH / embedded.height);
        const w = embedded.width * scale;
        const h = embedded.height * scale;
        page.drawImage(embedded, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      }
      const pdfBytes = await pdfDoc.save();
      downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `renders-${Date.now()}.pdf`);
    } catch (e) {
      console.error("Export renders PDF failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  const exportBomCsv = async () => {
    if (!bom || isExporting) return;
    setIsExporting(true);
    try {
      const esc = (v: any) => {
        const s = String(v ?? "");
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const rows: string[] = [];
      rows.push((bom.columns || []).map(esc).join(","));
      for (const r of bom.rows || []) {
        const fixed = (bom.columns || []).map((_, i) => esc(readBomCellText(r, bom.columns || [], i)));
        rows.push(fixed.join(","));
      }
      const csv = `\uFEFF${rows.join("\r\n")}`;
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `bom-${Date.now()}.csv`);
    } finally {
      setIsExporting(false);
    }
  };

  const renderSlots = useMemo(() => {
    const titles = getCadRenderSlotTitles(uiLang);
    return titles.map((fallbackTitle, idx) => {
      const item = localImages[idx];
      return {
        title: fallbackTitle,
        url: item?.url || "",
      };
    });
  }, [localImages, uiLang]);
  const analysisSlots = useMemo(() => {
    const fallbackTitles = [
      uiLang === "zh" ? "整体方案图" : "Overall Scheme",
      uiLang === "zh" ? "重点策略图" : "Key Strategy",
    ];
    return fallbackTitles.map((fallbackTitle, idx) => {
      const item = analysisImages[idx];
      return {
        title: typeof item?.title === "string" && item.title.trim() ? item.title : fallbackTitle,
        url: item?.url || "",
      };
    });
  }, [analysisImages, uiLang]);

  const hasRenderImages = localImages.some((x) => !!x?.url);

  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full bg-muted/20 relative overflow-hidden">
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-background/80 backdrop-blur rounded-xl border border-border/50 px-3 py-2 shadow-sm">
          <Button
            size="sm"
            variant={viewMode === "analysis" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("analysis")}
            title={uiLang === "zh" ? "查看分析图" : "View analysis images"}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {uiLang === "zh" ? "分析图" : "Analysis"}
          </Button>
          <Button
            size="sm"
            variant={viewMode === "2d" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("2d")}
            title={uiLang === "zh" ? "查看2D平面图" : "View 2D plan"}
          >
            <Box className="w-3.5 h-3.5" />
            2D
          </Button>
          <Button
            size="sm"
            variant={viewMode === "renders" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("renders")}
            title={uiLang === "zh" ? "查看装修图" : "View renders"}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {uiLang === "zh" ? "装修图" : "Renders"}
          </Button>
          <Button
            size="sm"
            variant={viewMode === "bom" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("bom")}
            title={uiLang === "zh" ? "查看物料清单" : "View BOM"}
          >
            <Table2 className="w-3.5 h-3.5" />
            {uiLang === "zh" ? "物料" : "BOM"}
          </Button>
          <div className="h-4 w-px bg-border/60 mx-1" />
          {viewMode === "2d" && (
            <>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportSvg} disabled={!svgContent || isExporting} title={uiLang === "zh" ? "导出SVG" : "Export SVG"}>
                <Download className="w-3.5 h-3.5" />
                SVG
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportSvgAsJpg} disabled={!svgContent || isExporting} title={uiLang === "zh" ? "导出JPG" : "Export JPG"}>
                <Download className="w-3.5 h-3.5" />
                JPG
              </Button>
            </>
          )}
          {viewMode === "renders" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportRendersPdf} disabled={!hasRenderImages || isExporting} title={uiLang === "zh" ? "导出装修图PDF" : "Export renders PDF"}>
              <Download className="w-3.5 h-3.5" />
              PDF
            </Button>
          )}
          {viewMode === "bom" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportBomCsv} disabled={!bom || isExporting} title={uiLang === "zh" ? "导出BOM CSV" : "Export BOM CSV"}>
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
          )}
        </div>

        {!svgContent && viewMode !== "2d" && viewMode !== "analysis" && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">{uiLang === "zh" ? "暂无 CAD 内容" : "No CAD content yet"}</p>
              <p className="text-xs">
                {uiLang === "zh"
                  ? "在右侧对话里先做需求分析，确认方案后生成 SVG（2D），满意后生成装修图。"
                  : "Use the chat on the right to define requirements, generate the 2D SVG, then generate renders."}
              </p>
            </div>
          </div>
        )}

        <div className="w-full h-full pt-16 p-6">
          {viewMode === "analysis" && (
            <div className="w-full h-full bg-white dark:bg-zinc-900 shadow-sm rounded-xl overflow-auto border border-border/50 p-4">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
                {analysisSlots.map((img, idx) => (
                  <div key={`${img.title}-${idx}`} className="rounded-xl border border-border/50 overflow-hidden bg-background">
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
                      <ImageIcon className="w-4 h-4" />
                      <span className="truncate flex-1">{img.title}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setPreviewImage(img)}
                          title={uiLang === "zh" ? "查看" : "View"}
                        >
                          <ImageIcon className="w-4 h-4" />
                        </Button>
                        <a
                          href={img.url || "#"}
                          download={`${img.title || (uiLang === "zh" ? "分析图" : "analysis")}.png`}
                          className="inline-flex"
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!img.url} title={uiLang === "zh" ? "下载" : "Download"}>
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                    <div className="aspect-video bg-muted/20">
                      {img.url ? (
                        <img src={img.url} alt={img.title} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground gap-2">
                          {analysisImagesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>{analysisImagesLoading ? (uiLang === "zh" ? "生成中" : "Generating") : (uiLang === "zh" ? "待生成" : "Pending")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === "2d" && (
            <div className="w-full h-full bg-white shadow-sm rounded-xl overflow-hidden border border-border/50">
              <iframe
                ref={svgEditorIframeRef}
                title={uiLang === "zh" ? "CAD SVG 编辑器" : "CAD SVG Editor"}
                src={SVG_EDITOR_IFRAME_PATH}
                className="h-full w-full border-0"
                onLoad={handleSvgEditorIframeLoad}
              />
            </div>
          )}

          {viewMode === "renders" && (
            <div className="w-full h-full bg-white dark:bg-zinc-900 shadow-sm rounded-xl overflow-auto border border-border/50 p-4">
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                {renderSlots.map((img, idx) => (
                  <div key={`${img.title}-${idx}`} className="rounded-xl border border-border/50 overflow-hidden bg-background">
                    <div className="px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
                      <ImageIcon className="w-4 h-4" />
                      <span className="truncate flex-1">{img.title}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => img.url && setPreviewImage(img)}
                          disabled={!img.url}
                          title={uiLang === "zh" ? "查看" : "View"}
                        >
                          <ImageIcon className="w-4 h-4" />
                        </Button>
                        <a
                          href={img.url || "#"}
                          download={`${img.title || (uiLang === "zh" ? "装修图" : "render")}.png`}
                          className="inline-flex"
                        >
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!img.url} title={uiLang === "zh" ? "下载" : "Download"}>
                            <Download className="w-4 h-4" />
                          </Button>
                        </a>
                      </div>
                    </div>
                    <div className="aspect-video bg-muted/20">
                      {img.url ? (
                        <img src={img.url} alt={img.title} className="w-full h-full object-cover cursor-pointer" onClick={() => setPreviewImage(img)} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground gap-2">
                          {imagesLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          <span>{imagesLoading ? (uiLang === "zh" ? "生成中" : "Generating") : (uiLang === "zh" ? "待生成" : "Pending")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewMode === "bom" && (
            <div className="w-full h-full bg-white dark:bg-zinc-900 shadow-sm rounded-xl overflow-auto border border-border/50 p-4">
              {!bom || !Array.isArray(bom.columns) || bom.columns.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                  {uiLang === "zh" ? "暂无物料清单" : "No BOM yet"}
                </div>
              ) : (
                <div className="w-full overflow-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left border-b border-border/60">
                        {bom.columns.map((c, i) => (
                          <th key={`${c}-${i}`} className="py-2 px-2 font-medium text-foreground/80 whitespace-normal break-words">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(Array.isArray(bom.rows) ? bom.rows : []).map((r, i) => (
                        <tr key={i} className="border-b border-border/40">
                          {bom.columns.map((_, ci) => (
                            <td key={ci} className="py-2 px-2 text-foreground/90 whitespace-normal break-words">
                              {readBomCellText(r, bom.columns, ci)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem
          onClick={async () => {
            if (!onAddToChat) return;
            if (viewMode === "analysis") onAddToChat(JSON.stringify({ type: "cad_analysis_images", images: analysisSlots }, null, 2));
            else if (viewMode === "2d") {
              const latest = await requestSvgFromEditor({ preferFallbackOnEmpty: true });
              if (latest) onAddToChat(latest);
            }
            else if (viewMode === "renders" && localImages.length > 0) onAddToChat(JSON.stringify({ type: "cad_images", prompts: localImages }, null, 2));
            else if (viewMode === "bom" && bom) onAddToChat(JSON.stringify({ type: "cad_bom", columns: bom.columns, rows: bom.rows }, null, 2));
            else if (plan) onAddToChat(JSON.stringify(plan, null, 2));
          }}
          className="cursor-pointer gap-2"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>{uiLang === "zh" ? "添加到对话" : "Add to chat"}</span>
        </ContextMenuItem>
      </ContextMenuContent>

      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="sm:max-w-[920px] max-w-[calc(100%-2rem)] p-4">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-base">{previewImage?.title || (uiLang === "zh" ? "装修图" : "Render")}</DialogTitle>
          </DialogHeader>
          <div className="w-full">
            {previewImage?.url ? (
              <div className="space-y-3">
                <div className="flex items-center justify-end">
                  <a
                    href={previewImage.url}
                    download={`${previewImage.title || (uiLang === "zh" ? "装修图" : "render")}.png`}
                    className="inline-flex"
                  >
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs" title={uiLang === "zh" ? "下载图片" : "Download image"}>
                      <Download className="w-4 h-4 mr-1" />
                      {uiLang === "zh" ? "下载图片" : "Download image"}
                    </Button>
                  </a>
                </div>
                <div className="rounded-lg border border-border/50 overflow-hidden bg-muted/10">
                  <img src={previewImage.url} alt={previewImage.title} className="w-full h-auto max-h-[70vh] object-contain" />
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  );
}
