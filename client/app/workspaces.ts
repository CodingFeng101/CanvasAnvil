import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { FileCode, Layers, Presentation, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/shared/i18n";

/**
 * The canvases the app offers.
 *
 * Adding or removing one is a change to this array and nothing else — the
 * header tabs, the persisted selection and the rendered workspace all read
 * from here.
 *
 * Each shell is loaded lazily: a session normally uses one canvas, and the
 * other two together account for most of the bundle.
 */

export type WorkspaceId = "flow" | "cad" | "ppt";

export interface WorkspaceDescriptor {
  id: WorkspaceId;
  /** Key into the shared message dictionary. */
  labelKey: MessageKey;
  icon: LucideIcon;
  Component: LazyExoticComponent<ComponentType>;
}

export const WORKSPACES: WorkspaceDescriptor[] = [
  {
    id: "flow",
    labelKey: "nav.flow",
    icon: Layers,
    Component: lazy(() =>
      import("@/workspaces/flow/FlowWorkspaceShell").then((m) => ({ default: m.FlowWorkspaceShell })),
    ),
  },
  {
    id: "cad",
    labelKey: "nav.cad",
    icon: FileCode,
    Component: lazy(() =>
      import("@/workspaces/cad/CadWorkspaceShell").then((m) => ({ default: m.CadWorkspaceShell })),
    ),
  },
  {
    id: "ppt",
    labelKey: "nav.ppt",
    icon: Presentation,
    Component: lazy(() =>
      import("@/workspaces/ppt/PptWorkspaceShell").then((m) => ({ default: m.PptWorkspaceShell })),
    ),
  },
];

export const DEFAULT_WORKSPACE: WorkspaceId = "flow";

/** Guards the value read back from localStorage, which may predate a removal. */
export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return WORKSPACES.some((workspace) => workspace.id === value);
}
