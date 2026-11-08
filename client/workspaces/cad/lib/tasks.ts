import type { ChatMessage } from "@/ai/client";

import cadOverallAnalysisBoardTemplate from "@prompts/cad/images-agents/overall-analysis-board.md?raw";
import cadKeyStrategyBoardTemplate from "@prompts/cad/images-agents/key-strategy-board.md?raw";

function applyTemplate(template: string, vars: Record<string, string>) {
  let out = String(template || "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v ?? ""));
  }
  return out;
}

export function buildCadTasksSystemContent(args: {
  globalSystemPrompt: string;
  globalConstraints: string;
}) {
  return [args.globalSystemPrompt, args.globalConstraints].filter(Boolean).join("\n\n");
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
