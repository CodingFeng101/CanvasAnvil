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
  if (!design) return { blocked: { message: zh ? "这件作品里还没有户型。" : "This work has no floorplan yet.", action } };
  if (design.status !== "confirmed")
    return { blocked: { message: zh ? "这套户型还没确认。先在室内设计里确认户型，再来引用。" : "This design is not confirmed yet. Confirm it in the interior-design canvas first.", action } };
  if (!isBundleCurrent(bundle, design))
    return {
      blocked: {
        message: zh
          ? "交付物需要更新：在室内设计里点「更新交付物」或「生成汇报 PPT」后再来引用。"
          : "The deliverables need updating: press 'Update deliverables' or 'Make report PPT' in the interior-design canvas first.",
        action,
      },
    };
  return { items: bundle.items, revision: bundle.revision };
}
