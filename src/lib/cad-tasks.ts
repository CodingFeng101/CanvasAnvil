import type { ChatMessage } from "@/lib/ai-client";

import cadBomPromptTemplate from "../../agent/cad/bom-prompt.md?raw";
import cadImagesMasterRenovationSchemeTemplate from "../../agent/cad/images-agents/master-renovation-scheme.agent.md?raw";
import cadRenovationPlanLayoutTemplate from "../../agent/cad/images-agents/renovation-plan-layout.agent.md?raw";
import cadFloorFinishPlanTemplate from "../../agent/cad/images-agents/floor-finish-plan.agent.md?raw";
import cadReflectedCeilingPlanTemplate from "../../agent/cad/images-agents/reflected-ceiling-plan.agent.md?raw";
import cadWallSettingOutPlanTemplate from "../../agent/cad/images-agents/wall-setting-out-plan.agent.md?raw";
import cadMepPlanTemplate from "../../agent/cad/images-agents/mep-plan.agent.md?raw";
import cadElevationIndexAndInteriorElevationsTemplate from "../../agent/cad/images-agents/elevation-index-and-interior-elevations.agent.md?raw";
import cadDetailDrawingsTemplate from "../../agent/cad/images-agents/detail-drawings.agent.md?raw";

function applyTemplate(template: string, vars: Record<string, string>) {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

export function buildCadBomPrompt(args: { planJson: string; svg2d: string }) {
  return applyTemplate(cadBomPromptTemplate, {
    planJson: String(args.planJson || ""),
    svg2d: String(args.svg2d || ""),
  });
}

export function buildCadTasksSystemContent(args: {
  globalSystemPrompt: string;
  globalConstraints: string;
}) {
  return [args.globalSystemPrompt, args.globalConstraints].filter(Boolean).join("\n\n");
}

export function buildCadBomMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
}): ChatMessage[] {
  return [
    { role: "system", content: args.systemContent },
    { role: "user", content: buildCadBomPrompt({ planJson: args.planJson, svg2d: args.svg2d }) },
  ];
}

export function buildCadImagesMasterMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
}): ChatMessage[] {
  return [
    { role: "system", content: args.systemContent },
    {
      role: "user",
      content: applyTemplate(cadImagesMasterRenovationSchemeTemplate, {
        planJson: String(args.planJson || ""),
        svg2d: String(args.svg2d || ""),
      }),
    },
  ];
}

export function buildCadImagesSheetMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
  masterSchemeJson?: string;
}): Array<{ sheetId: string; messages: ChatMessage[] }> {
  const sheets: Array<{ sheetId: string; template: string }> = [
    { sheetId: "renovation_plan_layout", template: cadRenovationPlanLayoutTemplate },
    { sheetId: "floor_finish_plan", template: cadFloorFinishPlanTemplate },
    { sheetId: "reflected_ceiling_plan", template: cadReflectedCeilingPlanTemplate },
    { sheetId: "wall_setting_out_plan", template: cadWallSettingOutPlanTemplate },
    { sheetId: "mep_plan", template: cadMepPlanTemplate },
    { sheetId: "elevation_index_and_interior_elevations", template: cadElevationIndexAndInteriorElevationsTemplate },
    { sheetId: "detail_drawings", template: cadDetailDrawingsTemplate },
  ];

  return sheets.map((s) => ({
    sheetId: s.sheetId,
    messages: [
      { role: "system", content: args.systemContent },
      {
        role: "user",
        content: applyTemplate(s.template, {
          planJson: String(args.planJson || ""),
          svg2d: String(args.svg2d || ""),
          masterSchemeJson: String(args.masterSchemeJson || ""),
        }),
      },
    ],
  }));
}
