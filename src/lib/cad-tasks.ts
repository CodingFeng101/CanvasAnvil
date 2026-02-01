import type { ChatMessage } from "@/lib/ai-client";

import cadBomPromptTemplate from "../../agent/cad/bom-prompt.md?raw";
import cadImagesPromptTemplate from "../../agent/cad/images-prompt.md?raw";

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

export function buildCadImagesPrompt(args: { planJson: string; svg2d: string }) {
  return applyTemplate(cadImagesPromptTemplate, {
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

export function buildCadImagesMessages(args: {
  systemContent: string;
  planJson: string;
  svg2d: string;
}): ChatMessage[] {
  return [
    { role: "system", content: args.systemContent },
    { role: "user", content: buildCadImagesPrompt({ planJson: args.planJson, svg2d: args.svg2d }) },
  ];
}
