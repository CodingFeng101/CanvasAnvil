import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const pptStore = createWorkspaceStore("CanvasAnvilPptWorkspaceDB");

export const PPT_STATE_KEY = "primary";
export const PPT_TEMPLATE_LIBRARY_KEY = "template-library";
