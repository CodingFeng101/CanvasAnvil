import React, { useMemo, useState, useEffect } from 'react';
import { generateChatMessage } from '@/lib/ai-client';
import { Loader2, MessageSquarePlus, Copy, Check, Box, Layers3 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { Cad3DPreview } from "@/components/workspaces/Cad3DPreview";

interface CadWorkspaceProps {
  onAddToChat?: (code: string) => void;
  code?: string; // New prop for incoming code (SVG or Python)
}

export function CadWorkspace({ onAddToChat, code }: CadWorkspaceProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [drawioXml, setDrawioXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [freecadCode, setFreecadCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"2d" | "3d" | "freecad">("2d");
  const [isGenerating3d, setIsGenerating3d] = useState(false);
  const [meshUrl, setMeshUrl] = useState<string | null>(null);
  const [meshError, setMeshError] = useState<string | null>(null);
  const [isRunningFreecad, setIsRunningFreecad] = useState(false);
  const [sectionCut, setSectionCut] = useState(true);

  useEffect(() => {
    if (code) {
      const trimmed = code.trim();
      setMeshUrl(null);
      setMeshError(null);
      if (trimmed.startsWith('<svg')) {
        setSvgContent(code);
        setDrawioXml(null);
        setViewMode("2d");
        return;
      }
      if (trimmed.startsWith('<mxGraphModel') || trimmed.startsWith('<mxfile')) {
        setDrawioXml(code);
        setSvgContent(null);
        setViewMode("2d");
        return;
      }
      setFreecadCode(code);
      setViewMode("freecad");
    }
  }, [code]);

  const handleCopyCode = async () => {
    if (freecadCode) {
      await navigator.clipboard.writeText(freecadCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const freecadServerBase = (import.meta as any).env?.VITE_FREECAD_SERVER || "http://localhost:43110";

  const normalizeMeshUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return `${freecadServerBase}${url}`;
  };

  const runFreecad = async (codeOverride?: string) => {
    const codeToRun = (codeOverride ?? freecadCode).trim();
    if (!codeToRun || isRunningFreecad) return;
    setIsRunningFreecad(true);
    setMeshError(null);
    try {
      const response = await fetch(`${freecadServerBase}/api/freecad/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToRun }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "FreeCAD 执行失败");
      }
      const data = await response.json();
      const resolvedUrl = normalizeMeshUrl(data.meshUrl || data.url || "");
      if (!resolvedUrl) throw new Error("未返回网格地址");
      setMeshUrl(resolvedUrl);
      setViewMode("3d");
    } catch (e) {
      const message = e instanceof Error ? e.message : "FreeCAD 执行失败";
      setMeshError(message);
    } finally {
      setIsRunningFreecad(false);
    }
  };

  const canShow3d = !!meshUrl || !!svgContent || !!freecadCode;

  const handleGenerate3dFrom2d = async () => {
    if ((!svgContent && !drawioXml) || isGenerating3d) return;
    setIsGenerating3d(true);
    try {
      const prompt = `You are a CAD assistant using FreeCAD Python.
Input is a 2D floor plan, provided as draw.io XML or SVG.
Goal: generate a real 3D model in FreeCAD (walls/rooms/openings) based on the 2D plan.

Requirements:
- Output ONLY Python code for FreeCAD.
- The script must be runnable inside FreeCAD's Python console/macros.
- Prefer robust geometry: create closed wires, make faces, then extrude solids.
- Use a default wall height of 3000 mm and wall thickness of 200 mm unless specified.
- Create a new document and add solids.
- Add a base/floor slab and extrude walls upward along +Z.
- Keep Z scale realistic. Do not generate a "flat" model.

If draw.io XML is provided:
- Treat rectangles/lines/polylines as plan elements (walls/rooms).
- Use element labels to infer types: "wall", "door", "window", "room".
- Assume 1 draw.io unit = 10 mm if no other scale.

Input:
${drawioXml ? `\`\`\`xml\n${drawioXml}\n\`\`\`` : `\`\`\`svg\n${svgContent}\n\`\`\``}
`;

      const response = await generateChatMessage([{ role: "user", content: prompt }]);
      const match = response.match(/```python\s*([\s\S]*?)```/);
      const py = match ? match[1].trim() : response.trim();
      setFreecadCode(py);
      setMeshUrl(null);
      await runFreecad(py);
    } catch (e) {
      console.error("Failed to generate FreeCAD code", e);
    } finally {
      setIsGenerating3d(false);
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
            disabled={!svgContent && !drawioXml}
          >
            <Box className="w-3.5 h-3.5" />
            2D
          </Button>
          <Button
            size="sm"
            variant={viewMode === "3d" ? "default" : "outline"}
            className="h-7 px-2 text-xs gap-1"
            onClick={() => {
              if (meshUrl) {
                setViewMode("3d");
                return;
              }
              if (freecadCode) {
                runFreecad();
                return;
              }
              setViewMode("3d");
            }}
            disabled={!canShow3d}
          >
            <Layers3 className="w-3.5 h-3.5" />
            3D
          </Button>
          <Button
            size="sm"
            variant={sectionCut ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => setSectionCut(v => !v)}
            disabled={!canShow3d}
          >
            剖切
          </Button>
          <Button
            size="sm"
            variant={viewMode === "freecad" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => setViewMode("freecad")}
            disabled={!freecadCode}
          >
            FreeCAD
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={handleGenerate3dFrom2d}
            disabled={(!svgContent && !drawioXml) || isGenerating3d}
          >
            {isGenerating3d ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            由 2D 生成 FreeCAD 3D
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => runFreecad()}
            disabled={!freecadCode || isRunningFreecad}
          >
            {isRunningFreecad ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : null}
            运行 FreeCAD 生成 3D
          </Button>
        </div>

        {!svgContent && !freecadCode && !loading && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p className="mb-2">暂无 CAD 内容</p>
              <p className="text-xs">在右侧对话里让 AI 先生成 SVG（2D），满意后再生成 FreeCAD（3D）。</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-600" />
            <p>正在生成 2D 视图...</p>
          </div>
        )}

        <div className="w-full h-full pt-16 p-6">
          {viewMode === "2d" && svgContent && !loading && (
            <div className="w-full h-full bg-white shadow-sm rounded-xl overflow-hidden border border-border/50 p-6 flex items-center justify-center">
              <div className="w-full h-full overflow-auto" dangerouslySetInnerHTML={{ __html: svgContent }} />
            </div>
          )}
          {viewMode === "2d" && !svgContent && drawioXml && !loading && (
            <div className="w-full h-full bg-zinc-950 shadow-sm rounded-xl overflow-auto border border-border/50 p-4 relative">
              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap">{drawioXml}</pre>
            </div>
          )}

          {viewMode === "3d" && (svgContent || meshUrl) && (
            <div className="w-full h-full grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-border/50 shadow-sm overflow-hidden">
                <div className="h-full min-h-[360px]">
                  <Cad3DPreview
                    svg={meshUrl ? undefined : svgContent || undefined}
                    meshUrl={meshUrl || undefined}
                    depth={240}
                    sectionCut={sectionCut}
                  />
                </div>
              </div>
              <div className="bg-zinc-950 rounded-xl border border-border/50 shadow-sm overflow-hidden relative">
                <div className="absolute top-2 right-2">
                  <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800" disabled={!freecadCode}>
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="h-full max-h-[70vh] overflow-auto p-4">
                  {meshError && (
                    <div className="text-red-400 text-xs mb-2 whitespace-pre-wrap">{meshError}</div>
                  )}
                  <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap">{freecadCode || "点击「由 2D 生成 3D」生成 FreeCAD 脚本。"}</pre>
                </div>
              </div>
            </div>
          )}

          {viewMode === "freecad" && freecadCode && (
            <div className="w-full h-full bg-zinc-950 shadow-sm rounded-xl overflow-auto border border-border/50 p-4 relative">
              <div className="absolute top-2 right-2">
                <Button variant="ghost" size="icon" onClick={handleCopyCode} className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap">{freecadCode}</pre>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onClick={() => onAddToChat && onAddToChat(svgContent || drawioXml || freecadCode)} className="cursor-pointer gap-2">
          <MessageSquarePlus className="w-4 h-4" />
          <span>添加到对话</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
