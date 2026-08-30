import { createWorkspaceStore } from "@/shared/storage/indexed-db-store";

/** Database name is load-bearing: changing it orphans everything users saved. */
export const cadStore = createWorkspaceStore("CanvasAnvilCadWorkspaceDB");

export const CAD_RENDERS_KEY = "renders";
export const CAD_ANALYSIS_IMAGES_KEY = "analysis-images";
