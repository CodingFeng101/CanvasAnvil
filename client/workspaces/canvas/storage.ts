import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const canvasStore = createWorkspaceStore("CanvasAnvilCanvasWorkspaceDB");

export const CANVAS_SCENE_KEY = "scene";
