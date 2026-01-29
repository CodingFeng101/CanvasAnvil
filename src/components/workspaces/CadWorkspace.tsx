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
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "renders" | "bom">("2d");
  const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    if (typeof svg2d === "string") {
      setSvgContent(svg2d);
    }
  }, [svg2d]);

  useEffect(() => {
    if (!focusPanel) return;
    setViewMode(focusPanel);
  }, [focusPanel]);
  
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
            disabled={(!images || images.length === 0) && !imagesLoading}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            装修图
          </Button>
          <Button
            size="sm"
            variant={viewMode === "bom" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setViewMode("bom")}
          >
            <Table2 className="w-3.5 h-3.5" />
            物料
          </Button>
        </div>

        {!svgContent && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">暂无 CAD 内容</p>
              <p className="text-xs">在右侧对话里先做需求分析，确认方案后生成 SVG（2D），满意后生成装修图。</p>
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
              {imagesLoading && images.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在生成装修图…</span>
                </div>
              ) : images.length === 0 ? (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">暂无装修图</div>
              ) : (
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {images.map((img, idx) => (
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
                            title="查看"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </Button>
                          <a href={img.url} download={`${img.title || "render"}.png`} className="inline-flex">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="下载">
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
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-sm">暂无物料清单</div>
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
            else if (viewMode === "renders" && images.length > 0) onAddToChat(JSON.stringify({ type: "cad_images", prompts: images }, null, 2));
            else if (viewMode === "bom" && bom) onAddToChat(JSON.stringify({ type: "cad_bom", columns: bom.columns, rows: bom.rows }, null, 2));
            else if (plan) onAddToChat(JSON.stringify(plan, null, 2));
          }}
          className="cursor-pointer gap-2"
        >
          <MessageSquarePlus className="w-4 h-4" />
          <span>添加到对话</span>
        </ContextMenuItem>
      </ContextMenuContent>

      <Dialog open={!!previewImage} onOpenChange={(open) => { if (!open) setPreviewImage(null); }}>
        <DialogContent className="sm:max-w-[920px] max-w-[calc(100%-2rem)] p-4">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-base">{previewImage?.title || "装修图"}</DialogTitle>
          </DialogHeader>
          <div className="w-full">
            {previewImage?.url ? (
              <div className="space-y-3">
                <div className="flex items-center justify-end">
                  <a href={previewImage.url} download={`${previewImage.title || "render"}.png`} className="inline-flex">
                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs">
                      <Download className="w-4 h-4 mr-1" />
                      下载图片
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
