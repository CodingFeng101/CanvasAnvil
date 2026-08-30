import FlowPage from "@/workspaces/flow/next/page";
import { DiagramProvider } from "@/workspaces/flow/next/contexts/diagram-context";

export function NextFlowWorkspace() {
  return (
    <DiagramProvider>
      <FlowPage />
    </DiagramProvider>
  );
}
