/**
 * Opening Settings from anywhere (the model name under the input, the +
 * menu's "Constraints"), optionally at one section. The sidebar's Settings
 * dialog listens.
 */

export const OPEN_SETTINGS_EVENT = "canvasanvil:open-settings";

export type SettingsSection = "general" | "appearance" | "canvas" | "notifications" | "models" | "constraints" | "shortcuts" | "stats" | "skills" | "data" | "tutorials" | "docs" | "about";

export interface OpenSettingsDetail {
  section?: SettingsSection;
  /** A row to scroll to and focus, e.g. "constraint-diagram". */
  focus?: string;
}

// A request made before the dialog is mounted (e.g. from the landing page,
// just before the workspace shows) waits here until it mounts.
let pending: OpenSettingsDetail | null = null;

export function openSettings(section?: SettingsSection, focus?: string) {
  pending = { section, focus };
  window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: pending }));
}

/** The request no listener took yet, cleared once read. */
export function takePendingSettings(): OpenSettingsDetail | null {
  const request = pending;
  pending = null;
  return request;
}
