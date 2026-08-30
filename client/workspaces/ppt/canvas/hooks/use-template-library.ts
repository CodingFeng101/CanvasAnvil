import { useCallback, useEffect, useMemo, useState } from "react";
import { generateImage } from "@/ai/client";
import { getTemplateGenerationPrompt } from "@/workspaces/ppt/lib/ppt-prompts";
import { PPT_TEMPLATE_LIBRARY_KEY, pptStore } from "@/workspaces/ppt/storage";
import {
  PPT_TEMPLATE_HIDDEN_PRESETS_KEY,
  PPT_TEMPLATE_UPLOADS_KEY,
  PRESET_TEMPLATES,
} from "@/workspaces/ppt/canvas/constants";
import {
  normalizePersistedStringArray,
  normalizePersistedUploadedTemplates,
  persistImageUrlIfNeeded,
  readLegacyHiddenPresetTemplateIds,
  readLegacyUploadedTemplates,
} from "@/workspaces/ppt/canvas/persisted-state";
import type { TemplateItem, UploadTemplate } from "@/workspaces/ppt/canvas/types";

type Translate = (zh: string, en: string) => string;

export interface TemplateLibraryOptions {
  /** Selection restored from the persisted workspace, if there was one. */
  initialSelectedTemplateId: string | null;
  uiLang: string;
  tr: Translate;
}

/**
 * The slide template picker: the built-in presets, the images the user has
 * uploaded or had generated, and which one is currently applied.
 *
 * The library persists separately from the deck, because it outlives any one
 * presentation -- deleting a deck should not cost the user their templates.
 */
export function useTemplateLibrary({ initialSelectedTemplateId, uiLang, tr }: TemplateLibraryOptions) {
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialSelectedTemplateId);
  const [uploadedTemplates, setUploadedTemplates] = useState<UploadTemplate[]>(readLegacyUploadedTemplates);
  const [hiddenPresetTemplateIds, setHiddenPresetTemplateIds] = useState<string[]>(readLegacyHiddenPresetTemplateIds);
  const [isHydrated, setIsHydrated] = useState(false);

  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [generatorRequirement, setGeneratorRequirement] = useState("");
  const [generatorIsGenerating, setGeneratorIsGenerating] = useState(false);

  // Load from IndexedDB. The useState initialisers above read the older
  // localStorage copy so the picker is populated on the very first paint;
  // this replaces it, and the persist effect then clears the legacy keys.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const persisted = await pptStore.read<{
          uploadedTemplates?: unknown;
          hiddenPresetTemplateIds?: unknown;
        }>(PPT_TEMPLATE_LIBRARY_KEY);
        if (cancelled || !persisted || typeof persisted !== "object") return;
        setUploadedTemplates(normalizePersistedUploadedTemplates(persisted.uploadedTemplates));
        setHiddenPresetTemplateIds(normalizePersistedStringArray(persisted.hiddenPresetTemplateIds));
      } catch (e) {
        console.error("Failed to load persisted PPT template library from IndexedDB", e);
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Writing before the load above finishes would save the legacy snapshot
    // over the real library.
    if (!isHydrated) return;

    void pptStore
      .save(PPT_TEMPLATE_LIBRARY_KEY, { uploadedTemplates, hiddenPresetTemplateIds, updatedAt: Date.now() })
      .then(() => {
        try {
          localStorage.removeItem(PPT_TEMPLATE_UPLOADS_KEY);
          localStorage.removeItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY);
        } catch {
          // A blocked localStorage only means the legacy copy lingers.
        }
      })
      .catch((e) => {
        console.error("Failed to persist PPT template library to IndexedDB", e);
      });
  }, [uploadedTemplates, hiddenPresetTemplateIds, isHydrated]);

  const templates: TemplateItem[] = useMemo(
    () => [
      ...PRESET_TEMPLATES.filter((t) => !hiddenPresetTemplateIds.includes(t.id)).map((t) => ({
        id: t.id,
        name: uiLang === "zh" ? t.zhName : t.enName,
        kind: "preset" as const,
        previewSrc: t.path,
        presetPath: t.path,
      })),
      ...uploadedTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        kind: "upload" as const,
        previewSrc: t.dataUrl,
        dataUrl: t.dataUrl,
      })),
    ],
    [hiddenPresetTemplateIds, uploadedTemplates, uiLang],
  );

  const selectTemplate = useCallback(async (item: TemplateItem) => {
    setSelectedTemplateId(item.id);
    if (item.kind === "upload") {
      setTemplateImage(item.dataUrl);
      return;
    }
    try {
      const response = await fetch(item.presetPath);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        setTemplateImage(reader.result as string);
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error("Failed to load template", e);
    }
  }, []);

  // Keeps the applied image in step with the selection: falls back to the
  // first template when the selected one is deleted, and re-reads an upload
  // whose data URL changed underneath it.
  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(null);
      setTemplateImage(null);
      return;
    }
    const selected = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;
    if (!selected) {
      void selectTemplate(templates[0]);
      return;
    }
    if (!templateImage) {
      void selectTemplate(selected);
      return;
    }
    if (selected.kind === "upload" && templateImage !== selected.dataUrl) {
      setTemplateImage(selected.dataUrl);
    }
  }, [selectedTemplateId, templateImage, templates, selectTemplate]);

  const readAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const addUploadedTemplates = async (files: File[]) => {
    const imageFiles = Array.from(files || []).filter((f) => f && f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const created: UploadTemplate[] = [];
    for (const file of imageFiles) {
      try {
        const dataUrl = await readAsDataUrl(file);
        created.push({
          id: `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: String(file.name || "").replace(/\.[^.]+$/, "") || tr("模板", "Template"),
          dataUrl,
        });
      } catch (e) {
        // One unreadable file should not lose the rest of the selection.
        console.error("Failed to read template image", e);
      }
    }
    if (created.length === 0) return;

    setUploadedTemplates((prev) => [...prev, ...created]);
    const last = created[created.length - 1];
    setSelectedTemplateId(last.id);
    setTemplateImage(last.dataUrl);
  };

  const handleUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Cleared so picking the same file again still fires a change event.
    e.target.value = "";
    await addUploadedTemplates(files);
  };

  const addGeneratedTemplate = async (imageUrl: string) => {
    const persisted = await persistImageUrlIfNeeded(imageUrl);
    if (!persisted.startsWith("data:image")) {
      throw new Error(
        tr("生成模板持久化失败：无法读取图片数据", "Failed to persist generated template: cannot read image data"),
      );
    }
    const created: UploadTemplate = {
      id: `generated-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: `${tr("AI 模板", "AI Template")}-${Date.now()}`,
      dataUrl: persisted,
    };
    setUploadedTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateImage(created.dataUrl);
  };

  const generateTemplate = async () => {
    const requirement = generatorRequirement.trim();
    if (!requirement) {
      alert(tr("请输入模板需求。", "Please enter template requirements."));
      return;
    }

    setGeneratorIsGenerating(true);
    try {
      const prompt = getTemplateGenerationPrompt({ requirements: requirement, language: uiLang });
      const imageUrl = await generateImage({ prompt });
      if (!imageUrl) {
        alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
        return;
      }
      await addGeneratedTemplate(imageUrl);
      setGeneratorRequirement("");
      setGeneratorOpen(false);
    } catch (e) {
      console.error("Template generation failed", e);
      alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
    } finally {
      setGeneratorIsGenerating(false);
    }
  };

  /**
   * Sets the selection from outside: restoring a persisted workspace, or
   * clearing it when the user starts over. Passing null drops the applied
   * image too, after which the effect above falls back to the first template.
   */
  const restoreSelection = useCallback((id: string | null) => {
    setSelectedTemplateId(id);
    if (id === null) setTemplateImage(null);
  }, []);

  /** Presets are hidden rather than removed, so they can never be lost. */
  const deleteTemplate = (item: TemplateItem) => {
    if (item.kind === "preset") {
      setHiddenPresetTemplateIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      return;
    }
    setUploadedTemplates((prev) => prev.filter((t) => t.id !== item.id));
  };

  return {
    templates,
    templateImage,
    selectedTemplateId,
    selectTemplate,
    handleUploadInputChange,
    deleteTemplate,
    restoreSelection,
    generator: {
      open: generatorOpen,
      setOpen: setGeneratorOpen,
      requirement: generatorRequirement,
      setRequirement: setGeneratorRequirement,
      isGenerating: generatorIsGenerating,
      generate: generateTemplate,
    },
  };
}
