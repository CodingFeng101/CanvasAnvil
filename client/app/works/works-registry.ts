import { toast } from "sonner";
import { getUiLanguage } from "@/shared/i18n";
import { createWorksStore, type WorksStore } from "@/shared/works/works-store";
import type { WorkspaceId } from "@/app/workspaces";
import { PPT_CHAT_STORAGE_KEY, PPT_HISTORY_STORAGE_KEY, PPT_RETURN_STAGE_STORAGE_KEY, PPT_STATE_KEY, PPT_WORKSPACE_STORAGE_KEY, pptStore } from "@/workspaces/ppt/storage";
import { CANVAS_CHAT_IMAGES_KEY, CANVAS_CHAT_STORAGE_KEY, CANVAS_SCENE_KEY, canvasStore } from "@/workspaces/canvas/storage";
import { CAD_CHAT_IMAGE_PREFIX, CAD_CHAT_STORAGE_KEY, CAD_DESIGN_KEYS, CAD_HISTORY_STORAGE_KEY, CAD_WORKSPACE_STORAGE_KEY, cadStore } from "@/workspaces/cad/storage";
import {
  DIAGRAM_DB_KEYS,
  LAYOUT_CORRECTIONS_STORAGE_KEY,
  STORAGE_KEYS as DIAGRAM_LOCAL_KEYS,
  diagramStore,
  migrateDiagramSession,
} from "@/workspaces/diagram/storage";

/**
 * Which keys make up one work, per canvas.
 *
 * IndexedDB keys move under the work's prefix; localStorage keys stay where the
 * canvas reads them and are swapped when another work is opened. Everything
 * not named here is shared by all works of the canvas (template library,
 * image options, quota counters, settings).
 */

let lastQuotaToast = 0;
function onSaveError(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  if (name !== "QuotaExceededError") {
    console.error("Failed to save work", error);
    return;
  }
  const now = Date.now();
  if (now - lastQuotaToast < 10_000) return;
  lastQuotaToast = now;
  toast.error(
    getUiLanguage() === "zh"
      ? "存储空间不足，请在「我的作品」里删除不用的作品"
      : "Storage is full. Delete works you no longer need in My works.",
  );
}

const stores = new Map<WorkspaceId, WorksStore>();

function create(workspace: WorkspaceId): WorksStore {
  switch (workspace) {
    case "ppt":
      return createWorksStore({
        store: pptStore,
        legacyKeys: [PPT_STATE_KEY],
        localKeys: [PPT_WORKSPACE_STORAGE_KEY, PPT_CHAT_STORAGE_KEY, PPT_HISTORY_STORAGE_KEY, PPT_RETURN_STAGE_STORAGE_KEY],
        onSaveError,
      });
    case "canvas":
      return createWorksStore({
        store: canvasStore,
        legacyKeys: [CANVAS_SCENE_KEY, CANVAS_CHAT_IMAGES_KEY],
        localKeys: [CANVAS_CHAT_STORAGE_KEY],
        // Scrolling, zooming or selecting rewrites the scene but changes nothing,
        // and loading reshapes elements (null → []) without changing them. Every
        // real edit bumps an element's version, so id + version is the content.
        normalize: (key, value) => {
          if (key !== CANVAS_SCENE_KEY || !value || typeof value !== "object") return value;
          const scene = value as { elements?: { id?: string; version?: number; isDeleted?: boolean }[]; files?: Record<string, unknown> };
          return {
            elements: (scene.elements ?? []).filter((element) => element && !element.isDeleted).map((element) => [element.id, element.version]),
            files: Object.keys(scene.files ?? {}).sort(),
          };
        },
        onSaveError,
      });
    case "cad":
      return createWorksStore({
        store: cadStore,
        legacyKeys: CAD_DESIGN_KEYS,
        legacyPrefixes: [CAD_CHAT_IMAGE_PREFIX],
        localKeys: [CAD_WORKSPACE_STORAGE_KEY, CAD_CHAT_STORAGE_KEY, CAD_HISTORY_STORAGE_KEY],
        onSaveError,
      });
    case "diagram":
      return createWorksStore({
        store: diagramStore,
        legacyKeys: Object.values(DIAGRAM_DB_KEYS),
        localKeys: [DIAGRAM_LOCAL_KEYS.sessionId, LAYOUT_CORRECTIONS_STORAGE_KEY],
        // Older releases kept the session in localStorage: copy it into the store first.
        beforeMigrate: () => migrateDiagramSession(diagramStore),
        onSaveError,
      });
  }
}

export function worksStoreFor(workspace: WorkspaceId): WorksStore {
  let store = stores.get(workspace);
  if (!store) {
    store = create(workspace);
    stores.set(workspace, store);
  }
  return store;
}
