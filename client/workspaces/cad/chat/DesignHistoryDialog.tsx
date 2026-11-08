import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import type { CadDesignSession } from "../lib/design/design-session";
import type { CadDesign, SinglePlan } from "../lib/design/types";
import { isBuilding } from "../lib/design/types";

/** Walls and room names of one version, drawn small enough for a thumbnail. */
function PlanThumbnail({ design }: { design: CadDesign }) {
  const plan: SinglePlan = isBuilding(design.plan) ? design.plan.floors[design.plan.cur]?.plan ?? design.plan.floors[0].plan : design.plan;
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const walls = plan.walls.filter((wall) => wall.status !== "removed" && nodes.has(wall.a) && nodes.has(wall.b));
  if (!walls.length) return <div className="text-xs text-muted-foreground">—</div>;
  const xs = plan.nodes.map((node) => node.x), ys = plan.nodes.map((node) => node.y);
  const pad = 400, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX, height = Math.max(...ys) + pad - minY;
  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {walls.map((wall) => {
        const a = nodes.get(wall.a)!, b = nodes.get(wall.b)!;
        return <line key={wall.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#334155" strokeWidth={Math.max(wall.t, 120)} strokeLinecap="square" />;
      })}
      {plan.furniture.map((item) => <circle key={item.id} cx={item.x} cy={item.y} r={Math.max(width, height) / 140} fill="#94a3b8" />)}
      {plan.rooms.map((room) => (
        <text key={room.id} x={room.x} y={room.y} fontSize={Math.max(width, height) / 22} textAnchor="middle" dominantBaseline="middle" fill="#0f172a">{room.name}</text>
      ))}
    </svg>
  );
}

export function DesignHistoryDialog({ open, onOpenChange, session, zh }: { open: boolean; onOpenChange: (open: boolean) => void; session: CadDesignSession; zh: boolean }) {
  const tr = (cn: string, en: string) => (zh ? cn : en);
  const [versions, setVersions] = useState<CadDesign[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setError("");
    // Pick up manual edits in the designer before listing.
    void session.sync().then(() => setVersions(session.versions())).catch(() => setVersions(session.versions()));
  }, [open, session]);
  const source = (design: CadDesign) =>
    design.lastSource === "user" ? tr("手动修改", "Manual edit") : design.lastSource === "recognize" ? tr("识别导入", "Recognized") : tr("AI 生成/修改", "AI");
  const restore = async () => {
    if (selected === null) return;
    try {
      await session.restoreVersion(selected);
      onOpenChange(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const current = versions.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto" data-testid="cad-history-dialog">
        <DialogHeader>
          <DialogTitle>{tr("户型历史版本", "Floorplan history")}</DialogTitle>
        </DialogHeader>
        {versions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">{tr("还没有户型版本。生成户型后，每次 AI 修改或手动修改都会存一个版本。", "No versions yet. Every AI or manual change to the floorplan is saved here.")}</div>
        ) : (
          <div className="grid grid-cols-2 gap-4 py-4 md:grid-cols-3">
            {versions.map((design, index) => ({ design, index })).reverse().map(({ design, index }) => (
              <button
                type="button"
                key={`${index}-${design.revision}`}
                disabled={index === current}
                onClick={() => setSelected(index)}
                className={`rounded-md border p-2 text-left transition-colors hover:border-primary disabled:cursor-default disabled:hover:border-border ${selected === index ? "border-primary ring-2 ring-primary" : ""}`}
              >
                <div className="flex aspect-video items-center justify-center overflow-hidden rounded bg-white p-1">
                  <PlanThumbnail design={design} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{tr(`版本 ${index + 1}`, `Version ${index + 1}`)}{index === current ? tr("（当前）", " (current)") : ""}</span>
                  <span className="text-muted-foreground">{source(design)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(design.updatedAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          {error && <div className="flex-1 text-sm text-destructive">{error}</div>}
          {selected !== null ? (
            <>
              <div className="flex-1 text-sm text-muted-foreground">
                {tr(`恢复到版本 ${selected + 1}？当前户型会保留在历史里。`, `Restore version ${selected + 1}? The current floorplan stays in the history.`)}
              </div>
              <Button variant="outline" onClick={() => setSelected(null)}>{tr("取消", "Cancel")}</Button>
              <Button onClick={() => void restore()}>{tr("恢复", "Restore")}</Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tr("关闭", "Close")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
