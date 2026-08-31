import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { errorText, isRetryableBeautifyError } from "./lib/errors";
import { runInParallel, sleep } from "./lib/concurrency";
import { parseJsonLoose } from "./lib/parse-json";
import { extractPdfPagesAsImages, isPdfFile } from "./lib/deck-source";
import {
  summariseReviewProgress,
} from "./lib/review-progress";
import {
  clampTextBlockRect,
  withTextBlocks,
} from "./lib/render-layers";
import { GenerationProgress } from "./views/GenerationProgress";
import { OutlineReview } from "./views/OutlineReview";
import { CreationStart } from "./views/CreationStart";
import { DeckView } from "./views/DeckView";
import {
  getOriginalSlideVersion as originalVersionOf,
  getTextlessBackgroundVersion as textlessBackgroundOf,
  getVisibleSlideVersions as getVisibleVersions,
  resolveSlideVersion,
} from "./lib/slide-versions";
import {
  buildSlideMaterialsFromAutoLabels,
} from "./lib/material-tokens";
import {
  creationReducer,
  initialCreationState,
  isGenerating,
  type CreationState,
} from "./lib/creation-machine";
import { useTemplateLibrary } from "./hooks/use-template-library";
import { useSlideMaterials } from "./hooks/use-slide-materials";
import { useCreationInputs } from "./hooks/use-creation-inputs";
import { useExportReview } from "./hooks/use-export-review";
import { useSlideshow } from "./hooks/use-slideshow";
import { buildBeautifyInstruction } from "./lib/beautify-instruction";
import { generateChatMessage } from '@/ai/client';
import {
  pptService,
  PptPage,
  type PptTextBlock,
  type SlideEditRoutingItem,
} from '@/workspaces/ppt/lib/ppt-service';
import { PPT_STATE_KEY, PPT_WORKSPACE_STORAGE_KEY, pptStore } from "@/workspaces/ppt/storage";
import { useUiLanguage } from "@/shared/i18n";
import { canvasAnvilToEditorSlide, editorSlideToExportPayload } from "@/features/ppt-editor";
import {
  BEAUTIFY_CONCURRENCY,
  BEAUTIFY_RETRY_BASE_DELAY_MS,
  BEAUTIFY_RETRY_MAX_ATTEMPTS,
  EDITABLE_EXPORT_CONCURRENCY,
  EDITABLE_REVIEW_CONCURRENCY,
  MODEL_CONCURRENCY,
} from "@/workspaces/ppt/canvas/lib/constants";
import {
  deriveTextElementsFromBlocks,
  hasRenderableTextBlocks,
  localizeLayoutHint,
  mergeTextBlocksIntoElements,
  normalizeLocalizedSlideTitle,
  parseSlideNo,
  stripLeadingBullet,
} from "@/workspaces/ppt/canvas/lib/slide-content";
import {
  filterRecordByAllowedKeys,
  migrateLegacyTextlessVersions,
  normalizePersistedImageMap,
  normalizePersistedImageVersions,
  normalizePersistedRenderLayers,
  normalizePersistedSlideMaterials,
  normalizePersistedSlides,
  normalizePersistedStringMap,
  persistImageUrlIfNeeded,
  shouldInlinePersistImageUrl,
} from "@/workspaces/ppt/canvas/lib/persisted-state";
import type {
  PptData,
  ReferenceVisualAsset,
  SlideData,
  SlideImageVersion,
  SlideImageVersionType,
  SlideRenderLayer,
} from "@/workspaces/ppt/canvas/types";

interface PptCanvasProps {
  data?: PptData;
  onAddToChat?: (json: string, name: string) => void;
  onPptReadyChange?: (ready: boolean) => void;
  onPptStageChange?: (stage: "start" | "outline" | "slides") => void;
  onCreationModeChange?: (mode: "idea" | "outline" | "beautify" | "image_transform") => void;
  onExportReviewModeChange?: (active: boolean) => void;
  incomingEdit?: { id: string; payload: string } | null;
  onIncomingEditHandled?: (id: string) => void;
  onResetWorkspace?: () => void;
}

export function PptCanvas({
  data,
  onAddToChat,
  onPptReadyChange,
  onPptStageChange,
  onCreationModeChange,
  onExportReviewModeChange,
  incomingEdit,
  onIncomingEditHandled,
  onResetWorkspace
}: PptCanvasProps) {
  const uiLang = useUiLanguage();
  const tr = useCallback((zh: string, en: string) => (uiLang === "zh" ? zh : en), [uiLang]);
  const initialPptStateRef = useRef<any>(undefined);
  if (typeof initialPptStateRef.current === "undefined") {
    initialPptStateRef.current = (() => {
      if (typeof window === "undefined") return null;
      try {
        const raw = localStorage.getItem(PPT_WORKSPACE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== "object") return null;
        return migrateLegacyTextlessVersions(parsed);
      } catch {
        return null;
      }
    })();
  }
  const initialPptState = initialPptStateRef.current;

  // If data is provided by AI, use it. Otherwise maintain local state for demo.
  const [localSlides, setLocalSlides] = useState<SlideData[]>(() => {
    const v = initialPptState?.localSlides;
    if (!Array.isArray(v)) return [];
    return v
      .filter((s: any) => s && typeof s.id === "string")
      .map((s: any) => ({
        id: String(s.id),
        title: typeof s.title === "string" ? s.title : "",
        content: Array.isArray(s.content) ? s.content.filter((x: any) => typeof x === "string") : [],
        note: typeof s.note === "string" ? s.note : undefined,
        layout: typeof s.layout === "string" ? s.layout : undefined,
        description: typeof s.description === "string" ? s.description : undefined,
      }));
  });
  const [currentSlideIndex, setCurrentSlideIndex] = useState(() => {
    const v = initialPptState?.currentSlideIndex;
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  });
  const templateLibrary = useTemplateLibrary({
    initialSelectedTemplateId:
      typeof initialPptState?.selectedTemplateId === "string" ? initialPptState.selectedTemplateId : null,
    uiLang,
    tr,
  });
  const { templateImage, selectedTemplateId, restoreSelection: restoreTemplateSelection } =
    templateLibrary;
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>(() => {
    const v = initialPptState?.generatedImages;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string") out[k] = val;
    }
    return out;
  });
  const [imageVersions, setImageVersions] = useState<Record<string, SlideImageVersion[]>>(() => {
    const v = initialPptState?.imageVersions;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, SlideImageVersion[]> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k !== "string" || !Array.isArray(val)) continue;
      out[k] = val
        .filter((x: any) => x && typeof x.id === "string" && typeof x.url === "string" && typeof x.timestamp === "number" && (x.type === "generated" || x.type === "edited" || x.type === "derived_textless"))
        .map((x: any) => ({
          id: x.id,
          url: x.url,
          timestamp: x.timestamp,
          type: x.type,
          instruction: typeof x.instruction === "string" ? x.instruction : undefined,
          sourceVersionId: typeof x.sourceVersionId === "string" ? x.sourceVersionId : undefined,
        }));
    }
    return out;
  });
  const [currentImageVersionId, setCurrentImageVersionId] = useState<Record<string, string>>(() => {
    const v = initialPptState?.currentImageVersionId;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string") out[k] = val;
    }
    return out;
  });
  const [renderLayers, setRenderLayers] = useState<Record<string, Record<string, SlideRenderLayer>>>(() => {
    const v = initialPptState?.renderLayers;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, Record<string, SlideRenderLayer>> = {};
    for (const [slideId, versions] of Object.entries(v)) {
      if (typeof slideId !== "string" || !versions || typeof versions !== "object" || Array.isArray(versions)) continue;
      const nextVersions: Record<string, SlideRenderLayer> = {};
      for (const [versionId, layer] of Object.entries(versions)) {
        if (typeof versionId !== "string" || !layer || typeof layer !== "object" || Array.isArray(layer)) continue;
        const backgroundImageUrl = typeof (layer as any).backgroundImageUrl === "string" ? (layer as any).backgroundImageUrl : "";
        const textBlocks = Array.isArray((layer as any).textBlocks) ? (layer as any).textBlocks : [];
        const elements = Array.isArray((layer as any).elements) ? (layer as any).elements : deriveTextElementsFromBlocks(textBlocks);
        const status = (layer as any).status === "pending" || (layer as any).status === "failed" ? (layer as any).status : "ready";
        nextVersions[versionId] = {
          backgroundImageUrl,
          textBlocks,
          elements,
          status,
          error: typeof (layer as any).error === "string" ? (layer as any).error : undefined,
        };
      }
      out[slideId] = nextVersions;
    }
    return out;
  });
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  // Creation Wizard State
  const [creation, dispatchCreation] = useReducer(
    creationReducer,
    ((): CreationState => {
      const v = initialPptState?.creationStep;
      if (v === "idle" || v === "input" || v === "outline" || v === "done") return initialCreationState(v);
      return initialCreationState(localSlides.length > 0 ? "done" : "idle");
    })(),
  );
  const { step: creationStep, progress } = creation;
  useEffect(() => {
    if (creationStep === "done") {
      onPptStageChange?.("slides");
      return;
    }
    if (creationStep === "outline") {
      onPptStageChange?.("outline");
      return;
    }
    onPptStageChange?.("start");
  }, [creationStep, onPptStageChange]);
  const inputs = useCreationInputs({
    initialState: initialPptState,
    onCreationModeChange,
  });
  const { creationMode, setCreationMode, ideaInput, outlineInput } = inputs;
  const { setIdeaInput, setOutlineInput } = inputs;
  const { setRequirement: setBeautifyRequirement, setUseTemplate: setBeautifyUseTemplate,
    setFailures: setBeautifyFailures } = inputs.beautify;
  const { setFailures: setImageTransformFailures } = inputs.imageTransform;
  const materials = useSlideMaterials({
    localSlides,
    setLocalSlides,
    uiLang,
    initialMaterials: normalizePersistedSlideMaterials(initialPptState?.slideMaterials),
  });
  const { slideMaterials, setSlideMaterials } = materials;
  const assetCaptionCacheRef = useRef<Record<string, string>>({});
  const pptImagePersistenceRunningRef = useRef(false);
  const pptImagePersistenceRetryRef = useRef(false);
  const [isPersistenceHydrated, setIsPersistenceHydrated] = useState(false);
  const latestWorkspaceUpdatedAtRef = useRef(
    typeof initialPptState?.updatedAt === "number" ? initialPptState.updatedAt : 0
  );
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
  const [previewCanvasSize, setPreviewCanvasSize] = useState({ width: 1100, height: 619 });


  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const raw = await pptStore.read<any>(PPT_STATE_KEY);
        if (cancelled || !raw || typeof raw !== "object") return;
        const persistedState = migrateLegacyTextlessVersions(raw);
        const snapshotState =
          initialPptStateRef.current && typeof initialPptStateRef.current === "object"
            ? initialPptStateRef.current
            : null;
        const snapshotUpdatedAt =
          typeof snapshotState?.updatedAt === "number" ? snapshotState.updatedAt : 0;
        const persistedUpdatedAt =
          typeof persistedState?.updatedAt === "number" ? persistedState.updatedAt : 0;
        const coreState =
          snapshotState && snapshotUpdatedAt > persistedUpdatedAt ? snapshotState : persistedState;

        const nextSlides = normalizePersistedSlides(coreState?.localSlides);
        const allowedSlideIds = new Set(nextSlides.map((slide) => slide.id));
        const nextGeneratedImages = {
          ...filterRecordByAllowedKeys(
            normalizePersistedImageMap(coreState?.generatedImages),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedImageMap(persistedState?.generatedImages),
            allowedSlideIds,
          ),
        };
        const nextImageVersions = {
          ...filterRecordByAllowedKeys(
            normalizePersistedImageVersions(coreState?.imageVersions),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedImageVersions(persistedState?.imageVersions),
            allowedSlideIds,
          ),
        };
        const nextRenderLayers = {
          ...filterRecordByAllowedKeys(
            normalizePersistedRenderLayers(coreState?.renderLayers),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedRenderLayers(persistedState?.renderLayers),
            allowedSlideIds,
          ),
        };
        const nextSlideMaterials = {
          ...filterRecordByAllowedKeys(
            normalizePersistedSlideMaterials(coreState?.slideMaterials),
            allowedSlideIds,
          ),
          ...filterRecordByAllowedKeys(
            normalizePersistedSlideMaterials(persistedState?.slideMaterials),
            allowedSlideIds,
          ),
        };
        setLocalSlides(nextSlides);
        setCurrentSlideIndex(
          typeof coreState?.currentSlideIndex === "number" && Number.isFinite(coreState.currentSlideIndex)
            ? Math.max(0, Math.floor(coreState.currentSlideIndex))
            : 0,
        );
        restoreTemplateSelection(
          typeof coreState?.selectedTemplateId === "string" ? coreState.selectedTemplateId : null,
        );
        setGeneratedImages(nextGeneratedImages);
        setImageVersions(nextImageVersions);
        setCurrentImageVersionId(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.currentImageVersionId),
            allowedSlideIds,
          ),
        );
        setRenderLayers(nextRenderLayers);
        dispatchCreation({
          type: "restored",
          step:
            coreState?.creationStep === "idle" ||
            coreState?.creationStep === "input" ||
            coreState?.creationStep === "outline" ||
            coreState?.creationStep === "done"
              ? coreState.creationStep
              : nextSlides.length > 0
                ? "done"
                : "idle",
        });
        setCreationMode(
          coreState?.creationMode === "idea" ||
            coreState?.creationMode === "outline" ||
            coreState?.creationMode === "beautify" ||
            coreState?.creationMode === "image_transform"
            ? coreState.creationMode
            : "idea",
        );
        setIdeaInput(typeof coreState?.ideaInput === "string" ? coreState.ideaInput : "");
        setOutlineInput(typeof coreState?.outlineInput === "string" ? coreState.outlineInput : "");
        setBeautifyRequirement(
          typeof coreState?.beautifyRequirement === "string" ? coreState.beautifyRequirement : "",
        );
        setBeautifyUseTemplate(Boolean(coreState?.beautifyUseTemplate));
        setBeautifyFailures(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.beautifyFailures, true),
            allowedSlideIds,
          ),
        );
        setImageTransformFailures(
          filterRecordByAllowedKeys(
            normalizePersistedStringMap(coreState?.imageTransformFailures, true),
            allowedSlideIds,
          ),
        );
        setSlideMaterials(nextSlideMaterials);
        latestWorkspaceUpdatedAtRef.current = Math.max(snapshotUpdatedAt, persistedUpdatedAt);
      } catch (e) {
        console.error("Failed to load persisted PPT workspace from IndexedDB", e);
      } finally {
        if (!cancelled) setIsPersistenceHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    restoreTemplateSelection,
    setSlideMaterials,
    setCreationMode,
    setIdeaInput,
    setOutlineInput,
    setBeautifyRequirement,
    setBeautifyUseTemplate,
    setBeautifyFailures,
    setImageTransformFailures,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isPersistenceHydrated) return;
    const updatedAt = Date.now();
    latestWorkspaceUpdatedAtRef.current = updatedAt;
    const workspaceState = {
      localSlides,
      currentSlideIndex,
      selectedTemplateId,
      generatedImages,
      imageVersions,
      currentImageVersionId,
      renderLayers,
      creationStep,
      creationMode,
      ideaInput,
      outlineInput,
      slideMaterials,
      beautifyRequirement: inputs.beautify.requirement,
      beautifyUseTemplate: inputs.beautify.useTemplate,
      beautifyFailures: inputs.beautify.failures,
      imageTransformFailures: inputs.imageTransform.failures,
      updatedAt,
    };
    try {
      localStorage.setItem(
        PPT_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          localSlides,
          currentSlideIndex,
          selectedTemplateId,
          generatedImages: {},
          imageVersions: {},
          currentImageVersionId,
          renderLayers: {},
          creationStep,
          creationMode,
          ideaInput,
          outlineInput,
          slideMaterials: {},
          beautifyRequirement: inputs.beautify.requirement,
          beautifyUseTemplate: inputs.beautify.useTemplate,
          beautifyFailures: inputs.beautify.failures,
          imageTransformFailures: inputs.imageTransform.failures,
          updatedAt,
        })
      );
    } catch (e) {
      console.error("Failed to persist PPT workspace snapshot to localStorage", e);
    }
    void pptStore.save(PPT_STATE_KEY, workspaceState).catch((e) => {
      console.error("Failed to persist PPT workspace to IndexedDB", e);
    });
  }, [
    localSlides,
    currentSlideIndex,
    selectedTemplateId,
    generatedImages,
    imageVersions,
    currentImageVersionId,
    renderLayers,
    creationStep,
    creationMode,
    ideaInput,
    outlineInput,
    slideMaterials,
    inputs.beautify.requirement,
    inputs.beautify.useTemplate,
    inputs.beautify.failures,
    inputs.imageTransform.failures,
    isPersistenceHydrated,
  ]);

  useEffect(() => {
    if (pptImagePersistenceRunningRef.current) {
      pptImagePersistenceRetryRef.current = true;
      return;
    }

    const pendingGenerated = Object.values(generatedImages).some(shouldInlinePersistImageUrl);
    const pendingVersions = Object.values(imageVersions).some((versions) =>
      Array.isArray(versions) && versions.some((item) => shouldInlinePersistImageUrl(item?.url || ""))
    );
    const pendingLayers = Object.values(renderLayers).some((versions) =>
      versions &&
      typeof versions === "object" &&
      Object.values(versions).some((layer) => shouldInlinePersistImageUrl(layer?.backgroundImageUrl || ""))
    );
    if (!pendingGenerated && !pendingVersions && !pendingLayers) return;

    let cancelled = false;
    pptImagePersistenceRunningRef.current = true;
    pptImagePersistenceRetryRef.current = false;

    void (async () => {
      try {
        const cache = new Map<string, string>();
        const resolveUrl = async (url: string) => {
          const raw = String(url || "").trim();
          if (!shouldInlinePersistImageUrl(raw)) return raw;
          if (cache.has(raw)) return cache.get(raw) || raw;
          const persisted = await persistImageUrlIfNeeded(raw);
          cache.set(raw, persisted);
          return persisted;
        };

        let generatedChanged = false;
        const nextGenerated: Record<string, string> = {};
        for (const [slideId, url] of Object.entries(generatedImages)) {
          const persisted = await resolveUrl(url);
          nextGenerated[slideId] = persisted;
          if (persisted !== url) generatedChanged = true;
        }

        let versionsChanged = false;
        const nextVersions: Record<string, SlideImageVersion[]> = {};
        for (const [slideId, versions] of Object.entries(imageVersions)) {
          const next = await Promise.all(
            (versions || []).map(async (item) => {
              const persisted = await resolveUrl(item.url);
              if (persisted !== item.url) versionsChanged = true;
              return persisted === item.url ? item : { ...item, url: persisted };
            })
          );
          nextVersions[slideId] = next;
        }

        let layersChanged = false;
        const nextLayers: Record<string, Record<string, SlideRenderLayer>> = {};
        for (const [slideId, versions] of Object.entries(renderLayers)) {
          const nextVersionMap: Record<string, SlideRenderLayer> = {};
          for (const [versionId, layer] of Object.entries(versions || {})) {
            const currentUrl = String(layer?.backgroundImageUrl || "");
            const persisted = await resolveUrl(currentUrl);
            if (persisted !== currentUrl) layersChanged = true;
            nextVersionMap[versionId] =
              persisted === currentUrl
                ? layer
                : { ...layer, backgroundImageUrl: persisted };
          }
          nextLayers[slideId] = nextVersionMap;
        }

        if (cancelled) return;
        if (generatedChanged) setGeneratedImages(nextGenerated);
        if (versionsChanged) setImageVersions(nextVersions);
        if (layersChanged) setRenderLayers(nextLayers);
      } finally {
        pptImagePersistenceRunningRef.current = false;
        if (!cancelled && pptImagePersistenceRetryRef.current) {
          pptImagePersistenceRetryRef.current = false;
          setGeneratedImages((prev) => ({ ...prev }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [generatedImages, imageVersions, renderLayers]);

  const onPptReadyChangeRef = useLatestRef(onPptReadyChange);
  const isPptReady = localSlides.length > 0;
  useEffect(() => {
    onPptReadyChangeRef.current?.(isPptReady);
  }, [isPptReady, onPptReadyChangeRef]);

  useEffect(() => {
      if (typeof window === "undefined") return;
      const handleResize = () => {
          setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const target = previewCanvasRef.current;
    if (!target) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(1, Math.round(entry.contentRect.width));
      const height = Math.max(1, Math.round(entry.contentRect.height));
      setPreviewCanvasSize({ width, height });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [currentSlideIndex, imageVersions, currentImageVersionId, generatedImages, creationStep]);









  const [isApplyingEdits, setIsApplyingEdits] = useState(false);

  const localSlidesRef = useLatestRef(localSlides);
  const currentSlideIndexRef = useLatestRef(currentSlideIndex);

  const setSlidesKeepingSelection = useCallback((nextSlides: SlideData[]) => {
    const currentId = localSlidesRef.current[currentSlideIndexRef.current]?.id;
    setLocalSlides(nextSlides);
    if (!Array.isArray(nextSlides) || nextSlides.length === 0) {
      setCurrentSlideIndex(0);
      return;
    }
    if (currentId) {
      const nextIdx = nextSlides.findIndex((s) => s.id === currentId);
      if (nextIdx >= 0) {
        setCurrentSlideIndex(nextIdx);
        return;
      }
    }
    setCurrentSlideIndex((prev) => {
      const safePrev = Number.isFinite(prev) ? Math.max(0, Math.floor(prev)) : 0;
      return Math.min(safePrev, nextSlides.length - 1);
    });
  }, [localSlidesRef, currentSlideIndexRef]);

  useEffect(() => {
    if (data && data.slides && data.slides.length > 0) {
      setSlidesKeepingSelection(data.slides);
      dispatchCreation({ type: "finished" });
      onPptReadyChangeRef.current?.(true);
    }
  }, [data, onPptReadyChangeRef, setSlidesKeepingSelection]);

  const applyIncomingSlideEdits = async (payload: string) => {
    let parsed: any;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }

    const toolTypeRaw = String(parsed?.type || "").trim().toLowerCase();
    if (toolTypeRaw && toolTypeRaw !== "ppt_edit") return;

    const incomingSlidesRaw: any[] = Array.isArray(parsed?.slides)
      ? parsed.slides
      : Array.isArray(parsed)
        ? parsed
        : [];

    if (incomingSlidesRaw.length === 0) return;

    const uploadedImages: string[] = Array.isArray(parsed?.uploadedImages)
      ? Array.from(new Set((parsed.uploadedImages as any[]).map((x: any) => String(x || "").trim()).filter(Boolean))).slice(0, 2)
      : [];
    const existingById = new Map(localSlides.map((s) => [s.id, s] as const));
    const getCurrentSlideImageUrlById = (slideId: string) => {
      const versions = imageVersions[slideId] || [];
      const currentVersion = currentImageVersionId[slideId];
      const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[slideId];
      return String(currentUrl || "").trim();
    };

    const existing = localSlides.length > 0 ? [...localSlides] : [];
    const resolveIncomingSlideId = (inc: any): string => {
      const rawId = String(inc?.id || "").trim();
      if (rawId && existing.some((s) => s.id === rawId)) return rawId;
      const fromIdNo = parseSlideNo(rawId);
      if (fromIdNo && existing[fromIdNo - 1]) return existing[fromIdNo - 1].id;
      const titleNo = parseSlideNo(String(inc?.title || "").trim());
      if (titleNo && existing[titleNo - 1]) return existing[titleNo - 1].id;
      return rawId;
    };

    const incomingSlides: any[] = incomingSlidesRaw
      .map((inc) => {
        const resolvedId = resolveIncomingSlideId(inc);
        if (!resolvedId) return null;
        return { ...inc, id: resolvedId };
      })
      .filter(Boolean);

    if (incomingSlides.length === 0) return;

    const toSlideData = (inc: any, fallbackId: string, source?: SlideData): SlideData => ({
      id: fallbackId,
      title: typeof inc?.title === "string"
        ? normalizeLocalizedSlideTitle(inc.title, uiLang as "zh" | "en", parseSlideNo(fallbackId))
        : (source?.title || tr("幻灯片", "Slide")),
      content: Array.isArray(inc?.content) ? inc.content.map((x: any) => String(x)) : (source?.content || []),
      description: typeof inc?.description === "string" ? inc.description : source?.description,
      note: typeof inc?.note === "string" ? inc.note : source?.note,
      layout: typeof inc?.layout === "string" ? localizeLayoutHint(inc.layout, uiLang as "zh" | "en") : source?.layout,
    });

    let mergedSlides: SlideData[] = localSlides.slice();
    let mergedIncomingSlides = incomingSlides.slice();
    mergedSlides = (() => {
      const byId = new Map(existing.map((s) => [s.id, s] as const));
      const order: string[] = existing.map((s) => s.id);

      for (const inc of incomingSlides) {
        const id = String(inc?.id || "");
        if (!id) continue;
        if (creationStep === "done" && !byId.has(id)) {
          // In slide-edit stage, unknown ids should not append new pages.
          continue;
        }
        const next: SlideData = toSlideData(inc, id, byId.get(id));
        byId.set(id, next);
        if (!order.includes(id)) order.push(id);
      }

      return order.map((id) => byId.get(id)!).filter(Boolean);
    })();
    mergedIncomingSlides = incomingSlides;
    setSlidesKeepingSelection(mergedSlides);

    const allowImageEdits = creationStep === "done";
    if (!allowImageEdits) return;

    const routedEditTasks: Array<() => Promise<void>> = [];
    for (const inc of mergedIncomingSlides) {
      const id = String(inc?.id || "");
      if (!id) continue;
      const slide = mergedSlides.find((s) => s.id === id);
      if (!slide) continue;

      const incomingImageUrl = typeof inc?.imageUrl === "string" ? inc.imageUrl : "";
      const instruction = typeof inc?.imageEditInstruction === "string"
        ? inc.imageEditInstruction
        : typeof inc?.instruction === "string"
          ? inc.instruction
          : "";
      const before = existingById.get(id);
      const changedByPatch =
        !!before &&
        (
          before.title !== slide.title ||
          before.description !== slide.description ||
          before.layout !== slide.layout ||
          before.note !== slide.note ||
          JSON.stringify(before.content || []) !== JSON.stringify(slide.content || [])
        );
      const isNewSlide = !before;
      const editType = normalizeSlideEditType(inc, before, slide);
      const styleRefSlideIds = Array.isArray(inc?.styleRefSlideIds)
        ? inc.styleRefSlideIds.map((x: any) => String(x || "").trim()).filter((x: string) => !!x && x !== id)
        : [];
      const styleRefPolicy: "style_only" | "style_and_layout" =
        inc?.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only";
      const explicitStyleRefImageUrls = Array.isArray(inc?.styleRefImageUrls)
        ? inc.styleRefImageUrls.map((x: any) => String(x || "").trim()).filter((x: string) => !!x)
        : [];
      const explicitMaterialImageUrls = Array.isArray(inc?.materialImageUrls)
        ? inc.materialImageUrls.map((x: any) => String(x || "").trim()).filter((x: string) => !!x)
        : [];
      const styleRefRefsFromSlides = styleRefSlideIds
        .map((sid: string) => {
          const url = getCurrentSlideImageUrlById(sid);
          if (!url) return null;
          const safeSid = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
          return { url, label: `STYLE_REF_SLIDE_${safeSid}`, source: sid };
        })
        .filter(Boolean) as Array<{ url: string; label: string; source: string }>;
      const explicitStyleRefRefs = explicitStyleRefImageUrls.map((url: string, idx: number) => ({
        url,
        label: `STYLE_REF_EXTERNAL_${idx + 1}`,
        source: `external-${idx + 1}`,
      }));
      const styleRefRefs = Array.from(
        new Map([...styleRefRefsFromSlides, ...explicitStyleRefRefs].map((x) => [x.url, x] as const)).values()
      );
      const styleRefImageUrls = styleRefRefs.map((x) => x.url);
      const styleRefMappingText = styleRefRefs.length > 0
        ? styleRefRefs.map((x, i) => `${i + 1}. ${x.label} => ${x.source}`).join("\n")
        : "";
      /*
      const styleReferenceInstruction = styleRefImageUrls.length > 0
        ? (
            styleRefPolicy === "style_and_layout"
              ? tr(
                  `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n可参考其视觉风格与版式结构，但禁止复用其文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                )
              : tr(
                  `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n仅参考其视觉风格（配色、质感、氛围），不要复制其版式与文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                )
          )
        : "";
      */
      const styleReferenceInstruction = styleRefImageUrls.length > 0
        ? (
            styleRefPolicy === "style_and_layout"
              ? tr(
                  `参考映射如下（标签 => 来源）:\n${styleRefMappingText}\n可参考其风格和版式，但不要复制其中的文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                )
              : tr(
                  `参考映射如下（标签 => 来源）:\n${styleRefMappingText}\n仅参考风格，不要复制其版式和文字内容。`,
                  `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                )
          )
        : "";
      const page: PptPage = {
        id,
        title: slide.title,
        content: slide.content || [],
        description: slide.description,
        note: slide.note,
        layout: slide.layout,
      };

      if (incomingImageUrl.trim()) {
        routedEditTasks.push(async () => {
          const persistedIncomingImageUrl = await persistImageUrlIfNeeded(incomingImageUrl);
          pushImageVersion(
            id,
            persistedIncomingImageUrl,
            "edited",
            instruction.trim() ? instruction : undefined,
          );
        });
        continue;
      }

      if (editType === "text_only" || editType === "text_relayout") {
        routedEditTasks.push(async () => {
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...materials.getImageRefs(id),
            ],
            [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", instruction.trim() || undefined);
          }
        });
        continue;
      }

      routedEditTasks.push(async () => {
        const versions = imageVersions[id] || [];
        const currentVersion = currentImageVersionId[id];
        const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[id];
        const shouldRegenerate = isNewSlide || !currentUrl || changedByPatch;
        if (shouldRegenerate) {
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...materials.getImageRefs(id),
            ],
            [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", instruction.trim() || undefined);
          }
          return;
        }
        const editedUrl = await pptService.editPageImage(
          page,
          [instruction.trim(), styleReferenceInstruction].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([
            ...styleRefImageUrls,
            ...explicitMaterialImageUrls,
            ...uploadedImages,
            ...materials.getImageUrls(id),
          ]))
        );
        if (editedUrl) {
          await pushImageVersionAndProcess(slide, editedUrl, "edited", instruction.trim() || undefined);
        }
      });
    }

    if (routedEditTasks.length > 0) {
      setIsApplyingEdits(true);
      try {
        await runInParallel(routedEditTasks, MODEL_CONCURRENCY);
      } catch (e) {
        console.error("Failed to apply image edits", e);
      } finally {
        setIsApplyingEdits(false);
      }
      return;
    }

    const editTasks: Array<() => Promise<void>> = [];
    for (const inc of mergedIncomingSlides) {
      const id = String(inc?.id || "");
      if (!id) continue;
      const incomingImageUrl = typeof inc?.imageUrl === "string" ? inc.imageUrl : "";
      const kind = inc?.kind === "content" || inc?.kind === "visual" || inc?.kind === "both" ? inc.kind : null;
      const instruction = typeof inc?.imageEditInstruction === "string"
        ? inc.imageEditInstruction
        : typeof inc?.instruction === "string"
          ? inc.instruction
          : "";
      const styleRefSlideIds = Array.isArray(inc?.styleRefSlideIds)
        ? inc.styleRefSlideIds
            .map((x: any) => String(x || "").trim())
            .filter((x: string) => !!x && x !== id)
        : [];
      const styleRefPolicy: "style_only" | "style_and_layout" =
        inc?.styleRefPolicy === "style_and_layout" ? "style_and_layout" : "style_only";
      const explicitStyleRefImageUrls = Array.isArray(inc?.styleRefImageUrls)
        ? inc.styleRefImageUrls
            .map((x: any) => String(x || "").trim())
            .filter((x: string) => !!x)
        : [];
      const styleRefRefsFromSlides = styleRefSlideIds
        .map((sid: string) => {
          const url = getCurrentSlideImageUrlById(sid);
          if (!url) return null;
          const safeSid = sid.replace(/[^a-zA-Z0-9_-]/g, "_");
          return {
            url,
            label: `STYLE_REF_SLIDE_${safeSid}`,
            source: sid,
          };
        })
        .filter(Boolean) as Array<{ url: string; label: string; source: string }>;
      const explicitStyleRefRefs = explicitStyleRefImageUrls.map((url: string, idx: number) => ({
        url,
        label: `STYLE_REF_EXTERNAL_${idx + 1}`,
        source: `external-${idx + 1}`,
      }));
      const styleRefRefs = Array.from(
        new Map(
          [...styleRefRefsFromSlides, ...explicitStyleRefRefs].map((x) => [x.url, x] as const)
        ).values()
      );
      const styleRefImageUrls = styleRefRefs.map((x) => x.url);
      const styleRefMappingText = styleRefRefs.length > 0
        ? styleRefRefs.map((x, i) => `${i + 1}. ${x.label} => ${x.source}`).join("\n")
        : "";

      const slide = mergedSlides.find((s) => s.id === id);
      if (!slide) continue;

      if (incomingImageUrl.trim()) {
        editTasks.push(async () => {
          const persistedIncomingImageUrl = await persistImageUrlIfNeeded(incomingImageUrl);
          pushImageVersion(
            id,
            persistedIncomingImageUrl,
            "edited",
            instruction.trim() ? instruction : undefined,
          );
        });
        continue;
      }

      const before = existingById.get(id);
      const changedByPatch =
        !!before &&
        (
          before.title !== slide.title ||
          before.description !== slide.description ||
          before.layout !== slide.layout ||
          before.note !== slide.note ||
          JSON.stringify(before.content || []) !== JSON.stringify(slide.content || [])
        );
      const isNewSlide = !before;

      if (kind === "content" || kind === "both" || (!kind && (changedByPatch || isNewSlide))) {
        editTasks.push(async () => {
          const page: PptPage = {
            id,
            title: slide.title,
            content: slide.content || [],
            description: slide.description,
            note: slide.note,
            layout: slide.layout,
          };
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...materials.getImageRefs(id),
            ],
            [
              kind === "both" && instruction.trim() ? instruction : "",
              styleRefImageUrls.length > 0
                ? (
                    styleRefPolicy === "style_and_layout"
                      ? tr(
                          `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n可参考其视觉风格与版式结构，但禁止复用其文字内容。`,
                          `Style reference mapping (label => source):\n${styleRefMappingText}\nYou may follow both style and layout, but must not copy their text content.`
                        )
                      : tr(
                          `风格参考映射如下（标签 => 来源）：\n${styleRefMappingText}\n仅参考其视觉风格（配色、质感、氛围），不要复制其版式与文字内容。`,
                          `Style reference mapping (label => source):\n${styleRefMappingText}\nFollow style only (palette/texture/mood), do not copy their layout or text content.`
                        )
                  )
                : "",
            ].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", kind === "both" ? instruction : undefined);
          }
        });
        if (kind === "content" || kind === "both") continue;
      }

      if (!instruction.trim()) continue;
      editTasks.push(async () => {
        const versions = imageVersions[id] || [];
        const currentVersion = currentImageVersionId[id];
        const currentUrl = currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[id];
        if (!currentUrl) return;

        const page: PptPage = {
          id,
          title: slide.title,
          content: slide.content || [],
          description: slide.description
        };
        const editedUrl = await pptService.editPageImage(
          page,
          [
            instruction,
            styleRefImageUrls.length > 0
              ? (
                  styleRefPolicy === "style_and_layout"
                    ? tr(
                        `附加参考图中，前 ${styleRefImageUrls.length} 张为风格参考图，顺序与映射如下（序号. 标签 => 来源）：\n${styleRefMappingText}\n可参考风格和版式，不可复用文字。`,
                        `In additional reference images, the first ${styleRefImageUrls.length} are style references. Mapping (index. label => source):\n${styleRefMappingText}\nYou may follow style and layout, but do not copy text.`
                      )
                    : tr(
                        `附加参考图中，前 ${styleRefImageUrls.length} 张为风格参考图，顺序与映射如下（序号. 标签 => 来源）：\n${styleRefMappingText}\n仅参考风格，不可复用版式与文字。`,
                        `In additional reference images, the first ${styleRefImageUrls.length} are style references. Mapping (index. label => source):\n${styleRefMappingText}\nStyle only, do not copy layout/text.`
                      )
                )
              : "",
          ].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([...styleRefImageUrls, ...uploadedImages, ...materials.getImageUrls(id)]))
        );
        if (editedUrl) {
          await pushImageVersionAndProcess(slide, editedUrl, "edited", instruction);
        }
      });
    }

    if (editTasks.length > 0) {
      setIsApplyingEdits(true);
      try {
        await runInParallel(editTasks, MODEL_CONCURRENCY);
      } catch (e) {
        console.error("Failed to apply image edits", e);
      } finally {
        setIsApplyingEdits(false);
      }
    }
  };

  useEffect(() => {
      if (!incomingEdit?.payload) return;
      const id = incomingEdit.id;
      Promise.resolve(applyIncomingSlideEdits(incomingEdit.payload))
        .catch((e) => {
          console.error("Failed to apply incoming slide edits", e);
        })
        .finally(() => {
          if (id) onIncomingEditHandled?.(id);
        });
  // One-shot per edit request: the id identifies the request, and the effect
  // reads that render's payload when it fires. Depending on the object would
  // re-apply the same edits on every parent render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingEdit?.id]);

  // The three maps the version resolver reads, gathered once per render.
  const versionState = useMemo(
    () => ({ imageVersions, currentImageVersionId, generatedImages }),
    [imageVersions, currentImageVersionId, generatedImages],
  );
  const originalVersionLabel = tr("原始版本", "Original version");

  const getSlideVersionMeta = useCallback(
    (slideId: string) => resolveSlideVersion(slideId, versionState, originalVersionLabel),
    [versionState, originalVersionLabel],
  );
  const getVisibleSlideVersions = useCallback(
    (slideId: string) => getVisibleVersions(slideId, versionState, originalVersionLabel),
    [versionState, originalVersionLabel],
  );
  const getOriginalSlideVersion = (slideId: string) => originalVersionOf(slideId, versionState);
  const getTextlessBackgroundVersion = (slideId: string) => textlessBackgroundOf(slideId, versionState);
  const getSlideImageUrl = (slideId: string) => getSlideVersionMeta(slideId).imageUrl;
  const getSlideRenderLayer = useCallback((slideId: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return undefined;
    return renderLayers[slideId]?.[versionId];
  }, [getSlideVersionMeta, renderLayers]);
  const getSlideBackgroundUrl = (slideId: string) => {
    return getSlideImageUrl(slideId) || "";
  };
  const getCurrentReviewLayerInfo = (slideId: string) => {
    const { versionId, imageUrl } = getSlideVersionMeta(slideId);
    return {
      versionId,
      imageUrl,
      layer: versionId ? renderLayers[slideId]?.[versionId] : undefined,
    };
  };
  const extractReviewTextLayer = async (slide: SlideData, slideImageUrl: string): Promise<SlideRenderLayer> => {
    const existingLayer = getSlideRenderLayer(slide.id);
    const persistedSlideImageUrl = await persistImageUrlIfNeeded(slideImageUrl);
    const page: PptPage = {
      id: slide.id,
      title: slide.title,
      content: slide.content,
      description: slide.description,
      note: slide.note,
      layout: slide.layout,
    };
    const textBlocks = await pptService.extractSlideTextBlocks(page, persistedSlideImageUrl, uiLang as "zh" | "en");
    return {
      backgroundImageUrl: persistedSlideImageUrl,
      textBlocks,
      elements: mergeTextBlocksIntoElements(textBlocks, existingLayer?.elements || []),
      status: "ready",
    } satisfies SlideRenderLayer;
  };
  const ensureEditableReviewLayer = async (slide: SlideData) => {
    const { versionId, imageUrl, layer } = getCurrentReviewLayerInfo(slide.id);
    if (!versionId || !imageUrl) return null;
    if (hasRenderableTextBlocks(layer)) {
      return { versionId, imageUrl, layer };
    }
    if (review.layerPromiseRef.current[slide.id]) {
      return await review.layerPromiseRef.current[slide.id];
    }
    const task = (async () => {
      review.setPreparingSlideIds((current) => (current.includes(slide.id) ? current : [...current, slide.id]));
      setRenderLayerState(slide.id, versionId, {
        backgroundImageUrl: imageUrl,
        textBlocks: Array.isArray(layer?.textBlocks) ? layer.textBlocks : [],
        elements: deriveTextElementsFromBlocks(Array.isArray(layer?.textBlocks) ? layer.textBlocks : []),
        status: "pending",
        error: undefined,
      });
      try {
        const nextLayer = await extractReviewTextLayer(slide, imageUrl);
        setRenderLayerState(slide.id, versionId, nextLayer);
        return { versionId, imageUrl, layer: nextLayer };
      } finally {
        review.setPreparingSlideIds((current) => current.filter((id) => id !== slide.id));
        delete review.layerPromiseRef.current[slide.id];
      }
    })();
    review.layerPromiseRef.current[slide.id] = task;
    return await task;
  };
  const createDefaultTextBlock = (
    slideId: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): PptTextBlock => {
    const layer = getSlideRenderLayer(slideId);
    const titleExists = (layer?.textBlocks || []).some((block) => block.role === "title");
    const role: PptTextBlock["role"] = !titleExists && y < 0.2 ? "title" : "bullet";
    return {
      id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role,
      text: "",
      x: Math.max(0, Math.min(0.95, x)),
      y: Math.max(0, Math.min(0.95, y)),
      w: Math.max(role === "title" ? 0.18 : 0.1, Math.min(1 - x, w)),
      h: Math.max(role === "title" ? 0.08 : 0.06, Math.min(1 - y, h)),
      style: {
        fontFamily: uiLang === "zh" ? "Microsoft YaHei" : "Aptos",
        fontSize: role === "title" ? 30 : 20,
        fontWeight: role === "title" ? 700 : 500,
        color: role === "title" ? "#ffffff" : "#111827",
        align: "left",
        lineHeight: role === "title" ? 1.12 : 1.35,
      },
    };
  };

  const normalizeSlideEditType = (
    incoming: any,
    before?: SlideData,
    after?: SlideData
  ): SlideEditRoutingItem["editType"] => {
    if (incoming?.editType === "text_only" || incoming?.editType === "text_relayout" || incoming?.editType === "background_redraw") {
      return incoming.editType;
    }
    const hasImageUrl = typeof incoming?.imageUrl === "string" && incoming.imageUrl.trim().length > 0;
    const hasImageEditInstruction =
      typeof incoming?.imageEditInstruction === "string" && incoming.imageEditInstruction.trim().length > 0;
    const hasInstruction = typeof incoming?.instruction === "string" && incoming.instruction.trim().length > 0;
    const hasMaterialImages =
      Array.isArray(incoming?.materialImageUrls) &&
      incoming.materialImageUrls.some((x: any) => String(x || "").trim().length > 0);
    const hasStyleRefImages =
      Array.isArray(incoming?.styleRefImageUrls) &&
      incoming.styleRefImageUrls.some((x: any) => String(x || "").trim().length > 0);
    const hasStyleRefSlides =
      Array.isArray(incoming?.styleRefSlideIds) &&
      incoming.styleRefSlideIds.some((x: any) => String(x || "").trim().length > 0);
    const styleNeedsLayout =
      (incoming?.styleRefPolicy === "style_and_layout" && (hasStyleRefImages || hasStyleRefSlides));
    const legacyKind = incoming?.kind === "content" || incoming?.kind === "visual" || incoming?.kind === "both" ? incoming.kind : null;
    if (legacyKind === "visual" || legacyKind === "both") return "background_redraw";
    if (legacyKind === "content") return "text_relayout";
    if (hasImageUrl || hasImageEditInstruction || hasMaterialImages || styleNeedsLayout) return "background_redraw";
    const layoutChanged = !!before && !!after && before.layout !== after.layout;
    if (layoutChanged) return "background_redraw";
    if (!before) return hasInstruction ? "text_relayout" : "text_only";
    const textChanged =
      !!after &&
      (
        before.title !== after.title ||
        before.description !== after.description ||
        before.note !== after.note ||
        JSON.stringify(before.content || []) !== JSON.stringify(after.content || [])
      );
    if (textChanged || hasInstruction || hasStyleRefImages || hasStyleRefSlides) return "text_relayout";
    return "text_only";
  };

  const updateSlideTextBlock = (slideId: string, blockId: string, nextText: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return;
    const currentLayer = renderLayers[slideId]?.[versionId];
    const nextBlocks = (currentLayer?.textBlocks || []).map((block) =>
      block.id === blockId ? { ...block, text: nextText } : block
    );
    setRenderLayers((prev) => withTextBlocks(prev, slideId, versionId, () => nextBlocks));
    setLocalSlides((prev) =>
      prev.map((slide) => {
        if (slide.id !== slideId) return slide;
        const titleBlock = nextBlocks.find((block) => block.role === "title");
        const bulletBlocks = nextBlocks.filter((block) => block.role === "bullet");
        const summaryBlocks = nextBlocks.filter((block) => block.role === "summary");
        return {
          ...slide,
          title: titleBlock ? titleBlock.text.trim() : slide.title,
          content: bulletBlocks.length > 0 ? bulletBlocks.map((block) => stripLeadingBullet(block.text)).filter(Boolean) : slide.content,
          description: summaryBlocks.length > 0 ? summaryBlocks.map((block) => block.text.trim()).filter(Boolean).join("\n") : slide.description,
        };
      })
    );
  };
  const updateSlideTextBlockRect = (
    slideId: string,
    blockId: string,
    nextRect: Partial<Pick<PptTextBlock, "x" | "y" | "w" | "h">>,
    targetVersionId?: string,
  ) => {
    const { versionId: currentVersionId } = getSlideVersionMeta(slideId);
    const versionId = targetVersionId || currentVersionId;
    if (!versionId) return;
    setRenderLayers((prev) =>
      withTextBlocks(prev, slideId, versionId, (blocks) =>
        blocks.map((block) =>
          block.id === blockId ? clampTextBlockRect(block, nextRect) : block,
        ),
      ),
    );
  };
  const appendSlideTextBlock = (slideId: string, block: PptTextBlock) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return;
    setRenderLayers((prev) =>
      withTextBlocks(prev, slideId, versionId, (blocks) => [...blocks, block]),
    );
  };
  const deleteSlideTextBlock = (slideId: string, blockId: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return;
    setRenderLayers((prev) =>
      withTextBlocks(prev, slideId, versionId, (blocks) =>
        blocks.filter((block) => block.id !== blockId),
      ),
    );
    review.setSelectedBlockId((current) => (current === blockId ? null : current));
  };

  const updateSlideTextBlockPosition = (slideId: string, blockId: string, nextX: number, nextY: number, targetVersionId?: string) => {
    updateSlideTextBlockRect(slideId, blockId, { x: nextX, y: nextY }, targetVersionId);
  };

  const updateSlideTextBlockSize = (
    slideId: string,
    blockId: string,
    nextW: number,
    nextH: number,
    targetVersionId?: string,
  ) => {
    updateSlideTextBlockRect(slideId, blockId, { w: nextW, h: nextH }, targetVersionId);
  };

  const review = useExportReview({
    slides: localSlides,
    currentSlideIndex,
    renderLayers,
    canvasRef: previewCanvasRef,
    onExportReviewModeChange,
    textBlocks: {
      updatePosition: updateSlideTextBlockPosition,
      updateRect: updateSlideTextBlockRect,
      updateSize: updateSlideTextBlockSize,
      append: appendSlideTextBlock,
      createDefault: createDefaultTextBlock,
      getLayer: getSlideRenderLayer,
    },
  });



  const activeSlides = localSlides;

  const slideshow = useSlideshow(activeSlides.length);
  const currentSlide = activeSlides[currentSlideIndex];
  const currentSlideImage = currentSlide ? getSlideBackgroundUrl(currentSlide.id) : "";
  const currentReviewLayer = currentSlide ? getSlideRenderLayer(currentSlide.id) : undefined;

  const reviewProgress = summariseReviewProgress(
    activeSlides.map((slide) => review.getExtractionStatus(slide.id)),
    activeSlides.map((slide) => getSlideRenderLayer(slide.id)?.status),
  );
  const isAnyEditableExtractionRunning = reviewProgress.isExtracting;
  const allReviewLayersPrepared = reviewProgress.allLayersPrepared;
  const allEditableExtractionsDone = reviewProgress.allExtractionsDone;
  const failedBeautifyCount = activeSlides.reduce((n, s) => n + (inputs.beautify.failures[s.id] ? 1 : 0), 0);
  const failedImageTransformCount = activeSlides.reduce((n, s) => n + (inputs.imageTransform.failures[s.id] ? 1 : 0), 0);
  const currentSlideFailure = currentSlide
    ? (creationMode === "image_transform" ? inputs.imageTransform.failures[currentSlide.id] : inputs.beautify.failures[currentSlide.id])
    : "";

  const formatImageVersionLabel = (version: SlideImageVersion, index: number) => {
    if (version.type === "derived_textless") {
      return tr("无字底图", "Textless background");
    }
    if (version.instruction === tr("原始版本", "Original version") || version.instruction === tr("原始页面", "Original full slide")) {
      return tr("原始版本", "Original version");
    }
    return tr(`第 ${index + 1} 版`, `Version ${index + 1}`);
  };







  const setRenderLayerState = (slideId: string, versionId: string, layer: SlideRenderLayer) => {
      const normalizedLayer: SlideRenderLayer = {
        ...layer,
        textBlocks: Array.isArray(layer.textBlocks) ? layer.textBlocks : [],
        elements: Array.isArray(layer.elements) && layer.elements.length > 0
          ? layer.elements
          : deriveTextElementsFromBlocks(layer.textBlocks || []),
      };
      setRenderLayers((prev) => ({
          ...prev,
          [slideId]: {
              ...(prev[slideId] || {}),
              [versionId]: normalizedLayer,
          },
      }));
  };

  const processRenderedSlideVersion = async (slide: SlideData, slideImageUrl: string, versionId: string) => {
      try {
          const existingLayer = renderLayers[slide.id]?.[versionId];
          const persistedSlideImageUrl = await persistImageUrlIfNeeded(slideImageUrl);
          const page: PptPage = {
            id: slide.id,
            title: slide.title,
            content: slide.content,
            description: slide.description,
            note: slide.note,
            layout: slide.layout,
          };
          const textBlocks = await pptService.extractSlideTextBlocks(
            page,
            persistedSlideImageUrl,
            uiLang as "zh" | "en"
          );
          const backgroundImageUrlRaw = await pptService.generateTextlessPageImage(
            page,
            persistedSlideImageUrl,
            textBlocks,
            uiLang as "zh" | "en"
          );
          const backgroundImageUrl = await persistImageUrlIfNeeded(backgroundImageUrlRaw || persistedSlideImageUrl);
          const reviewedTextBlocks = await pptService.reviewSlideTextBlocks(
            page,
            persistedSlideImageUrl,
            backgroundImageUrl || persistedSlideImageUrl,
            textBlocks,
            uiLang as "zh" | "en"
          );
          return {
              backgroundImageUrl: backgroundImageUrl || persistedSlideImageUrl,
              textBlocks: reviewedTextBlocks,
              elements: mergeTextBlocksIntoElements(reviewedTextBlocks, existingLayer?.elements || []),
              status: "ready",
          } satisfies SlideRenderLayer;
      } catch (error) {
          console.error("Failed to build PPT render layer", error);
          const persistedSlideImageUrl = await persistImageUrlIfNeeded(slideImageUrl);
          const failedLayer = {
              backgroundImageUrl: persistedSlideImageUrl,
              textBlocks: [],
              elements: [],
              status: "failed",
              error: error instanceof Error ? error.message : "Failed to process slide",
          } satisfies SlideRenderLayer;
          setRenderLayerState(slide.id, versionId, failedLayer);
          return failedLayer;
      }
  };

  const upsertTextlessBackgroundVersion = async (
    slideId: string,
    sourceVersionId: string,
    backgroundImageUrl: string,
  ) => {
    const persistedUrl = await persistImageUrlIfNeeded(backgroundImageUrl);
    const nextTimestamp = Date.now();
    setImageVersions((prev) => {
      const current = prev[slideId] || [];
      const existing = current.find(
        (version) => version.type === "derived_textless" && version.sourceVersionId === sourceVersionId,
      );
      if (existing) {
        return {
          ...prev,
          [slideId]: current.map((version) =>
            version.id === existing.id
              ? { ...version, url: persistedUrl, timestamp: nextTimestamp }
              : version
          ),
        };
      }
      return {
        ...prev,
        [slideId]: [
          ...current,
          {
            id: `v-textless-${nextTimestamp}-${Math.random().toString(16).slice(2)}`,
            url: persistedUrl,
            timestamp: nextTimestamp,
            type: "derived_textless",
            sourceVersionId,
          },
        ],
      };
    });
    return persistedUrl;
  };

  const extractEditableReviewSlide = async (slide: SlideData) => {
    const { versionId, imageUrl } = getSlideVersionMeta(slide.id);
    if (!versionId || !imageUrl) return;
    review.setExtractionStatus((prev) => ({ ...prev, [slide.id]: "extracting" }));
    review.setPreparingSlideIds((current) => (current.includes(slide.id) ? current : [...current, slide.id]));
    setRenderLayerState(slide.id, versionId, {
      backgroundImageUrl: imageUrl,
      textBlocks: [],
      elements: [],
      status: "pending",
      error: undefined,
    });
    try {
      const nextLayer = await processRenderedSlideVersion(slide, imageUrl, versionId);
      setRenderLayerState(slide.id, versionId, nextLayer);
      if (nextLayer.status === "failed") {
        review.setExtractionStatus((prev) => ({ ...prev, [slide.id]: "failed" }));
        return;
      }
      await upsertTextlessBackgroundVersion(slide.id, versionId, nextLayer.backgroundImageUrl || imageUrl);
      review.setExtractionStatus((prev) => ({ ...prev, [slide.id]: "done" }));
    } catch (error) {
      console.error("Failed to extract editable review slide", error);
      review.setExtractionStatus((prev) => ({ ...prev, [slide.id]: "failed" }));
    } finally {
      review.setPreparingSlideIds((current) => current.filter((id) => id !== slide.id));
    }
  };

  const pushImageVersion = (
    slideId: string,
    url: string,
    type: SlideImageVersionType,
    instruction?: string,
    options?: { setCurrent?: boolean; sourceVersionId?: string }
  ) => {
      const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setImageVersions(prev => ({
          ...prev,
          [slideId]: [
              ...(prev[slideId] || []),
              { id: versionId, url, timestamp: Date.now(), type, instruction, sourceVersionId: options?.sourceVersionId }
          ]
      }));
      if (options?.setCurrent !== false) {
        setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
        setGeneratedImages(prev => ({ ...prev, [slideId]: url }));
      }
      return versionId;
  };

  const pushImageVersionAndProcess = async (slide: SlideData, url: string, type: "generated" | "edited", instruction?: string) => {
      const persistedUrl = await persistImageUrlIfNeeded(url);
      return pushImageVersion(slide.id, persistedUrl, type, instruction);
  };

  const ensurePrimaryImageVersions = async (slides: SlideData[]) => {
    const ensuredEntries = await Promise.all(
      slides.map(async (slide) => {
        const existingVersions = imageVersions[slide.id] || [];
        if (existingVersions.some((version) => version.type !== "derived_textless")) {
          return null;
        }
        const fallbackUrl = generatedImages[slide.id];
        if (!fallbackUrl) return null;
        const persistedUrl = await persistImageUrlIfNeeded(fallbackUrl);
        return {
          slideId: slide.id,
          version: {
            id: `v-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            url: persistedUrl,
            timestamp: Date.now(),
            type: "generated" as const,
            instruction: tr("原始版本", "Original version"),
          },
        };
      })
    );

    const validEntries = ensuredEntries.filter((item): item is NonNullable<typeof item> => !!item);
    if (validEntries.length === 0) return;

    setImageVersions((prev) => {
      const next = { ...prev };
      for (const entry of validEntries) {
        next[entry.slideId] = [...(next[entry.slideId] || []), entry.version];
      }
      return next;
    });
    setCurrentImageVersionId((prev) => {
      const next = { ...prev };
      for (const entry of validEntries) {
        if (!next[entry.slideId]) next[entry.slideId] = entry.version.id;
      }
      return next;
    });
  };

  const createTwoStageSlideProgressTracker = (
    slideCount: number,
    initialZh: string,
    initialEn: string,
    processingZh: string,
    processingEn: string,
  ) => {
    const safeTotal = Math.max(1, slideCount);
    const counter = { doneUnits: 0 };
    const localizeProgress = (zhLabel: string, enLabel: string) => {
      if (uiLang !== "zh") return enLabel;
      const normalized = String(enLabel || "").trim();
      if (normalized === "Importing slide images...") return "正在导入页面图片...";
      if (normalized === "Finishing import...") return "正在完成导入...";
      if (normalized === "Generating beautified slides...") return "正在生成美化页面...";
      if (normalized === "Finishing beautification...") return "正在完成美化...";
      if (normalized === "Retrying slide generation...") return "正在重试生成页面...";
      if (normalized === "Finishing retry...") return "正在完成重试...";
      if (normalized === "Generating slide images...") return "正在生成页面图片...";
      if (normalized === "Finishing slide generation...") return "正在完成生成...";
      return zhLabel;
    };
    const setStage = (current: number, zhLabel: string, enLabel: string) => {
      dispatchCreation({
        type: "progress",
        current,
        total: safeTotal,
        message: localizeProgress(zhLabel, enLabel),
      });
    };

    return {
      start() {
        setStage(0, initialZh, initialEn);
      },
      markBaseReady() {
        counter.doneUnits = Math.min(safeTotal * 2, counter.doneUnits + 1);
        setStage(counter.doneUnits / 2, processingZh, processingEn);
      },
      markSlideFinished(baseReady: boolean) {
        counter.doneUnits = Math.min(safeTotal * 2, counter.doneUnits + (baseReady ? 1 : 2));
        setStage(counter.doneUnits / 2, processingZh, processingEn);
      },
    };
  };





  const buildReferenceVisualAssetsWithCaptions = async (): Promise<ReferenceVisualAsset[]> => {
    const raw = (inputs.reference.visualAssetsRaw || []).filter((x: any) => x && typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:image"));
    if (raw.length === 0) return [];

    const baseItems = raw.slice(0, 24).map((x: any, idx: number) => {
      const label = `FIG_${idx + 1}`;
      const sourcePage = typeof x.page === "number" ? x.page : undefined;
      const textHint = String(x.textHint || "").slice(0, 800);
      const cached = assetCaptionCacheRef.current[x.id];
      const fallbackCaption = cached || (sourcePage ? tr(`来自第 ${sourcePage} 页的图表`, `Figure/table from page ${sourcePage}`) : tr("参考素材图片", "Reference visual asset"));
      return {
        id: String(x.id || `asset-${idx + 1}`),
        label,
        sourceFileName: String(x.sourceFileName || tr("参考文件", "Reference file")),
        sourcePage,
        dataUrl: String(x.dataUrl || ""),
        textHint,
        caption: fallbackCaption,
      } as ReferenceVisualAsset;
    });

    const uncached = baseItems.filter((item) => !assetCaptionCacheRef.current[item.id]);
    if (uncached.length === 0) return baseItems;

    try {
      const prompt = [
        "你是论文素材caption生成器。返回JSON数组，不要任何额外文字。",
        "任务：为每个素材生成一句简短中文说明（18-36字），偏重实验数据/图表含义，不要编造具体数值。",
        "格式：[{\"id\":\"...\",\"caption\":\"...\"}]",
        "素材列表：",
        ...uncached.map((item, idx) => {
          const pageText = typeof item.sourcePage === "number" ? `page=${item.sourcePage}` : "page=NA";
          return `${idx + 1}. id=${item.id}; source=${item.sourceFileName}; ${pageText}; text_hint=${item.textHint || "(none)"}`;
        }),
      ].join("\n");

      const resp = await generateChatMessage([{ role: "user", content: prompt }], undefined, { timeoutMs: 90000 });
      const parsed = parseJsonLoose(resp);
      const arr = Array.isArray(parsed) ? parsed : [];
      for (const it of arr) {
        const id = String(it?.id || "").trim();
        const caption = String(it?.caption || "").trim();
        if (!id || !caption) continue;
        assetCaptionCacheRef.current[id] = caption.slice(0, 80);
      }
    } catch (e) {
      console.error("Failed to generate asset captions", e);
    }

    return baseItems.map((item) => ({
      ...item,
      caption: assetCaptionCacheRef.current[item.id] || item.caption,
    }));
  };











  /** Redraws a slide's editor unless the user is typing in it. */


  const resetGenerationState = () => {
      setGeneratedImages({});
      setImageVersions({});
      setCurrentImageVersionId({});
      setRenderLayers({});
      setCurrentSlideIndex(0);
  };





  // extractPdfPagesAsImages counts pages; the wording stays here with tr.
  const reportPdfParseProgress = useCallback((done: number, total: number) => {
    dispatchCreation({
      type: "progress",
      current: done,
      total,
      message: tr(`正在解析 PDF... (${done}/${total})`, `Parsing PDF... (${done}/${total})`),
    });
  }, [tr]);

  const extractImageDeckPages = async (file: File) => {
    if (isPdfFile(file)) {
      return await extractPdfPagesAsImages(file, reportPdfParseProgress);
    }
    throw new Error(tr("仅支持 PDF 文件。", "Only PDF files are supported."));
  };




  const createImageTransformSlideVersion = async (slide: SlideData, sourceUrl: string) => {
    const persistedSourceUrl = await persistImageUrlIfNeeded(sourceUrl);
    const versionId = pushImageVersion(
      slide.id,
      persistedSourceUrl,
      "generated",
      tr("原始上传页", "Original uploaded page"),
    );
    setImageTransformFailures((prev) => {
      if (!prev[slide.id]) return prev;
      const next = { ...prev };
      delete next[slide.id];
      return next;
    });
    return versionId;

    /* const reconstructedVersionId = pushImageVersion(
      slide.id,
      persistedSourceUrl,
      "edited",
      tr("图片PPT转化结果", "Image PPT reconstruction"),
      { sourceVersionId: originalVersionId }
    );
    setRenderLayerState(slide.id, reconstructedVersionId, {
      backgroundImageUrl: persistedSourceUrl,
      textBlocks: [],
      elements: [],
      status: "pending",
    });

    try {
      const derived = await processRenderedSlideVersion(slide, persistedSourceUrl, reconstructedVersionId);
      setRenderLayerState(slide.id, reconstructedVersionId, derived);
      if (derived.status === "failed") {
        setImageTransformFailures((prev) => ({
          ...prev,
          [slide.id]: derived.error || tr("图片PPT转化失败", "Image PPT transform failed"),
        }));
      } else {
        setImageTransformFailures((prev) => {
          if (!prev[slide.id]) return prev;
          const next = { ...prev };
          delete next[slide.id];
          return next;
        });
      }
      return reconstructedVersionId;
    } catch (error) {
      const message = getErrorMessage(error);
      setImageTransformFailures((prev) => ({ ...prev, [slide.id]: message }));
      return reconstructedVersionId;
    } */
  };

  const handleStartImageTransform = async () => {
    const file = inputs.imageTransform.file;
    if (!file) return;

    resetGenerationState();
    setBeautifyFailures({});
    setImageTransformFailures({});
    dispatchCreation({ type: "writing", message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = await extractImageDeckPages(file);
      if (pageImages.length === 0) {
        alert(tr("无法解析页面图片，请确认文件格式。", "Failed to extract slide images. Please check the file format."));
        dispatchCreation({ type: "failed" });
        return;
      }

      const slides: SlideData[] = pageImages.map((_, i) => ({
        id: `slide-${i + 1}`,
        title: tr(`第 ${i + 1} 页`, `Slide ${i + 1}`),
        content: [],
        description: "",
      }));

      setLocalSlides(slides);
      dispatchCreation({ type: "rendering" });

      const progressTracker = createTwoStageSlideProgressTracker(
        slides.length,
        "正在创建原始版本...",
        "Importing slide images...",
        "正在重建可编辑文字层...",
        "Finishing import...",
      );
      progressTracker.start();

      const tasks = slides.map((slide, index) => async () => {
        let baseReady = false;
        try {
          progressTracker.markBaseReady();
          baseReady = true;
          await createImageTransformSlideVersion(slide, pageImages[index]);
        } catch (error) {
          setImageTransformFailures((prev) => ({
            ...prev,
            [slide.id]: getErrorMessage(error),
          }));
        } finally {
          progressTracker.markSlideFinished(baseReady);
        }
      });

      await runInParallel(tasks, MODEL_CONCURRENCY);
      dispatchCreation({ type: "finished" });
      onPptReadyChange?.(true);
    } catch (error) {
      console.error("Image PPT transform failed", error);
      alert(getErrorMessage(error));
      dispatchCreation({ type: "failed" });
    }
  };


  const getErrorMessage = useCallback(
    (error: unknown) => errorText(error) || tr("未知错误", "Unknown error"),
    [tr],
  );


  const editPageImageWithRetry = async (
    page: PptPage,
    instruction: string,
    baseImageUrl: string,
    beautifyTemplate?: string
  ) => {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= BEAUTIFY_RETRY_MAX_ATTEMPTS; attempt += 1) {
      try {
        const edited = await pptService.editPageImage(page, instruction, baseImageUrl, beautifyTemplate);
        if (edited) return edited;
        lastError = new Error(tr("模型返回空结果", "Empty model result"));
      } catch (e) {
        lastError = e;
        if (!isRetryableBeautifyError(e) || attempt >= BEAUTIFY_RETRY_MAX_ATTEMPTS) break;
      }

      if (attempt < BEAUTIFY_RETRY_MAX_ATTEMPTS) {
        const jitter = Math.floor(Math.random() * 350);
        const delay = BEAUTIFY_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(getErrorMessage(lastError));
  };

  const handleStartBeautify = async () => {
    const file = inputs.beautify.file;
    if (!file) return;

    resetGenerationState();
    setBeautifyFailures({});
    dispatchCreation({ type: "writing", message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = isPdfFile(file)
        ? await extractPdfPagesAsImages(file, reportPdfParseProgress)
        : [];

      if (pageImages.length === 0) {
        alert(tr("无法解析页面图片，请确认文件格式（仅支持 .pdf）。", "Failed to extract pages. Please upload a .pdf file."));
        dispatchCreation({ type: "failed" });
        return;
      }

      const slides: SlideData[] = pageImages.map((_, i) => ({
        id: `slide-${i + 1}`,
        title: tr(`第 ${i + 1} 页`, `Slide ${i + 1}`),
        content: [],
        description: "",
      }));

      const persistedPageImages = await Promise.all(
        pageImages.map(async (url) => await persistImageUrlIfNeeded(url))
      );
      const initialGenerated: Record<string, string> = {};
      const initialCurrent: Record<string, string> = {};
      const initialVersions: Record<string, SlideImageVersion[]> = {};

      for (let i = 0; i < slides.length; i += 1) {
        const slideId = slides[i].id;
        const url = persistedPageImages[i] || pageImages[i];
        const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        initialGenerated[slideId] = url;
        initialCurrent[slideId] = versionId;
        initialVersions[slideId] = [{ id: versionId, url, timestamp: Date.now(), type: "generated", instruction: tr("原始页面", "Original full slide") }];
      }

      setLocalSlides(slides);
      setGeneratedImages(initialGenerated);
      setCurrentImageVersionId(initialCurrent);
      setImageVersions(initialVersions);

      dispatchCreation({ type: "rendering" });
      const progressTracker = createTwoStageSlideProgressTracker(
        slides.length,
        "正在生成美化页图...",
        "Generating beautified slides...",
        "正在处理美化页文字层...",
        "Finishing beautification...",
      );
      progressTracker.start();

      const instruction = buildBeautifyInstruction(inputs.beautify.requirement);
      const beautifyTemplate = inputs.beautify.useTemplate ? (templateImage || undefined) : undefined;
      const tasks = slides.map((s, i) => async () => {
        let baseReady = false;
        try {
          const page: PptPage = { id: s.id, title: s.title, content: s.content || [], description: s.description || "" };
          const edited = await editPageImageWithRetry(
            page,
            instruction,
            persistedPageImages[i] || pageImages[i],
            beautifyTemplate,
          );
          progressTracker.markBaseReady();
          baseReady = true;
          if (edited) {
            await pushImageVersionAndProcess(s, edited, "edited", instruction);
            setBeautifyFailures((prev) => {
              if (!prev[s.id]) return prev;
              const next = { ...prev };
              delete next[s.id];
              return next;
            });
          } else {
            setBeautifyFailures((prev) => ({ ...prev, [s.id]: tr("模型返回空结果", "Empty model result") }));
          }
        } catch (e) {
          console.error(`Beautify failed for slide ${i + 1}`, e);
          setBeautifyFailures((prev) => ({ ...prev, [s.id]: getErrorMessage(e) }));
        } finally {
          progressTracker.markSlideFinished(baseReady);
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      dispatchCreation({ type: "finished" });
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Beautify failed", e);
      alert(tr("美化失败，请重试", "Beautify failed. Please retry."));
      dispatchCreation({ type: "failed" });
    }
  };

  const handleRetryFailedBeautify = async () => {
    if (creationMode !== "beautify") return;
    const failedSlideIds = activeSlides
      .map((s) => s.id)
      .filter((id) => !!inputs.beautify.failures[id]);
    if (failedSlideIds.length === 0) return;

    dispatchCreation({ type: "rendering" });
    const progressTracker = createTwoStageSlideProgressTracker(
      failedSlideIds.length,
      "正在重试生成页图...",
      "Retrying slide generation...",
      "正在处理重试页文字层...",
      "Finishing retry...",
    );
    progressTracker.start();

    try {
      const instruction = buildBeautifyInstruction(inputs.beautify.requirement);
      const beautifyTemplate = inputs.beautify.useTemplate ? (templateImage || undefined) : undefined;
      const tasks = failedSlideIds.map((slideId) => async () => {
        let baseReady = false;
        const slide = activeSlides.find((x) => x.id === slideId);
        const baseImageUrl = generatedImages[slideId] || getSlideImageUrl(slideId);
        if (!slide || !baseImageUrl) {
          setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("缺少可重试的原始图片", "Missing base image for retry") }));
          progressTracker.markSlideFinished(false);
          return;
        }
        try {
          const page: PptPage = { id: slide.id, title: slide.title, content: slide.content || [], description: slide.description || "" };
          const edited = await editPageImageWithRetry(page, instruction, baseImageUrl, beautifyTemplate);
          progressTracker.markBaseReady();
          baseReady = true;
          if (!edited) {
            setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("模型返回空结果", "Empty model result") }));
          } else {
            await pushImageVersionAndProcess(slide, edited, "edited", instruction);
            setBeautifyFailures((prev) => {
              if (!prev[slideId]) return prev;
              const next = { ...prev };
              delete next[slideId];
              return next;
            });
          }
        } catch (e) {
          setBeautifyFailures((prev) => ({ ...prev, [slideId]: getErrorMessage(e) }));
        } finally {
          if (slide && baseImageUrl) {
            progressTracker.markSlideFinished(baseReady);
          }
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      dispatchCreation({ type: "finished" });
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Retry failed slides error", e);
      alert(tr("重试失败页时出错，请重试。", "Retrying failed slides failed. Please try again."));
      dispatchCreation({ type: "finished" });
    }
  };

  const handleLoadOutline = async () => {
      if (!outlineInput.trim()) return;
      resetGenerationState();
      dispatchCreation({ type: "preparing", message: tr("正在解析参考素材...", "Preparing reference assets...") });
      try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        dispatchCreation({ type: "progress", current: 0, total: 0, message: tr("正在生成计划...", "Generating plan...") });
        const pages = await pptService.generatePlanFromOutline(
          outlineInput,
          uiLang as "zh" | "en",
          inputs.reference.files,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          }))
        );
        const slides: SlideData[] = pages.map((p, i) => ({
            id: p.id || `slide-${i + 1}`,
            title: normalizeLocalizedSlideTitle(p.title, uiLang as "zh" | "en", i + 1),
            content: p.content,
            description: p.description || "",
            note: p.note || "",
            layout: localizeLayoutHint(p.layout || "", uiLang as "zh" | "en"),
        }));
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets, uiLang as "zh" | "en");
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        dispatchCreation({ type: "outlined" });
        onPptReadyChange?.(true);
      } catch (e) {
        console.error("Failed to build plan from outline", e);
        alert(e instanceof Error ? e.message : tr("大纲转计划失败，请重试。", "Failed to build plan from outline. Please retry."));
        dispatchCreation({ type: "failed" });
      }
  };
  const handleGenerateOutline = async () => {
    if (!ideaInput.trim()) return;
    
    resetGenerationState();
    // The input form stays up while the plan is being built.
    dispatchCreation({ type: "preparing", message: tr("正在解析参考素材...", "Preparing reference assets...") });
    
    try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        dispatchCreation({ type: "progress", current: 0, total: 0, message: tr("正在生成大纲...", "Generating outline...") });
        const pages = await pptService.generateOutline(
          ideaInput,
          uiLang as "zh" | "en",
          inputs.reference.files,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          }))
        );
        if (!Array.isArray(pages) || pages.length === 0) {
            throw new Error("Invalid outline response");
        }
        const slides: SlideData[] = pages.map((p, i) => ({
            id: `slide-${i + 1}`,
            title: normalizeLocalizedSlideTitle(p.title, uiLang as "zh" | "en", i + 1),
            content: p.content,
            description: p.description,
            note: p.note,
            layout: localizeLayoutHint(p.layout || "", uiLang as "zh" | "en")
        }));
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets, uiLang as "zh" | "en");
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        dispatchCreation({ type: "outlined" });
        onPptReadyChange?.(true);
    } catch (e) {
        console.error("Failed to generate outline", e);
        const name = (e as any)?.name;
        const isAbort = name === "AbortError" || name === "APIUserAbortError";
        const msg = isAbort
          ? tr("生成大纲超时或被中断（120s）。请检查网络和模型可用性后重试。", "Outline generation timed out or was interrupted (120s). Check network/model availability and retry.")
          : e instanceof Error
            ? e.message
            : tr("生成大纲失败，请重试", "Failed to generate outline. Please retry.");
        alert(msg);
        dispatchCreation({ type: "failed" });
    }
  };

  const handleGenerateFullPpt = async () => {
    dispatchCreation({ type: "rendering" });
    
    // Convert SlideData back to PptPage for service
    const pages: PptPage[] = localSlides.map(s => ({
        id: s.id,
        title: s.title,
        content: s.content,
        description: s.description,
        note: s.note,
        layout: s.layout,
        status: 'outline_generated'
    }));

    try {
        const progressTracker = createTwoStageSlideProgressTracker(
          pages.length,
          "正在生成页图...",
          "Generating slide images...",
          "正在处理页文字层...",
          "Finishing slide generation...",
        );
        progressTracker.start();
        const imageTasks = pages.map((_, i) => async () => {
             let baseReady = false;
             try {
                 const imageUrl = await pptService.generatePageImage(
                  pages[i],
                  uiLang as "zh" | "en",
                  templateImage || undefined,
                 materials.getImageRefs(pages[i].id || `slide-${i + 1}`)
                );
                 progressTracker.markBaseReady();
                 baseReady = true;
                 if (imageUrl) {
                     const slide = localSlides[i];
                     if (slide) {
                       await pushImageVersionAndProcess(slide, imageUrl, 'generated');
                     }
                 }
             } catch (e) {
                 console.error(`Failed to generate image for slide ${i}`, e);
             } finally {
                 progressTracker.markSlideFinished(baseReady);
             }
        });

        await runInParallel(imageTasks, MODEL_CONCURRENCY);

        dispatchCreation({ type: "finished" });
        onPptReadyChange?.(true);

    } catch (e) {
        console.error("Full generation failed", e);
        alert(tr("生成过程中出错。", "An error occurred during generation."));
        dispatchCreation({ type: "finished" }); // Show whatever did render
        onPptReadyChange?.(true);
    }
  };

  const handleGenerateAiImage = async () => {
    if (!currentSlide) return;
    
    setIsGeneratingImage(true);
    try {
        if (creationMode === "image_transform") {
          const originalVersion = getOriginalSlideVersion(currentSlide.id);
          if (!originalVersion?.url) return;
          await createImageTransformSlideVersion(currentSlide, originalVersion.url);
          return;
        }
        let imageUrl: string | null = null;
        const pages: PptPage[] = localSlides.map(s => ({
          id: s.id,
          title: s.title,
          content: s.content,
          status: 'description_generated',
          description: s.description,
          note: s.note,
          layout: s.layout
        }));
        const pageIndex = localSlides.findIndex(s => s === currentSlide);
        imageUrl = await pptService.generatePageImage(
          pages[pageIndex],
          uiLang as "zh" | "en",
          templateImage || undefined,
          materials.getImageRefs(currentSlide.id || `slide-${pageIndex + 1}`)
        );

        if (imageUrl) {
            await pushImageVersionAndProcess(currentSlide, imageUrl, 'generated');
        }
    } catch (e) {
        console.error("Failed to generate slide image", e);
    } finally {
        setIsGeneratingImage(false);
    }
  };

  const toRenderablePage = (slide: SlideData): PptPage => {
    const editorSlide = canvasAnvilToEditorSlide(slide, {
      backgroundImageUrl: getSlideImageUrl(slide.id) || undefined,
    });
    return editorSlideToExportPayload(editorSlide).page;
  };

  const buildEditableExportPage = async (
    slide: SlideData,
    options?: { regenerateBackground?: boolean }
  ): Promise<PptPage> => {
    const { versionId, imageUrl } = getSlideVersionMeta(slide.id);
    const basePage: PptPage = {
      id: slide.id,
      title: slide.title,
      content: slide.content,
      description: slide.description,
      note: slide.note,
      layout: slide.layout,
      textBlocks: [],
      elements: [],
      backgroundImageUrl: imageUrl || undefined,
      status: "completed",
    };
    if (!versionId || !imageUrl) return basePage;
    let layer: SlideRenderLayer | undefined = renderLayers[slide.id]?.[versionId];
    if (!hasRenderableTextBlocks(layer)) {
      layer = (await ensureEditableReviewLayer(slide))?.layer;
    }
    if (!layer || !hasRenderableTextBlocks(layer)) return basePage;
    let exportTextBlocks = layer.textBlocks.filter((block) => block.text.trim().length > 0);
    if (exportTextBlocks.length === 0) return basePage;
    const textlessVersion = getTextlessBackgroundVersion(slide.id);
    let backgroundImageUrl = textlessVersion?.url || layer.backgroundImageUrl || imageUrl;
    if (options?.regenerateBackground) {
      backgroundImageUrl = await pptService.generateTextlessPageImage(
        basePage,
        imageUrl,
        exportTextBlocks,
        uiLang as "zh" | "en"
      );
      backgroundImageUrl = await persistImageUrlIfNeeded(backgroundImageUrl || imageUrl);
      exportTextBlocks = await pptService.reviewSlideTextBlocks(
        basePage,
        imageUrl,
        backgroundImageUrl || imageUrl,
        exportTextBlocks,
        uiLang as "zh" | "en"
      );
      const refilledElements = mergeTextBlocksIntoElements(exportTextBlocks, layer.elements);
      layer = {
        ...layer,
        backgroundImageUrl,
        textBlocks: exportTextBlocks,
        elements: refilledElements,
      };
      setRenderLayerState(slide.id, versionId, layer);
    }
    return {
      ...editorSlideToExportPayload(
        canvasAnvilToEditorSlide(slide, {
          renderLayer: {
            ...layer,
            backgroundImageUrl,
            textBlocks: exportTextBlocks,
            elements: mergeTextBlocksIntoElements(exportTextBlocks, layer.elements),
          },
          backgroundImageUrl,
        })
      ).page,
      backgroundImageUrl,
    };
  };

  const buildCurrentSlideImagesMap = () => {
    const images: Record<string, string> = {};
    for (const slide of activeSlides) {
      const currentUrl = getSlideImageUrl(slide.id);
      if (currentUrl) images[slide.id] = currentUrl;
    }
    return images;
  };

  const handleAddSlideToChat = (slide: SlideData) => {
    if (onAddToChat) {
        const slideId = slide.id || `slide-${currentSlideIndex + 1}`;
        const currentVersion = currentImageVersionId[slideId];
        const versions = imageVersions[slideId] || [];
        const imageUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[slideId];
        const layer = getSlideRenderLayer(slideId);
        const materialImages = (slideMaterials[slideId] || []).map((x) => ({
          name: x.name,
          url: x.dataUrl,
          caption: x.caption || "",
          sourceFileName: x.sourceFileName || "",
          sourcePage: typeof x.sourcePage === "number" ? x.sourcePage : undefined,
          refLabel: x.refLabel || "",
        }));
        onAddToChat(JSON.stringify({
          ...slide,
          imageUrl,
          backgroundImageUrl: layer?.backgroundImageUrl || imageUrl,
          textBlocks: layer?.textBlocks || [],
          materialImages,
        }, null, 2), `${slideId}.json`);
    }
  };

  const handleDownloadPpt = async () => {
    if (review.isExporting) return;
    review.setIsExporting("pptx");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPptx(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        review.setIsExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (review.isExporting) return;
    review.setIsExporting("pdf");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPdf(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        review.setIsExporting(null);
    }
  };

  const startEditableExportReview = async () => {
    if (activeSlides.length === 0) return;
    await ensurePrimaryImageVersions(activeSlides);
    review.setIsActive(true);
    review.setExtractionStatus((prev) => {
      const next = { ...prev };
      for (const item of activeSlides) {
        if (!next[item.id]) next[item.id] = "idle";
      }
      return next;
    });
    const slide = activeSlides[currentSlideIndex] || activeSlides[0];
    if (!slide) return;
    try {
      await ensureEditableReviewLayer(slide);
      const restSlides = activeSlides.filter((item) => item.id !== slide.id);
      void runInParallel(
        restSlides.map((item) => async () => {
          await ensureEditableReviewLayer(item);
        }),
        EDITABLE_REVIEW_CONCURRENCY,
      ).catch((error) => {
        console.error("Failed to prefetch editable review layers", error);
      });
    } catch (e) {
      console.error("Failed to prepare editable export review", e);
      alert(tr("可编辑导出准备失败", "Failed to prepare editable export review"));
    }
  };

  const handleDownloadEditablePpt = async () => {
    if (!review.isActive) {
      await startEditableExportReview();
      return;
    }
    if (!allEditableExtractionsDone) return;
    if (review.isExporting) return;
    review.setIsExporting("pptx_editable");
    try {
      const pages = new Array<PptPage | null>(activeSlides.length).fill(null);
      const tasks = activeSlides.map((slide, index) => async () => {
        pages[index] = await buildEditableExportPage(slide);
      });
      await runInParallel(tasks, EDITABLE_EXPORT_CONCURRENCY);
      if (pages.some((page) => !page)) {
        throw new Error("Missing editable export page");
      }
      await pptService.exportPptx(pages as PptPage[], {}, `presentation-editable-${Date.now()}`);
      review.setIsActive(false);
      review.setDrawMode(false);
      review.setDraftRect(null);
      review.setSelectedBlockId(null);
    } catch (e) {
      console.error("Editable export failed", e);
      alert(tr("导出可编辑 PPTX 失败", "Failed to export editable PPTX"));
    } finally {
      review.setIsExporting(null);
    }
  };

  const handleExtractEditableText = async (targetSlideId?: string) => {
    if (!review.isActive || isAnyEditableExtractionRunning) return;
    if (!targetSlideId && !allReviewLayersPrepared) return;
    const targets = (targetSlideId
      ? activeSlides.filter((slide) => slide.id === targetSlideId)
      : activeSlides).filter(Boolean);
    if (targets.length === 0) return;
    try {
      if (targetSlideId) {
        await extractEditableReviewSlide(targets[0]);
        return;
      }
      await runInParallel(
        targets.map((slide) => async () => {
          await extractEditableReviewSlide(slide);
        }),
        EDITABLE_REVIEW_CONCURRENCY,
      );
    } catch (error) {
      console.error("Editable text extraction failed", error);
    }
  };

  const resetToStart = () => {
    if (typeof onResetWorkspace === "function") {
      onResetWorkspace();
      return;
    }
    try {
      localStorage.removeItem(PPT_WORKSPACE_STORAGE_KEY);
    } catch {
      // A blocked localStorage only means the old history lingers.
    }
    void pptStore.clear(PPT_STATE_KEY).catch((e) => {
      console.error("Failed to clear persisted PPT workspace", e);
    });
    setLocalSlides([]);
    resetGenerationState();
    dispatchCreation({ type: "cleared" });
    setIdeaInput("");
    setOutlineInput("");
    setBeautifyRequirement("");
    setBeautifyUseTemplate(false);
    inputs.beautify.setFile(null);
    inputs.imageTransform.setFile(null);
    review.setIsActive(false);
    review.setExtractionStatus({});
    review.setSelectedBlockId(null);
    review.setDrawMode(false);
    review.setDraftRect(null);
    setBeautifyFailures({});
    setImageTransformFailures({});
    inputs.reference.setUploadFiles([]);
    setSlideMaterials({});
    materials.picker.close();
    review.setPreparingSlideIds([]);
    setRenderLayers({});
    setImageVersions({});
    setCurrentImageVersionId({});
    setGeneratedImages({});
    restoreTemplateSelection(null);
    dispatchCreation({ type: "progress", current: 0, total: 0, message: "" });
  };

  const handleBackToStart = () => {
    setBackConfirmOpen(true);
  };

  const handleBackToInputFromOutline = () => {
    setLocalSlides([]);
    setSlideMaterials({});
    resetGenerationState();
    dispatchCreation({ type: "cleared" });
  };
  const createOutlineSlide = (displayIndex: number): SlideData => ({
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: tr(`? ${displayIndex + 1} ?`, `Slide ${displayIndex + 1}`),
    content: [],
    description: "",
    note: "",
    layout: "",
  });

  const handleAddOutlineSlide = (afterIndex?: number) => {
    let nextIndex = 0;
    setLocalSlides((prev) => {
      const insertAt = typeof afterIndex === "number"
        ? Math.max(0, Math.min(afterIndex + 1, prev.length))
        : prev.length;
      nextIndex = insertAt;
      const next = [...prev];
      next.splice(insertAt, 0, createOutlineSlide(insertAt));
      return next;
    });
    setCurrentSlideIndex(nextIndex);
  };

  const handleDeleteOutlineSlide = (slideId: string) => {
    const deleteIndex = localSlides.findIndex((slide) => slide.id === slideId);
    setLocalSlides((prev) => prev.filter((s) => s.id !== slideId));
    setCurrentSlideIndex((prev) => {
      if (deleteIndex < 0) return prev;
      if (prev < deleteIndex) return prev;
      return Math.max(0, Math.min(prev - 1, localSlides.length - 2));
    });
    setGeneratedImages((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setImageVersions((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setCurrentImageVersionId((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setRenderLayers((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setBeautifyFailures((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setImageTransformFailures((prev) => {
      if (!(slideId in prev)) return prev;
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
    setSlideMaterials((prev) => {
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
  };

  // Render Creation Wizard
  if (activeSlides.length === 0 && (creationStep === 'idle' || creationStep === 'input' || creationStep === 'done')) {
    return (
      <CreationStart
        inputs={inputs}
        templateLibrary={templateLibrary}
        progress={progress}
        exportReviewMode={review.isActive}
        tr={tr}
        onGenerateOutline={handleGenerateOutline}
        onLoadOutline={handleLoadOutline}
        onStartBeautify={handleStartBeautify}
        onStartImageTransform={handleStartImageTransform}
      />
    );
  }

  // Render Outline Review
  if (creationStep === 'outline') {
    return (
      <OutlineReview
        slides={localSlides}
        setSlides={setLocalSlides}
        materials={materials}
        tr={tr}
        onBack={handleBackToInputFromOutline}
        onAddSlide={handleAddOutlineSlide}
        onDeleteSlide={handleDeleteOutlineSlide}
        onAddSlideToChat={handleAddSlideToChat}
        onGenerate={handleGenerateFullPpt}
      />
    );
  }

  // Render Progress
  if (isGenerating(creationStep)) {
    return <GenerationProgress step={creationStep} progress={progress} tr={tr} />;
  }

  // Regular View (creationStep === 'done' or manually provided data)
  return (
    <DeckView
      deck={{
        slides: activeSlides,
        currentSlide,
        currentIndex: currentSlideIndex,
        setCurrentIndex: setCurrentSlideIndex,
        currentSlideImage,
        currentLayer: currentReviewLayer,
        currentVersionId: currentSlide ? getSlideVersionMeta(currentSlide.id).versionId : "",
        versionIdBySlide: currentImageVersionId,
        setVersionIdBySlide: setCurrentImageVersionId,
        getVisibleVersions: getVisibleSlideVersions,
        getLayer: getSlideRenderLayer,
        getBackgroundUrl: getSlideBackgroundUrl,
        formatVersionLabel: formatImageVersionLabel,
        getVersionId: (slideId) => getSlideVersionMeta(slideId).versionId,
        templateImage,
      }}
      textBlocks={{
        update: updateSlideTextBlock,
        updateRect: updateSlideTextBlockRect,
        remove: deleteSlideTextBlock,
      }}
      review={review}
      reviewProgress={reviewProgress}
      materials={materials}
      inputs={inputs}
      slideshow={slideshow}
      actions={{
        addSlideToChat: handleAddSlideToChat,
        backToStart: handleBackToStart,
        backConfirmOpen,
        setBackConfirmOpen,
        confirmBackToStart: resetToStart,
        downloadPpt: () => void handleDownloadPpt(),
        downloadPdf: () => void handleDownloadPdf(),
        downloadEditablePpt: () => void handleDownloadEditablePpt(),
        extractEditableText: (slideId) => void handleExtractEditableText(slideId),
        generateAiImage: () => void handleGenerateAiImage(),
        retryFailedBeautify: () => void handleRetryFailedBeautify(),
      }}
      status={{
        currentSlideFailure,
        failedBeautifyCount,
        failedImageTransformCount,
        isApplyingEdits,
        isGeneratingImage,
      }}
      layout={{
        canvasRef: previewCanvasRef,
        canvasSize: previewCanvasSize,
        window: windowDimensions,
      }}
      creationMode={creationMode}
      progress={progress}
      tr={tr}
      uiLang={uiLang}
    />
  );
}