import type { ReferenceItem, WorkReference } from "./types";

/**
 * Referenced items as files, the form chat attachments and slide materials
 * already take. Text becomes a Markdown file; items of a kind the place does
 * not accept are dropped by the caller (see `accept` in bus.ts).
 */

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "text/csv": "csv",
  "application/pdf": "pdf",
  "application/dxf": "dxf",
};

/** The bytes and type of a data URL; null for anything else. */
export function decodeDataUrl(dataUrl: string): { type: string; bytes: Uint8Array } | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const type = match[1] || "application/octet-stream";
  const body = match[3];
  if (match[2]) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { type, bytes };
  }
  return { type, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
}

/** A file name without characters that file systems refuse. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim() || "reference";
}

export function itemFileName(reference: Pick<WorkReference, "workName">, item: ReferenceItem, type: string): string {
  if (item.fileName) return safeFileName(item.fileName);
  const extension = item.kind === "text" ? "md" : EXTENSIONS[type] ?? "bin";
  const base = reference.workName ? `${reference.workName} · ${item.label}` : item.label;
  return `${safeFileName(base)}.${extension}`;
}

/** One item as a File, or null when it has no content. */
export function itemToFile(reference: Pick<WorkReference, "workName">, item: ReferenceItem): File | null {
  if (item.kind === "text") {
    if (!item.text?.trim()) return null;
    return new File([item.text], itemFileName(reference, item, "text/markdown"), { type: "text/markdown" });
  }
  const decoded = item.dataUrl ? decodeDataUrl(item.dataUrl) : null;
  if (!decoded) return null;
  const type = item.kind === "file" && decoded.type === "application/octet-stream" && item.fileName?.endsWith(".dxf") ? "application/dxf" : decoded.type;
  return new File([decoded.bytes], itemFileName(reference, item, type), { type });
}

export function referenceToFiles(reference: WorkReference): File[] {
  return reference.items.map((item) => itemToFile(reference, item)).filter((file): file is File => file !== null);
}
