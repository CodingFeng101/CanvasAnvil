import React, { useState, useEffect } from 'react';
import { Loader2, MessageSquarePlus, Box, Image as ImageIcon, Table2, Download } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PDFDocument } from "pdf-lib";
import { useUiLanguage } from "@/lib/use-ui-language";

interface CadWorkspaceProps {
  onAddToChat?: (code: string) => void;
  svg2d?: string;
  plan?: any;
  images?: { title: string; url: string }[];
  imagesLoading?: boolean;
  bom?: { columns: string[]; rows: any[] } | null;
  focusPanel?: "2d" | "renders" | "bom" | null;
}

export function CadWorkspace({ onAddToChat, svg2d, plan, images = [], imagesLoading = false, bom, focusPanel }: CadWorkspaceProps) {
  const CAD_RENDERS_STORAGE_KEY = "unified-ai-workspace-cad-renders-v1";
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "renders" | "bom">("2d");
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [localImages, setLocalImages] = useState<Array<{ title: string; url: string }>>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(CAD_RENDERS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x: any) => x && typeof x.url === "string" && !String(x.url).startsWith("blob:"))
        .map((x: any) => ({
          title: typeof x.title === "string" ? x.title : "",
          url: String(x.url),
        }));
    } catch {
      return [];
    }
  });
  const uiLang = useUiLanguage();

  useEffect(() => {
    if (typeof svg2d === "string") {
      setSvgContent(svg2d);
      return;
    }
    setSvgContent(null);
  }, [svg2d]);

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
          if (!rawUrl) return null;
          const title = typeof (it as any)?.title === "string" ? String((it as any).title) : "";
          if (rawUrl.startsWith("blob:")) {
            const dataUrl = await blobUrlToDataUrl(rawUrl);
            if (!dataUrl) return null;
            return { title, url: dataUrl };
          }
          return { title, url: rawUrl };
        })
      );
      if (cancelled) return;
      const cleaned = mapped.filter(Boolean) as Array<{ title: string; url: string }>;
      setLocalImages(cleaned);
    })();

    return () => {
      cancelled = true;
    };
  }, [images]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stable = localImages.filter((x) => x && typeof x.url === "string" && !x.url.startsWith("blob:")).slice(0, 30);
      localStorage.setItem(CAD_RENDERS_STORAGE_KEY, JSON.stringify(stable));
    } catch {
    }
  }, [localImages]);

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
    if (!svg2d || isExporting) return;
    setIsExporting(true);
    try {
      const blob = new Blob([svg2d], { type: "image/svg+xml;charset=utf-8" });
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

  const exportSvgAsPdf = async () => {
    if (!svg2d || isExporting) return;
    setIsExporting(true);
    try {
      const pngDataUrl = await svgToPngDataUrl(svg2d, 1600);
      if (!pngDataUrl) return;
      const base64 = pngDataUrl.split(",")[1] || "";
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pdfDoc = await PDFDocument.create();
      const img = await pdfDoc.embedPng(bytes);
      const page = pdfDoc.addPage([960, 540]);
      const scale = Math.min(960 / img.width, 540 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (960 - w) / 2, y: (540 - h) / 2, width: w, height: h });
      const pdfBytes = await pdfDoc.save();
      downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), `floorplan-${Date.now()}.pdf`);
    } catch (e) {
      console.error("Export SVG->PDF failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  const exportRendersPdf = async () => {
    if (localImages.length === 0 || isExporting) return;
    setIsExporting(true);
    try {
      const pdfDoc = await PDFDocument.create();
      for (const it of localImages) {
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
        const arr = Array.isArray(r) ? r : [];
        const fixed = (bom.columns || []).map((_, i) => esc(arr[i] ?? ""));
        rows.push(fixed.join(","));
      }
      const csv = `\uFEFF${rows.join("\r\n")}`;
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `bom-${Date.now()}.csv`);
    } finally {
      setIsExporting(false);
    }
  };
  
  return (
    <ContextMenu>
      <ContextMenuTrigger className="w-full h-full bg-muted/20 relative overflow-hidden">
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-background/80 backdrop-blur rounded-xl border border-border/50 px-3 py-2 shadow-sm">
          <Button
            size="sm"
            variant={viewMode === "2d" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("2d")}
            disabled={!svgContent}
          >
            <Box className="w-3.5 h-3.5" />
            2D
          </Button>
          <Button
            size="sm"
            variant={viewMode === "renders" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("renders")}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {uiLang === "zh" ? "装修图" : "Renders"}
          </Button>
          <Button
            size="sm"
            variant={viewMode === "bom" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("bom")}
          >
            <Table2 className="w-3.5 h-3.5" />
            {uiLang === "zh" ? "物料" : "BOM"}
          </Button>
          <div className="h-4 w-px bg-border/60 mx-1" />
          {viewMode === "2d" && (
            <>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportSvg} disabled={!svg2d || isExporting}>
                <Download className="w-3.5 h-3.5" />
                SVG
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportSvgAsPdf} disabled={!svg2d || isExporting}>
                <Download className="w-3.5 h-3.5" />
                PDF
              </Button>
            </>
          )}
          {viewMode === "renders" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportRendersPdf} disabled={localImages.length === 0 || isExporting}>
              <Download className="w-3.5 h-3.5" />
              PDF
            </Button>
          )}
          {viewMode === "bom" && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={exportBomCsv} disabled={!bom || isExporting}>
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
          )}
        </div>

        {!svgContent && (
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
          {viewMode === "2d" && svgContent && (
            <div className="w-full h-full bg-white shadow-sm rounded-xl overflow-hidden border border-border/50 p-6 flex items-center justify-center">
              <div className="w-full h-full overflow-auto" dangerouslySetInnerHTML={{ __html: svgContent }} />
            </div>
          )}

          {viewMode === "renders" && (
            <div className="w-full h-full bg-white dark:bg-zinc-900 shadow-sm rounded-xl overflow-auto border border-border/50 p-4">
              {imagesLoading && localImages.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uiLang === "zh" ? "正在生成装修图…" : "Generating renders…"}</span>
                </div>
              ) : localImages.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">
                  {uiLang === "zh" ? "暂无装修图" : "No renders yet"}
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {localImages.map((img, idx) => (
                    <div key={`${img.url}-${idx}`} className="rounded-xl border border-border/50 overflow-hidden bg-background">
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
                          <a href={img.url} download={`${img.title || "render"}.png`} className="inline-flex">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={uiLang === "zh" ? "下载" : "Download"}>
                              <Download className="w-4 h-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                      <div className="aspect-video bg-muted/20 cursor-pointer" onClick={() => setPreviewImage(img)}>
                        <img src={img.url} alt={img.title} className="w-full h-full object-cover" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                              {Array.isArray(r) ? String(r[ci] ?? "") : String(r?.[bom.columns[ci]] ?? "")}
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
          onClick={() => {
            if (!onAddToChat) return;
            if (viewMode === "2d" && svgContent) onAddToChat(svgContent);
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
                  <a href={previewImage.url} download={`${previewImage.title || "render"}.png`} className="inline-flex">
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
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
