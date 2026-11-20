/**
 * Opening Settings from anywhere (the model name under the input, the +
 * menu's "Constraints"), optionally at one section. The sidebar's Settings
 * dialog listens.
 */

export const OPEN_SETTINGS_EVENT = "canvasanvil:open-settings";

export type SettingsSection = "general" | "appearance" | "canvas" | "notifications" | "models" | "constraints" | "shortcuts" | "stats" | "skills" | "data" | "about";

export interface OpenSettingsDetail {
  section?: SettingsSection;
  /** A row to scroll to and focus, e.g. "constraint-diagram". */
  focus?: string;
}

export function openSettings(section?: SettingsSection, focus?: string) {
  window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail: { section, focus } }));
}
