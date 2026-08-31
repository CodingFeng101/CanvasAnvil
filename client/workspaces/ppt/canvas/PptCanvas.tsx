import React, { useState, useEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import { motion } from "motion/react";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import { errorText, isRetryableBeautifyError } from "./lib/errors";
import { runInParallel, sleep } from "./lib/concurrency";
import { parseJsonLoose } from "./lib/parse-json";
import { extractPdfPagesAsImages, isPdfFile } from "./lib/deck-source";
import { getSlideshowDimensions } from "./lib/slideshow-size";
import { clampTextBlockRect, withTextBlocks } from "./lib/render-layers";
import { GenerationProgress } from "./views/GenerationProgress";
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
import { useSlideshow } from "./hooks/use-slideshow";
import { buildBeautifyInstruction } from "./lib/beautify-instruction";
import { generateChatMessage } from '@/ai/client';
import {
  pptService,
  PptPage,
  type PptTextBlock,
  type SlideEditRoutingItem,
  PPT_REFERENCE_SLIDE_HEIGHT,
  PPT_REFERENCE_SLIDE_WIDTH,
} from '@/workspaces/ppt/lib/ppt-service';
import { PPT_STATE_KEY, PPT_WORKSPACE_STORAGE_KEY, pptStore } from "@/workspaces/ppt/storage";
import {
  Loader2,
  Plus,
  Image as ImageIcon,
  MessageSquarePlus,
  Upload,
  Presentation,
  Sparkles,
  FileText,
  Download,
  Lightbulb,
  X,
  ArrowLeft,
  ArrowRight,
  Eye,
  Trash2,
  Maximize2,
  Minimize2,
  RefreshCcw,
} from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/shared/ui/context-menu";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { useUiLanguage } from "@/shared/i18n";
import { useFileProcessor as useFlowFileProcessor } from "@/shared/files/use-file-processor";
import { canvasAnvilToEditorSlide, editorSlideToExportPayload, PptEditorBridge, PptReviewSidebar } from "@/features/ppt-editor";
import {
  BEAUTIFY_CONCURRENCY,
  BEAUTIFY_RETRY_BASE_DELAY_MS,
  BEAUTIFY_RETRY_MAX_ATTEMPTS,
  EDITABLE_EXPORT_CONCURRENCY,
  EDITABLE_REVIEW_CONCURRENCY,
  MODEL_CONCURRENCY,
  REVIEW_BOX_COLOR,
  REVIEW_BOX_SELECTED_COLOR,
} from "@/workspaces/ppt/canvas/constants";
import {
  deriveTextElementsFromBlocks,
  hasRenderableTextBlocks,
  localizeLayoutHint,
  mergeTextBlocksIntoElements,
  normalizeLocalizedSlideTitle,
  parseSlideNo,
  stripLeadingBullet,
} from "@/workspaces/ppt/canvas/slide-content";
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
} from "@/workspaces/ppt/canvas/persisted-state";
import type {
  CreationMode,
  EditableExtractionStatus,
  PptData,
  ReferenceFile,
  ReferenceVisualAsset,
  ReviewDraftRect,
  ReviewResizeHandle,
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
        return migrateLegacyTextlessVersions(parsed as any);
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
  const { templates, templateImage, selectedTemplateId, restoreSelection: restoreTemplateSelection } =
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
  const [draggingTextBlockId, setDraggingTextBlockId] = useState<string | null>(null);
  const [resizingTextBlockId, setResizingTextBlockId] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isExporting, setIsExporting] = useState<null | "pptx" | "pptx_editable" | "pdf">(null);
  
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
  const [creationMode, setCreationMode] = useState<CreationMode>(() => {
    const v = initialPptState?.creationMode;
    return v === "idea" || v === "outline" || v === "beautify" || v === "image_transform" ? v : "idea";
  });
  useEffect(() => {
    onCreationModeChange?.(creationMode);
  }, [creationMode, onCreationModeChange]);
  const [ideaInput, setIdeaInput] = useState(() => (typeof initialPptState?.ideaInput === "string" ? initialPptState.ideaInput : ""));
  const [outlineInput, setOutlineInput] = useState(() => (typeof initialPptState?.outlineInput === "string" ? initialPptState.outlineInput : ""));
  const [beautifyRequirement, setBeautifyRequirement] = useState(() => (typeof initialPptState?.beautifyRequirement === "string" ? initialPptState.beautifyRequirement : ""));
  const [beautifyUseTemplate, setBeautifyUseTemplate] = useState(() => Boolean(initialPptState?.beautifyUseTemplate));
  const [beautifyFile, setBeautifyFile] = useState<File | null>(null);
  const [imageTransformFile, setImageTransformFile] = useState<File | null>(null);
  const [beautifyFailures, setBeautifyFailures] = useState<Record<string, string>>(() => {
    const v = initialPptState?.beautifyFailures;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string" && val.trim()) out[k] = val;
    }
    return out;
  });
  const [imageTransformFailures, setImageTransformFailures] = useState<Record<string, string>>(() => {
    const v = initialPptState?.imageTransformFailures;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string" && val.trim()) out[k] = val;
    }
    return out;
  });
  const {
    files: referenceUploadFiles,
    pdfData: referencePdfData,
    visualAssets: referenceVisualAssetsRaw,
    handleFileChange: handleReferenceFileChange,
    setFiles: setReferenceUploadFiles
  } = useFlowFileProcessor("ppt");
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false);
  const [referencePreviewFile, setReferencePreviewFile] = useState<ReferenceFile | null>(null);
  const materials = useSlideMaterials({
    localSlides,
    setLocalSlides,
    uiLang,
    initialMaterials: normalizePersistedSlideMaterials(initialPptState?.slideMaterials),
  });
  const { slideMaterials, setSlideMaterials } = materials;
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const beautifyFileInputRef = useRef<HTMLInputElement | null>(null);
  const imageTransformFileInputRef = useRef<HTMLInputElement | null>(null);
  const assetCaptionCacheRef = useRef<Record<string, string>>({});
  const pptImagePersistenceRunningRef = useRef(false);
  const pptImagePersistenceRetryRef = useRef(false);
  const [isPersistenceHydrated, setIsPersistenceHydrated] = useState(false);
  const latestWorkspaceUpdatedAtRef = useRef(
    typeof initialPptState?.updatedAt === "number" ? initialPptState.updatedAt : 0
  );
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const textBlockDragRef = useRef<null | {
    slideId: string;
    versionId: string;
    blockId: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    blockW: number;
    blockH: number;
    canvasWidth: number;
    canvasHeight: number;
  }>(null);
  const textBlockResizeRef = useRef<null | {
    slideId: string;
    versionId: string;
    blockId: string;
    startClientX: number;
    startClientY: number;
    startW: number;
    startH: number;
    startX: number;
    startY: number;
    canvasWidth: number;
    canvasHeight: number;
    handle?: ReviewResizeHandle;
  }>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportReviewMode, setExportReviewMode] = useState(false);
  const [editableExtractionStatusBySlideId, setEditableExtractionStatusBySlideId] = useState<Record<string, EditableExtractionStatus>>({});
  const [reviewPreparingSlideIds, setReviewPreparingSlideIds] = useState<string[]>([]);
  const [selectedReviewTextBlockId, setSelectedReviewTextBlockId] = useState<string | null>(null);
  const [reviewDrawMode, setReviewDrawMode] = useState(false);
  const [reviewDraftRect, setReviewDraftRect] = useState<ReviewDraftRect | null>(null);
  const [reviewPanelWidth, setReviewPanelWidth] = useState(420);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const reviewDrawRef = useRef<null | {
    slideId: string;
    rect: DOMRect;
    startX: number;
    startY: number;
  }>(null);
  const reviewPanelResizeRef = useRef<null | { startClientX: number; startWidth: number }>(null);
  const reviewLayerPromiseRef = useRef<Record<string, Promise<{ versionId: string; imageUrl: string; layer: SlideRenderLayer } | null> | undefined>>({});
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
  const [previewCanvasSize, setPreviewCanvasSize] = useState({ width: 1100, height: 619 });
  useEffect(() => {
    onExportReviewModeChange?.(exportReviewMode);
  }, [exportReviewMode, onExportReviewModeChange]);

  const isParsingReferenceFiles = Array.from(referencePdfData.values()).some((x) => x.isExtracting);
  const referenceFiles: ReferenceFile[] = referenceUploadFiles
    .map((file) => {
      const meta = referencePdfData.get(file);
      if (!meta || meta.isExtracting || !meta.text) return null;
      return {
        id: `ref-${file.name}-${file.lastModified}-${file.size}`,
        filename: file.name,
        content: String(meta.text || "").slice(0, 150000),
        charCount: meta.charCount || 0,
      } as ReferenceFile;
    })
    .filter((x): x is ReferenceFile => !!x);

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
  }, [restoreTemplateSelection, setSlideMaterials]);

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
      beautifyRequirement,
      beautifyUseTemplate,
      beautifyFailures,
      imageTransformFailures,
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
          beautifyRequirement,
          beautifyUseTemplate,
          beautifyFailures,
          imageTransformFailures,
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
    beautifyRequirement,
    beautifyUseTemplate,
    beautifyFailures,
    imageTransformFailures,
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
  const getEditableExtractionStatus = (slideId: string): EditableExtractionStatus =>
    editableExtractionStatusBySlideId[slideId] || "idle";
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
  const isReviewPreparing = (slideId?: string | null) => !!slideId && reviewPreparingSlideIds.includes(slideId);
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
    if (reviewLayerPromiseRef.current[slide.id]) {
      return await reviewLayerPromiseRef.current[slide.id];
    }
    const task = (async () => {
      setReviewPreparingSlideIds((current) => (current.includes(slide.id) ? current : [...current, slide.id]));
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
        setReviewPreparingSlideIds((current) => current.filter((id) => id !== slide.id));
        delete reviewLayerPromiseRef.current[slide.id];
      }
    })();
    reviewLayerPromiseRef.current[slide.id] = task;
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
    setSelectedReviewTextBlockId((current) => (current === blockId ? null : current));
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

  useEffect(() => {
    if (!draggingTextBlockId && !resizingTextBlockId) return;
    const handlePointerMove = (event: PointerEvent) => {
      const drag = textBlockDragRef.current;
      if (drag) {
        const dx = (event.clientX - drag.startClientX) / Math.max(drag.canvasWidth, 1);
        const dy = (event.clientY - drag.startClientY) / Math.max(drag.canvasHeight, 1);
        updateSlideTextBlockPosition(
          drag.slideId,
          drag.blockId,
          drag.startX + dx,
          drag.startY + dy,
          drag.versionId,
        );
      }
      const resize = textBlockResizeRef.current;
      if (resize) {
        const dw = (event.clientX - resize.startClientX) / Math.max(resize.canvasWidth, 1);
        const dh = (event.clientY - resize.startClientY) / Math.max(resize.canvasHeight, 1);
        if (!resize.handle || resize.handle === "se") {
          updateSlideTextBlockSize(
            resize.slideId,
            resize.blockId,
            resize.startW + dw,
            resize.startH + dh,
            resize.versionId,
          );
        } else {
          const minW = 0.05;
          const minH = 0.04;
          let nextX = resize.startX;
          let nextY = resize.startY;
          let nextW = resize.startW;
          let nextH = resize.startH;
          if (resize.handle.includes("e")) nextW = resize.startW + dw;
          if (resize.handle.includes("s")) nextH = resize.startH + dh;
          if (resize.handle.includes("w")) {
            nextX = resize.startX + dw;
            nextW = resize.startW - dw;
          }
          if (resize.handle.includes("n")) {
            nextY = resize.startY + dh;
            nextH = resize.startH - dh;
          }
          if (nextW < minW) {
            if (resize.handle.includes("w")) nextX -= minW - nextW;
            nextW = minW;
          }
          if (nextH < minH) {
            if (resize.handle.includes("n")) nextY -= minH - nextH;
            nextH = minH;
          }
          updateSlideTextBlockRect(
            resize.slideId,
            resize.blockId,
            { x: nextX, y: nextY, w: nextW, h: nextH },
            resize.versionId,
          );
        }
      }
    };
    const stopDrag = () => {
      textBlockDragRef.current = null;
      textBlockResizeRef.current = null;
      setDraggingTextBlockId(null);
      setResizingTextBlockId(null);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  // Registered for the duration of one drag. The updaters it calls write
  // through setRenderLayers's functional form, so they see current state
  // despite being captured at drag start; depending on them would tear the
  // listeners down and rebuild them on every pointermove.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingTextBlockId, resizingTextBlockId]);
  useEffect(() => {
    const activeSlide = localSlides[currentSlideIndex];
    if (!exportReviewMode) {
      setSelectedReviewTextBlockId(null);
      setReviewDrawMode(false);
      setReviewDraftRect(null);
      return;
    }
    const layer = activeSlide ? getSlideRenderLayer(activeSlide.id) : undefined;
    const blocks = layer?.textBlocks || [];
    if (blocks.length === 0) {
      setSelectedReviewTextBlockId(null);
      return;
    }
    if (!selectedReviewTextBlockId || !blocks.some((block) => block.id === selectedReviewTextBlockId)) {
      setSelectedReviewTextBlockId(blocks[0].id);
    }
  }, [exportReviewMode, localSlides, currentSlideIndex, renderLayers, selectedReviewTextBlockId, getSlideRenderLayer]);
  useEffect(() => {
    if (!reviewDrawRef.current) return;
    const handlePointerMove = (event: PointerEvent) => {
      const draft = reviewDrawRef.current;
      if (!draft) return;
      const nextX = Math.max(0, Math.min(1, (event.clientX - draft.rect.left) / Math.max(draft.rect.width, 1)));
      const nextY = Math.max(0, Math.min(1, (event.clientY - draft.rect.top) / Math.max(draft.rect.height, 1)));
      setReviewDraftRect({
        startX: draft.startX,
        startY: draft.startY,
        currentX: nextX,
        currentY: nextY,
      });
    };
    const stopPointer = () => {
      const draft = reviewDrawRef.current;
      reviewDrawRef.current = null;
      if (!draft || !reviewDraftRect) {
        setReviewDraftRect(null);
        return;
      }
      const minX = Math.min(reviewDraftRect.startX, reviewDraftRect.currentX);
      const minY = Math.min(reviewDraftRect.startY, reviewDraftRect.currentY);
      const width = Math.abs(reviewDraftRect.currentX - reviewDraftRect.startX);
      const height = Math.abs(reviewDraftRect.currentY - reviewDraftRect.startY);
      setReviewDraftRect(null);
      if (width < 0.025 || height < 0.025) return;
      const block = createDefaultTextBlock(draft.slideId, minX, minY, width, height);
      appendSlideTextBlock(draft.slideId, block);
      setSelectedReviewTextBlockId(block.id);
      setReviewDrawMode(false);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointer);
    window.addEventListener("pointercancel", stopPointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointer);
      window.removeEventListener("pointercancel", stopPointer);
    };
  // Same as the text-block drag above: rebuilt per draw gesture, not per frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewDraftRect]);
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const draft = reviewPanelResizeRef.current;
      if (!draft) return;
      const delta = draft.startClientX - event.clientX;
      setReviewPanelWidth(Math.max(320, Math.min(720, draft.startWidth + delta)));
    };
    const stopPointer = () => {
      reviewPanelResizeRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopPointer);
    window.addEventListener("pointercancel", stopPointer);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopPointer);
      window.removeEventListener("pointercancel", stopPointer);
    };
  }, []);
  const handleReviewCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>, slide: SlideData) => {
    if (!reviewDrawMode) return;
    const rect = previewCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(rect.width, 1)));
    const startY = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(rect.height, 1)));
    reviewDrawRef.current = {
      slideId: slide.id,
      rect,
      startX,
      startY,
    };
    setReviewDraftRect({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  };

  const renderScaledSlideScene = (
    slide: SlideData,
    _editable = false,
    outerWidth = PPT_REFERENCE_SLIDE_WIDTH,
    outerHeight = PPT_REFERENCE_SLIDE_HEIGHT,
  ) => {
    const backgroundUrl = getSlideBackgroundUrl(slide.id);
    if (!backgroundUrl) return null;

    return (
      <PptEditorBridge
        slide={canvasAnvilToEditorSlide(slide, {
          renderLayer: getSlideRenderLayer(slide.id),
          backgroundImageUrl: backgroundUrl,
        })}
        canvasWidth={outerWidth}
        canvasHeight={outerHeight}
        showElements={false}
      />
    );
  };
  const renderReviewSelectionOverlay = (slide: SlideData) => {
    const layer = getSlideRenderLayer(slide.id);
    if (!layer) return null;
    const resizeHandles: Array<{ key: ReviewResizeHandle; className: string; cursor: string }> = [
      { key: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
      { key: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
      { key: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
      { key: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
      { key: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
      { key: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
      { key: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
      { key: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
    ];

    return (
      <div
        className="absolute inset-0 z-20"
        style={{ cursor: reviewDrawMode ? "crosshair" : "default" }}
        onPointerDown={(event) => handleReviewCanvasPointerDown(event, slide)}
      >
        {layer.textBlocks.map((block, index) => {
          const isSelected = selectedReviewTextBlockId === block.id;
          const borderColor = isSelected ? REVIEW_BOX_SELECTED_COLOR : REVIEW_BOX_COLOR;
          const fillColor = isSelected ? "rgba(245,158,11,0.18)" : "rgba(34,211,238,0.12)";
          return (
            <div
              key={`review-box-${block.id}`}
              className="absolute"
              style={{
                left: `${block.x * 100}%`,
                top: `${block.y * 100}%`,
                width: `${block.w * 100}%`,
                height: `${block.h * 100}%`,
                border: `2px solid ${borderColor}`,
                background: fillColor,
                boxShadow: isSelected ? `0 0 0 2px rgba(255,255,255,0.25), 0 0 18px ${borderColor}` : "none",
                pointerEvents: "auto",
                cursor: reviewDrawMode ? "crosshair" : "move",
              }}
              onPointerDown={(event) => {
                if (reviewDrawMode) return;
                event.preventDefault();
                event.stopPropagation();
                const rect = previewCanvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const { versionId } = getSlideVersionMeta(slide.id);
                if (!versionId) return;
                setSelectedReviewTextBlockId(block.id);
                textBlockDragRef.current = {
                  slideId: slide.id,
                  versionId,
                  blockId: block.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  startX: block.x,
                  startY: block.y,
                  blockW: block.w,
                  blockH: block.h,
                  canvasWidth: rect.width,
                  canvasHeight: rect.height,
                };
                setDraggingTextBlockId(block.id);
              }}
            >
              <div className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                {`#${index + 1}`}
              </div>
              {isSelected
                ? resizeHandles.map((handle) => (
                    <button
                      key={handle.key}
                      type="button"
                      className={`absolute z-20 rounded-full border-2 border-white shadow-sm ${handle.className}`}
                      style={{
                        width: "12px",
                        height: "12px",
                        background: borderColor,
                        cursor: handle.cursor,
                      }}
                      title={tr("缩放文字框", "Resize text box")}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        const rect = previewCanvasRef.current?.getBoundingClientRect();
                        if (!rect) return;
                        const { versionId } = getSlideVersionMeta(slide.id);
                        if (!versionId) return;
                        textBlockResizeRef.current = {
                          slideId: slide.id,
                          versionId,
                          blockId: block.id,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                          startW: block.w,
                          startH: block.h,
                          startX: block.x,
                          startY: block.y,
                          canvasWidth: rect.width,
                          canvasHeight: rect.height,
                          handle: handle.key,
                        };
                        setResizingTextBlockId(block.id);
                      }}
                    />
                  ))
                : null}
            </div>
          );
        })}
        {reviewDraftRect ? (
          <div
            className="absolute border-2 border-dashed"
            style={{
              left: `${Math.min(reviewDraftRect.startX, reviewDraftRect.currentX) * 100}%`,
              top: `${Math.min(reviewDraftRect.startY, reviewDraftRect.currentY) * 100}%`,
              width: `${Math.abs(reviewDraftRect.currentX - reviewDraftRect.startX) * 100}%`,
              height: `${Math.abs(reviewDraftRect.currentY - reviewDraftRect.startY) * 100}%`,
              borderColor: REVIEW_BOX_SELECTED_COLOR,
              background: "rgba(245,158,11,0.14)",
              pointerEvents: "none",
            }}
          />
        ) : null}
      </div>
    );
  };

  const activeSlides = localSlides;

  const slideshow = useSlideshow(activeSlides.length);
  const isAnyEditableExtractionRunning = activeSlides.some((slide) => getEditableExtractionStatus(slide.id) === "extracting");
  const allReviewLayersPrepared =
    activeSlides.length > 0 &&
    activeSlides.every((slide) => {
      const layer = getSlideRenderLayer(slide.id);
      return layer?.status === "ready" || layer?.status === "failed";
    });
  const allEditableExtractionsDone =
    activeSlides.length > 0 && activeSlides.every((slide) => getEditableExtractionStatus(slide.id) === "done");
  const currentSlide = activeSlides[currentSlideIndex];
  const currentSlideImage = currentSlide ? getSlideBackgroundUrl(currentSlide.id) : "";
  const currentReviewLayer = currentSlide ? getSlideRenderLayer(currentSlide.id) : undefined;
  const extractionDoneCount = activeSlides.filter((slide) => getEditableExtractionStatus(slide.id) === "done").length;
  const extractionFailedCount = activeSlides.filter((slide) => getEditableExtractionStatus(slide.id) === "failed").length;
  const preparedReviewLayerCount = activeSlides.filter((slide) => {
    const layer = getSlideRenderLayer(slide.id);
    return layer?.status === "ready" || layer?.status === "failed";
  }).length;
  const reviewPhase: "boxes" | "text" = isAnyEditableExtractionRunning ? "text" : "boxes";
  const renderReviewSidebarBridge = () => (
    <PptReviewSidebar
      panelWidth={reviewPanelWidth}
      slideNumber={currentSlide ? currentSlideIndex + 1 : null}
      textBlocks={currentReviewLayer?.textBlocks || []}
      selectedTextBlockId={selectedReviewTextBlockId}
      isScanning={!!currentSlide && isReviewPreparing(currentSlide.id) && !hasRenderableTextBlocks(currentReviewLayer)}
      isExtracting={isAnyEditableExtractionRunning}
      canExtract={allReviewLayersPrepared}
      canStartEditing={allEditableExtractionsDone}
      reviewPhase={reviewPhase}
      extractionSummary={tr(
        isAnyEditableExtractionRunning
          ? `文本提取中 ${extractionDoneCount}/${activeSlides.length} 页`
          : allReviewLayersPrepared
          ? `文本提取完成 ${extractionDoneCount}/${activeSlides.length} 页${extractionFailedCount > 0 ? `，失败 ${extractionFailedCount} 页` : ""}`
          : `文本框准备中 ${preparedReviewLayerCount}/${activeSlides.length} 页`,
        isAnyEditableExtractionRunning
          ? `${extractionDoneCount}/${activeSlides.length} slides text extracted`
          : allReviewLayersPrepared
          ? `${extractionDoneCount}/${activeSlides.length} slides text extracted${extractionFailedCount > 0 ? `, ${extractionFailedCount} failed` : ""}`
          : `${preparedReviewLayerCount}/${activeSlides.length} text-box layers prepared`
      )}
      reviewDrawMode={reviewDrawMode}
      tr={tr}
      onPanelResizeStart={(event) => {
        event.preventDefault();
        reviewPanelResizeRef.current = { startClientX: event.clientX, startWidth: reviewPanelWidth };
      }}
      onExtract={() => void handleExtractEditableText()}
      onStartEditing={() => void handleDownloadEditablePpt()}
      onToggleDrawMode={() => setReviewDrawMode((current) => !current)}
      onSelectBlock={setSelectedReviewTextBlockId}
      onDeleteBlock={(blockId) => {
        if (!currentSlide) return;
        deleteSlideTextBlock(currentSlide.id, blockId);
      }}
      onChangeText={(blockId, nextText) => {
        if (!currentSlide) return;
        updateSlideTextBlock(currentSlide.id, blockId, nextText);
      }}
      onChangeRectField={(blockId, field, value) => {
        if (!currentSlide) return;
        const nextValue = Number.parseFloat(value);
        if (!Number.isFinite(nextValue)) return;
        updateSlideTextBlockRect(
          currentSlide.id,
          blockId,
          field === "x"
            ? { x: nextValue }
            : field === "y"
              ? { y: nextValue }
              : field === "w"
                ? { w: nextValue }
                : { h: nextValue }
        );
      }}
    />
  );
  const failedBeautifyCount = activeSlides.reduce((n, s) => n + (beautifyFailures[s.id] ? 1 : 0), 0);
  const failedImageTransformCount = activeSlides.reduce((n, s) => n + (imageTransformFailures[s.id] ? 1 : 0), 0);
  const currentSlideFailure = currentSlide
    ? (creationMode === "image_transform" ? imageTransformFailures[currentSlide.id] : beautifyFailures[currentSlide.id])
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





  useEffect(() => {
    if (!exportMenuOpen || typeof document === "undefined") return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (exportMenuRef.current?.contains(target)) return;
      setExportMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

  useEffect(() => {
    if (isExporting) setExportMenuOpen(false);
  }, [isExporting]);

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
    setEditableExtractionStatusBySlideId((prev) => ({ ...prev, [slide.id]: "extracting" }));
    setReviewPreparingSlideIds((current) => (current.includes(slide.id) ? current : [...current, slide.id]));
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
        setEditableExtractionStatusBySlideId((prev) => ({ ...prev, [slide.id]: "failed" }));
        return;
      }
      await upsertTextlessBackgroundVersion(slide.id, versionId, nextLayer.backgroundImageUrl || imageUrl);
      setEditableExtractionStatusBySlideId((prev) => ({ ...prev, [slide.id]: "done" }));
    } catch (error) {
      console.error("Failed to extract editable review slide", error);
      setEditableExtractionStatusBySlideId((prev) => ({ ...prev, [slide.id]: "failed" }));
    } finally {
      setReviewPreparingSlideIds((current) => current.filter((id) => id !== slide.id));
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

  const handleReferenceFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      if (files.length === 0) return;
      await handleReferenceFileChange([...referenceUploadFiles, ...files]);
  };

  const openReferencePreview = (file: ReferenceFile) => {
      setReferencePreviewFile(file);
      setReferencePreviewOpen(true);
  };



  const buildReferenceVisualAssetsWithCaptions = async (): Promise<ReferenceVisualAsset[]> => {
    const raw = (referenceVisualAssetsRaw || []).filter((x: any) => x && typeof x.dataUrl === "string" && x.dataUrl.startsWith("data:image"));
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


  const handleBeautifyFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setBeautifyFile(f);
  };

  const handleImageTransformFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setImageTransformFile(f);
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
    const file = imageTransformFile;
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
    const file = beautifyFile;
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

      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
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
      .filter((id) => !!beautifyFailures[id]);
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
      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
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
          referenceFiles,
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
          referenceFiles,
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
    if (isExporting) return;
    setIsExporting("pptx");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPptx(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        setIsExporting(null);
    }
  };

  const handleDownloadPdf = async () => {
    if (isExporting) return;
    setIsExporting("pdf");
    try {
        const pages: PptPage[] = activeSlides.map((s) => toRenderablePage(s));
        const images = buildCurrentSlideImagesMap();
        await pptService.exportPdf(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        setIsExporting(null);
    }
  };

  const startEditableExportReview = async () => {
    if (activeSlides.length === 0) return;
    await ensurePrimaryImageVersions(activeSlides);
    setExportReviewMode(true);
    setEditableExtractionStatusBySlideId((prev) => {
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
    if (!exportReviewMode) {
      await startEditableExportReview();
      return;
    }
    if (!allEditableExtractionsDone) return;
    if (isExporting) return;
    setIsExporting("pptx_editable");
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
      setExportReviewMode(false);
      setReviewDrawMode(false);
      setReviewDraftRect(null);
      setSelectedReviewTextBlockId(null);
    } catch (e) {
      console.error("Editable export failed", e);
      alert(tr("导出可编辑 PPTX 失败", "Failed to export editable PPTX"));
    } finally {
      setIsExporting(null);
    }
  };

  const handleExtractEditableText = async (targetSlideId?: string) => {
    if (!exportReviewMode || isAnyEditableExtractionRunning) return;
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
    setBeautifyFile(null);
    setImageTransformFile(null);
    setExportReviewMode(false);
    setEditableExtractionStatusBySlideId({});
    setSelectedReviewTextBlockId(null);
    setReviewDrawMode(false);
    setReviewDraftRect(null);
    setBeautifyFailures({});
    setImageTransformFailures({});
    setReferenceUploadFiles([]);
    setSlideMaterials({});
    materials.picker.close();
    setReviewPreparingSlideIds([]);
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
      const tabs = [
        { id: 'idea', label: tr('想法', 'Idea') },
        { id: 'outline', label: tr('大纲', 'Outline') },
        { id: 'beautify', label: tr('PPT美化', 'Beautify') },
        { id: 'image_transform', label: tr('图片PPT转化', 'Image PPT Transform') },
      ];
      const modeCopy = (() => {
          if (creationMode === "outline") {
              return {
                  hint: tr("已有大纲？直接粘贴即可快速生成，AI 将自动结构化。", "Have an outline? Paste it and AI will structure it into slides."),
                  placeholder: tr(
                    "粘贴你的 PPT 大纲，例如：\n第一部分：AI 起源\n- 1950 年代\n- 达特茅斯会议",
                    "Paste your PPT outline, for example:\nPart 1: Origins of AI\n- 1950s\n- Dartmouth workshop"
                  )
              };
          }
          if (creationMode === "beautify") {
              return {
                  hint: tr("上传 PDF，输入美化要求，然后并发渲染每一页。", "Upload PDF, enter requirements, then beautify each page in parallel."),
                  placeholder: tr(
                    "例如：整体更高级、留白更充足、标题层级更明显、配色更统一；保持原文案不变。",
                    "e.g. More premium look, more whitespace, stronger title hierarchy, unified palette, higher contrast; keep all original text unchanged."
                  )
              };
          }
          if (creationMode === "image_transform") {
              return {
                  hint: tr("上传 PDF，系统会将每一页导入为图片幻灯片；仅在导出可编辑 PPTX 时才进行文字识别。", "Upload a PDF and the system will import each page as an image slide; text recognition runs only for editable PPTX export."),
                  placeholder: "",
              };
          }
          return {
              hint: tr("输入你的想法，AI 将为你生成完整 PPT", "Describe your idea and AI will generate a full deck."),
              placeholder: tr("例如：生成一份关于 AI 发展史的演讲 PPT", "e.g. Create a presentation about the history of AI")
          };
      })();

      return (
        <div className="w-full h-full bg-zinc-50/50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-8">
              <div className="max-w-4xl mx-auto space-y-8 bg-white dark:bg-zinc-800 p-8 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700/50">

                <div className="space-y-8">
                    {/* Template Selection */}
                    {creationMode !== "image_transform" && !exportReviewMode ? (
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">1</span>
                            {tr("选择或上传参考模板", "Choose or upload a reference template")}
                        </label>
                        
                        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                            <label className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-zinc-800/50">
                                <div className="flex flex-col items-center text-zinc-400 group-hover:text-blue-500 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("添加模板", "Add template")}</span>
                                </div>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={templateLibrary.handleUploadInputChange} />
                            </label>
                            <button
                              type="button"
                              onClick={() => templateLibrary.generator.setOpen(true)}
                              title={tr("AI生成模板", "AI generate template")}
                              className="cursor-pointer border-2 border-dashed rounded-xl transition-all duration-200 overflow-hidden relative aspect-video flex flex-col items-center justify-center group border-zinc-200 dark:border-zinc-700 hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-zinc-800/50"
                            >
                                <div className="flex flex-col items-center text-zinc-400 group-hover:text-blue-500 transition-colors">
                                    <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-2 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-medium">{tr("AI生成模板", "AI generate")}</span>
                                </div>
                            </button>
                            {templates.map((t) => (
                                <div
                                    key={t.id}
                                    onClick={() => void templateLibrary.selectTemplate(t)}
                                    className={`cursor-pointer border rounded-xl overflow-hidden relative aspect-video group transition-all duration-200 bg-zinc-100 dark:bg-zinc-900 ${
                                        selectedTemplateId === t.id
                                            ? "border-blue-500 ring-2 ring-blue-500 shadow-md"
                                            : "border-zinc-200 dark:border-zinc-700 hover:ring-2 hover:ring-blue-500 hover:shadow-md"
                                    }`}
                                >
                                    <img src={t.previewSrc} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" alt={t.name} />
                                    {selectedTemplateId === t.id && (
                                        <div className="absolute top-2 left-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white shadow">
                                            {tr("已选择", "Selected")}
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            templateLibrary.deleteTemplate(t);
                                        }}
                                        className="absolute top-2 right-2 rounded-full bg-black/50 text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title={tr("删除模板", "Delete template")}
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                        <div className="text-white text-xs font-medium text-center">{t.name}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    ) : null}

                    {/* Mode Selection & Input */}
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">{creationMode === "image_transform" ? "1" : "2"}</span>
                            {tr("输入内容", "Input")}
                        </label>

                        {/* Segmented Control */}
                        <div className="bg-zinc-100 dark:bg-zinc-900/50 p-1 rounded-lg inline-flex w-full sm:w-auto">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setCreationMode(tab.id as any)}
                                    title={tab.label}
                                    className={`relative flex-1 sm:flex-none px-6 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
                                        creationMode === tab.id 
                                            ? "text-zinc-900 dark:text-zinc-100 shadow-sm" 
                                            : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                    }`}
                                >
                                    {creationMode === tab.id && (
                                        <motion.div
                                            layoutId="activeTab"
                                            className="absolute inset-0 bg-white dark:bg-zinc-700 rounded-md"
                                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        <input
                            ref={referenceFileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.zip,.tex,.tgz,.tar.gz,application/pdf,application/zip,application/x-zip-compressed,application/gzip,application/x-gzip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml,.toml"
                            className="hidden"
                            onChange={handleReferenceFileInputChange}
                        />

                        <motion.div
                            key={creationMode}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-3"
                        >
                            <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                                {creationMode === "beautify" ? <Sparkles className="w-4 h-4 text-blue-600" /> : creationMode === "image_transform" ? <Presentation className="w-4 h-4 text-blue-600" /> : <Lightbulb className="w-4 h-4 text-amber-500" />}
                                <span>{modeCopy.hint}</span>
                            </div>

                            {creationMode === "beautify" ? (
                              <div className="space-y-3">
                                <input
                                  ref={beautifyFileInputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={handleBeautifyFileInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                      {beautifyFile ? beautifyFile.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => beautifyFileInputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 cursor-pointer">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("启用模板美化（可选）", "Use template for beautify (optional)")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                      {tr("开启后将把当前模板传给美化模型；关闭则仅基于上传的幻灯片美化。", "When enabled, current template is passed to beautify model; otherwise beautify uses only uploaded slides.")}
                                    </div>
                                  </div>
                                  <input
                                    type="checkbox"
                                    checked={beautifyUseTemplate}
                                    onChange={(e) => setBeautifyUseTemplate(e.target.checked)}
                                    className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                  />
                                </label>

                                <textarea
                                  value={beautifyRequirement}
                                  onChange={(e) => setBeautifyRequirement(e.target.value)}
                                  className="w-full h-36 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none outline-none"
                                  placeholder={modeCopy.placeholder}
                                />
                              </div>
                            ) : creationMode === "image_transform" ? (
                              <div className="space-y-3">
                                <input
                                  ref={imageTransformFileInputRef}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={handleImageTransformFileInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("上传 PDF", "Upload PDF")}</div>
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                                      {imageTransformFile ? imageTransformFile.name : tr("未选择文件", "No file selected")}
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="shrink-0"
                                    onClick={() => imageTransformFileInputRef.current?.click()}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    {tr("选择文件", "Choose")}
                                  </Button>
                                </div>

                                <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400 leading-6">
                                  <div>{tr("处理结果：", "Output:")}</div>
                                  <div>{tr("系统会把 PDF 每一页导入为图片幻灯片。", "The system imports each PDF page as an image slide.")}</div>
                                  <div>{tr("如需可编辑文字，请在导出可编辑 PPTX 时再进行文字识别与回填。", "If you need editable text, recognition and text refill happen only during editable PPTX export.")}</div>
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="relative">
                                    <textarea 
                                        value={creationMode === "idea" ? ideaInput : outlineInput}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (creationMode === "idea") setIdeaInput(v);
                                            else setOutlineInput(v);
                                        }}
                                        className="w-full h-40 p-4 pb-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none outline-none"
                                        placeholder={modeCopy.placeholder}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => referenceFileInputRef.current?.click()}
                                        disabled={isParsingReferenceFiles}
                                        title={tr("上传参考文件", "Upload reference files")}
                                        className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors disabled:opacity-60"
                                    >
                                        {isParsingReferenceFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {tr("上传文件", "Upload files")}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {tr(
                                          "上传 PDF/Word/LaTeX/TXT作为参考资料（可选）；推荐 Word/LaTeX，图表素材更稳定。",
                                          "Upload PDF/Word/LaTeX/TXT as reference (optional); Word/LaTeX recommended for stable figures."
                                        )}
                                    </div>
                                    {referenceFiles.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setReferenceUploadFiles([])}
                                            title={tr("清空参考文件", "Clear reference files")}
                                            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                            disabled={isParsingReferenceFiles}
                                        >
                                            {tr("清空", "Clear")}
                                        </button>
                                    )}
                                </div>

                                {referenceFiles.length > 0 && (
                                    <div className="grid gap-2">
                                        {referenceFiles.map((f) => (
                                            <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/40 px-3 py-2">
                                                <button
                                                    type="button"
                                                    onClick={() => openReferencePreview(f)}
                                                    title={tr("预览文件", "Preview file")}
                                                    className="flex items-center gap-2 min-w-0 text-left"
                                                >
                                                    <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                                    <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">{f.filename}</span>
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">({f.charCount} chars)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                                    title={tr("移除文件", "Remove file")}
                                                    onClick={() => {
                                                      const nextFiles = referenceUploadFiles.filter((rf) => rf.name !== f.filename);
                                                      void handleReferenceFileChange(nextFiles);
                                                    }}
                                                >
                                                    {tr("移除", "Remove")}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                              </>
                            )}
                        </motion.div>
                    </div>

                    <Button 
                        onClick={creationMode === "beautify" ? handleStartBeautify : creationMode === "image_transform" ? handleStartImageTransform : creationMode === "idea" ? handleGenerateOutline : handleLoadOutline}
                        disabled={Boolean(progress.message) || (creationMode === "beautify" ? !beautifyFile : creationMode === "image_transform" ? !imageTransformFile || !isPdfFile(imageTransformFile) : isParsingReferenceFiles || (creationMode === "idea" ? !ideaInput.trim() : !outlineInput.trim()))}
                        className="w-full py-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {progress.message ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
                        {progress.message || (creationMode === "beautify" ? tr("开始渲染", "Start rendering") : creationMode === "image_transform" ? tr("开始转化", "Start transform") : creationMode === "idea" ? tr("开始生成大纲", "Generate outline") : tr("载入大纲", "Load outline"))}
                    </Button>
                </div>

                <Dialog open={referencePreviewOpen} onOpenChange={setReferencePreviewOpen}>
                    <DialogContent className="max-w-3xl">
                        <DialogHeader>
                            <DialogTitle>{referencePreviewFile?.filename || tr("参考文件", "Reference file")}</DialogTitle>
                        </DialogHeader>
                        <Textarea value={referencePreviewFile?.content || ""} readOnly className="min-h-[420px] font-mono text-xs" />
                    </DialogContent>
                </Dialog>

                <Dialog open={templateLibrary.generator.open} onOpenChange={templateLibrary.generator.setOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{tr("AI生成模板", "AI Template Generator")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {tr("生成的模板会自动加入模板列表，可随时删除。", "Generated templates will be added to the template list automatically and can be deleted anytime.")}
                            </div>
                            <Textarea
                              value={templateLibrary.generator.requirement}
                              onChange={(e) => templateLibrary.generator.setRequirement(e.target.value)}
                              placeholder={tr(
                                "例如：科技感、深色背景、蓝紫渐变、玻璃拟态、留白充足；不要出现任何文字。",
                                "e.g. Futuristic, dark background, blue-purple gradient, glassmorphism, generous whitespace; no text."
                              )}
                              className="min-h-[140px]"
                              disabled={templateLibrary.generator.isGenerating}
                            />
                            <div className="flex justify-end gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => templateLibrary.generator.setOpen(false)}
                                  disabled={templateLibrary.generator.isGenerating}
                                >
                                  {tr("取消", "Cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={templateLibrary.generator.generate}
                                  disabled={templateLibrary.generator.isGenerating || !templateLibrary.generator.requirement.trim()}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {templateLibrary.generator.isGenerating ? (
                                    <>
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                      {tr("生成中...", "Generating...")}
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="w-4 h-4 mr-2" />
                                      {tr("生成并保存", "Generate & Save")}
                                    </>
                                  )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
              </div>
            </div>
        </div>
      );
  }

  // Render Outline Review
  if (creationStep === 'outline') {
      return (
        <div className="w-full h-full bg-zinc-50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-6">
              <div className="w-full min-h-full bg-white dark:bg-zinc-800 rounded-xl shadow-sm flex flex-col overflow-hidden">
                <div className="p-6 border-b border-border flex justify-between items-center">
                    <h3 className="font-semibold text-lg">{tr("确认大纲", "Review outline")}</h3>
                    <div className="text-sm text-muted-foreground">{tr(`共 ${localSlides.length} 页`, `${localSlides.length} slides`)}</div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {localSlides.length === 0 && (
                      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                        {tr("当前没有大纲，请返回修改后重新生成。", "No outline yet. Go back and regenerate.")}
                      </div>
                    )}
                    {localSlides.map((slide, i) => (
                        <div key={slide.id || i} className="flex gap-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
                            <div className="w-8 h-8 flex items-center justify-center bg-white dark:bg-zinc-800 rounded-full border text-sm font-medium text-muted-foreground">
                                {i + 1}
                            </div>
                            <div className="flex-1 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                  <input 
                                      value={slide.title}
                                      onChange={(e) => {
                                          setLocalSlides((prev) =>
                                            prev.map((slide, n) => (n === i ? { ...slide, title: e.target.value } : slide)),
                                          );
                                      }}
                                      className="w-full font-medium bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                                  />
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Button variant="outline" size="sm" onClick={() => handleAddOutlineSlide(i)} title={tr("在当前页后新增大纲", "Add outline after current")}>
                                      <Plus className="w-4 h-4 mr-1" />
                                      {tr("新增", "Add")}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDeleteOutlineSlide(slide.id)}
                                      title={tr("删除当前大纲", "Delete current outline")}
                                    >
                                      <Trash2 className="w-4 h-4 mr-1" />
                                      {tr("删除", "Delete")}
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => handleAddSlideToChat(slide)} className="shrink-0">
                                      <MessageSquarePlus className="w-4 h-4 mr-2" />
                                      {tr("加入对话", "Add to chat")}
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs font-medium text-foreground mb-1">{tr("要点内容（content）", "Bullet content (content)")}</div>
                                  <textarea
                                    value={(slide.content || []).join("\n")}
                                    onChange={(e) => {
                                      const lines = String(e.target.value || "")
                                        .split(/\r?\n/)
                                        .map((x) => x.trim())
                                        .filter((x) => x.length > 0);
                                      setLocalSlides((prev) =>
                                        prev.map((slide, n) => (n === i ? { ...slide, content: lines } : slide)),
                                      );
                                    }}
                                    className="w-full h-24 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    placeholder={tr("每行一个要点，例如：\n市场现状与挑战\n核心方案与价值\n落地计划与里程碑", "One bullet per line, e.g.:\nMarket status and challenges\nCore solution and value\nExecution plan and milestones")}
                                  />
                                </div>
                                <div className="pt-3 grid gap-3">
                                  <div>
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("布局提示（layout）", "Layout hint (layout)")}</div>
                                    <input
                                      value={slide.layout || ""}
                                      onChange={(e) => {
                                        setLocalSlides((prev) =>
                                          prev.map((slide, n) => (n === i ? { ...slide, layout: e.target.value } : slide)),
                                        );
                                      }}
                                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：cover / title+bullets / two-column / left-text-right-image", "e.g. cover / title+bullets / two-column / left-text-right-image")}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("演讲者备注（note）", "Speaker notes (note)")}</div>
                                    <textarea
                                      value={slide.note || ""}
                                      onChange={(e) => {
                                        setLocalSlides((prev) =>
                                          prev.map((slide, n) => (n === i ? { ...slide, note: e.target.value } : slide)),
                                        );
                                      }}
                                      className="w-full h-20 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：这一页强调三个关键点；讲解时先抛出问题再给答案。", "e.g. Emphasize three key points; start with a question, then answer it.")}
                                    />
                                  </div>
                                  <div className="relative">
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("画面描述（description，用于生图）", "Visual description (description)")}</div>
                                    <div
                                      ref={(el) => {
                                        materials.editor.refs.current[slide.id] = el;
                                        if (el) materials.editor.render(slide.id, slide.description || "");
                                      }}
                                      contentEditable
                                      suppressContentEditableWarning
                                      onFocus={() => {
                                        materials.editor.focusedRef.current = slide.id;
                                      }}
                                      onBlur={() => {
                                        materials.editor.focusedRef.current = null;
                                        const nextValue = materials.editor.parse(slide.id);
                                        materials.editor.appliedRef.current[slide.id] = nextValue;
                                        setLocalSlides((prev) =>
                                          prev.map((slide, n) => (n === i ? { ...slide, description: nextValue } : slide)),
                                        );
                                      }}
                                      onInput={() => {
                                        const nextValue = materials.editor.parse(slide.id);
                                        materials.editor.appliedRef.current[slide.id] = nextValue;
                                        setLocalSlides((prev) =>
                                          prev.map((slide, n) => (n === i ? { ...slide, description: nextValue } : slide)),
                                        );
                                      }}
                                      onKeyDown={(e) => {
                                        if (materials.picker.slideId === slide.id && (slideMaterials[slide.id] || []).length > 0) {
                                          const list = slideMaterials[slide.id] || [];
                                          const len = list.length;
                                          if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            materials.picker.setActiveIndex((prev) => (prev + 1) % len);
                                            return;
                                          }
                                          if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            materials.picker.setActiveIndex((prev) => (prev - 1 + len) % len);
                                            return;
                                          }
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const idx = Math.max(0, Math.min(materials.picker.activeIndex, len - 1));
                                            const picked = list[idx];
                                            if (picked) {
                                              materials.picker.insertToken(i, slide.id, picked.name);
                                            }
                                            return;
                                          }
                                        }
                                        if (e.key === "Escape") {
                                          materials.picker.close();
                                          return;
                                        }
                                        if ((e.key === "Backspace" || e.key === "Delete") && e.currentTarget) {
                                          const root = e.currentTarget;
                                          const sel = window.getSelection();
                                          if (!sel || sel.rangeCount === 0) return;
                                          const r = sel.getRangeAt(0);
                                          if (!root.contains(r.startContainer) || !r.collapsed) return;
                                          const tryRemoveToken = (el: Element | null) => {
                                            if (!el) return false;
                                            const token = (el as HTMLElement).getAttribute("data-material-token");
                                            if (!token) return false;
                                            el.remove();
                                            return true;
                                          };
                                          if (r.startContainer.nodeType === Node.TEXT_NODE) {
                                            const t = r.startContainer as Text;
                                            if (e.key === "Backspace" && r.startOffset === 0) {
                                              const prev = t.previousSibling;
                                              if (prev && prev.nodeType === Node.ELEMENT_NODE && tryRemoveToken(prev as Element)) {
                                                e.preventDefault();
                                              }
                                            }
                                            if (e.key === "Delete" && r.startOffset === t.data.length) {
                                              const next = t.nextSibling;
                                              if (next && next.nodeType === Node.ELEMENT_NODE && tryRemoveToken(next as Element)) {
                                                e.preventDefault();
                                              }
                                            }
                                          }
                                        }
                                      }}
                                      onKeyUp={(e) => {
                                        if ((slideMaterials[slide.id] || []).length === 0) return;
                                        if (e.key === "/" || e.key === "／") {
                                          materials.picker.openAtCaret(slide.id);
                                        }
                                      }}
                                      className="w-full min-h-[96px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-placeholder={tr("例如：科技感蓝色渐变背景，中间是 AI 芯片与电路纹理，留白清晰。", "e.g. Futuristic blue gradient background, abstract AI chip and circuit textures, clean whitespace.")}
                                    />
                                    {materials.picker.slideId === slide.id && (slideMaterials[slide.id] || []).length > 0 && (
                                      <div
                                        ref={materials.picker.ref}
                                        className="absolute z-20 w-56 rounded-md border border-border bg-popover p-2 shadow-sm"
                                        style={{ left: materials.picker.pos?.left ?? 8, top: materials.picker.pos?.top ?? 8 }}
                                      >
                                        <div className="max-h-56 space-y-1 overflow-y-auto">
                                          {(slideMaterials[slide.id] || []).map((img, idx) => (
                                          <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => materials.picker.insertToken(i, slide.id, img.name)}
                                            onMouseEnter={() => materials.picker.setActiveIndex(idx)}
                                            title={tr(`插入第 ${idx + 1} 张素材`, `Insert material ${idx + 1}`)}
                                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                                              materials.picker.activeIndex === idx
                                                ? "border-blue-300 bg-blue-100 text-blue-800 ring-1 ring-blue-300"
                                                  : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                              }`}
                                            >
                                              <img src={img.dataUrl} alt={img.name} className="h-8 w-8 rounded object-cover" />
                                              <span className="truncate">{img.name}</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                                      <span>{tr("素材图片（用于该页生图）", "Material images (for this slide)")}</span>
                                      <button
                                        type="button"
                                        onClick={() => materials.editor.inputRefs.current[slide.id]?.click()}
                                        title={tr("上传素材图片", "Upload material images")}
                                        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        {tr("上传", "Upload")}
                                      </button>
                                      <input
                                        ref={(el) => {
                                          materials.editor.inputRefs.current[slide.id] = el;
                                        }}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          const files = Array.from(e.target.files || []);
                                          e.target.value = "";
                                          void materials.addImages(slide.id, files);
                                        }}
                                      />
                                    </div>
                                    {(slideMaterials[slide.id] || []).length === 0 ? (
                                      <div className="rounded-md border border-dashed border-zinc-300 px-3 py-2 text-xs text-zinc-500">
                                        {tr("暂无素材，上传后可在 description 输入 / 选择变量", "No materials yet. Upload images, then type / in description to insert variables.")}
                                      </div>
                                    ) : (
                                      <div className="flex flex-wrap gap-3">
                                        {(slideMaterials[slide.id] || []).map((img) => (
                                          <div key={img.id} className="w-20">
                                            <div
                                              className="group relative h-20 w-20 cursor-zoom-in overflow-hidden rounded-md border bg-background"
                                              onClick={() => materials.setPreview({ open: true, slideTitle: slide.title, item: img })}
                                              title={tr("点击查看素材", "Click to preview material")}
                                            >
                                              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  materials.setPreview({ open: true, slideTitle: slide.title, item: img });
                                                }}
                                                className="absolute bottom-1 left-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/85 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-700"
                                                aria-label={tr("查看素材", "Preview material")}
                                                title={tr("查看", "Preview")}
                                              >
                                                <Eye className="h-3 w-3" />
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  materials.removeImage(slide.id, img.id);
                                                }}
                                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-all group-hover:opacity-100 hover:bg-black/80"
                                                aria-label={tr("移除素材", "Remove material")}
                                                title={tr("移除", "Remove")}
                                              >
                                                ×
                                              </button>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => materials.setPreview({ open: true, slideTitle: slide.title, item: img })}
                                              className="mt-1 w-full truncate text-center text-xs text-foreground hover:text-blue-600"
                                              title={tr("点击查看素材", "Click to preview material")}
                                            >
                                              {img.name}
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-border bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end gap-3">
                    <Button variant="outline" onClick={handleBackToInputFromOutline}>{tr("返回修改", "Back")}</Button>
                    <Button onClick={handleGenerateFullPpt} className="bg-blue-600 hover:bg-blue-700" disabled={localSlides.length === 0}>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {tr("生成完整 PPT", "Generate full deck")}
                    </Button>
                </div>
                <Dialog
                  open={materials.preview.open}
                  onOpenChange={(open) => materials.setPreview((prev) => ({ ...prev, open }))}
                >
                  <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
                    </DialogHeader>
                    {materials.preview.item && (
                      <div className="space-y-3">
                        <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                          <img
                            src={materials.preview.item.dataUrl}
                            alt={materials.preview.item.name}
                            className="block max-h-full max-w-full object-scale-down"
                          />
                        </div>
                        <div className="grid gap-1 text-xs text-muted-foreground">
                          <div>{tr("所在幻灯片", "Slide")}: {materials.preview.slideTitle || "-"}</div>
                          <div>{tr("素材编号", "Material label")}: {materials.preview.item.name}</div>
                          {materials.preview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materials.preview.item.refLabel}</div> : null}
                          {materials.preview.item.caption ? <div>{tr("简短说明", "Caption")}: {materials.preview.item.caption}</div> : null}
                          {materials.preview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materials.preview.item.sourceFileName}</div> : null}
                          {typeof materials.preview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materials.preview.item.sourcePage}</div> : null}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(materials.preview.item!.dataUrl, "_blank", "noopener,noreferrer")}
                          >
                            {tr("在新窗口查看原图", "Open full image in new tab")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </div>
        </div>
      );
  }

  // Render Progress
  if (isGenerating(creationStep)) {
    return <GenerationProgress step={creationStep} progress={progress} tr={tr} />;
  }

  // Regular View (creationStep === 'done' or manually provided data)
  return (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col">
      {/* Toolbar */}
      <div className="relative z-50 h-14 px-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4 [&>h2]:hidden">
            <h2 className="hidden font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
            <div className="font-semibold text-sm text-foreground">{tr("PPT \u6f14\u793a\u6587\u7a3f", "PPT Deck")}</div>
            <button
                onClick={handleBackToStart}
                title={tr("返回开始", "Back to start")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回", "Back")}</span>
            </button>
            <h2 className="font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
            <div className="h-4 w-px bg-border"></div>
            <button
                onClick={() => slideshow.open(currentSlideIndex)}
                disabled={activeSlides.length === 0}
                title={tr("从当前页开始放映", "Present from the current slide")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-foreground rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Presentation className="w-3.5 h-3.5" />
                <span>{tr("放映", "Present")}</span>
            </button>
            <div ref={exportMenuRef} className="relative z-[60]">
              <button
                onClick={() => setExportMenuOpen((open) => !open)}
                disabled={activeSlides.length === 0 || !!isExporting}
                title={tr("导出", "Export")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting ? tr("导出中…", "Exporting...") : tr("导出", "Export")}</span>
              </button>
              {exportMenuOpen && !isExporting ? (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute left-0 top-full z-[70] mt-2 min-w-[190px] rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800"
                >
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setExportMenuOpen(false);
                      void handleDownloadPdf();
                    }}
                  >
                    {tr("导出 PDF", "Export PDF")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setExportMenuOpen(false);
                      void handleDownloadPpt();
                    }}
                  >
                    {tr("导出图片版 PPT", "Export Image PPT")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    onClick={() => {
                      setExportMenuOpen(false);
                      void handleDownloadEditablePpt();
                    }}
                  >
                    {tr("导出可编辑 PPTX", "Export Editable PPTX")}
                  </button>
                </motion.div>
              ) : null}
            </div>
            {creationMode === "beautify" && (
              <button
                onClick={handleRetryFailedBeautify}
                disabled={failedBeautifyCount === 0 || Boolean(progress.message)}
                title={tr("重试失败页", "Retry failed slides")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{tr("重试失败页", "Retry failed")}</span>
                {failedBeautifyCount > 0 ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">{failedBeautifyCount}</span> : null}
              </button>
            )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {creationMode === "beautify" && failedBeautifyCount > 0 ? (
              <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                {tr(`失败 ${failedBeautifyCount} 页`, `${failedBeautifyCount} failed`)}
              </span>
            ) : null}
            {creationMode === "image_transform" && failedImageTransformCount > 0 ? (
              <span className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                {tr(`转化失败 ${failedImageTransformCount} 页`, `${failedImageTransformCount} failed`)}
              </span>
            ) : null}
            <span>{activeSlides.length > 0 ? tr(`第 ${currentSlideIndex + 1} / ${activeSlides.length} 页`, `Slide ${currentSlideIndex + 1} / ${activeSlides.length}`) : tr("空文档", "Empty")}</span>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-64 bg-zinc-50 dark:bg-zinc-900 border-r border-border overflow-y-auto p-4 space-y-4">
          {activeSlides.map((slide, index) => {
            const hasGeneratedImage = getSlideBackgroundUrl(slide.id);
            const slideFailure = creationMode === "image_transform" ? imageTransformFailures[slide.id] : beautifyFailures[slide.id];
            return (
            <ContextMenu key={slide.id || index}>
                <ContextMenuTrigger asChild>
                    <div 
                    onClick={() => setCurrentSlideIndex(index)}
                    className={`cursor-pointer border-2 rounded-lg overflow-hidden relative aspect-[16/9] group transition-all duration-200 ${
                        currentSlideIndex === index 
                        ? 'border-blue-600 shadow-md scale-[1.02]' 
                        : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm'
                    }`}
                    >
                    {creationMode !== "image_transform" && !exportReviewMode ? (
                      <div
                        className="absolute top-1 left-1 z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-6 px-2 text-[10px] gap-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleAddSlideToChat(slide)}
                        >
                          <Presentation className="w-3 h-3" />
                          {tr("加入对话", "Add to chat")}
                        </Button>
                      </div>
                    ) : null}
                    {/* Thumbnail Preview */}
                    {hasGeneratedImage ? (
                        renderScaledSlideScene(slide, false, 240, 135)
                    ) : (
                        <div className="w-full h-full p-2 flex flex-col bg-white overflow-hidden text-[6px]">
                            {templateImage && (
                                <img src={templateImage} className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none" alt="" />
                            )}
                            <div className="font-bold mb-1 truncate z-10 relative">{slide.title}</div>
                            <div className="flex-1 space-y-0.5 z-10 relative">
                                {(slide.content || []).slice(0, 3).map((line, i) => (
                                    <div key={i} className="truncate text-zinc-500">• {line}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 rounded-sm backdrop-blur-sm">
                        {index + 1}
                    </div>
                    {exportReviewMode && getEditableExtractionStatus(slide.id) === "done" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="absolute left-1 top-1 z-20 h-6 gap-1 px-2 text-[10px] shadow-sm"
                        disabled={isAnyEditableExtractionRunning}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleExtractEditableText(slide.id);
                        }}
                      >
                        <RefreshCcw className="h-3 w-3" />
                        {tr("重新提取", "Re-extract")}
                      </Button>
                    ) : null}
                    {slideFailure ? (
                      <div
                        className="absolute top-1 right-1 bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-sm max-w-[85%] truncate"
                        title={slideFailure}
                      >
                        {creationMode === "image_transform" ? tr("转化失败", "Transform failed") : tr("美化失败", "Beautify failed")}
                      </div>
                    ) : null}
                    {exportReviewMode ? (
                      <div className="absolute bottom-1 left-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-sm">
                        {getEditableExtractionStatus(slide.id) === "done"
                          ? tr("文字已提取", "Text extracted")
                          : getEditableExtractionStatus(slide.id) === "extracting"
                            ? tr("文字提取中", "Extracting text")
                            : isReviewPreparing(slide.id)
                              ? tr("文本框识别中", "Preparing text boxes")
                              : getSlideRenderLayer(slide.id)?.status === "ready"
                                ? tr("文本框已就绪", "Text boxes ready")
                                : tr("待准备", "Pending")}
                      </div>
                    ) : null}
                    </div>
                </ContextMenuTrigger>
                {creationMode !== "image_transform" && !exportReviewMode ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleAddSlideToChat(slide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>{tr("把此页添加到对话", "Add this slide to chat")}</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          )})}
          
          {activeSlides.length === 0 && (
             <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-3">
                    <Presentation className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {uiLang === "zh" ? "在右侧对话框中输入需求" : "Describe your needs in the chat on the right"}
                  <br />
                  {uiLang === "zh" ? "让 AI 为您生成 PPT" : "Let AI generate your PPT"}
                </p>
             </div>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 p-4 flex items-center justify-center bg-zinc-200/50 dark:bg-zinc-950/50 overflow-auto relative">
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2 bg-white/80 dark:bg-zinc-900/70 backdrop-blur rounded-xl border border-border/50 px-3 py-2 shadow-sm">
            {!exportReviewMode ? (
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleGenerateAiImage}
                disabled={!currentSlide || isGeneratingImage}
              >
                {isGeneratingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                {tr("重新渲染本页", "Regenerate this slide")}
              </Button>
            ) : null}
            {currentSlide && getVisibleSlideVersions(currentSlide.id).length > 0 && (
              <select
                className="h-7 text-xs rounded-md border border-input bg-background px-2"
                value={
                  (() => {
                    const visibleVersions = getVisibleSlideVersions(currentSlide.id);
                    const currentVersionId = currentImageVersionId[currentSlide.id];
                    const preferredVersion =
                      [...visibleVersions].reverse().find((item) => item.type !== "derived_textless") ||
                      visibleVersions[visibleVersions.length - 1];
                    return visibleVersions.some((item) => item.id === currentVersionId)
                      ? currentVersionId
                      : preferredVersion?.id || "";
                  })()
                }
                onChange={(e) => {
                  const slideId = currentSlide.id;
                  const versionId = e.target.value;
                  const versions = getVisibleSlideVersions(slideId);
                  const v = versions.find(x => x.id === versionId);
                  if (v) {
                    setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
                  }
                }}
              >
                {getVisibleSlideVersions(currentSlide.id).map((v, idx) => (
                  <option key={v.id} value={v.id}>
                    {v.type === "derived_textless"
                      ? formatImageVersionLabel(v, idx)
                      : `${formatImageVersionLabel(v, idx)} · ${new Date(v.timestamp).toLocaleString()}`}
                  </option>
                ))}
              </select>
            )}
          </div>
          {currentSlideFailure ? (
            <div className="absolute top-16 left-4 z-30 max-w-[520px] rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-xs text-red-700 shadow-sm">
              <span className="font-medium mr-1">{creationMode === "image_transform" ? tr("本页转化失败：", "Slide transform failed:") : tr("本页美化失败：", "Slide beautify failed:")}</span>
              <span>{currentSlideFailure}</span>
            </div>
          ) : null}
          {currentSlide ? (
             <ContextMenu>
                <ContextMenuTrigger asChild>
                    <div 
                        ref={previewCanvasRef}
                        className="relative w-full max-w-[1100px] bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col transition-transform duration-300 outline-none"
                        style={{ aspectRatio: "16/9" }}
                    >
                        <PptEditorBridge
                          slide={currentSlide ? canvasAnvilToEditorSlide(currentSlide, {
                            renderLayer: currentReviewLayer,
                            backgroundImageUrl: currentSlideImage || undefined,
                          }) : null}
                          canvasWidth={previewCanvasSize.width}
                          canvasHeight={previewCanvasSize.height}
                          showElements={exportReviewMode}
                          showTextElements={false}
                          showImageElements
                          showShapeElements
                          emptyState={
                            <div className="w-full h-full p-12 flex flex-col relative">
                              {templateImage && (
                                <img src={templateImage} className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" alt="Template" />
                              )}

                              <div className="relative z-10 h-full flex flex-col">
                                <h1 className="mb-8 w-fit border-b-4 border-blue-600 pb-4 pr-12 text-4xl font-bold text-zinc-900">
                                  {currentSlide.title}
                                </h1>
                                <div className="flex-1 space-y-6">
                                  {(currentSlide.content || []).map((point, i) => (
                                    <div key={i} className="flex items-start gap-4 text-2xl leading-relaxed text-zinc-700">
                                      <span className="mt-2 text-blue-600">•</span>
                                      <span>{point}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-auto flex justify-between border-t border-zinc-100 pt-8 text-sm text-zinc-400">
                                  <span>Generated by Unified AI Workspace</span>
                                  <span>{currentSlideIndex + 1}</span>
                                </div>
                              </div>
                            </div>
                          }
                        >
                          {exportReviewMode && currentSlideImage ? renderReviewSelectionOverlay(currentSlide) : null}
                        </PptEditorBridge>
                        
                        {/* Overlay Label if Generated */}
                        {(isApplyingEdits || isGeneratingImage) && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
                                <div className="flex flex-col items-center gap-3 bg-white shadow-xl px-6 py-4 rounded-xl border border-blue-100">
                                    <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                                    <span className="text-sm font-medium text-zinc-700">{tr("幻灯片正在生成中...", "Generating slides...")}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </ContextMenuTrigger>
                {creationMode !== "image_transform" && !exportReviewMode ? (
                  <ContextMenuContent>
                      <ContextMenuItem onClick={() => handleAddSlideToChat(currentSlide)} className="gap-2">
                          <MessageSquarePlus className="w-4 h-4" />
                          <span>把此页添加到对话</span>
                      </ContextMenuItem>
                  </ContextMenuContent>
                ) : null}
            </ContextMenu>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>{tr("暂无幻灯片", "No slides yet")}</p>
            </div>
          )}
        </div>
        {exportReviewMode ? renderReviewSidebarBridge() : null}
      </div>

      <Dialog open={slideshow.isOpen} onOpenChange={(open) => { if (!open) slideshow.close(); }}>
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-black/95 border-none">
          <div ref={slideshow.rootRef} className="w-full h-full flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between text-white/90 bg-black/50 backdrop-blur-sm z-50">
            <div className="text-sm font-medium">
              {activeSlides.length > 0 ? `${uiLang === "zh" ? "第" : "Slide "}${slideshow.index + 1} / ${activeSlides.length}${uiLang === "zh" ? " 页" : ""}` : ""}
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                title={slideshow.isFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("进入全屏", "Enter fullscreen")}
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={() => {
                  if (slideshow.isFullscreen) {
                    void slideshow.exitFullscreen();
                  } else {
                    void slideshow.enterFullscreen();
                  }
                }}
              >
                {slideshow.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {slideshow.isFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("全屏", "Fullscreen")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={slideshow.close}
              >
                <X className="w-4 h-4" />
                {tr("退出", "Close")}
              </Button>
            </div>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden bg-black/90">
            {activeSlides[slideshow.index] ? (
              (() => {
                const slideDims = getSlideshowDimensions(windowDimensions);
                const slideWidth = typeof slideDims.width === "number" ? slideDims.width : 1100;
                const slideHeight = typeof slideDims.height === "number" ? slideDims.height : 619;
                return (
              <div className="relative w-full h-full flex items-center justify-center">
                  <div 
                    className="relative bg-white shadow-2xl overflow-hidden rounded-lg mx-auto"
                    style={{
                      width: slideDims.width,
                      height: slideDims.height
                    }}
                  >
                  {getSlideBackgroundUrl(activeSlides[slideshow.index].id) ? (
                    renderScaledSlideScene(activeSlides[slideshow.index], false, slideWidth, slideHeight)
                  ) : (
                    <div className="w-full h-full p-16 flex flex-col">
                      <h1 className="text-5xl font-bold mb-12 text-zinc-900 border-b-4 border-blue-600 pb-6 w-fit pr-16">
                        {activeSlides[slideshow.index].title}
                      </h1>
                      <div className="flex-1 space-y-8">
                        {(activeSlides[slideshow.index].content || []).map((point, i) => (
                          <div key={i} className="flex gap-6 text-3xl text-zinc-700 leading-relaxed items-start">
                            <span className="text-blue-600 mt-2">•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-8 flex justify-between text-lg text-zinc-400 border-t border-zinc-100">
                        <span>Generated by Unified AI Workspace</span>
                        <span>{slideshow.index + 1}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
                );
              })()
            ) : null}
          </div>

          <div className="h-20 px-4 flex items-center justify-center gap-8 pb-4">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={slideshow.previous}
              disabled={activeSlides.length <= 1}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="text-white/50 text-sm font-medium">
                {slideshow.index + 1} / {activeSlides.length}
            </div>
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={slideshow.next}
              disabled={activeSlides.length <= 1}
            >
              <ArrowRight className="w-6 h-6" />
            </Button>
          </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={backConfirmOpen} onOpenChange={setBackConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("确认返回开始", "Confirm restart")}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {tr(
              "返回开始将清空当前 PPT（建议先导出保存）。是否继续？",
              "Restart will clear the current deck (export first if needed). Continue?"
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBackConfirmOpen(false)}>
              {tr("取消", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBackConfirmOpen(false);
                resetToStart();
              }}
            >
              {tr("确认返回", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={materials.preview.open}
        onOpenChange={(open) => materials.setPreview((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
          </DialogHeader>
          {materials.preview.item && (
            <div className="space-y-3">
              <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                <img
                  src={materials.preview.item.dataUrl}
                  alt={materials.preview.item.name}
                  className="block max-h-full max-w-full object-scale-down"
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>{tr("所在幻灯片", "Slide")}: {materials.preview.slideTitle || "-"}</div>
                <div>{tr("素材编号", "Material label")}: {materials.preview.item.name}</div>
                {materials.preview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materials.preview.item.refLabel}</div> : null}
                {materials.preview.item.caption ? <div>{tr("简短说明", "Caption")}: {materials.preview.item.caption}</div> : null}
                {materials.preview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materials.preview.item.sourceFileName}</div> : null}
                {typeof materials.preview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materials.preview.item.sourcePage}</div> : null}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(materials.preview.item!.dataUrl, "_blank", "noopener,noreferrer")}
                >
                  {tr("在新窗口查看原图", "Open full image in new tab")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
