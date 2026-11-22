import { STORAGE_GLOBAL_CONSTRAINTS_KEY } from "@/shared/chat/global-constraints-dialog";
import { CONSTRAINT_KEYS } from "@/shared/constraints";

/*
 * Everything outside the works that makes this browser's CanvasAnvil look and
 * behave the way it does, for the backup file (Settings → Data): preferences,
 * theme and language, memory, model settings, usage, the sidebar's order.
 *
 * Only the keys named here travel. A work's own state (its chat, its scene)
 * goes with the works; passing jobs and quota counters stay behind.
 */

/** Where the browser keeps the model settings (see client/ai/storage.ts). */
const AI_CONFIG_KEY = "unified_ai_workspace_config";
/** The fields of the model settings that are secrets: they travel only when asked to. */
const SECRET_FIELDS = ["apiKey", "textApiKey", "imageApiKey", "fileParserApiToken"] as const;

const SETTINGS_KEYS = [
  // Settings page and appearance
  "CanvasAnvil-preferences-v1",
  "CanvasAnvil-theme-v1",
  "CanvasAnvil-ui-lang-v1",
  // Where the app was and how it was laid out
  "CanvasAnvil-app-view-v1",
  "CanvasAnvil-active-workspace-v1",
  "CanvasAnvil-sidebar-collapsed-v1",
  "CanvasAnvil-recent-order-v1",
  "CanvasAnvil-canvas-image-options-v1",
  "canvasanvil:ppt-rail-width",
  // Memory
  STORAGE_GLOBAL_CONSTRAINTS_KEY,
  ...Object.values(CONSTRAINT_KEYS),
  "CanvasAnvil-constraints-enabled-v1",
  // Models
  "CanvasAnvil-model-lists-v1",
  AI_CONFIG_KEY,
  // Usage
  "CanvasAnvil-usage-stats-v1",
];

export interface SettingsBackup {
  /** Each key's stored text; null where this browser had nothing. */
  values: Record<string, string | null>;
  /** Whether the model settings' keys and tokens are in the file. */
  secrets: boolean;
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function withoutSecrets(raw: string): string {
  try {
    const config = JSON.parse(raw) as Record<string, unknown>;
    for (const field of SECRET_FIELDS) delete config[field];
    return JSON.stringify(config);
  } catch {
    return "{}";
  }
}

export function exportSettings(includeSecrets: boolean): SettingsBackup {
  const values: Record<string, string | null> = {};
  for (const key of new Set(SETTINGS_KEYS)) {
    const value = readKey(key);
    values[key] = key === AI_CONFIG_KEY && value !== null && !includeSecrets ? withoutSecrets(value) : value;
  }
  return { values, secrets: includeSecrets };
}

/**
 * Puts a backup's settings in place. Keys the file has no value for are
 * cleared, so the result matches the machine it came from; model keys the
 * file left out are kept from this browser rather than wiped.
 * The page must reload afterwards.
 */
export function importSettings(backup: SettingsBackup) {
  const known = new Set(SETTINGS_KEYS);
  for (const [key, value] of Object.entries(backup.values ?? {})) {
    if (!known.has(key)) continue;
    let next = value;
    if (key === AI_CONFIG_KEY && !backup.secrets) {
      const here = readKey(AI_CONFIG_KEY);
      try {
        const kept = here ? (JSON.parse(here) as Record<string, unknown>) : {};
        const incoming = next ? (JSON.parse(next) as Record<string, unknown>) : {};
        for (const field of SECRET_FIELDS) if (typeof kept[field] === "string") incoming[field] = kept[field];
        next = JSON.stringify(incoming);
      } catch {
        next = here;
      }
    }
    try {
      if (next === null || typeof next !== "string") localStorage.removeItem(key);
      else localStorage.setItem(key, next);
    } catch {
      /* storage full or blocked: that setting just isn't restored */
    }
  }
}
