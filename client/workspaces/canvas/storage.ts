import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const canvasStore = createWorkspaceStore("CanvasAnvilCanvasWorkspaceDB");

export const CANVAS_SCENE_KEY = "scene";
/** Pictures the chat shows that never went onto the board (the annotation previews). */
export const CANVAS_CHAT_IMAGES_KEY = "chat-images";
/** Same value as chatStorageKey("canvas"); the chat panel builds it that way. */
export const CANVAS_CHAT_STORAGE_KEY = "chat_history_v2_canvas";
