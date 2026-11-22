import type { ReferenceWorkspace, WorkReference } from "./types";

/**
 * A referenced work travels in the sent message as one of its text files, whose first line says
 * where it came from:
 *
 *   [File: 两室一厅 80㎡ · 设计方案.md]
 *   [[WORK_REF|cad|两室一厅 80㎡|设计方案;户型图]]
 *   …the text…
 *
 * The model reads that as "this came from that work"; the transcript reads it to show the
 * reference as a canvas card above the bubble instead of as a Markdown file.
 */

const MARKER = /^\[\[WORK_REF\|(diagram|cad|ppt|canvas)\|([^|\]]*)\|([^\]]*)\]\]\n?/;
const WORKSPACES: ReferenceWorkspace[] = ["diagram", "cad", "ppt", "canvas"];

const clean = (value: string) => value.replace(/[|\]\n\r]+/g, " ").trim();

export function referenceMarker(reference: Pick<WorkReference, "workspace" | "workName" | "items">): string {
  const labels = reference.items.map((item) => clean(item.label)).filter(Boolean).join(";");
  return `[[WORK_REF|${reference.workspace}|${clean(reference.workName)}|${labels}]]`;
}

export interface SentReference {
  workspace: ReferenceWorkspace;
  workName: string;
  labels: string[];
  /** The text that came along, without the marker. */
  text: string;
}

/**
 * Whether a file section of a sent message came with one of its references: the one carrying the
 * marker, or another file of the same work (named "<work> · <label>.<ext>"). Those all fold into
 * the reference's canvas card rather than showing as separate files.
 */
export function isReferenceFile(filename: string, content: string, references: SentReference[]): boolean {
  if (readReference(content)) return true;
  const name = filename.trim();
  return references.some((reference) => {
    const work = reference.workName.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim();
    return Boolean(work) && name.startsWith(`${work} · `);
  });
}

/** The reference a file section of a sent message carries, or null for an ordinary file. */
export function readReference(content: string): SentReference | null {
  const match = MARKER.exec(content.trimStart());
  if (!match || !WORKSPACES.includes(match[1] as ReferenceWorkspace)) return null;
  return {
    workspace: match[1] as ReferenceWorkspace,
    workName: match[2],
    labels: match[3] ? match[3].split(";").filter(Boolean) : [],
    text: content.trimStart().slice(match[0].length).trim(),
  };
}
