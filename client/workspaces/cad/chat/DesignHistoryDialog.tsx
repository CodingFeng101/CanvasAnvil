import { useEffect, useState } from "react";
import { HistoryDialog, type HistoryItem } from "@/shared/chat/history-dialog";
import { CadDesignSession } from "../lib/design/design-session";
import type { CadDesign, SinglePlan } from "../lib/design/types";
import { isBuilding } from "../lib/design/types";

/** Walls and room names of one version, for a version saved before its picture was kept. */
function PlanThumbnail({ design }: { design: CadDesign }) {
  const plan: SinglePlan = isBuilding(design.plan) ? design.plan.floors[design.plan.cur]?.plan ?? design.plan.floors[0].plan : design.plan;
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const walls = plan.walls.filter((wall) => wall.status !== "removed" && nodes.has(wall.a) && nodes.has(wall.b));
  if (!walls.length) return <div className="text-xs text-muted-foreground">—</div>;
  const xs = plan.nodes.map((node) => node.x), ys = plan.nodes.map((node) => node.y);
  const pad = 400, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX, height = Math.max(...ys) + pad - minY;
  return (
    <svg viewBox={`${minX} ${minY} ${width} ${height}`} className="h-full w-full rounded bg-white" preserveAspectRatio="xMidYMid meet">
      {walls.map((wall) => {
        const a = nodes.get(wall.a)!, b = nodes.get(wall.b)!;
        return <line key={wall.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#334155" strokeWidth={Math.max(wall.t, 120)} strokeLinecap="square" />;
      })}
      {plan.rooms.map((room) => (
        <text key={room.id} x={room.x} y={room.y} fontSize={Math.max(width, height) / 22} textAnchor="middle" dominantBaseline="middle" fill="#0f172a">{room.name}</text>
      ))}
    </svg>
  );
}

export function DesignHistoryDialog({ open, onOpenChange, session, zh }: { open: boolean; onOpenChange: (open: boolean) => void; session: CadDesignSession; zh: boolean }) {
  const tr = (cn: string, en: string) => (zh ? cn : en);
  const [versions, setVersions] = useState<CadDesign[]>([]);
  const [shots, setShots] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    // Pick up manual edits in the designer before listing.
    void session.sync().then(() => setVersions(session.versions())).catch(() => setVersions(session.versions()));
    void session.shots().then(setShots);
  }, [open, session]);
  const source = (design: CadDesign) =>
    design.lastSource === "user" ? tr("手动修改", "Manual edit") : design.lastSource === "recognize" ? tr("识别导入", "Recognized") : tr("AI 生成/修改", "AI");
  const current = versions.length - 1;
  const items: HistoryItem[] = versions.map((design, index) => ({
    id: `${index}-${design.revision}`,
    timestamp: design.updatedAt,
    content: "",
    type: "json",
    // The designer's own picture of this version, else its walls.
    image: shots[CadDesignSession.shotKey(design)],
    thumbnail: <PlanThumbnail design={design} />,
    badge: source(design),
    current: index === current,
  }));

  return (
    <HistoryDialog
      showHistory={open}
      onToggleHistory={onOpenChange}
      history={items}
      title={tr("户型历史版本", "Floorplan history")}
      empty={tr("还没有户型版本。生成户型后，每次 AI 修改或手动修改都会存一个版本。", "No versions yet. Every AI or manual change to the floorplan is saved here.")}
      // The current floorplan goes into the history, so this can be undone too.
      onRestore={(item) => session.restoreVersion(items.indexOf(item))}
    />
  );
}
