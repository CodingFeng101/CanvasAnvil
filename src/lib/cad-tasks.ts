import type { ChatMessage } from "@/lib/ai-client";

import cadBomPromptTemplate from "../../agent/cad/bom-prompt.md?raw";
import cadImagesMasterRenovationSchemeTemplate from "../../agent/cad/images-agents/master-renovation-scheme.md?raw";
import cadRenovationPlanLayoutTemplate from "../../agent/cad/images-agents/renovation-plan-layout.md?raw";
import cadFloorFinishPlanTemplate from "../../agent/cad/images-agents/floor-finish-plan.md?raw";
import cadReflectedCeilingPlanTemplate from "../../agent/cad/images-agents/reflected-ceiling-plan.md?raw";
import cadWallSettingOutPlanTemplate from "../../agent/cad/images-agents/wall-setting-out-plan.md?raw";
import cadMepPlanTemplate from "../../agent/cad/images-agents/mep-plan.md?raw";
import cadElevationIndexAndInteriorElevationsTemplate from "../../agent/cad/images-agents/elevation-index-and-interior-elevations.md?raw";
import cadDetailDrawingsTemplate from "../../agent/cad/images-agents/detail-drawings.md?raw";
import cadOverallAnalysisBoardTemplate from "../../agent/cad/images-agents/overall-analysis-board.md?raw";
import cadKeyStrategyBoardTemplate from "../../agent/cad/images-agents/key-strategy-board.md?raw";

function applyTemplate(template: string, vars: Record<string, string>) {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

export function buildCadBomPrompt(args: { planJson: string; svg2d: string; outputLanguage?: string }) {
  const base = applyTemplate(cadBomPromptTemplate, {
    planJson: String(args.planJson || ""),
    svg2d: String(args.svg2d || ""),
  });
  if (!args.outputLanguage) return base;
  return `${base}\n\nOutput language: ${args.outputLanguage}`;
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
  outputLanguage?: string;
}): ChatMessage[] {
  return [
    { role: "system", content: args.systemContent },
    { role: "user", content: buildCadBomPrompt({ planJson: args.planJson, svg2d: args.svg2d, outputLanguage: args.outputLanguage }) },
  ];
}

export function buildCadImagesMasterMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
  outputLanguage?: string;
}): ChatMessage[] {
  const base = applyTemplate(cadImagesMasterRenovationSchemeTemplate, {
    planJson: String(args.planJson || ""),
    svg2d: String(args.svg2d || ""),
  });
  const withLang = args.outputLanguage ? `${base}\n\nOutput language: ${args.outputLanguage}` : base;
  return [
    { role: "system", content: args.systemContent },
    { role: "user", content: withLang },
  ];
}

export function buildCadImagesSheetMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
  masterSchemeJson?: string;
  outputLanguage?: string;
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
        content: (() => {
          const base = applyTemplate(s.template, {
            planJson: String(args.planJson || ""),
            svg2d: String(args.svg2d || ""),
            masterSchemeJson: String(args.masterSchemeJson || ""),
          });
          return args.outputLanguage ? `${base}\n\nOutput language: ${args.outputLanguage}` : base;
        })(),
      },
    ],
  }));
}

export function buildCadAnalysisMessages(args: {
  systemContent: string;
  planDesign: string;
  outputLanguage?: string;
}): Array<{ imageId: "overall_analysis" | "key_strategy"; messages: ChatMessage[] }> {
  const resolvedOutputLanguage = String(args.outputLanguage || "English").trim() || "English";
  const specs: Array<{ imageId: "overall_analysis" | "key_strategy"; template: string }> = [
    { imageId: "overall_analysis", template: cadOverallAnalysisBoardTemplate },
    { imageId: "key_strategy", template: cadKeyStrategyBoardTemplate },
  ];

  return specs.map((spec) => {
    const base = applyTemplate(spec.template, {
      planDesign: String(args.planDesign || ""),
      planJson: String(args.planDesign || ""),
      outputLanguage: resolvedOutputLanguage,
    });
    return {
      imageId: spec.imageId,
      messages: [
        { role: "system", content: args.systemContent },
        { role: "user", content: base },
      ],
    };
  });
}
