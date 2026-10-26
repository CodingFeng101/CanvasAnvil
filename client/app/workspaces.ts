import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { FileCode, Layers, Paintbrush, Presentation, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/shared/i18n";

/**
 * The canvases the app offers.
 *
 * The header tabs, the persisted selection and the rendered workspace all
 * read from this array. The portal (pages/portal) also needs a card and a
 * detail page per canvas; it is keyed on WorkspaceId, so the compiler points
 * at what's missing when one is added here.
 *
 * Each shell is loaded lazily: a session normally uses one canvas, and the
 * other two together account for most of the bundle.
 */

export type WorkspaceId = "flow" | "cad" | "ppt" | "canvas";

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
      import("@/workspaces/flow/FlowWorkspace").then((m) => ({ default: m.FlowWorkspace })),
    ),
  },
  {
    id: "cad",
    labelKey: "nav.cad",
    icon: FileCode,
    Component: lazy(() =>
      import("@/workspaces/cad/CadWorkspace").then((m) => ({ default: m.CadWorkspace })),
    ),
  },
  {
    id: "ppt",
    labelKey: "nav.ppt",
    icon: Presentation,
    Component: lazy(() =>
      import("@/workspaces/ppt/PptWorkspace").then((m) => ({ default: m.PptWorkspace })),
    ),
  },
  {
    id: "canvas",
    labelKey: "nav.canvas",
    icon: Paintbrush,
    Component: lazy(() =>
      import("@/workspaces/canvas/CanvasWorkspace").then((m) => ({ default: m.CanvasWorkspace })),
    ),
  },
];

export const DEFAULT_WORKSPACE: WorkspaceId = "flow";

/** Guards the value read back from localStorage, which may predate a removal. */
export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return WORKSPACES.some((workspace) => workspace.id === value);
}
