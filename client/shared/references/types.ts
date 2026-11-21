/**
 * A work referenced from another canvas (docs/plans/impl-2026-11-21-canvas-references.md).
 *
 * A reference is a copy: its items carry their own data, so the work it came
 * from can change or be deleted without touching where it was used. Each
 * canvas says what of its works can be referenced (workspaces/<canvas>/references.ts);
 * the picker lets the user tick which of those to take.
 */

/** The canvases, as in client/app/workspaces.ts (repeated here: shared/ does not import the app). */
export type ReferenceWorkspace = "diagram" | "cad" | "ppt" | "canvas";

export type ReferenceItemKind = "image" | "file" | "text";

export interface ReferenceItem {
  id: string;
  kind: ReferenceItemKind;
  /** "彩平图", "第 3 页", "报价单" — already in the interface language. */
  label: string;
  /** Items shown together: the versions of one picture, one slide's pictures. */
  group?: string;
  /** image / file: the content as a data URL. Absent while `resolve` has not run. */
  dataUrl?: string;
  /** file: the name it is attached under (报价单.csv). */
  fileName?: string;
  /** text: the content (Markdown). */
  text?: string;
  /** A small preview for the picker; images use their own data. */
  thumb?: string;
  /** Ticked when the picker opens. */
  defaultOn?: boolean;
  /**
   * For content that is costly to produce (a diagram rendered by draw.io):
   * run only for the items the user ticks, returning the data URL.
   */
  resolve?: () => Promise<string>;
}

export interface WorkReference {
  workspace: ReferenceWorkspace;
  workId: string;
  workName: string;
  items: ReferenceItem[];
  /** Interior design: the design's revision the items were exported from. */
  revision?: number;
}

/** What a canvas's extractor reports when a work cannot be referenced as it is. */
export interface ReferenceBlock {
  /** Why, in the interface language ("先在设计器里确认户型"). */
  message: string;
  /** A button that fixes it, e.g. open that work in its canvas. */
  action?: { label: string; run: () => void };
}

export type ReferenceExtract = { items: ReferenceItem[]; revision?: number } | { blocked: ReferenceBlock };
