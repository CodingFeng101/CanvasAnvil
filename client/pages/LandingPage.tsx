import { PortalPage } from "@/pages/portal/PortalPage";
import type { PortalWorkspace } from "@/pages/portal/data";
import { setPendingPrompt } from "@/shared/pending-prompt";

interface LandingPageProps {
  onStart: (workspace?: PortalWorkspace) => void;
  onOpenTutorials: () => void;
}

export function LandingPage({ onStart, onOpenTutorials }: LandingPageProps) {
  return (
    <PortalPage
      onEnterWorkspace={(workspace, prompt) => {
        // The canvas's chat panel picks this up once, unsent (shared/pending-prompt).
        if (prompt) setPendingPrompt(workspace, prompt);
        onStart(workspace);
      }}
      onOpenTutorials={onOpenTutorials}
    />
  );
}
