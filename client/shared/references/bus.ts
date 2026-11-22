import type { ReferenceItemKind, ReferenceWorkspace, WorkReference } from "./types";

/**
 * Opening the "reference a work" picker from a canvas.
 *
 * The picker lives in the app shell (it lists every canvas's works); a canvas
 * only knows this function. A canvas rendered without the shell (the skills
 * reuse some canvas components) has no picker, and `canReference()` is false.
 */

export interface ReferencePickerRequest {
  /** The canvas asking, so its own open work is not offered. */
  from: { workspace: ReferenceWorkspace; workId?: string };
  /** The kinds the asking place can use; items of other kinds are not offered. */
  accept: ReferenceItemKind[];
}

type Picker = (request: ReferencePickerRequest) => Promise<WorkReference | null>;

let picker: Picker | null = null;

/** The app shell registers its picker; returns an unregister. */
export function registerReferencePicker(open: Picker): () => void {
  picker = open;
  return () => {
    if (picker === open) picker = null;
  };
}

export function canReference(): boolean {
  return picker !== null;
}

/** Resolves with the chosen reference, or null when the picker is closed without one. */
export function openReferencePicker(request: ReferencePickerRequest): Promise<WorkReference | null> {
  return picker ? picker(request) : Promise.resolve(null);
}

/**
 * Switching canvas from inside one ("到自由画布修改" and the like). The shell owns
 * the works, so it registers this too. `workId`: a work's id opens it, null
 * opens a new draft, undefined opens the canvas on its latest work.
 */
type CanvasOpener = (workspace: ReferenceWorkspace, workId?: string | null) => Promise<boolean>;

let opener: CanvasOpener | null = null;

export function registerCanvasOpener(open: CanvasOpener): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

export function canOpenCanvas(): boolean {
  return opener !== null;
}

export function openCanvasFor(workspace: ReferenceWorkspace, workId?: string | null): Promise<boolean> {
  return opener ? opener(workspace, workId) : Promise.resolve(false);
}

/**
 * Writing into another work that is not open ("送回 PPT"): the shell owns the works' stores, so it
 * registers this. `update` gets the key's current value (null when empty) and returns the new one.
 * Resolves false when the work is gone or there is no shell.
 */
type WorkValueWriter = <T>(workspace: ReferenceWorkspace, workId: string, key: string, update: (previous: T | null) => T) => Promise<boolean>;

let writer: WorkValueWriter | null = null;

export function registerWorkValueWriter(write: WorkValueWriter): () => void {
  writer = write;
  return () => {
    if (writer === write) writer = null;
  };
}

export function updateWorkValue<T>(workspace: ReferenceWorkspace, workId: string, key: string, update: (previous: T | null) => T): Promise<boolean> {
  return writer ? writer(workspace, workId, key, update) : Promise.resolve(false);
}
