import { PortalPage } from "@/pages/portal/PortalPage";
import type { PortalWorkspace } from "@/pages/portal/data";

interface LandingPageProps {
  onStart: (workspace?: PortalWorkspace) => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  return <PortalPage onEnterWorkspace={(workspace) => onStart(workspace)} />;
}
