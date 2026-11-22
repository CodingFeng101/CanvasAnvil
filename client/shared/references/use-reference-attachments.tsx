import { useMemo, useState, type ReactNode } from "react";
import { Library, X } from "lucide-react";
import type { PlusMenuItem } from "@/shared/chat/composer";
import { useUiLanguage } from "@/shared/i18n";
import { useWork } from "@/shared/works/work-context";
import { usePeek } from "@/shared/ui/peek";
import { canReference, openReferencePicker } from "./bus";
import { referenceSourcesFor } from "./sources";
import { referenceToChatFiles } from "./to-files";
import type { ReferenceItemKind, ReferenceWorkspace, WorkReference } from "./types";

/**
 * "Reference a work" in a chat box: the + menu entry, and the referenced works
 * as one card each above the box. Their items join the box's attachments as
 * files (the form chat already sends), so nothing downstream changes; the
 * cards replace those files' own previews. A canvas that puts references
 * somewhere else (Free drawing, onto the board) passes `onReference`.
 */

interface AttachedReference {
  key: string;
  workName: string;
  workspace: ReferenceWorkspace;
  files: File[];
  /** For the hover preview: what was taken, and the pictures among it. */
  labels: string[];
  images: string[];
}

export interface ReferenceAttachmentsOptions {
  /** The canvas the box belongs to. */
  workspace: ReferenceWorkspace;
  /** The kinds this box takes; empty hides the entry. */
  accept: ReferenceItemKind[];
  files: File[];
  /** Replace the attachments (the box's own setter, which also extracts text). */
  setFiles: (files: File[]) => void;
  onReference?: (reference: WorkReference) => void;
}

export interface ReferenceAttachments {
  /** The + menu entry, or null when this box cannot reference. */
  menuItem: PlusMenuItem | null;
  /** The cards, or null when nothing is referenced. */
  cards: ReactNode;
  /** The attachments that are not from a reference (for the usual previews). */
  plainFiles: File[];
  /** Attach a reference that came from elsewhere (a canvas's shortcut button), as if picked here. */
  attach(reference: WorkReference): void;
}

export function useReferenceAttachments({ workspace, accept, files, setFiles, onReference }: ReferenceAttachmentsOptions): ReferenceAttachments {
  const lang = useUiLanguage();
  const tr = (zh: string, en: string) => (lang === "zh" ? zh : en);
  const work = useWork();
  const [references, setReferences] = useState<AttachedReference[]>([]);

  // A card lasts as long as its files are attached (sending clears them).
  const live = useMemo(
    () => references.map((r) => ({ ...r, files: r.files.filter((f) => files.includes(f)) })).filter((r) => r.files.length > 0),
    [references, files],
  );
  const plainFiles = useMemo(() => {
    const referenced = new Set(live.flatMap((r) => r.files));
    return files.filter((f) => !referenced.has(f));
  }, [files, live]);

  const attach = (reference: WorkReference) => {
    const added = referenceToChatFiles(reference);
    if (!added.length) return;
    setReferences((prev) => [
      ...prev.filter((r) => r.files.some((f) => files.includes(f))),
      {
        key: `${reference.workspace}:${reference.workId}:${Date.now()}`,
        workName: reference.workName,
        workspace: reference.workspace,
        files: added,
        labels: reference.items.map((item) => item.label),
        images: reference.items.filter((item) => item.kind === "image" && item.dataUrl).map((item) => item.dataUrl!),
      },
    ]);
    setFiles([...files, ...added]);
  };

  const pick = async () => {
    const reference = await openReferencePicker({ from: { workspace, workId: work?.workId }, accept });
    if (!reference) return;
    if (onReference) onReference(reference);
    else attach(reference);
  };

  const remove = (key: string) => {
    const drop = new Set(live.find((r) => r.key === key)?.files ?? []);
    setFiles(files.filter((f) => !drop.has(f)));
    setReferences((prev) => prev.filter((r) => r.key !== key));
  };

  const canvasLabel = (id: ReferenceWorkspace) =>
    ({ canvas: tr("自由绘制", "Free drawing"), ppt: "PPT", diagram: tr("图表", "Diagram"), cad: tr("室内设计", "Interior") })[id];

  const menuItem: PlusMenuItem | null =
    canReference() && accept.length > 0 && referenceSourcesFor(workspace).length > 0 ? { icon: Library, label: tr("引用作品", "Reference a work"), trailing: "›", onSelect: () => void pick() } : null;

  const cards = live.length ? (
    <div className="flex flex-wrap gap-2">
      {live.map((r) => (
        <ReferenceCard
          key={r.key}
          reference={r}
          canvas={canvasLabel(r.workspace)}
          count={tr(`${r.files.length} 项`, `${r.files.length} items`)}
          removeLabel={tr("移除引用", "Remove reference")}
          onRemove={() => remove(r.key)}
        />
      ))}
    </div>
  ) : null;

  return { menuItem, cards, plainFiles, attach };
}

/** One referenced work above the box; hovering its name shows its pictures and what was taken. */
function ReferenceCard({ reference, canvas, count, removeLabel, onRemove }: { reference: AttachedReference; canvas: string; count: string; removeLabel: string; onRemove: () => void }) {
  const peek = usePeek({ title: reference.workName, images: reference.images, text: reference.labels.join("、"), meta: `${canvas} · ${count}` });
  return (
    <div className="flex max-w-[16rem] items-center gap-2 rounded-xl border border-border bg-background py-1.5 pl-2.5 pr-1.5">
      <span {...peek} className="flex min-w-0 items-center gap-2">
        <Library className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-foreground">{reference.workName}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {canvas} · {count}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
        aria-label={removeLabel}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
