import React from "react";
import FlowPage from "@/workspaces/flow/next/page";
import { DiagramProvider } from "@/workspaces/flow/next/contexts/diagram-context";
import { LanguageProvider } from "@/workspaces/flow/next/contexts/language-context";

export function NextFlowWorkspace() {
  return (
    <LanguageProvider>
      <DiagramProvider>
        <FlowPage />
      </DiagramProvider>
    </LanguageProvider>
  );
}
