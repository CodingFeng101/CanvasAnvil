import { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { errorText, isRetryableBeautifyError } from "./lib/errors";
import { runInParallel, sleep } from "./lib/concurrency";
import { pptConcurrency } from "@/shared/preferences";
import { parseJsonLoose } from "./lib/parse-json";
import { extractPdfPagesAsImages, isPdfFile } from "./lib/deck-source";
import { GenerationProgress } from "./views/GenerationProgress";
import { OutlineReview } from "./views/OutlineReview";
import { OutlineWriting, type WritingPage } from "./views/OutlineWriting";
import { PptStart, StylePickerDialog } from "./views/StylePicker";
import type { DeckActivity, DeckCommand } from "@/workspaces/ppt/lib/deck-flow";
import type { CreationRequest, CreationResult } from "@/workspaces/ppt/lib/creation-intent";
import { DeckView } from "./views/DeckView";
import {
  getTextlessBackgroundVersion as textlessBackgroundOf,
  getVisibleSlideVersions as getVisibleVersions,
  resolveSlideVersion,
} from "./lib/slide-versions";
import {
  buildSlideMaterialsFromAutoLabels,
  uploadedImageLabel,
  type MaterialLang,
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
import { useDeckExport } from "./hooks/use-deck-export";
import { useEditableExport } from "./hooks/use-editable-export";

/**
 * Editable export runs the server's editable PPTX pipeline. The older
 * in-browser rebuild (handleDownloadEditablePpt, vision/) is kept intact
 * behind this switch.
 */
const EDITABLE_EXPORT_VIA_AGENT = true;
import { useSlideshow } from "./hooks/use-slideshow";
import { buildBeautifyInstruction } from "./lib/beautify-instruction";
import { buildChatImagesInstruction, buildStyleReferenceInstruction } from "../lib/slide-prompts";
import { describeRebuildEvent, type RebuildLogEntry } from "./lib/rebuild-log";
import { generateChatMessage } from '@/ai/client';
import {
  PLAN_TIMEOUT_MS,
  pptService,
  partialOutlinePages,
  PptPage,
  type PptElement,
  type PptTextBlock,
  type SlideEditRoutingItem,
} from '@/workspaces/ppt/lib/ppt-service';
import { PPT_STATE_KEY, PPT_WORKSPACE_STORAGE_KEY, pptStore } from "@/workspaces/ppt/storage";
import { useReportBusy, useWork, useWorkStore } from "@/shared/works/work-context";
import { notify } from "@/shared/ui/notify";
import { registerPeekSource } from "@/shared/ui/peek";
import { setPendingReference, takePendingReference } from "@/shared/references/pending";
import { canOpenCanvas, openCanvasFor } from "@/shared/references/bus";
import { inboxForSlides, PPT_INBOX_KEY, type SlideInboxEntry } from "@/shared/references/inbox";
import { referenceToFiles } from "@/shared/references/to-files";
import { REPORT_IMAGES_KEY, matchReportImages, picturesAsReportItems, type PendingReportImages } from "./lib/report-images";
import { nameFromText } from "@/shared/works/works-index";
import { makeThumbnail } from "@/shared/works/thumbnail";
import { useUiLanguage } from "@/shared/i18n";
import { canvasAnvilToEditorSlide, editorSlideToExportPayload } from "@/features/ppt-editor";
import {
  BEAUTIFY_RETRY_BASE_DELAY_MS,
  BEAUTIFY_RETRY_MAX_ATTEMPTS,
  UPLOADED_IMAGE_LIMIT,
} from "@/workspaces/ppt/canvas/lib/constants";
import {
  deriveTextElementsFromBlocks,
  hasRenderableTextBlocks,
  localizeLayoutHint,
  mergeTextBlocksIntoElements,
  normalizeLocalizedSlideTitle,
  parseSlideNo,
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
  incomingEdit?: { id: string; payload: string } | null;
  onIncomingEditHandled?: (id: string) => void;
  /** The first chat message of a deck: what to make, from what. */
  creationRequest?: (CreationRequest & { id: string }) | null;
  onCreationHandled?: (id: string, result: CreationResult) => void;
  /** What is being typed in the chat, for the style library's suggestions. */
  draftText?: string;
  onTemplateChange?: (template: { name: string; previewSrc: string } | null) => void;
  /** What the canvas is doing while a deck is made, for the chat's steps. */
  onActivityChange?: (activity: DeckActivity) => void;
  /** What the chat asks for: make the slides (the outline was confirmed there), or pick a style. */
  command?: DeckCommand | null;
  onCommandHandled?: () => void;
}

export function PptCanvas({
  data,
  onAddToChat,
  onPptReadyChange,
  onPptStageChange,
  incomingEdit,
  onIncomingEditHandled,
  creationRequest,
  onCreationHandled,
  draftText = "",
  onTemplateChange,
  onActivityChange,
  command,
  onCommandHandled,
}: PptCanvasProps) {
  const uiLang = useUiLanguage();
  const tr = useCallback((zh: string, en: string) => (uiLang === "zh" ? zh : en), [uiLang]);
  // The open work's store (My works); the canvas remounts when another work is opened.
  const deckStore = useWorkStore(pptStore);
  const work = useWork();
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
  const selectedTemplate = templateLibrary.templates.find((t) => t.id === selectedTemplateId);
  const selectedTemplateName = selectedTemplate?.name ?? "";
  const selectedTemplatePreview = selectedTemplate?.previewSrc ?? "";
  useEffect(() => {
    onTemplateChange?.(selectedTemplateName ? { name: selectedTemplateName, previewSrc: selectedTemplatePreview } : null);
  }, [selectedTemplateName, selectedTemplatePreview, onTemplateChange]);
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
  /** What the editable export is doing, while it does it. Reading a deck's
   *  text and repainting each background takes minutes, and a button that
   *  only says "exporting" for that long reads as a hang. */
  const [editableExportProgress, setEditableExportProgress] = useState("");
  /**
   * Every step of the rebuild, kept so a failure can be read afterwards.
   *
   * A page that could not be rebuilt exports as the picture it already was,
   * which is indistinguishable from the button having done nothing. This log
   * is the only place that difference shows.
   */
  const [editableExportLog, setEditableExportLog] = useState<RebuildLogEntry[]>([]);
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
  const inputs = useCreationInputs({ initialState: initialPptState });
  const { creationMode, setCreationMode, ideaInput, outlineInput } = inputs;
  const { setIdeaInput, setOutlineInput } = inputs;
  const { setRequirement: setBeautifyRequirement, setUseTemplate: setBeautifyUseTemplate,
    setFailures: setBeautifyFailures } = inputs.beautify;
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
  // The workspace clears the chat when the deck goes back to "start", so only a real start says so:
  // not while slides are being drawn (the outline exists), and not before the saved deck has loaded
  // (a refresh would otherwise wipe the conversation of a finished deck).
  useEffect(() => {
    if (creationStep === "done") onPptStageChange?.("slides");
    else if (creationStep === "outline" || creationStep === "generating_images") onPptStageChange?.("outline");
    else if (creationStep === "generating_content") return;
    else if (isPersistenceHydrated) onPptStageChange?.("start");
  }, [creationStep, onPptStageChange, isPersistenceHydrated]);
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
        const raw = await deckStore.read<any>(PPT_STATE_KEY);
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
            coreState?.creationMode === "beautify"
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
    deckStore,
    restoreTemplateSelection,
    setSlideMaterials,
    setCreationMode,
    setIdeaInput,
    setOutlineInput,
    setBeautifyRequirement,
    setBeautifyUseTemplate,
    setBeautifyFailures,
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
          updatedAt,
        })
      );
    } catch (e) {
      console.error("Failed to persist PPT workspace snapshot to localStorage", e);
    }
    void deckStore.save(PPT_STATE_KEY, workspaceState).catch((e) => {
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
      ? Array.from(
          new Set((parsed.uploadedImages as any[]).map((x: any) => String(x || "").trim()).filter(Boolean)),
        ).slice(0, UPLOADED_IMAGE_LIMIT)
      : [];
    /**
     * The chat panel's pictures, named so the prompt can place them.
     *
     * They used to reach only the "edit the existing image" path, which is the
     * one branch that does not redraw the slide -- so a user who attached a
     * picture and asked for it to appear got the redraw branch instead, and
     * the picture went nowhere.
     */
    const uploadedImageRefs = uploadedImages.map((url, i) => ({
      url,
      label: uploadedImageLabel(i + 1, uiLang as MaterialLang),
    }));
    /**
     * Which image call a slide takes: the user's choice from the chat toolbar,
     * not the router's guess.
     *
     * A payload without the field predates the toolbar, so it falls back to
     * what the router wanted. Editing needs something to edit, and a message
     * can add a slide that has no picture yet -- that one still gets drawn,
     * or it would come out blank.
     */
    const pinnedImageMode: "auto" | "edit" | "regenerate" =
      parsed?.imageMode === "edit" || parsed?.imageMode === "regenerate" ? parsed.imageMode : "auto";
    const shouldRedraw = (routerWantsRedraw: boolean, currentUrl: string) => {
      if (pinnedImageMode === "regenerate") return true;
      if (pinnedImageMode === "edit") return !String(currentUrl || "").trim();
      return routerWantsRedraw;
    };
    const uploadedImageInstruction = buildChatImagesInstruction(uiLang as "zh" | "en", uploadedImageRefs.map((x) => x.label));
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
      const styleReferenceInstruction = buildStyleReferenceInstruction(uiLang as "zh" | "en", styleRefPolicy, styleRefRefs);
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

      if ((editType === "text_only" || editType === "text_relayout") && pinnedImageMode !== "edit") {
        routedEditTasks.push(async () => {
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...materials.getImageRefs(id, page.description || ""),
              ...uploadedImageRefs,
            ],
            [instruction.trim(), styleReferenceInstruction, uploadedImageInstruction].filter(Boolean).join("\n")
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
        const shouldRegenerate = shouldRedraw(
          isNewSlide || !currentUrl || changedByPatch,
          currentUrl || "",
        );
        if (shouldRegenerate) {
          const rendered = await pptService.generatePageImage(
            page,
            uiLang as "zh" | "en",
            templateImage || undefined,
            [
              ...styleRefRefs.map((x) => ({ url: x.url, label: x.label })),
              ...materials.getImageRefs(id, page.description || ""),
              ...uploadedImageRefs,
            ],
            [instruction.trim(), styleReferenceInstruction, uploadedImageInstruction].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", instruction.trim() || undefined);
          }
          return;
        }
        const editedUrl = await pptService.editPageImage(
          page,
          [instruction.trim(), styleReferenceInstruction, uploadedImageInstruction].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([
            ...styleRefImageUrls,
            ...explicitMaterialImageUrls,
            ...uploadedImages,
            ...materials.getImageUrls(id, page.description || ""),
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
        await runInParallel(routedEditTasks, pptConcurrency());
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

      // The same pin applies on the fallback path, which decides by `kind`.
      const fallbackWantsRedraw = kind === "content" || kind === "both" || (!kind && (changedByPatch || isNewSlide));
      const fallbackCurrentUrl = (() => {
        const versions = imageVersions[id] || [];
        const currentVersion = currentImageVersionId[id];
        return String(
          (currentVersion ? versions.find((v) => v.id === currentVersion)?.url : generatedImages[id]) || "",
        );
      })();
      if (shouldRedraw(fallbackWantsRedraw, fallbackCurrentUrl)) {
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
              ...materials.getImageRefs(id, page.description || ""),
              ...uploadedImageRefs,
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
              uploadedImageInstruction,
            ].filter(Boolean).join("\n")
          );
          if (rendered) {
            await pushImageVersionAndProcess(slide, rendered, "generated", kind === "both" ? instruction : undefined);
          }
        });
        if (pinnedImageMode === "regenerate" || kind === "content" || kind === "both") continue;
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
            uploadedImageInstruction,
          ].filter(Boolean).join("\n"),
          currentUrl || undefined,
          templateImage || undefined,
          Array.from(new Set([...styleRefImageUrls, ...uploadedImages, ...materials.getImageUrls(id, page.description || "")]))
        );
        if (editedUrl) {
          await pushImageVersionAndProcess(slide, editedUrl, "edited", instruction);
        }
      });
    }

    if (editTasks.length > 0) {
      setIsApplyingEdits(true);
      try {
        await runInParallel(editTasks, pptConcurrency());
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
  const getTextlessBackgroundVersion = (slideId: string) => textlessBackgroundOf(slideId, versionState);
  const getSlideImageUrl = (slideId: string) => getSlideVersionMeta(slideId).imageUrl;

  // Hover previews for slides named in the chat and materials named in a description.
  const peekRef = useLatestRef({ localSlides, slideMaterials, getSlideImageUrl, tr });
  useEffect(() => {
    const slideOf = (el: HTMLElement) => {
      const { localSlides: slides } = peekRef.current;
      const id = el.dataset.slideId;
      const page = Number(el.dataset.peekPage);
      const index = id ? slides.findIndex((s) => s.id === id) : Number.isFinite(page) ? page - 1 : -1;
      return index >= 0 && index < slides.length ? { slide: slides[index], index } : null;
    };
    const offSlide = registerPeekSource("ppt-slide", (el) => {
      const found = slideOf(el);
      if (!found) return null;
      const { slide, index } = found;
      const { getSlideImageUrl: imageOf, tr: say } = peekRef.current;
      const picture = el.dataset.tokenKind === "outline" ? "" : imageOf(slide.id);
      const points = (slide.content || []).filter(Boolean).map((line) => `· ${line}`).join("\n");
      return {
        title: say(`第 ${index + 1} 页 · ${slide.title || "未命名"}`, `Slide ${index + 1} · ${slide.title || "Untitled"}`),
        images: picture ? [picture] : [],
        text: points || slide.description || "",
      };
    });
    const offMaterial = registerPeekSource("ppt-material", (el) => {
      const name = el.dataset.materialToken;
      const slideId = el.closest<HTMLElement>("[data-peek-slide]")?.dataset.peekSlide;
      if (!name || !slideId) return null;
      const material = (peekRef.current.slideMaterials[slideId] || []).find((m) => m.name === name);
      if (!material) return { title: name, text: peekRef.current.tr("这张素材已经删掉了", "This material has been removed") };
      return { title: name, images: material.dataUrl ? [material.dataUrl] : [], text: material.caption || "", meta: material.refLabel || material.sourceFileName || "" };
    });
    return () => {
      offSlide();
      offMaterial();
    };
    // Registered once; the ref carries the current deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A design sent here from the interior canvas ("生成汇报 PPT"), once the deck is loaded.
  useEffect(() => {
    if (!isPersistenceHydrated) return;
    const waiting = takePendingReference("ppt");
    if (!waiting) return;
    if (waiting.intent.kind === "deck-source") {
      // A design to report on: its pictures wait (saved with this work) until the outline exists.
      const items = waiting.reference.items.filter((item) => item.kind === "image" && item.dataUrl);
      if (items.length) void deckStore.save<PendingReportImages>(REPORT_IMAGES_KEY, { workName: waiting.reference.workName, items });
      return;
    }
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersistenceHydrated]);

  // Once the report's outline is there, the waiting design pictures go onto the slides that talk about them.
  useEffect(() => {
    if (!isPersistenceHydrated || creationStep !== "outline" || localSlides.length === 0) return;
    let cancelled = false;
    void (async () => {
      const waiting = await deckStore.read<PendingReportImages>(REPORT_IMAGES_KEY).catch(() => null);
      if (cancelled || !waiting?.items?.length) return;
      await deckStore.clear(REPORT_IMAGES_KEY);
      const { bySlide, unmatched } = matchReportImages(localSlides, waiting.items);
      const placed: string[] = [];
      for (const [slideId, items] of bySlide) {
        const reference = { workspace: "cad" as const, workId: "", workName: waiting.workName, items };
        const added = await materials.addReferencedImages(slideId, referenceToFiles(reference), waiting.workName);
        const index = localSlides.findIndex((slide) => slide.id === slideId);
        if (added.length) placed.push(tr(`第 ${index + 1} 页：${items.map((i) => i.label).join("、")}`, `slide ${index + 1}: ${items.map((i) => i.label).join(", ")}`));
      }
      if (placed.length) notify.success(tr("户型图片已放进对应页面", "Design pictures added to their slides"), { description: placed.join(tr("；", "; ")), duration: 8000 });
      if (unmatched.length)
        notify.info(tr(`有 ${unmatched.length} 张图没找到合适的页面`, `${unmatched.length} picture(s) fit no slide`), {
          description: tr(`${unmatched.map((i) => i.label).join("、")}。可以在那一页点「从作品引用」加进去。`, `${unmatched.map((i) => i.label).join(", ")}. Add them on a slide with "From a work".`),
          duration: 8000,
        });
    })();
    return () => {
      cancelled = true;
    };
    // Runs when the outline appears; the pictures are cleared once placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersistenceHydrated, creationStep, localSlides.length]);

  // Pictures sent back from Free drawing ("送回 PPT"): each becomes a new version of its slide.
  useEffect(() => {
    if (!isPersistenceHydrated) return;
    let cancelled = false;
    void (async () => {
      const entries = await deckStore.read<SlideInboxEntry[]>(PPT_INBOX_KEY).catch(() => null);
      if (cancelled || !Array.isArray(entries) || entries.length === 0) return;
      await deckStore.clear(PPT_INBOX_KEY);
      const { apply, dropped } = inboxForSlides(entries, localSlides.map((slide) => slide.id));
      let lastIndex = -1;
      for (const entry of apply) {
        const slide = localSlides.find((s) => s.id === entry.slideId);
        if (!slide) continue;
        await pushImageVersionAndProcess(slide, entry.dataUrl, "edited", entry.note || tr(`从自由绘制「${entry.from}」送回`, `Sent back from Free drawing "${entry.from}"`));
        lastIndex = localSlides.indexOf(slide);
      }
      if (lastIndex >= 0) {
        setCurrentSlideIndex(lastIndex);
        notify.success(tr(`已送回第 ${lastIndex + 1} 页`, `Sent back to slide ${lastIndex + 1}`), { description: tr("加成了新版本，原来的版本还在，可以随时切回。", "It is a new version; the earlier one is still there to switch back to."), duration: 6000 });
      }
      if (dropped) notify.info(tr(`有 ${dropped} 张送回的图没有加进来`, `${dropped} sent-back picture(s) were not added`), { description: tr("它们对应的页面已经删除了。", "Their slides have been deleted.") });
    })();
    return () => {
      cancelled = true;
    };
    // Once, when the deck has loaded; the inbox is cleared as it is read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersistenceHydrated]);

  /** The slide's current picture to Free drawing, to mark up and edit there; it can be sent back. */
  const editSlideOnBoard = async (slide: SlideData) => {
    const index = localSlides.findIndex((s) => s.id === slide.id);
    const url = getSlideImageUrl(slide.id);
    if (!url || index < 0 || !work) return;
    const dataUrl = await persistImageUrlIfNeeded(url);
    if (!dataUrl.startsWith("data:image")) {
      notify.error(tr("没能读出这一页的图片", "Could not read this slide's picture"), { description: tr("可以先重新渲染这一页再试。", "Re-render the slide and try again.") });
      return;
    }
    const slideLabel = tr(`第 ${index + 1} 页`, `slide ${index + 1}`);
    const deckName = work.name || tr("未命名 PPT", "Untitled deck");
    setPendingReference({
      to: "canvas",
      reference: { workspace: "ppt", workId: work.workId, workName: deckName, items: [{ id: `ppt:${slide.id}`, kind: "image", label: slideLabel, dataUrl }] },
      intent: { kind: "board-edit", returnTo: { workId: work.workId, slideId: slide.id, slideLabel, deckName } },
    });
    // A board of its own: the latest board may hold other slides sent there before.
    await openCanvasFor("canvas", null);
  };

  const getSlideRenderLayer = useCallback((slideId: string) => {
    const { versionId } = getSlideVersionMeta(slideId);
    if (!versionId) return undefined;
    return renderLayers[slideId]?.[versionId];
  }, [getSlideVersionMeta, renderLayers]);
  const getSlideBackgroundUrl = (slideId: string) => {
    return getSlideImageUrl(slideId) || "";
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




  const exporter = useDeckExport();
  const editableExport = useEditableExport(tr);



  const activeSlides = localSlides;

  const slideshow = useSlideshow(activeSlides.length);
  const currentSlide = activeSlides[currentSlideIndex];
  const currentSlideImage = currentSlide ? getSlideBackgroundUrl(currentSlide.id) : "";
  const currentReviewLayer = currentSlide ? getSlideRenderLayer(currentSlide.id) : undefined;

  const failedBeautifyCount = activeSlides.reduce((n, s) => n + (inputs.beautify.failures[s.id] ? 1 : 0), 0);
  const currentSlideFailure = currentSlide ? inputs.beautify.failures[currentSlide.id] : "";

  const formatImageVersionLabel = (version: SlideImageVersion, index: number) => {
    if (version.type === "derived_textless") {
      return tr("无字底图", "Textless background");
    }
    if (version.instruction === tr("原始版本", "Original version") || version.instruction === tr("原始页面", "Original full slide")) {
      return tr("原始版本", "Original version");
    }
    return tr(`第 ${index + 1} 版`, `Version ${index + 1}`);
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


  // The outline as it streams: slide titles shown on the canvas one by one.
  const [outlineDraft, setOutlineDraft] = useState<WritingPage[]>([]);
  // The AI pen writing the outline out on the canvas; it keeps going until it has written the
  // whole outline, then the outline turns editable.
  const [penWriting, setPenWriting] = useState(false);
  const watchOutline = () => {
    setPenWriting(true);
    let timer = 0;
    let latest = "";
    const flush = () => {
      timer = 0;
      setOutlineDraft(partialOutlinePages(latest).map((page) => ({ title: page.title, content: page.content ?? [] })));
    };
    const onText = (text: string) => {
      latest = text;
      if (!timer) timer = window.setTimeout(flush, 120);
    };
    const done = () => {
      window.clearTimeout(timer);
      setOutlineDraft([]);
    };
    return { onText, done };
  };

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

  const handleStartBeautify = async (
    fileOverride?: File | null,
    requirementOverride?: string,
    useTemplateOverride?: boolean,
  ): Promise<CreationResult> => {
    const file = fileOverride ?? inputs.beautify.file;
    if (!file) return { ok: false };
    let failedCount = 0;

    resetGenerationState();
    setBeautifyFailures({});
    dispatchCreation({ type: "writing", message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = isPdfFile(file)
        ? await extractPdfPagesAsImages(file, reportPdfParseProgress)
        : [];

      if (pageImages.length === 0) {
        dispatchCreation({ type: "failed" });
        return { ok: false, error: tr("无法解析页面图片，请确认文件格式（仅支持 .pdf）。", "Failed to extract pages. Please upload a .pdf file.") };
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

      const instruction = buildBeautifyInstruction(requirementOverride ?? inputs.beautify.requirement);
      const beautifyTemplate = (useTemplateOverride ?? inputs.beautify.useTemplate) ? (templateImage || undefined) : undefined;
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
            failedCount += 1;
            setBeautifyFailures((prev) => ({ ...prev, [s.id]: tr("模型返回空结果", "Empty model result") }));
          }
        } catch (e) {
          console.error(`Beautify failed for slide ${i + 1}`, e);
          failedCount += 1;
          setBeautifyFailures((prev) => ({ ...prev, [s.id]: getErrorMessage(e) }));
        } finally {
          progressTracker.markSlideFinished(baseReady);
        }
      });

      await runInParallel(tasks, pptConcurrency());
      dispatchCreation({ type: "finished" });
      onPptReadyChange?.(true);
      return { ok: true, count: slides.length, failed: failedCount };
    } catch (e) {
      console.error("Beautify failed", e);
      dispatchCreation({ type: "failed" });
      return { ok: false, error: getErrorMessage(e) };
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

      await runInParallel(tasks, pptConcurrency());
      dispatchCreation({ type: "finished" });
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Retry failed slides error", e);
      notify.error(tr("重试失败页没有成功", "Retrying the failed slides did not work"), { description: errorText(e) });
      dispatchCreation({ type: "finished" });
    }
  };

  const handleLoadOutline = async (override?: string): Promise<CreationResult> => {
      const outlineText = override ?? outlineInput;
      if (!outlineText.trim()) return { ok: false };
      resetGenerationState();
      dispatchCreation({ type: "preparing", message: tr("正在解析参考素材...", "Preparing reference assets...") });
      try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        dispatchCreation({ type: "progress", current: 0, total: 0, message: tr("正在生成计划...", "Generating plan...") });
        const watch = watchOutline();
        const pages = await pptService.generatePlanFromOutline(
          outlineText,
          uiLang as "zh" | "en",
          inputs.reference.files,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          })),
          watch.onText,
        ).finally(watch.done);
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
        return { ok: true, count: slides.length };
      } catch (e) {
        console.error("Failed to build plan from outline", e);
        dispatchCreation({ type: "failed" });
        return { ok: false, error: e instanceof Error ? e.message : tr("大纲转计划失败，请重试。", "Failed to build plan from outline. Please retry.") };
      }
  };
  const handleGenerateOutline = async (override?: string): Promise<CreationResult> => {
    const ideaText = override ?? ideaInput;
    if (!ideaText.trim()) return { ok: false };

    resetGenerationState();
    // The input form stays up while the plan is being built.
    dispatchCreation({ type: "preparing", message: tr("正在解析参考素材...", "Preparing reference assets...") });
    
    try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        dispatchCreation({ type: "progress", current: 0, total: 0, message: tr("正在生成大纲...", "Generating outline...") });
        const watch = watchOutline();
        const pages = await pptService.generateOutline(
          ideaText,
          uiLang as "zh" | "en",
          inputs.reference.files,
          referenceVisualAssets.map((x) => ({
            label: x.label,
            caption: x.caption,
            sourceFile: x.sourceFileName,
            sourcePage: x.sourcePage,
          })),
          watch.onText,
        ).finally(watch.done);
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
        return { ok: true, count: slides.length };
    } catch (e) {
        console.error("Failed to generate outline", e);
        const name = (e as any)?.name;
        const isAbort = name === "AbortError" || name === "APIUserAbortError";
        const msg = isAbort
          ? tr(
              `生成大纲超时或被中断（${PLAN_TIMEOUT_MS / 1000}s）。请检查网络和模型可用性后重试。`,
              `Outline generation timed out or was interrupted (${PLAN_TIMEOUT_MS / 1000}s). Check network/model availability and retry.`,
            )
          : e instanceof Error
            ? e.message
            : tr("生成大纲失败，请重试", "Failed to generate outline. Please retry.");
        dispatchCreation({ type: "failed" });
        return { ok: false, error: msg };
    }
  };

  /**
   * A deck asked for in the chat. The reference documents are read first; the
   * flow itself starts from the render after that, so it sees their text.
   */
  const pendingCreationRef = useRef<(CreationRequest & { id: string }) | null>(null);
  const [pendingCreationTick, setPendingCreationTick] = useState(0);
  useEffect(() => {
    const request = creationRequest;
    if (!request) return;
    setCreationMode(request.kind);
    if (request.kind === "idea") setIdeaInput(request.text);
    else if (request.kind === "outline") setOutlineInput(request.text);
    else {
      setBeautifyRequirement(request.text);
      setBeautifyUseTemplate(Boolean(templateImage));
    }
    void (async () => {
      // A referenced work's pictures wait (saved with this work) until the outline exists, like a design sent here.
      if (request.kind !== "beautify" && request.pictures?.length) {
        const items = await picturesAsReportItems(request.pictures).catch(() => []);
        if (items.length) await deckStore.save<PendingReportImages>(REPORT_IMAGES_KEY, { workName: items[0].workName, items: items.map((x) => x.item) });
      }
      if (request.kind !== "beautify") {
        dispatchCreation({ type: "preparing", message: tr("正在读参考资料...", "Reading the reference files...") });
        await inputs.reference.handleFileChange(request.files).catch((e) => console.error("Failed to read reference files", e));
      }
      pendingCreationRef.current = request;
      setPendingCreationTick((x) => x + 1);
    })();
    // One-shot per request: the id identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationRequest?.id]);
  useEffect(() => {
    const request = pendingCreationRef.current;
    if (!request || inputs.reference.isParsing) return;
    pendingCreationRef.current = null;
    const run =
      request.kind === "idea"
        ? handleGenerateOutline(request.text)
        : request.kind === "outline"
          ? handleLoadOutline(request.text)
          : handleStartBeautify(request.files[0] ?? null, request.text, Boolean(templateImage));
    void run
      .catch((e): CreationResult => ({ ok: false, error: getErrorMessage(e) }))
      .then((result) => {
        // A request turned away before it started leaves no "reading…" behind.
        if (!result.ok) dispatchCreation({ type: "failed" });
        onCreationHandled?.(request.id, result);
      });
    // Runs the handlers of the render that has the parsed files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCreationTick, inputs.reference.isParsing]);

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
                 materials.getImageRefs(pages[i].id || `slide-${i + 1}`, pages[i].description || "")
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

        await runInParallel(imageTasks, pptConcurrency());
        // The last page's pen sweep finishes before the deck replaces the grid.
        await sleep(1400);

        dispatchCreation({ type: "finished" });
        onPptReadyChange?.(true);

    } catch (e) {
        console.error("Full generation failed", e);
        notify.error(tr("生成中途出错了", "Generation stopped with an error"), { description: tr(`已经生成的页面都保留了。${errorText(e)}`, `The slides already made are kept. ${errorText(e)}`) });
        dispatchCreation({ type: "finished" }); // Show whatever did render
        onPptReadyChange?.(true);
    }
  };

  const handleGenerateAiImage = async () => {
    if (!currentSlide) return;
    
    setIsGeneratingImage(true);
    try {
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
          materials.getImageRefs(currentSlide.id || `slide-${pageIndex + 1}`, pages[pageIndex]?.description || "")
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

  /**
   * One slide, ready to be written into an editable .pptx.
   *
   * Everything the file needs is produced here in a single pass: the text
   * blocks, the background with that text painted out, and the version record
   * for both. It cannot be split into a prepare phase and a build phase --
   * the second would read `renderLayers` from a closure captured before the
   * first one's state landed, find nothing, and extract every slide twice.
   *
   * A slide whose layer and textless background both survive from an earlier
   * export is reused as it stands, so exporting twice costs one run.
   */
  /**
   * One slide, ready to be written into an editable .pptx.
   *
   * Nothing is generated here. Real text boxes need a background with that
   * text painted out, and deriving one costs several model calls per slide --
   * export does not pay them. A slide that already has both, from an earlier
   * run or from the image-transform path, is exported with its text editable;
   * every other slide goes out as the rendered image, which is what a text
   * layer over the original would look like anyway, only doubled.
   */
  const buildEditableExportPage = (slide: SlideData): PptPage => {
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

    const layer = renderLayers[slide.id]?.[versionId];
    const textless = getTextlessBackgroundVersion(slide.id);
    if (!hasRenderableTextBlocks(layer) || !textless?.url) return basePage;

    const exportTextBlocks = layer.textBlocks.filter((block) => block.text.trim().length > 0);
    if (exportTextBlocks.length === 0) return basePage;

    const backgroundImageUrl = textless.url;
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
    if (exporter.isExporting) return;
    exporter.setIsExporting("pptx");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPptx(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        notify.error(tr("导出没有成功", "Export failed"), { description: errorText(e) });
    } finally {
        exporter.setIsExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (exporter.isExporting) return;
    exporter.setIsExporting("pdf");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPdf(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        notify.error(tr("导出没有成功", "Export failed"), { description: errorText(e) });
    } finally {
        exporter.setIsExporting(null);
    }
  };


  /**
   * A slide that already carries a rebuild, from an earlier export.
   *
   * Rebuilding costs image calls, so a deck exported twice pays once. The
   * layer and the background are kept together: half of a rebuild is worse
   * than none, because the background has had its content removed and only
   * the elements can put it back.
   */
  const existingRebuild = (
    slide: SlideData,
  ): { textBlocks: PptTextBlock[]; elements: PptElement[]; backgroundImageUrl: string } | null => {
    const { versionId } = getSlideVersionMeta(slide.id);
    if (!versionId) return null;

    const layer = renderLayers[slide.id]?.[versionId];
    const background = getTextlessBackgroundVersion(slide.id);
    if (!background?.url || !hasRenderableTextBlocks(layer)) return null;

    return {
      textBlocks: layer.textBlocks.filter((block) => block.text.trim().length > 0),
      elements: Array.isArray(layer.elements) ? layer.elements : [],
      backgroundImageUrl: background.url,
    };
  };

  /**
   * Exports the deck as a .pptx, rebuilt from each slide's own pixels.
   *
   * The whole page is rebuilt rather than only its text: a background with
   * its content removed needs the text, the shapes *and* the pictures put
   * back, and any one of the three missing is content erased from the deck.
   *
   * Results are collected here rather than read back from state. The writes
   * below land after this closure captured `renderLayers`, so reading it
   * would find nothing and rebuild every slide a second time.
   */
  const handleDownloadEditablePpt = async () => {
    if (activeSlides.length === 0 || exporter.isExporting) return;
    exporter.setIsExporting("pptx_editable");

    // A fresh run starts a fresh log; ids carry the run so React never
    // reconciles two different runs' lines.
    const runId = `run-${Date.now()}`;
    setEditableExportLog([]);

    try {
      const rebuilt = new Map<
        string,
        { textBlocks: PptTextBlock[]; elements: PptElement[]; backgroundImageUrl: string }
      >();

      const pending: { id: string; imageUrl: string; expected: string[] }[] = [];
      for (const slide of activeSlides) {
        const done = existingRebuild(slide);
        if (done) {
          rebuilt.set(slide.id, done);
          continue;
        }
        const imageUrl = getSlideImageUrl(slide.id);
        if (!imageUrl) continue;
        pending.push({
          id: slide.id,
          imageUrl,
          expected: [slide.title || "", ...(slide.content || [])].filter(Boolean),
        });
      }

      if (pending.length > 0) {
        // Imported on demand: the rebuild carries an inference runtime and a
        // page of pixel code that a deck exported as images never needs.
        const { rebuildDeck } = await import("@/workspaces/ppt/vision/pipeline");
        let line = 0;
        const results = await rebuildDeck(pending, {
          onEvent: (event) => {
            const described = describeRebuildEvent(event, uiLang === "zh" ? "zh" : "en");
            if (!described) return;
            line += 1;
            const entry = { id: `${runId}-${line}`, ...described };
            setEditableExportLog((prev) => [...prev, entry]);
            // The headline is the last thing that happened, so a long step
            // does not look like a stall.
            setEditableExportProgress(entry.text);
          },
        });

        for (const result of results) {
          if (result.status !== "ready" || !result.backgroundImageUrl) {
            // Never fall back to the original page as a background: it still
            // holds every card and icon, and the rebuilt elements would draw
            // each of them a second time.
            console.error(`Could not rebuild ${result.slideId}`, result.error);
            continue;
          }

          const persisted = await persistImageUrlIfNeeded(result.backgroundImageUrl);
          rebuilt.set(result.slideId, {
            textBlocks: result.textBlocks,
            elements: result.elements,
            backgroundImageUrl: persisted,
          });

          const { versionId } = getSlideVersionMeta(result.slideId);
          if (!versionId) continue;
          pushImageVersion(
            result.slideId,
            persisted,
            "derived_textless",
            tr("导出可编辑 PPTX 时生成", "Derived for editable PPTX export"),
            { setCurrent: false, sourceVersionId: versionId },
          );
          setRenderLayers((prev) => ({
            ...prev,
            [result.slideId]: {
              ...(prev[result.slideId] || {}),
              [versionId]: {
                backgroundImageUrl: persisted,
                textBlocks: result.textBlocks,
                elements: result.elements,
                status: "ready",
              },
            },
          }));
        }
      }

      setEditableExportProgress(tr("正在写入文件…", "Writing the file..."));
      const pages = activeSlides.map((slide) => {
        const own = rebuilt.get(slide.id);
        // A page that could not be rebuilt goes out as the image it already
        // is, which is what this button produced before.
        if (!own) return buildEditableExportPage(slide);

        return {
          ...toRenderablePage(slide),
          backgroundImageUrl: own.backgroundImageUrl,
          textBlocks: own.textBlocks,
          elements: mergeTextBlocksIntoElements(own.textBlocks, own.elements),
          status: "completed",
        };
      });

      await pptService.exportPptx(pages, buildCurrentSlideImagesMap(), `presentation-editable-${Date.now()}`);
    } catch (e) {
      console.error("Editable export failed", e);
      const reason = e instanceof Error ? e.message : String(e);
      setEditableExportLog((prev) => [
        ...prev,
        {
          id: `${runId}-fatal`,
          level: "error" as const,
          text: tr(`导出失败：${reason}`, `Export failed: ${reason}`),
        },
      ]);
    } finally {
      setEditableExportProgress("");
      exporter.setIsExporting(null);
    }
  };


  // My works: no switching while a deck is being generated; the deck's title and
  // first slide name and preview the work.
  useReportBusy(isGenerating(creationStep) || isGeneratingImage);
  const firstSlide = localSlides[0];
  const firstSlideImage = firstSlide ? generatedImages[firstSlide.id] : undefined;
  useEffect(() => {
    if (!work || !isPersistenceHydrated) return;
    // Only an outline or slides count: words still being typed are not a work yet.
    if (localSlides.length === 0) return;
    const nameHint = nameFromText(firstSlide?.title || ideaInput || outlineInput);
    work.report({ touched: true, ...(nameHint ? { nameHint } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPersistenceHydrated, localSlides.length, firstSlide?.title, ideaInput, outlineInput]);
  useEffect(() => {
    if (!work || !firstSlideImage) return;
    let cancelled = false;
    void makeThumbnail(firstSlideImage).then((thumb) => {
      if (thumb && !cancelled) work.report({ thumb });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSlideImage]);

  const createOutlineSlide = (displayIndex: number): SlideData => ({
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: tr(`第 ${displayIndex + 1} 页`, `Slide ${displayIndex + 1}`),
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
    setSlideMaterials((prev) => {
      const next = { ...prev };
      delete next[slideId];
      return next;
    });
  };

  // Before a deck: what it is about is said in the chat; the style comes at the outline.
  // What the canvas is doing, for the chat's steps (only when it changes).
  const drawnCount = localSlides.filter((slide) => generatedImages[slide.id]).length;
  const activityPhase: DeckActivity["phase"] =
    creationStep === "input"
      ? outlineDraft.length > 0 ? "outlining" : "reading"
      : creationStep === "outline"
        ? "review"
        : creationStep === "generating_images"
          ? "drawing"
          : creationStep === "done"
            ? "done"
            : creationStep === "generating_content"
              ? "working"
              : "idle";
  const activityTitles = (creationStep === "input" ? outlineDraft.map((page) => page.title) : localSlides.map((slide) => slide.title)).join("\u0000");
  useEffect(() => {
    onActivityChange?.({
      phase: activityPhase,
      titles: activityTitles ? activityTitles.split("\u0000") : [],
      drawn: drawnCount,
      total: localSlides.length,
    });
  }, [activityPhase, activityTitles, drawnCount, localSlides.length, onActivityChange]);

  const [pickingStyle, setPickingStyle] = useState(false);
  useEffect(() => {
    if (!command) return;
    if (command.kind === "generate" && creationStep === "outline") void handleGenerateFullPpt();
    if (command.kind === "pick-style") setPickingStyle(true);
    onCommandHandled?.();
    // One command at a time, with the handlers of the render that has it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id]);
  const stylePicker = (
    <StylePickerDialog
      open={pickingStyle}
      onOpenChange={setPickingStyle}
      templateLibrary={templateLibrary}
      tr={tr}
      topic={localSlides.map((slide) => slide.title).join(" ")}
    />
  );

  // The outline being written by the AI pen, until it has written all of it.
  if (penWriting && (creationStep === "input" || creationStep === "outline")) {
    const final = creationStep === "outline";
    return (
      <OutlineWriting
        pages={final ? localSlides.map((slide) => ({ title: slide.title, content: slide.content || [] })) : outlineDraft}
        final={final}
        onDone={() => setPenWriting(false)}
        tr={tr}
      />
    );
  }
  if (activeSlides.length === 0 && (creationStep === 'idle' || creationStep === 'input' || creationStep === 'done')) {
    return (
      <PptStart progress={progress} tr={tr} templateLibrary={templateLibrary} />
    );
  }

  // Render Outline Review
  if (creationStep === 'outline') {
    return (
      <>
      <OutlineReview
        slides={localSlides}
        setSlides={setLocalSlides}
        materials={materials}
        tr={tr}
        onAddSlide={handleAddOutlineSlide}
        onDeleteSlide={handleDeleteOutlineSlide}
        onAddSlideToChat={handleAddSlideToChat}
      />
      {stylePicker}
      </>
    );
  }

  // Render Progress
  if (isGenerating(creationStep)) {
    return <GenerationProgress step={creationStep} progress={progress} tr={tr} slides={activeSlides} images={generatedImages} />;
  }

  // Regular View (creationStep === 'done' or manually provided data)
  return (
    <>
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
      exporter={exporter}
      editable={{
        exporter: editableExport,
        slides: activeSlides
          .map((slide) => ({ id: slide.id, title: slide.title || "", imageUrl: getSlideImageUrl(slide.id) || "" }))
          .filter((slide) => slide.imageUrl),
      }}
      materials={materials}
      inputs={inputs}
      slideshow={slideshow}
      actions={{
        addSlideToChat: handleAddSlideToChat,
        editOnBoard: canOpenCanvas() && work ? (slide) => void editSlideOnBoard(slide) : undefined,
        downloadPpt: () => void handleDownloadPpt(),
        downloadPdf: () => void handleDownloadPdf(),
        downloadEditablePpt: () =>
          EDITABLE_EXPORT_VIA_AGENT ? editableExport.setDialogOpen(true) : void handleDownloadEditablePpt(),
        generateAiImage: () => void handleGenerateAiImage(),
        retryFailedBeautify: () => void handleRetryFailedBeautify(),
        dismissExportLog: () => setEditableExportLog([]),
      }}
      status={{
        currentSlideFailure,
        failedBeautifyCount,
        isApplyingEdits,
        isGeneratingImage,
        exportProgress: editableExportProgress,
        exportLog: editableExportLog,
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
    </>
  );
}
