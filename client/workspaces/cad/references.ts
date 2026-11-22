import type { WorkspaceStore } from "@/shared/storage/indexed-db-store";
import type { ReferenceExtract } from "@/shared/references/types";
import type { CadDesign } from "./lib/design/types";
import { isBundleCurrent, readReferenceBundle } from "./lib/reference-bundle";

/**
 * What an interior-design work offers to other canvases: its delivery bundle (texts, pictures,
 * the designer's exported files), only for a confirmed design and only when the bundle was made
 * from the current revision. No earlier versions: the confirmed one is the right one.
 */

type StoredDesign = { design?: CadDesign | null };

export async function extractCadReference(store: WorkspaceStore, lang: "zh" | "en", open: () => void): Promise<ReferenceExtract> {
  const zh = lang === "zh";
  const [record, bundle] = await Promise.all([store.read<StoredDesign>("cad-design-record").catch(() => null), readReferenceBundle(store)]);
  const design = record?.design ?? null;
  const action = { label: zh ? "打开这套户型" : "Open this design", run: open };
  if (!design)
    return { blocked: { title: zh ? "这件作品里还没有户型" : "This work has no floorplan yet", detail: zh ? "先在室内设计里把户型做出来并确认。" : "Make and confirm the floorplan in the interior-design canvas first.", action } };
  if (design.status !== "confirmed")
    return { blocked: { title: zh ? "这套户型还没确认" : "This design is not confirmed yet", detail: zh ? "确认户型后才能引用，确认时会顺带准备好交付物。" : "Confirm it first; its deliverables are prepared as it is confirmed.", action } };
  if (!isBundleCurrent(bundle, design))
    return { blocked: { title: zh ? "这套户型的交付物还没准备好" : "This design's deliverables are not ready", detail: zh ? "打开这套户型会自动准备，完成后再回来引用。" : "Opening the design prepares them; come back once it is done.", action } };
  return { items: bundle.items, revision: bundle.revision };
}
