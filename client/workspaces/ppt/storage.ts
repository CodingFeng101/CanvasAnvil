import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const pptStore = createWorkspaceStore("CanvasAnvilPptWorkspaceDB");

export const PPT_STATE_KEY = "primary";
export const PPT_TEMPLATE_LIBRARY_KEY = "template-library";

/** Mirror of the workspace state in localStorage, read by the chat panel. */
export const PPT_WORKSPACE_STORAGE_KEY = "CanvasAnvil-ppt-state-v1";
export const PPT_RETURN_STAGE_STORAGE_KEY = "CanvasAnvil-ppt-return-stage-v1";
export const PPT_HISTORY_STORAGE_KEY = "CanvasAnvil-history-ppt-v1";
/** Same value as chatStorageKey("ppt"); the chat panel builds it that way. */
export const PPT_CHAT_STORAGE_KEY = "chat_history_v2_ppt";
