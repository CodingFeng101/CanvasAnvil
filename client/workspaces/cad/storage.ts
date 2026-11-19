import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const cadStore = createWorkspaceStore("CanvasAnvilCadWorkspaceDB");

/** The open work's small state, in localStorage (read synchronously by the workspace). */
export const CAD_WORKSPACE_STORAGE_KEY = "CanvasAnvil-cad-state-v2";
/** Same value as chatStorageKey("cad"); the chat panel builds it that way. */
export const CAD_CHAT_STORAGE_KEY = "chat_history_v2_cad";
export const CAD_HISTORY_STORAGE_KEY = "CanvasAnvil-history-cad-v1";
/** The design session's record (lib/design/design-session.ts) and the keys it replaced. */
export const CAD_DESIGN_KEYS = ["cad-design-record", "cad-design", "cad-design-history"];
/** Pictures shown in the chat, one key each (chat/ChatPanel.tsx). */
export const CAD_CHAT_IMAGE_PREFIX = "chat-image:";

export const CAD_RENDERS_KEY = "renders";
export const CAD_ANALYSIS_IMAGES_KEY = "analysis-images";
