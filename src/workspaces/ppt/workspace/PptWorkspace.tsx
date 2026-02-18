import React, { useState, useEffect, useRef } from 'react';
import { motion } from "framer-motion";
import { generateImage, generateChatMessage } from '@/lib/ai-client';
import { pptService, PptPage } from '@/lib/ppt-service';
import { getTemplateGenerationPrompt } from '@/lib/ppt-prompts';
import { Loader2, Plus, Image as ImageIcon, MessageSquarePlus, Upload, Presentation, Sparkles, Check, Play, FileText, Download, Lightbulb, X, ArrowLeft, ArrowRight, Eye, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/workspaces/ppt/ui/context-menu";
import { Button } from "@/workspaces/ppt/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/workspaces/ppt/ui/dialog";
import { Textarea } from "@/workspaces/ppt/ui/textarea";
import { useUiLanguage } from "@/lib/use-ui-language";
import { useFileProcessor as useFlowFileProcessor } from "@/workspaces/flow/next/lib/use-file-processor";

interface SlideData {
  id: string;
  title: string;
  content: string[];
  note?: string;
  layout?: string;
  description?: string; // Add description support
}

interface PptData {
  theme?: string;
  slides: SlideData[];
}

const localizeLayoutHint = (layout: string, lang: "zh" | "en") => {
  const raw = String(layout || "").trim();
  if (!raw) return raw;
  const key = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[+_/-]/g, "");
  const map: Record<string, { zh: string; en: string }> = {
    cover: { zh: "封面页", en: "Cover" },
    titlebullets: { zh: "标题+要点", en: "Title + Bullets" },
    titlebullet: { zh: "标题+要点", en: "Title + Bullets" },
    twocolumn: { zh: "双栏布局", en: "Two-column" },
    lefttextrightimage: { zh: "左文右图", en: "Left text, right image" },
    titleandcontent: { zh: "标题+内容", en: "Title + Content" },
    封面页: { zh: "封面页", en: "Cover" },
    标题要点: { zh: "标题+要点", en: "Title + Bullets" },
    双栏布局: { zh: "双栏布局", en: "Two-column" },
    左文右图: { zh: "左文右图", en: "Left text, right image" },
    标题内容: { zh: "标题+内容", en: "Title + Content" },
  };
  const hit = map[key];
  if (!hit) return raw;
  return lang === "zh" ? hit.zh : hit.en;
};

const parseSlideNo = (value: string): number | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const m1 = raw.match(/^(?:slide|page)[\s_-]*(\d+)$/i);
  if (m1) return Number(m1[1]);
  const m2 = raw.match(/^第\s*(\d+)\s*页$/i);
  if (m2) return Number(m2[1]);
  const m3 = raw.match(/^(\d+)$/);
  if (m3) return Number(m3[1]);
  return null;
};

const normalizeLocalizedSlideTitle = (
  title: string,
  uiLang: "zh" | "en",
  fallbackNo?: number | null
) => {
  const raw = String(title || "").trim();
  const fromTitle = parseSlideNo(raw);
  const no = fromTitle || (typeof fallbackNo === "number" ? fallbackNo : null);
  if (uiLang === "zh") {
    if (/^(?:slide|page)(?:\s|_|-)*\d*$/i.test(raw) || /^slide$/i.test(raw) || /^page$/i.test(raw)) {
      return no ? `第 ${no} 页` : "幻灯片";
    }
    return raw;
  }
  if (/^第\s*\d+\s*页$/i.test(raw)) {
    return no ? `Slide ${no}` : "Slide";
  }
  return raw;
};

interface PptWorkspaceProps {
  data?: PptData;
  onAddToChat?: (json: string, name: string) => void;
  onPptReadyChange?: (ready: boolean) => void;
  onPptStageChange?: (stage: "start" | "outline" | "slides") => void;
  incomingEdit?: { id: string; payload: string } | null;
  onIncomingEditHandled?: (id: string) => void;
  onResetWorkspace?: () => void;
}

type CreationStep = 'idle' | 'input' | 'outline' | 'generating_content' | 'generating_images' | 'done';
type CreationMode = 'idea' | 'outline' | 'beautify';
type ReferenceFile = { id: string; filename: string; content: string; charCount: number };
type SlideMaterialImage = {
  id: string;
  name: string;
  fileName: string;
  dataUrl: string;
  refLabel?: string;
  caption?: string;
  sourceFileName?: string;
  sourcePage?: number;
};
type ReferenceVisualAsset = {
  id: string;
  label: string;
  caption: string;
  sourceFileName: string;
  sourcePage?: number;
  dataUrl: string;
  textHint: string;
};

type PresetTemplate = { id: string; zhName: string; enName: string; path: string };
type UploadTemplate = { id: string; name: string; dataUrl: string };
type TemplateItem =
  | { id: string; name: string; kind: "preset"; previewSrc: string; presetPath: string }
  | { id: string; name: string; kind: "upload"; previewSrc: string; dataUrl: string };

const PPT_TEMPLATE_UPLOADS_KEY = "ppt_template_uploads_v1";
const PPT_TEMPLATE_HIDDEN_PRESETS_KEY = "ppt_template_hidden_presets_v1";
const PPT_WORKSPACE_STORAGE_KEY = "CanvasAnvil-ppt-state-v1";

const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "preset-tech-business", zhName: "科技商务", enName: "Tech Business", path: "/templates/template_b.png" },
  { id: "preset-academic", zhName: "学术汇报", enName: "Academic", path: "/templates/template_academic.jpg" },
  { id: "preset-minimal", zhName: "极简主义", enName: "Minimal", path: "/templates/template_s.png" },
  { id: "preset-vector", zhName: "矢量插画", enName: "Vector Illustration", path: "/templates/template_vector_illustration.png" },
  { id: "preset-yellow", zhName: "活力黄", enName: "Vibrant Yellow", path: "/templates/template_y.png" },
  { id: "preset-glass", zhName: "磨砂玻璃", enName: "Frosted Glass", path: "/templates/template_glass.png" },
];

const MODEL_CONCURRENCY = 5;
const BEAUTIFY_CONCURRENCY = 5;
const BEAUTIFY_RETRY_MAX_ATTEMPTS = 3;
const BEAUTIFY_RETRY_BASE_DELAY_MS = 1200;

export function PptWorkspace({ data, onAddToChat, onPptReadyChange, onPptStageChange, incomingEdit, onIncomingEditHandled, onResetWorkspace }: PptWorkspaceProps) {
  const uiLang = useUiLanguage();
  const tr = (zh: string, en: string) => (uiLang === "zh" ? zh : en);
  const initialPptState = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(PPT_WORKSPACE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as any;
    } catch {
      return null;
    }
  })();

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
  const [templateImage, setTemplateImage] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(() => {
    const v = initialPptState?.selectedTemplateId;
    return typeof v === "string" ? v : null;
  });
  const [uploadedTemplates, setUploadedTemplates] = useState<UploadTemplate[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PPT_TEMPLATE_UPLOADS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
        .map((x: any) => ({ id: x.id, name: x.name, dataUrl: x.dataUrl }));
    } catch {
      return [];
    }
  });
  const [templateGeneratorOpen, setTemplateGeneratorOpen] = useState(false);
  const [backConfirmOpen, setBackConfirmOpen] = useState(false);
  const [templateGeneratorRequirement, setTemplateGeneratorRequirement] = useState("");
  const [templateGeneratorIsGenerating, setTemplateGeneratorIsGenerating] = useState(false);
  const [hiddenPresetTemplateIds, setHiddenPresetTemplateIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((x: any) => String(x)) : [];
    } catch {
      return [];
    }
  });
  const [generatedImages, setGeneratedImages] = useState<Record<string, string>>(() => {
    const v = initialPptState?.generatedImages;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k === "string" && typeof val === "string") out[k] = val;
    }
    return out;
  });
  const [imageVersions, setImageVersions] = useState<Record<string, Array<{ id: string; url: string; timestamp: number; type: 'generated' | 'edited'; instruction?: string }>>>(() => {
    const v = initialPptState?.imageVersions;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, Array<{ id: string; url: string; timestamp: number; type: 'generated' | 'edited'; instruction?: string }>> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k !== "string" || !Array.isArray(val)) continue;
      out[k] = val
        .filter((x: any) => x && typeof x.id === "string" && typeof x.url === "string" && typeof x.timestamp === "number" && (x.type === "generated" || x.type === "edited"))
        .map((x: any) => ({
          id: x.id,
          url: x.url,
          timestamp: x.timestamp,
          type: x.type,
          instruction: typeof x.instruction === "string" ? x.instruction : undefined,
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
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isExporting, setIsExporting] = useState<null | "pptx" | "pdf">(null);
  
  // Creation Wizard State
  const [creationStep, setCreationStep] = useState<CreationStep>(() => {
    const v = initialPptState?.creationStep;
    if (v === "idle" || v === "input" || v === "outline" || v === "done") return v;
    return localSlides.length > 0 ? "done" : "idle";
  });
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
    return v === "idea" || v === "outline" || v === "beautify" ? v : "idea";
  });
  const [ideaInput, setIdeaInput] = useState(() => (typeof initialPptState?.ideaInput === "string" ? initialPptState.ideaInput : ""));
  const [outlineInput, setOutlineInput] = useState(() => (typeof initialPptState?.outlineInput === "string" ? initialPptState.outlineInput : ""));
  const [beautifyRequirement, setBeautifyRequirement] = useState(() => (typeof initialPptState?.beautifyRequirement === "string" ? initialPptState.beautifyRequirement : ""));
  const [beautifyUseTemplate, setBeautifyUseTemplate] = useState(() => Boolean(initialPptState?.beautifyUseTemplate));
  const [beautifyFile, setBeautifyFile] = useState<File | null>(null);
  const [beautifyFailures, setBeautifyFailures] = useState<Record<string, string>>(() => {
    const v = initialPptState?.beautifyFailures;
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
  const [slideMaterials, setSlideMaterials] = useState<Record<string, SlideMaterialImage[]>>(() => {
    const v = initialPptState?.slideMaterials;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, SlideMaterialImage[]> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof k !== "string" || !Array.isArray(val)) continue;
      out[k] = val
        .filter((x: any) => x && typeof x.id === "string" && typeof x.name === "string" && typeof x.dataUrl === "string")
        .map((x: any) => ({
          id: x.id,
          name: x.name,
          fileName: typeof x.fileName === "string" ? x.fileName : x.name,
          dataUrl: x.dataUrl,
        }));
    }
    return out;
  });
  const [materialPickerSlideId, setMaterialPickerSlideId] = useState<string | null>(null);
  const [materialPickerPos, setMaterialPickerPos] = useState<{ left: number; top: number } | null>(null);
  const [materialPickerActiveIndex, setMaterialPickerActiveIndex] = useState(0);
  const materialPickerReplaceRangeRef = useRef<Range | null>(null);
  const materialPickerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const beautifyFileInputRef = useRef<HTMLInputElement | null>(null);
  const slideMaterialInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const descriptionTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const descriptionEditorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const descriptionEditorAppliedRef = useRef<Record<string, string>>({});
  const descriptionEditorFocusedRef = useRef<string | null>(null);
  const assetCaptionCacheRef = useRef<Record<string, string>>({});
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [slideshowFullscreen, setSlideshowFullscreen] = useState(false);
  const slideshowRootRef = useRef<HTMLDivElement | null>(null);
  const [materialPreview, setMaterialPreview] = useState<{ open: boolean; slideTitle: string; item: SlideMaterialImage | null }>({
    open: false,
    slideTitle: "",
    item: null
  });
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });
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

  const templates: TemplateItem[] = [
    ...PRESET_TEMPLATES
      .filter((t) => !hiddenPresetTemplateIds.includes(t.id))
      .map((t) => ({ id: t.id, name: uiLang === "zh" ? t.zhName : t.enName, kind: "preset" as const, previewSrc: t.path, presetPath: t.path })),
    ...uploadedTemplates.map((t) => ({ id: t.id, name: t.name, kind: "upload" as const, previewSrc: t.dataUrl, dataUrl: t.dataUrl })),
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_TEMPLATE_UPLOADS_KEY, JSON.stringify(uploadedTemplates));
    } catch (e) {
      console.error("Failed to persist uploaded PPT templates", e);
    }
  }, [uploadedTemplates]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(PPT_TEMPLATE_HIDDEN_PRESETS_KEY, JSON.stringify(hiddenPresetTemplateIds));
    } catch {
    }
  }, [hiddenPresetTemplateIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        PPT_WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          localSlides,
          currentSlideIndex,
          selectedTemplateId,
          generatedImages,
          imageVersions,
          currentImageVersionId,
          creationStep,
          creationMode,
          ideaInput,
          outlineInput,
          slideMaterials,
          beautifyRequirement,
          beautifyUseTemplate,
          beautifyFailures,
          updatedAt: Date.now(),
        })
      );
    } catch {
    }
  }, [
    localSlides,
    currentSlideIndex,
    selectedTemplateId,
    generatedImages,
    imageVersions,
    currentImageVersionId,
    creationStep,
    creationMode,
    ideaInput,
    outlineInput,
    slideMaterials,
    beautifyRequirement,
    beautifyUseTemplate,
    beautifyFailures,
  ]);

  useEffect(() => {
    onPptReadyChange?.(localSlides.length > 0);
  }, [localSlides.length]);

  useEffect(() => {
      if (typeof window === "undefined") return;
      const handleResize = () => {
          setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
      };
      window.addEventListener('resize', handleResize);
      handleResize();
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getSlideshowDimensions = () => {
      if (!windowDimensions.width) return { width: '90vw', height: '50.625vw' }; // Fallback
      const maxWidth = windowDimensions.width * 0.9;
      const maxHeight = windowDimensions.height * 0.85;
      
      let w = maxWidth;
      let h = w * 9 / 16;
      
      if (h > maxHeight) {
          h = maxHeight;
          w = h * 16 / 9;
      }
      return { width: w, height: h };
  };

  const setTemplateFromItem = async (item: TemplateItem) => {
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
  };

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(null);
      setTemplateImage(null);
      return;
    }
    const selected = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;
    if (!selected) {
      void setTemplateFromItem(templates[0]);
      return;
    }
    if (!templateImage) {
      void setTemplateFromItem(selected);
      return;
    }
    if (selected.kind === "upload" && templateImage !== selected.dataUrl) {
      setTemplateImage(selected.dataUrl);
    }
  }, [selectedTemplateId, templateImage, hiddenPresetTemplateIds.join("|"), uploadedTemplates.map((t) => t.id).join("|")]);

  const addUploadedTemplates = async (files: File[]) => {
    const imageFiles = Array.from(files || []).filter((f) => f && f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const toDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const baseName = (name: string) => String(name || "").replace(/\.[^.]+$/, "") || tr("模板", "Template");

    const created: UploadTemplate[] = [];
    for (const f of imageFiles) {
      try {
        const dataUrl = await toDataUrl(f);
        const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const name = baseName(f.name);
        created.push({ id, name, dataUrl });
      } catch (e) {
        console.error("Failed to read template image", e);
      }
    }
    if (created.length === 0) return;
    setUploadedTemplates((prev) => [...prev, ...created]);
    const last = created[created.length - 1];
    setSelectedTemplateId(last.id);
    setTemplateImage(last.dataUrl);
  };

  const handleTemplateUploadInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await addUploadedTemplates(files);
  };

  const toDataUrlIfNeeded = async (url: string) => {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (raw.startsWith("data:image")) return raw;
    try {
      const resp = await fetch(raw);
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve("");
        reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error("Failed to convert generated template to data url", e);
      return "";
    }
  };

  const addGeneratedTemplate = async (imageUrl: string) => {
    const dataUrl = await toDataUrlIfNeeded(imageUrl);
    if (!dataUrl || !dataUrl.startsWith("data:image")) {
      throw new Error(tr("生成模板持久化失败：无法读取图片数据", "Failed to persist generated template: cannot read image data"));
    }
    const id = `generated-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = `${tr("AI 模板", "AI Template")}-${Date.now()}`;
    const created: UploadTemplate = { id, name, dataUrl };
    setUploadedTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateImage(created.dataUrl);
  };

  const handleGenerateTemplate = async () => {
    const requirement = templateGeneratorRequirement.trim();
    if (!requirement) {
      alert(tr("请输入模板需求。", "Please enter template requirements."));
      return;
    }
    setTemplateGeneratorIsGenerating(true);
    try {
      const prompt = getTemplateGenerationPrompt({ requirements: requirement, language: uiLang });
      const imageUrl = await generateImage({ prompt });
      if (!imageUrl) {
        alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
        return;
      }
      await addGeneratedTemplate(imageUrl);
      setTemplateGeneratorRequirement("");
      setTemplateGeneratorOpen(false);
    } catch (e: any) {
      console.error("Template generation failed", e);
      alert(tr("模板生成失败，请重试", "Template generation failed. Please retry."));
    } finally {
      setTemplateGeneratorIsGenerating(false);
    }
  };

  const deleteTemplate = (item: TemplateItem) => {
    if (item.kind === "preset") {
      setHiddenPresetTemplateIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
      return;
    }
    setUploadedTemplates((prev) => prev.filter((t) => t.id !== item.id));
  };

  const [isApplyingEdits, setIsApplyingEdits] = useState(false);

  const setSlidesKeepingSelection = (nextSlides: SlideData[]) => {
    const currentId = localSlides[currentSlideIndex]?.id;
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
  };

  useEffect(() => {
    if (data && data.slides && data.slides.length > 0) {
      setSlidesKeepingSelection(data.slides);
      setCreationStep('done');
      onPptReadyChange?.(true);
    }
  }, [data]);

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

    const uploadedImages: string[] = Array.isArray(parsed?.uploadedImages) ? parsed.uploadedImages : [];
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
        pushImageVersion(id, incomingImageUrl, "edited", instruction.trim() ? instruction : undefined);
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
              ...getSlideMaterialImageRefs(id),
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
            pushImageVersion(id, rendered, "generated", kind === "both" ? instruction : undefined);
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
          Array.from(new Set([...styleRefImageUrls, ...uploadedImages, ...getSlideMaterialImageUrls(id)]))
        );
        if (editedUrl) {
          pushImageVersion(id, editedUrl, "edited", instruction);
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
  }, [incomingEdit?.id]);

  const activeSlides = localSlides.length > 0 ? localSlides : [];
  const currentSlide = activeSlides[currentSlideIndex];
  const getSlideImageUrl = (slideId: string) => {
      const versions = imageVersions[slideId] || [];
      const currentVersion = currentImageVersionId[slideId];
      const v = currentVersion ? versions.find((x) => x.id === currentVersion) : undefined;
      return v?.url || generatedImages[slideId] || "";
  };
  const currentSlideImage = currentSlide ? getSlideImageUrl(currentSlide.id) : "";
  const failedBeautifyCount = activeSlides.reduce((n, s) => n + (beautifyFailures[s.id] ? 1 : 0), 0);
  const currentSlideFailure = currentSlide ? beautifyFailures[currentSlide.id] : "";

  const enterSlideshowFullscreen = async () => {
    if (typeof document === "undefined") return;
    const root = slideshowRootRef.current;
    if (!root) return;
    try {
      if (document.fullscreenElement === root) return;
      if (root.requestFullscreen) {
        await root.requestFullscreen();
        return;
      }
      const anyRoot = root as any;
      if (typeof anyRoot.webkitRequestFullscreen === "function") {
        anyRoot.webkitRequestFullscreen();
      }
    } catch {
    }
  };

  const exitSlideshowFullscreen = async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
        return;
      }
      const anyDoc = document as any;
      if (typeof anyDoc.webkitExitFullscreen === "function") {
        anyDoc.webkitExitFullscreen();
      }
    } catch {
    }
  };

  const closeSlideshow = () => {
    setSlideshowOpen(false);
    void exitSlideshowFullscreen();
  };

  const openSlideshow = () => {
    if (activeSlides.length === 0) return;
    setSlideshowOpen(true);
  };

  useEffect(() => {
      if (!slideshowOpen) return;
      setSlideshowIndex(currentSlideIndex);
      const timer = window.setTimeout(() => {
        void enterSlideshowFullscreen();
      }, 0);
      return () => window.clearTimeout(timer);
  }, [slideshowOpen, currentSlideIndex]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFullscreenChange = () => {
      const root = slideshowRootRef.current;
      const fullEl = document.fullscreenElement || (document as any).webkitFullscreenElement || null;
      setSlideshowFullscreen(!!root && !!fullEl && (fullEl === root || root.contains(fullEl)));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    onFullscreenChange();
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!slideshowOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeSlides.length === 0) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        setSlideshowIndex((v) => (v + 1) % activeSlides.length);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setSlideshowIndex((v) => (v - 1 + activeSlides.length) % activeSlides.length);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (slideshowFullscreen) {
          void exitSlideshowFullscreen();
        } else {
          closeSlideshow();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slideshowOpen, activeSlides.length, slideshowFullscreen]);

  const pushImageVersion = (slideId: string, url: string, type: 'generated' | 'edited', instruction?: string) => {
      const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setImageVersions(prev => ({
          ...prev,
          [slideId]: [
              ...(prev[slideId] || []),
              { id: versionId, url, timestamp: Date.now(), type, instruction }
          ]
      }));
      setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
      setGeneratedImages(prev => ({ ...prev, [slideId]: url }));
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

  const getMaterialLabel = (index: number) => {
    return uiLang === "zh" ? `第${index}张` : `Image ${index}`;
  };

  const parseJsonLoose = (text: string) => {
    const raw = String(text || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
    }
    const jsonBlock = raw.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonBlock?.[1]) {
      try {
        return JSON.parse(String(jsonBlock[1]).trim());
      } catch {
      }
    }
    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      const candidate = raw.slice(firstBracket, lastBracket + 1);
      try {
        return JSON.parse(candidate);
      } catch {
      }
    }
    return null;
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

  const ensureDescriptionHasMaterialTokens = (description: string, materials: Array<{ name: string; caption?: string }>) => {
    const source = String(description || "");
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const placementsZh = [
      "放在左侧主视觉区域，约占画面宽度 40%",
      "放在右上区域，作为辅助图示",
      "放在底部横向区域，作为补充对比",
    ];
    const placementsEn = [
      "place it in the left primary visual area, about 40% width",
      "place it in the upper-right area as a supporting visual",
      "place it in the bottom horizontal area as supplementary comparison",
    ];

    let working = source;
    const lines: string[] = [];
    for (let i = 0; i < materials.length; i += 1) {
      const m = materials[i];
      const token = `{{image:${m.name}}}`;
      const tokenEscaped = escapeRegExp(token);
      const placement = uiLang === "zh"
        ? placementsZh[Math.min(i, placementsZh.length - 1)]
        : placementsEn[Math.min(i, placementsEn.length - 1)];
      const captionPart = String(m.caption || "").trim();
      const sentence = uiLang === "zh"
        ? `${token}${placement}${captionPart ? `，内容重点为：${captionPart}` : ""}。`
        : `${token} ${placement}${captionPart ? `, focus: ${captionPart}` : ""}.`;

      const wrongLangPlacementRe = uiLang === "zh"
        ? new RegExp(`${tokenEscaped}[^\\n]*\\bplace\\b[^\\n]*`, "gi")
        : new RegExp(`${tokenEscaped}[^\\n]*放在[^\\n]*`, "g");
      if (wrongLangPlacementRe.test(working)) {
        working = working.replace(wrongLangPlacementRe, "");
      }

      const hasToken = working.includes(token);
      const hasPlacement = uiLang === "zh"
        ? new RegExp(`${tokenEscaped}[^\\n]*放在`).test(working)
        : new RegExp(`${tokenEscaped}[^\\n]*\\bplace\\b`, "i").test(working);
      if (!hasToken || !hasPlacement) lines.push(sentence);
    }

    working = working
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (lines.length === 0) return working || source;
    const trimmed = working.trim();
    if (!trimmed) return lines.join("\n");
    return `${trimmed}\n${lines.join("\n")}`;
  };

  const buildSlideMaterialsFromAutoLabels = (
    pages: PptPage[],
    slides: SlideData[],
    assets: ReferenceVisualAsset[]
  ) => {
    const assetMap = new Map<string, ReferenceVisualAsset>();
    for (const a of assets) assetMap.set(a.label, a);

    const pageLabels: string[][] = slides.map((_, idx) => {
      const labels = Array.isArray(pages[idx]?.materialLabels)
        ? pages[idx]!.materialLabels!.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      return labels.slice(0, 3);
    });
    const explicitLabelCount = pageLabels.reduce((sum, arr) => sum + arr.length, 0);

    // Fallback: if AI returned no labels at all but assets exist, attach a few assets
    // to representative slides so users can review and adjust instead of seeing empty materials.
    if (explicitLabelCount === 0 && assets.length > 0 && slides.length > 0) {
      const fallbackCount = Math.min(assets.length, Math.max(1, Math.min(6, Math.ceil(slides.length / 2))));
      const step = Math.max(1, Math.floor(slides.length / fallbackCount));
      for (let n = 0; n < fallbackCount; n += 1) {
        const slideIndex = Math.min(slides.length - 1, n * step);
        const label = assets[n]?.label;
        if (!label) continue;
        if (!pageLabels[slideIndex]) pageLabels[slideIndex] = [];
        if (!pageLabels[slideIndex].includes(label)) pageLabels[slideIndex].push(label);
      }
    }

    const nextMaterials: Record<string, SlideMaterialImage[]> = {};
    const nextSlides = slides.map((slide, idx) => {
      const labels = (pageLabels[idx] || []).slice(0, 3);
      const matched = labels
        .map((lb) => assetMap.get(lb))
        .filter((x): x is ReferenceVisualAsset => !!x)
        .slice(0, 3);
      if (matched.length === 0) return slide;

      const materialItems: SlideMaterialImage[] = matched.map((asset, mIdx) => ({
        id: `auto-mat-${slide.id}-${asset.label}-${mIdx + 1}`,
        name: getMaterialLabel(mIdx + 1),
        fileName: asset.sourceFileName,
        dataUrl: asset.dataUrl,
        refLabel: asset.label,
        caption: asset.caption,
        sourceFileName: asset.sourceFileName,
        sourcePage: asset.sourcePage,
      }));
      nextMaterials[slide.id] = materialItems;

      const withTokens = ensureDescriptionHasMaterialTokens(
        String(slide.description || ""),
        materialItems.map((m) => ({ name: m.name, caption: m.caption }))
      );
      return { ...slide, description: withTokens };
    });

    return { nextSlides, nextMaterials };
  };

  const addSlideMaterialImages = async (slideId: string, files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const toDataUrl = (file: File) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

    const currentCount = (slideMaterials[slideId] || []).length;
    const created: SlideMaterialImage[] = [];
    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      try {
        const dataUrl = await toDataUrl(file);
        if (!dataUrl.startsWith("data:image")) continue;
        const label = getMaterialLabel(currentCount + i + 1);
        created.push({
          id: `mat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: label,
          fileName: file.name,
          dataUrl,
        });
      } catch (e) {
        console.error("Failed to read slide material image", file.name, e);
      }
    }
    if (created.length === 0) return;
    setSlideMaterials((prev) => ({
      ...prev,
      [slideId]: [...(prev[slideId] || []), ...created],
    }));
  };

  const removeSlideMaterialImage = (slideId: string, id: string) => {
    const removed = (slideMaterials[slideId] || []).find((x) => x.id === id);
    setSlideMaterials((prev) => ({
      ...prev,
      [slideId]: (prev[slideId] || []).filter((x) => x.id !== id),
    }));
    if (!removed) return;

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenRe = new RegExp(`\\{\\{image:${escapeRegExp(removed.name)}\\}\\}`, "g");
    setLocalSlides((prev) =>
      prev.map((s) => {
        if (s.id !== slideId) return s;
        const nextDesc = String(s.description || "")
          .replace(tokenRe, "")
          .replace(/[ \t]{2,}/g, " ")
          .replace(/ *\n */g, "\n");
        return { ...s, description: nextDesc };
      })
    );

    const editor = descriptionEditorRefs.current[slideId];
    if (editor) {
      for (const node of Array.from(editor.querySelectorAll("[data-material-token]"))) {
        const el = node as HTMLElement;
        if (el.getAttribute("data-material-token") === removed.name) {
          el.remove();
        }
      }
    }
  };

  const getSlideMaterialImageUrls = (slideId: string) =>
    (slideMaterials[slideId] || []).map((x) => x.dataUrl).filter(Boolean);

  const getSlideMaterialImageRefs = (slideId: string) =>
    (slideMaterials[slideId] || [])
      .map((x) => ({ url: x.dataUrl, label: x.name }))
      .filter((x) => !!x.url);

  const getTextAreaCaretPosition = (textarea: HTMLTextAreaElement) => {
    const div = document.createElement("div");
    const style = window.getComputedStyle(textarea);
    const props = [
      "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth",
      "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight",
      "fontFamily", "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing",
      "tabSize", "MozTabSize",
    ] as const;
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    for (const prop of props) {
      (div.style as any)[prop] = (style as any)[prop];
    }
    div.textContent = textarea.value.substring(0, textarea.selectionStart || 0);
    const span = document.createElement("span");
    span.textContent = textarea.value.substring(textarea.selectionStart || 0) || ".";
    div.appendChild(span);
    document.body.appendChild(div);
    const rect = textarea.getBoundingClientRect();
    const caretRect = span.getBoundingClientRect();
    const left = caretRect.left - rect.left + textarea.scrollLeft;
    const top = caretRect.top - rect.top + textarea.scrollTop + 2;
    document.body.removeChild(div);
    return { left, top };
  };

  const extractMaterialTokenNames = (text: string) => {
    const out: string[] = [];
    const re = /\{\{image:([^}]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(String(text || "")))) {
      const name = String(m[1] || "").trim();
      if (name) out.push(name);
    }
    return out;
  };

  const insertMaterialTokenToSlideDescription = (slideIndex: number, slideId: string, materialName: string) => {
    const token = `{{image:${materialName}}}`;
    const editor = descriptionEditorRefs.current[slideId];
    if (editor) {
      const sel = window.getSelection();
      const replaceRange = materialPickerReplaceRangeRef.current;
      if (replaceRange) {
        replaceRange.deleteContents();
        const chip = document.createElement("span");
        chip.setAttribute("data-material-token", materialName);
        chip.setAttribute("contenteditable", "false");
        chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
        chip.textContent = materialName;
        replaceRange.insertNode(chip);
        const space = document.createTextNode(" ");
        replaceRange.collapse(false);
        replaceRange.insertNode(space);
        const next = document.createRange();
        next.setStartAfter(space);
        next.collapse(true);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(next);
        }
      } else {
        const chip = document.createElement("span");
        chip.setAttribute("data-material-token", materialName);
        chip.setAttribute("contenteditable", "false");
        chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
        chip.textContent = materialName;
        editor.appendChild(chip);
      }

      const parseEditorValue = () => {
        const parts: string[] = [];
        for (const node of Array.from(editor.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE) {
            parts.push(node.textContent || "");
            continue;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as HTMLElement;
          if (el.tagName === "BR") {
            parts.push("\n");
            continue;
          }
          const tokenName = el.getAttribute("data-material-token");
          if (tokenName) {
            parts.push(`{{image:${tokenName}}}`);
            continue;
          }
          parts.push(el.textContent || "");
        }
        return parts.join("");
      };

      const nextValue = parseEditorValue();
      descriptionEditorAppliedRef.current[slideId] = nextValue;
      const newSlides = [...localSlides];
      newSlides[slideIndex].description = nextValue;
      setLocalSlides(newSlides);
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      materialPickerReplaceRangeRef.current = null;
      return;
    }

    const textarea = descriptionTextareaRefs.current[slideId];
    const prev = localSlides[slideIndex]?.description || "";
    if (!textarea) {
      const newSlides = [...localSlides];
      newSlides[slideIndex].description = `${prev}${token}`;
      setLocalSlides(newSlides);
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      return;
    }

    const cursor = textarea.selectionStart ?? prev.length;
    const before = prev.slice(0, cursor);
    const slashAt = Math.max(before.lastIndexOf("/"), before.lastIndexOf("／"));
    const nextValue =
      slashAt >= 0 ? `${prev.slice(0, slashAt)}${token}${prev.slice(cursor)}` : `${before}${token}${prev.slice(cursor)}`;
    const nextCursor = (slashAt >= 0 ? slashAt : cursor) + token.length;
    const newSlides = [...localSlides];
    newSlides[slideIndex].description = nextValue;
    setLocalSlides(newSlides);
    setMaterialPickerSlideId(null);
    setMaterialPickerPos(null);
    setMaterialPickerActiveIndex(0);
    requestAnimationFrame(() => {
      const input = descriptionTextareaRefs.current[slideId];
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const openMaterialPickerAtCaret = (slideId: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (!editor.contains(r.startContainer)) return;
    if (!r.collapsed) return;
    if (r.startContainer.nodeType !== Node.TEXT_NODE) return;
    const textNode = r.startContainer as Text;
    if (r.startOffset <= 0) return;
    const prevChar = textNode.data[r.startOffset - 1];
    if (prevChar !== "/" && prevChar !== "／") return;

    const replaceRange = document.createRange();
    replaceRange.setStart(textNode, r.startOffset - 1);
    replaceRange.setEnd(textNode, r.startOffset);
    materialPickerReplaceRangeRef.current = replaceRange;

    const marker = r.cloneRange();
    marker.setStart(textNode, r.startOffset);
    marker.collapse(true);
    const rect = marker.getBoundingClientRect();
    const hostRect = editor.getBoundingClientRect();
    setMaterialPickerPos({
      left: editor.offsetLeft + (rect.left - hostRect.left),
      top: editor.offsetTop + (rect.bottom - hostRect.top) + 2,
    });
    setMaterialPickerActiveIndex(0);
    setMaterialPickerSlideId(slideId);
  };

  useEffect(() => {
    if (!materialPickerSlideId) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (materialPickerRef.current?.contains(target)) return;
      setMaterialPickerSlideId(null);
      setMaterialPickerPos(null);
      setMaterialPickerActiveIndex(0);
      materialPickerReplaceRangeRef.current = null;
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [materialPickerSlideId]);

  useEffect(() => {
    if (!materialPickerSlideId) return;
    const len = (slideMaterials[materialPickerSlideId] || []).length;
    if (len <= 0) return;
    setMaterialPickerActiveIndex((prev) => {
      if (prev < 0) return 0;
      if (prev >= len) return len - 1;
      return prev;
    });
  }, [materialPickerSlideId, slideMaterials]);

  const renderDescriptionEditor = (slideId: string, value: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return;
    if (descriptionEditorFocusedRef.current === slideId) return;
    if (descriptionEditorAppliedRef.current[slideId] === value) return;
    descriptionEditorAppliedRef.current[slideId] = value;
    editor.innerHTML = "";
    const text = String(value || "");
    const re = /\{\{image:([^}]+)\}\}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const appendText = (s: string) => {
      const lines = s.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]) editor.appendChild(document.createTextNode(lines[i]));
        if (i < lines.length - 1) editor.appendChild(document.createElement("br"));
      }
    };
    while ((m = re.exec(text))) {
      const before = text.slice(last, m.index);
      if (before) appendText(before);
      const name = String(m[1] || "").trim();
      const chip = document.createElement("span");
      chip.setAttribute("data-material-token", name);
      chip.setAttribute("contenteditable", "false");
      chip.className = "mx-0.5 inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 align-middle";
      chip.textContent = name;
      editor.appendChild(chip);
      editor.appendChild(document.createTextNode(" "));
      last = m.index + m[0].length;
    }
    const rest = text.slice(last);
    if (rest) appendText(rest);
    if (!editor.lastChild) editor.appendChild(document.createTextNode(""));
  };

  const parseDescriptionEditor = (slideId: string) => {
    const editor = descriptionEditorRefs.current[slideId];
    if (!editor) return "";
    const out: string[] = [];
    for (const node of Array.from(editor.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent || "");
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const el = node as HTMLElement;
      if (el.tagName === "BR") {
        out.push("\n");
        continue;
      }
      const name = el.getAttribute("data-material-token");
      if (name) {
        out.push(`{{image:${name}}}`);
        continue;
      }
      out.push(el.textContent || "");
    }
    return out.join("");
  };

  const resetGenerationState = () => {
      console.log("Resetting generation state...");
      setGeneratedImages({});
      setImageVersions({});
      setCurrentImageVersionId({});
      setCurrentSlideIndex(0);
  };

  const extractJsonArray = (text: string) => {
      const match = text.match(/\[[\s\S]*\]/);
      return match ? match[0] : null;
  };

  const parseSlides = (raw: string): SlideData[] | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const jsonArrayText = extractJsonArray(trimmed);
    if (jsonArrayText) {
      try {
        const parsed = JSON.parse(jsonArrayText);
        if (Array.isArray(parsed)) {
          return parsed.map((it: any, i: number) => ({
            id: String(it.id || `slide-${i + 1}`),
            title: String(it.title || tr(`第 ${i + 1} 页`, `Slide ${i + 1}`)),
            content: Array.isArray(it.content) ? it.content.map((x: any) => String(x)) : [],
            description: typeof it.description === "string" ? it.description : undefined,
            note: typeof it.note === "string" ? it.note : undefined,
            layout: typeof it.layout === "string" ? localizeLayoutHint(it.layout, uiLang as "zh" | "en") : undefined,
          }));
        }
      } catch {
      }
    }

    const lines = trimmed.split(/\r?\n/);
    const slides: SlideData[] = [];
    let current: SlideData | null = null;
    const ensureCurrent = () => {
      if (!current) {
        current = {
          id: `slide-${slides.length + 1}`,
          title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`),
          content: [],
        };
      }
      return current;
    };
    const pushCurrent = () => {
      if (current) slides.push(current);
      current = null;
    };

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;

      const heading = l.match(/^(#{1,3})\s+(.*)$/);
      if (heading) {
        pushCurrent();
        current = {
          id: `slide-${slides.length + 1}`,
          title: heading[2].trim() || tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`),
          content: [],
        };
        continue;
      }

      const bullet = l.match(/^[-*•]\s+(.*)$/);
      if (bullet) {
        ensureCurrent().content.push(bullet[1].trim());
        continue;
      }

      const desc = l.match(/^description[:：]\s*(.*)$/i);
      if (desc) {
        ensureCurrent().description = desc[1].trim();
        continue;
      }

      const note = l.match(/^note[:：]\s*(.*)$/i);
      if (note) {
        ensureCurrent().note = note[1].trim();
        continue;
      }

      const layout = l.match(/^layout[:：]\s*(.*)$/i);
      if (layout) {
        ensureCurrent().layout = layout[1].trim();
      }
    }
    pushCurrent();
    return slides.length > 0 ? slides : null;
  };

  const runInParallel = async (tasks: (() => Promise<void>)[], limit: number) => {
      const results: Promise<void>[] = [];
      const executing: Promise<void>[] = [];
      for (const task of tasks) {
          const p = Promise.resolve().then(() => task());
          results.push(p);
          let e: Promise<void>;
          e = p
            .catch(() => {
            })
            .then(() => {
              executing.splice(executing.indexOf(e), 1);
            });
          executing.push(e);
          if (executing.length >= limit) {
              await Promise.race(executing);
          }
      }
      await Promise.all(results);
  };

  const isBeautifyPdfFile = (file: File) => {
    const name = String(file?.name || "").toLowerCase();
    return file?.type === "application/pdf" || name.endsWith(".pdf");
  };

  const extractPdfPagesAsImages = async (file: File) => {
    const { getPdfDocumentFromUrl, renderPdfPageToCanvas } = await import("@/lib/pdf-utils");
    const objectUrl = URL.createObjectURL(file);
    try {
      const pdf = await getPdfDocumentFromUrl(objectUrl);
      const pageCount = (pdf as any)?.numPages ?? 0;
      const out: string[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        setProgress({
          current: pageNumber - 1,
          total: pageCount,
          message: tr(`正在解析 PDF... (${pageNumber - 1}/${pageCount})`, `Parsing PDF... (${pageNumber - 1}/${pageCount})`),
        });
        const canvas = document.createElement("canvas");
        await renderPdfPageToCanvas({ pdf, pageNumber, canvas, targetWidth: 1280 });
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl && dataUrl.startsWith("data:image")) out.push(dataUrl);
      }
      setProgress({
        current: pageCount,
        total: pageCount,
        message: tr(`正在解析 PDF... (${pageCount}/${pageCount})`, `Parsing PDF... (${pageCount}/${pageCount})`),
      });
      return out;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };


  const handleBeautifyFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    e.target.value = "";
    setBeautifyFile(f);
  };

  const buildBeautifyInstruction = (req: string) => {
    const r = String(req || "").trim();
    const parts = [
      "Beautify the slide while preserving all original text, numbers, and meaning.",
      "Improve typography, spacing, alignment, color harmony, hierarchy, and visual balance.",
      "Do not add watermarks. Keep 16:9 landscape.",
      "Do not translate or rewrite text unless explicitly requested.",
      r ? `User requirements: ${r}` : "",
    ].filter(Boolean);
    return parts.join("\n");
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === "string" && error.trim()) return error.trim();
    return tr("未知错误", "Unknown error");
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isRetryableBeautifyError = (error: unknown) => {
    const msg = getErrorMessage(error).toLowerCase();
    return (
      msg.includes("429") ||
      msg.includes("524") ||
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("networkerror") ||
      msg.includes("fetch") ||
      msg.includes("rate limit")
    );
  };

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
    setCreationStep("generating_content");
    setProgress({ current: 0, total: 0, message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = isBeautifyPdfFile(file)
        ? await extractPdfPagesAsImages(file)
        : [];

      if (pageImages.length === 0) {
        alert(tr("无法解析页面图片，请确认文件格式（仅支持 .pdf）。", "Failed to extract pages. Please upload a .pdf file."));
        setCreationStep("idle");
        setProgress({ current: 0, total: 0, message: "" });
        return;
      }

      const slides: SlideData[] = pageImages.map((_, i) => ({
        id: `slide-${i + 1}`,
        title: tr(`第 ${i + 1} 页`, `Slide ${i + 1}`),
        content: [],
        description: "",
      }));

      const initialGenerated: Record<string, string> = {};
      const initialCurrent: Record<string, string> = {};
      const initialVersions: Record<string, Array<{ id: string; url: string; timestamp: number; type: "generated" | "edited"; instruction?: string }>> = {};

      for (let i = 0; i < slides.length; i += 1) {
        const slideId = slides[i].id;
        const url = pageImages[i];
        const versionId = `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        initialGenerated[slideId] = url;
        initialCurrent[slideId] = versionId;
        initialVersions[slideId] = [{ id: versionId, url, timestamp: Date.now(), type: "generated", instruction: tr("原始页面", "Original") }];
      }

      setLocalSlides(slides);
      setGeneratedImages(initialGenerated);
      setCurrentImageVersionId(initialCurrent);
      setImageVersions(initialVersions);

      setCreationStep("generating_images");
      setProgress({ current: 0, total: slides.length, message: tr("正在美化渲染...", "Beautifying slides...") });

      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
      const counter = { done: 0 };
      const tasks = slides.map((s, i) => async () => {
        try {
          const page: PptPage = { id: s.id, title: s.title, content: s.content || [], description: s.description || "" };
          const edited = await editPageImageWithRetry(page, instruction, pageImages[i], beautifyTemplate);
          if (edited) {
            pushImageVersion(s.id, edited, "edited", instruction);
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
          counter.done += 1;
          setProgress((prev) => ({
            ...prev,
            current: counter.done,
            total: slides.length,
            message: tr(`正在美化渲染... (${counter.done}/${slides.length})`, `Beautifying slides... (${counter.done}/${slides.length})`),
          }));
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      setCreationStep("done");
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Beautify failed", e);
      alert(tr("美化失败，请重试", "Beautify failed. Please retry."));
      setCreationStep("idle");
    } finally {
      setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleRetryFailedBeautify = async () => {
    if (creationMode !== "beautify") return;
    const failedSlideIds = activeSlides
      .map((s) => s.id)
      .filter((id) => !!beautifyFailures[id]);
    if (failedSlideIds.length === 0) return;

    setCreationStep("generating_images");
    setProgress({
      current: 0,
      total: failedSlideIds.length,
      message: tr(`正在重试失败页... (0/${failedSlideIds.length})`, `Retrying failed slides... (0/${failedSlideIds.length})`),
    });

    try {
      const instruction = buildBeautifyInstruction(beautifyRequirement);
      const beautifyTemplate = beautifyUseTemplate ? (templateImage || undefined) : undefined;
      const counter = { done: 0 };
      const tasks = failedSlideIds.map((slideId) => async () => {
        const slide = activeSlides.find((x) => x.id === slideId);
        const baseImageUrl = generatedImages[slideId] || getSlideImageUrl(slideId);
        if (!slide || !baseImageUrl) {
          setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("缺少可重试的原始图片", "Missing base image for retry") }));
          counter.done += 1;
          setProgress((prev) => ({
            ...prev,
            current: counter.done,
            total: failedSlideIds.length,
            message: tr(`正在重试失败页... (${counter.done}/${failedSlideIds.length})`, `Retrying failed slides... (${counter.done}/${failedSlideIds.length})`),
          }));
          return;
        }
        try {
          const page: PptPage = { id: slide.id, title: slide.title, content: slide.content || [], description: slide.description || "" };
          const edited = await editPageImageWithRetry(page, instruction, baseImageUrl, beautifyTemplate);
          if (!edited) {
            setBeautifyFailures((prev) => ({ ...prev, [slideId]: tr("模型返回空结果", "Empty model result") }));
          } else {
            pushImageVersion(slideId, edited, "edited", instruction);
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
          counter.done += 1;
          setProgress((prev) => ({
            ...prev,
            current: counter.done,
            total: failedSlideIds.length,
            message: tr(`正在重试失败页... (${counter.done}/${failedSlideIds.length})`, `Retrying failed slides... (${counter.done}/${failedSlideIds.length})`),
          }));
        }
      });

      await runInParallel(tasks, BEAUTIFY_CONCURRENCY);
      setCreationStep("done");
      onPptReadyChange?.(true);
    } catch (e) {
      console.error("Retry failed slides error", e);
      alert(tr("重试失败页时出错，请重试。", "Retrying failed slides failed. Please try again."));
      setCreationStep("done");
    } finally {
      setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleLoadOutline = async () => {
      if (!outlineInput.trim()) return;
      resetGenerationState();
      setCreationStep("input");
      setProgress({ current: 0, total: 0, message: tr("正在解析参考素材...", "Preparing reference assets...") });
      try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        setProgress({ current: 0, total: 0, message: tr("正在生成计划...", "Generating plan...") });
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
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets);
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        setCreationStep("outline");
        onPptReadyChange?.(true);
      } catch (e) {
        console.error("Failed to build plan from outline", e);
        alert(e instanceof Error ? e.message : tr("大纲转计划失败，请重试。", "Failed to build plan from outline. Please retry."));
        setCreationStep("idle");
      } finally {
        setProgress({ current: 0, total: 0, message: "" });
      }
  };
  const handleGenerateOutline = async () => {
    if (!ideaInput.trim()) return;
    
    resetGenerationState();
    setCreationStep('input'); // Keep input visible but loading
    setProgress({ current: 0, total: 0, message: tr("正在解析参考素材...", "Preparing reference assets...") });
    
    try {
        const referenceVisualAssets = await buildReferenceVisualAssetsWithCaptions();
        setProgress({ current: 0, total: 0, message: tr("正在生成大纲...", "Generating outline...") });
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
        const autoMaterial = buildSlideMaterialsFromAutoLabels(pages, slides, referenceVisualAssets);
        setSlideMaterials(autoMaterial.nextMaterials);
        setLocalSlides(autoMaterial.nextSlides);
        setCreationStep('outline');
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
        setCreationStep("idle");
    } finally {
        setProgress({ current: 0, total: 0, message: "" });
    }
  };

  const handleGenerateFullPpt = async () => {
    setCreationStep('generating_images');
    
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
        setProgress({ current: 0, total: pages.length, message: tr("正在生成幻灯片...", "Generating slides...") });

        const imageCounter = { done: 0 };
        const imageTasks = pages.map((_, i) => async () => {
             try {
                 const imageUrl = await pptService.generatePageImage(
                  pages[i],
                  uiLang as "zh" | "en",
                  templateImage || undefined,
                  getSlideMaterialImageRefs(pages[i].id || `slide-${i + 1}`)
                );
                 if (imageUrl) {
                     const slideId = localSlides[i]?.id || `slide-${i}`;
                     pushImageVersion(slideId, imageUrl, 'generated');
                 }
             } catch (e) {
                 console.error(`Failed to generate image for slide ${i}`, e);
             } finally {
                 imageCounter.done += 1;
                 setProgress(prev => ({
                     ...prev,
                     current: imageCounter.done,
                     message: tr(`正在生成幻灯片... (${imageCounter.done}/${pages.length})`, `Generating slides... (${imageCounter.done}/${pages.length})`)
                 }));
             }
        });

        await runInParallel(imageTasks, MODEL_CONCURRENCY);

        setCreationStep('done');
        onPptReadyChange?.(true);

    } catch (e) {
        console.error("Full generation failed", e);
        alert(tr("生成过程中出错。", "An error occurred during generation."));
        setCreationStep('done'); // Allow viewing what's done
        onPptReadyChange?.(true);
    }
  };

  const handleGenerateImagesOnly = async () => {
      if (localSlides.length === 0) return;
      setCreationStep('generating_images');
      setProgress({ current: 0, total: localSlides.length, message: tr("正在生成幻灯片...", "Generating slides...") });

      const pages: PptPage[] = localSlides.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content || [],
          description: s.description,
          status: "description_generated"
      }));

      const imageCounter = { done: 0 };
      const imageTasks = pages.map((_, i) => async () => {
          try {
              const imageUrl = await pptService.generatePageImage(
                pages[i],
                uiLang as "zh" | "en",
                templateImage || undefined,
                getSlideMaterialImageRefs(pages[i].id || `slide-${i + 1}`)
              );
              if (imageUrl) {
                  pushImageVersion(pages[i].id || `slide-${i}`, imageUrl, 'generated');
              }
          } catch (e) {
              console.error(`Failed to generate image for slide ${i}`, e);
          } finally {
              imageCounter.done += 1;
              setProgress(prev => ({
                  ...prev,
                  current: imageCounter.done,
                  message: tr(`正在生成幻灯片... (${imageCounter.done}/${pages.length})`, `Generating slides... (${imageCounter.done}/${pages.length})`)
              }));
          }
      });

      try {
          await runInParallel(imageTasks, MODEL_CONCURRENCY);
          setCreationStep('done');
          onPptReadyChange?.(true);
      } catch (e) {
          console.error("Image-only generation failed", e);
          setCreationStep('done');
          onPptReadyChange?.(true);
      }
  };

  const handleGenerateAiImage = async () => {
    if (!currentSlide) return;
    
    setIsGeneratingImage(true);
    try {
        // Use the service logic if description exists, otherwise fallback
        let imageUrl: string | null = null;
        
        if (currentSlide.description) {
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
              getSlideMaterialImageRefs(currentSlide.id || `slide-${pageIndex + 1}`)
            );
        } else {
             // Fallback to simple prompt
             const prompt = `Design a presentation slide. Title: "${currentSlide.title}". Content: ${(currentSlide.content || []).join('; ')}. Style: Professional, Modern.`;
             imageUrl = await generateImage({
                prompt: prompt,
                referenceImageUrl: templateImage || undefined
            });
        }

        if (imageUrl) {
            const slideId = currentSlide.id || `slide-${currentSlideIndex + 1}`;
            pushImageVersion(slideId, imageUrl, 'generated');
        }
    } catch (e) {
        console.error("Failed to generate slide image", e);
    } finally {
        setIsGeneratingImage(false);
    }
  };

  const handleAddSlideToChat = (slide: SlideData) => {
    if (onAddToChat) {
        const slideId = slide.id || `slide-${currentSlideIndex + 1}`;
        const currentVersion = currentImageVersionId[slideId];
        const versions = imageVersions[slideId] || [];
        const imageUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[slideId];
        const materialImages = (slideMaterials[slideId] || []).map((x) => ({
          name: x.name,
          url: x.dataUrl,
          caption: x.caption || "",
          sourceFileName: x.sourceFileName || "",
          sourcePage: typeof x.sourcePage === "number" ? x.sourcePage : undefined,
          refLabel: x.refLabel || "",
        }));
        onAddToChat(JSON.stringify({ ...slide, imageUrl, materialImages }, null, 2), `${slideId}.json`);
    }
  };

  const handleDownloadPpt = async () => {
    if (isExporting) return;
    setIsExporting("pptx");
    try {
        const pages: PptPage[] = activeSlides.map(s => ({
            id: s.id,
            title: s.title,
            content: s.content,
            status: 'completed'
        }));
        const images: Record<string, string> = {};
        for (const s of activeSlides) {
            const versions = imageVersions[s.id] || [];
            const currentVersion = currentImageVersionId[s.id];
            const currentUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[s.id];
            if (currentUrl) images[s.id] = currentUrl;
        }
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
        const pages: PptPage[] = activeSlides.map(s => ({
            id: s.id,
            title: s.title,
            content: s.content,
            status: 'completed'
        }));
        const images: Record<string, string> = {};
        for (const s of activeSlides) {
            const versions = imageVersions[s.id] || [];
            const currentVersion = currentImageVersionId[s.id];
            const currentUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[s.id];
            if (currentUrl) images[s.id] = currentUrl;
        }
        await pptService.exportPdf(pages, images, `presentation-${Date.now()}`);
    } catch (e) {
        console.error("Export failed", e);
        alert(tr("导出失败", "Export failed"));
    } finally {
        setIsExporting(null);
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
    }
    setLocalSlides([]);
    resetGenerationState();
    setCreationStep("idle");
    setIdeaInput("");
    setOutlineInput("");
    setBeautifyRequirement("");
    setBeautifyUseTemplate(false);
    setBeautifyFile(null);
    setBeautifyFailures({});
    setReferenceUploadFiles([]);
    setSlideMaterials({});
    setMaterialPickerSlideId(null);
    setTemplateImage(null);
    setSelectedTemplateId(null);
    setProgress({ current: 0, total: 0, message: "" });
  };

  const handleBackToStart = () => {
    setBackConfirmOpen(true);
  };

  const handleBackToInputFromOutline = () => {
    setLocalSlides([]);
    setSlideMaterials({});
    resetGenerationState();
    setCreationStep("idle");
  };

  const createOutlineSlide = (displayIndex: number): SlideData => ({
    id: `slide-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: tr(`第 ${displayIndex + 1} 页`, `Slide ${displayIndex + 1}`),
    content: [],
    description: "",
    note: "",
    layout: "",
  });

  const handleAddOutlineSlide = (afterIndex?: number) => {
    setLocalSlides((prev) => {
      const insertAt = typeof afterIndex === "number"
        ? Math.max(0, Math.min(afterIndex + 1, prev.length))
        : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, createOutlineSlide(insertAt));
      return next;
    });
  };

  const handleDeleteOutlineSlide = (slideId: string) => {
    setLocalSlides((prev) => prev.filter((s) => s.id !== slideId));
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
                                <input type="file" accept="image/*" multiple className="hidden" onChange={handleTemplateUploadInputChange} />
                            </label>
                            <button
                              type="button"
                              onClick={() => setTemplateGeneratorOpen(true)}
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
                                    onClick={() => void setTemplateFromItem(t)}
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
                                            deleteTemplate(t);
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

                    {/* Mode Selection & Input */}
                    <div className="space-y-4">
                        <label className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs flex items-center justify-center font-bold">2</span>
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
                                {creationMode === "beautify" ? <Sparkles className="w-4 h-4 text-blue-600" /> : <Lightbulb className="w-4 h-4 text-amber-500" />}
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
                        onClick={creationMode === "beautify" ? handleStartBeautify : creationMode === "idea" ? handleGenerateOutline : handleLoadOutline}
                        disabled={Boolean(progress.message) || (creationMode === "beautify" ? !beautifyFile : isParsingReferenceFiles || (creationMode === "idea" ? !ideaInput.trim() : !outlineInput.trim()))}
                        className="w-full py-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {progress.message ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
                        {progress.message || (creationMode === "beautify" ? tr("开始渲染", "Start rendering") : creationMode === "idea" ? tr("开始生成大纲", "Generate outline") : tr("载入大纲", "Load outline"))}
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

                <Dialog open={templateGeneratorOpen} onOpenChange={setTemplateGeneratorOpen}>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{tr("AI生成模板", "AI Template Generator")}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {tr("生成的模板会自动加入模板列表，可随时删除。", "Generated templates will be added to the template list automatically and can be deleted anytime.")}
                            </div>
                            <Textarea
                              value={templateGeneratorRequirement}
                              onChange={(e) => setTemplateGeneratorRequirement(e.target.value)}
                              placeholder={tr(
                                "例如：科技感、深色背景、蓝紫渐变、玻璃拟态、留白充足；不要出现任何文字。",
                                "e.g. Futuristic, dark background, blue-purple gradient, glassmorphism, generous whitespace; no text."
                              )}
                              className="min-h-[140px]"
                              disabled={templateGeneratorIsGenerating}
                            />
                            <div className="flex justify-end gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => setTemplateGeneratorOpen(false)}
                                  disabled={templateGeneratorIsGenerating}
                                >
                                  {tr("取消", "Cancel")}
                                </Button>
                                <Button
                                  type="button"
                                  onClick={handleGenerateTemplate}
                                  disabled={templateGeneratorIsGenerating || !templateGeneratorRequirement.trim()}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  {templateGeneratorIsGenerating ? (
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
                                          const newSlides = [...localSlides];
                                          newSlides[i].title = e.target.value;
                                          setLocalSlides(newSlides);
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
                                      const newSlides = [...localSlides];
                                      newSlides[i].content = lines;
                                      setLocalSlides(newSlides);
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
                                        const newSlides = [...localSlides];
                                        newSlides[i].layout = e.target.value;
                                        setLocalSlides(newSlides);
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
                                        const newSlides = [...localSlides];
                                        newSlides[i].note = e.target.value;
                                        setLocalSlides(newSlides);
                                      }}
                                      className="w-full h-20 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：这一页强调三个关键点；讲解时先抛出问题再给答案。", "e.g. Emphasize three key points; start with a question, then answer it.")}
                                    />
                                  </div>
                                  <div className="relative">
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("画面描述（description，用于生图）", "Visual description (description)")}</div>
                                    <div
                                      ref={(el) => {
                                        descriptionEditorRefs.current[slide.id] = el;
                                        if (el) renderDescriptionEditor(slide.id, slide.description || "");
                                      }}
                                      contentEditable
                                      suppressContentEditableWarning
                                      onFocus={() => {
                                        descriptionEditorFocusedRef.current = slide.id;
                                      }}
                                      onBlur={() => {
                                        descriptionEditorFocusedRef.current = null;
                                        const nextValue = parseDescriptionEditor(slide.id);
                                        descriptionEditorAppliedRef.current[slide.id] = nextValue;
                                        const newSlides = [...localSlides];
                                        newSlides[i].description = nextValue;
                                        setLocalSlides(newSlides);
                                      }}
                                      onInput={() => {
                                        const nextValue = parseDescriptionEditor(slide.id);
                                        descriptionEditorAppliedRef.current[slide.id] = nextValue;
                                        const newSlides = [...localSlides];
                                        newSlides[i].description = nextValue;
                                        setLocalSlides(newSlides);
                                      }}
                                      onKeyDown={(e) => {
                                        if (materialPickerSlideId === slide.id && (slideMaterials[slide.id] || []).length > 0) {
                                          const list = slideMaterials[slide.id] || [];
                                          const len = list.length;
                                          if (e.key === "ArrowDown") {
                                            e.preventDefault();
                                            setMaterialPickerActiveIndex((prev) => (prev + 1) % len);
                                            return;
                                          }
                                          if (e.key === "ArrowUp") {
                                            e.preventDefault();
                                            setMaterialPickerActiveIndex((prev) => (prev - 1 + len) % len);
                                            return;
                                          }
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            const idx = Math.max(0, Math.min(materialPickerActiveIndex, len - 1));
                                            const picked = list[idx];
                                            if (picked) {
                                              insertMaterialTokenToSlideDescription(i, slide.id, picked.name);
                                            }
                                            return;
                                          }
                                        }
                                        if (e.key === "Escape") {
                                          setMaterialPickerSlideId(null);
                                          setMaterialPickerPos(null);
                                          setMaterialPickerActiveIndex(0);
                                          materialPickerReplaceRangeRef.current = null;
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
                                          openMaterialPickerAtCaret(slide.id);
                                        }
                                      }}
                                      className="w-full min-h-[96px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      data-placeholder={tr("例如：科技感蓝色渐变背景，中间是 AI 芯片与电路纹理，留白清晰。", "e.g. Futuristic blue gradient background, abstract AI chip and circuit textures, clean whitespace.")}
                                    />
                                    {materialPickerSlideId === slide.id && (slideMaterials[slide.id] || []).length > 0 && (
                                      <div
                                        ref={materialPickerRef}
                                        className="absolute z-20 w-56 rounded-md border border-border bg-popover p-2 shadow-sm"
                                        style={{ left: materialPickerPos?.left ?? 8, top: materialPickerPos?.top ?? 8 }}
                                      >
                                        <div className="max-h-56 space-y-1 overflow-y-auto">
                                          {(slideMaterials[slide.id] || []).map((img, idx) => (
                                          <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => insertMaterialTokenToSlideDescription(i, slide.id, img.name)}
                                            onMouseEnter={() => setMaterialPickerActiveIndex(idx)}
                                            title={tr(`插入第 ${idx + 1} 张素材`, `Insert material ${idx + 1}`)}
                                            className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                                              materialPickerActiveIndex === idx
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
                                        onClick={() => slideMaterialInputRefs.current[slide.id]?.click()}
                                        title={tr("上传素材图片", "Upload material images")}
                                        className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
                                      >
                                        <Upload className="h-3.5 w-3.5" />
                                        {tr("上传", "Upload")}
                                      </button>
                                      <input
                                        ref={(el) => {
                                          slideMaterialInputRefs.current[slide.id] = el;
                                        }}
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          const files = Array.from(e.target.files || []);
                                          e.target.value = "";
                                          void addSlideMaterialImages(slide.id, files);
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
                                              onClick={() => setMaterialPreview({ open: true, slideTitle: slide.title, item: img })}
                                              title={tr("点击查看素材", "Click to preview material")}
                                            >
                                              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setMaterialPreview({ open: true, slideTitle: slide.title, item: img });
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
                                                  removeSlideMaterialImage(slide.id, img.id);
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
                                              onClick={() => setMaterialPreview({ open: true, slideTitle: slide.title, item: img })}
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
                  open={materialPreview.open}
                  onOpenChange={(open) => setMaterialPreview((prev) => ({ ...prev, open }))}
                >
                  <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
                    </DialogHeader>
                    {materialPreview.item && (
                      <div className="space-y-3">
                        <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                          <img
                            src={materialPreview.item.dataUrl}
                            alt={materialPreview.item.name}
                            className="block max-h-full max-w-full object-scale-down"
                          />
                        </div>
                        <div className="grid gap-1 text-xs text-muted-foreground">
                          <div>{tr("所在幻灯片", "Slide")}: {materialPreview.slideTitle || "-"}</div>
                          <div>{tr("素材编号", "Material label")}: {materialPreview.item.name}</div>
                          {materialPreview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materialPreview.item.refLabel}</div> : null}
                          {materialPreview.item.caption ? <div>{tr("简短说明", "Caption")}: {materialPreview.item.caption}</div> : null}
                          {materialPreview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materialPreview.item.sourceFileName}</div> : null}
                          {typeof materialPreview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materialPreview.item.sourcePage}</div> : null}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(materialPreview.item!.dataUrl, "_blank", "noopener,noreferrer")}
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
  if (creationStep === 'generating_content' || creationStep === 'generating_images') {
      const progressRatio = progress.total > 0 ? progress.current / progress.total : 0;
      const clampedRatio = Math.max(0, Math.min(1, progressRatio));
      const dash = clampedRatio * 251.2;
      const percent = Math.round(clampedRatio * 100);
      return (
        <div className="w-full h-full bg-zinc-50 dark:bg-zinc-900 flex flex-col overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-md bg-white dark:bg-zinc-800 p-8 rounded-xl shadow-lg text-center space-y-6">
                <div className="relative w-20 h-20 mx-auto">
                    <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle className="text-zinc-200 dark:text-zinc-700 stroke-current" strokeWidth="8" cx="50" cy="50" r="40" fill="transparent"></circle>
                        <circle className="text-blue-600 stroke-current transition-all duration-300 ease-in-out origin-center -rotate-90" strokeWidth="8" strokeLinecap="round" cx="50" cy="50" r="40" fill="transparent" strokeDasharray={`${dash} 251.2`}></circle>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                        {percent}%
                    </div>
                </div>
                
                <div className="space-y-2">
                    <h3 className="font-semibold text-lg">{tr("AI 正在创作中", "AI is creating")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {progress.message || tr("正在渲染图片…", "Rendering images...")}
                    </p>
                </div>
                
                <div className="flex justify-center gap-2 text-xs text-muted-foreground">
                   <div className={`flex items-center gap-1 ${creationStep === 'generating_images' ? 'text-blue-600' : 'text-green-600'}`}>
                        {creationStep === 'generating_images' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>{tr("渲染图片", "Render images")}</span>
                   </div>
                </div>
              </div>
            </div>
        </div>
      );
  }

  // Regular View (creationStep === 'done' or manually provided data)
  return (
    <div className="w-full h-full bg-zinc-100 dark:bg-zinc-900 flex flex-col">
      {/* Toolbar */}
      <div className="h-14 px-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-4">
            <h2 className="font-semibold text-sm text-foreground">{tr("PPT 演示文稿", "PPT Deck")}</h2>
            <div className="h-4 w-px bg-border"></div>
            <button
                onClick={handleBackToStart}
                title={tr("返回开始", "Back to start")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回开始", "Back")}</span>
            </button>
            <button
                onClick={openSlideshow}
                disabled={activeSlides.length === 0}
                title={tr("播放幻灯片", "Play slideshow")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <Play className="w-3.5 h-3.5" />
                <span>{tr("播放", "Play")}</span>
            </button>
            <div className="h-4 w-px bg-border"></div>
            <button 
                onClick={handleDownloadPpt}
                disabled={activeSlides.length === 0 || !!isExporting}
                title={tr("导出 PPTX", "Export PPTX")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pptx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pptx" ? tr("导出中…", "Exporting...") : tr("导出 PPTX", "Export PPTX")}</span>
            </button>
            <button 
                onClick={handleDownloadPdf}
                disabled={activeSlides.length === 0 || !!isExporting}
                title={tr("导出 PDF", "Export PDF")}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pdf" ? tr("导出中…", "Exporting...") : tr("导出 PDF", "Export PDF")}</span>
            </button>
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
            <span>{activeSlides.length > 0 ? tr(`第 ${currentSlideIndex + 1} / ${activeSlides.length} 页`, `Slide ${currentSlideIndex + 1} / ${activeSlides.length}`) : tr("空文档", "Empty")}</span>
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-64 bg-zinc-50 dark:bg-zinc-900 border-r border-border overflow-y-auto p-4 space-y-4">
          {activeSlides.map((slide, index) => {
            const hasGeneratedImage = generatedImages[slide.id || index];
            const slideFailure = beautifyFailures[slide.id];
            return (
            <ContextMenu key={slide.id || index}>
                <ContextMenuTrigger>
                    <div 
                    onClick={() => setCurrentSlideIndex(index)}
                    className={`cursor-pointer border-2 rounded-lg overflow-hidden relative aspect-[16/9] group transition-all duration-200 ${
                        currentSlideIndex === index 
                        ? 'border-blue-600 shadow-md scale-[1.02]' 
                        : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-800 shadow-sm'
                    }`}
                    >
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
                    {/* Thumbnail Preview */}
                    {hasGeneratedImage ? (
                        <img src={hasGeneratedImage} className="w-full h-full object-cover" alt={`Slide ${index + 1}`} />
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
                    {slideFailure ? (
                      <div
                        className="absolute top-1 right-1 bg-red-600/90 text-white text-[10px] px-1.5 py-0.5 rounded-sm max-w-[85%] truncate"
                        title={slideFailure}
                      >
                        {tr("美化失败", "Beautify failed")}
                      </div>
                    ) : null}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleAddSlideToChat(slide)} className="gap-2">
                        <MessageSquarePlus className="w-4 h-4" />
                        <span>{tr("把此页添加到对话", "Add this slide to chat")}</span>
                    </ContextMenuItem>
                </ContextMenuContent>
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
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleGenerateAiImage}
              disabled={!currentSlide || isGeneratingImage}
            >
              {isGeneratingImage ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {tr("重新渲染本页", "Regenerate this slide")}
            </Button>
            {currentSlide && (imageVersions[currentSlide.id] || []).length > 0 && (
              <select
                className="h-7 text-xs rounded-md border border-input bg-background px-2"
                value={currentImageVersionId[currentSlide.id] || (imageVersions[currentSlide.id] || [])[0]?.id}
                onChange={(e) => {
                  const slideId = currentSlide.id;
                  const versionId = e.target.value;
                  const versions = imageVersions[slideId] || [];
                  const v = versions.find(x => x.id === versionId);
                  if (v) {
                    setCurrentImageVersionId(prev => ({ ...prev, [slideId]: versionId }));
                    setGeneratedImages(prev => ({ ...prev, [slideId]: v.url }));
                  }
                }}
              >
                {(imageVersions[currentSlide.id] || []).map((v, idx) => (
                  <option key={v.id} value={v.id}>
                    {idx + 1} 路 {new Date(v.timestamp).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>
          {currentSlideFailure ? (
            <div className="absolute top-16 left-4 z-30 max-w-[520px] rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-xs text-red-700 shadow-sm">
              <span className="font-medium mr-1">{tr("本页美化失败：", "Slide beautify failed:")}</span>
              <span>{currentSlideFailure}</span>
            </div>
          ) : null}
          {currentSlide ? (
             <ContextMenu>
                <ContextMenuTrigger className="outline-none">
                    <div 
                        className="relative w-full max-w-[1100px] bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col transition-transform duration-300"
                        style={{ aspectRatio: "16/9" }}
                    >
                        {/* Display either generated image or DOM layout */}
                        {currentSlideImage ? (
                            <img src={currentSlideImage} className="w-full h-full object-contain bg-white" alt="AI Generated Slide" />
                        ) : (
                            <div className="w-full h-full p-12 flex flex-col relative">
                                {/* Background Template */}
                                {templateImage && (
                                    <img src={templateImage} className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none" alt="Template" />
                                )}

                                {/* Slide Content */}
                                <div className="relative z-10 h-full flex flex-col">
                                    <h1 className="text-4xl font-bold mb-8 text-zinc-900 border-b-4 border-blue-600 pb-4 w-fit pr-12">
                                        {currentSlide.title}
                                    </h1>
                                    <div className="flex-1 space-y-6">
                                        {(currentSlide.content || []).map((point, i) => (
                                            <div key={i} className="flex gap-4 text-2xl text-zinc-700 leading-relaxed items-start">
                                                <span className="text-blue-600 mt-2">•</span>
                                                <span>{point}</span>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {/* Footer/Note Placeholder */}
                                    <div className="mt-auto pt-8 flex justify-between text-sm text-zinc-400 border-t border-zinc-100">
                                        <span>Generated by Unified AI Workspace</span>
                                        <span>{currentSlideIndex + 1}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
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
                <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleAddSlideToChat(currentSlide)} className="gap-2">
                        <MessageSquarePlus className="w-4 h-4" />
                        <span>把此页添加到对话</span>
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center">
              <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
              <p>{tr("暂无幻灯片", "No slides yet")}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={slideshowOpen} onOpenChange={(open) => (open ? setSlideshowOpen(true) : closeSlideshow())}>
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-black/95 border-none">
          <div ref={slideshowRootRef} className="w-full h-full flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between text-white/90 bg-black/50 backdrop-blur-sm z-50">
            <div className="text-sm font-medium">
              {activeSlides.length > 0 ? `${uiLang === "zh" ? "第" : "Slide "}${slideshowIndex + 1} / ${activeSlides.length}${uiLang === "zh" ? " 页" : ""}` : ""}
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                title={slideshowFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("进入全屏", "Enter fullscreen")}
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={() => {
                  if (slideshowFullscreen) {
                    void exitSlideshowFullscreen();
                  } else {
                    void enterSlideshowFullscreen();
                  }
                }}
              >
                {slideshowFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                {slideshowFullscreen ? tr("退出全屏", "Exit fullscreen") : tr("全屏", "Fullscreen")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={closeSlideshow}
              >
                <X className="w-4 h-4" />
                {tr("退出", "Close")}
              </Button>
            </div>
          </div>
          
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden bg-black/90">
            {activeSlides[slideshowIndex] ? (
              <div className="relative w-full h-full flex items-center justify-center">
                  <div 
                    className="relative bg-white shadow-2xl overflow-hidden rounded-lg mx-auto"
                    style={{
                      width: getSlideshowDimensions().width,
                      height: getSlideshowDimensions().height
                    }}
                  >
                  {getSlideImageUrl(activeSlides[slideshowIndex].id) ? (
                    <img
                      src={getSlideImageUrl(activeSlides[slideshowIndex].id)}
                      className="w-full h-full object-contain bg-black"
                      alt="Slide"
                    />
                  ) : (
                    <div className="w-full h-full p-16 flex flex-col">
                      <h1 className="text-5xl font-bold mb-12 text-zinc-900 border-b-4 border-blue-600 pb-6 w-fit pr-16">
                        {activeSlides[slideshowIndex].title}
                      </h1>
                      <div className="flex-1 space-y-8">
                        {(activeSlides[slideshowIndex].content || []).map((point, i) => (
                          <div key={i} className="flex gap-6 text-3xl text-zinc-700 leading-relaxed items-start">
                            <span className="text-blue-600 mt-2">•</span>
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-auto pt-8 flex justify-between text-lg text-zinc-400 border-t border-zinc-100">
                        <span>Generated by Unified AI Workspace</span>
                        <span>{slideshowIndex + 1}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="h-20 px-4 flex items-center justify-center gap-8 pb-4">
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={() => setSlideshowIndex((v) => (v - 1 + activeSlides.length) % activeSlides.length)}
              disabled={activeSlides.length <= 1}
            >
              <ArrowLeft className="w-6 h-6" />
            </Button>
            <div className="text-white/50 text-sm font-medium">
                {slideshowIndex + 1} / {activeSlides.length}
            </div>
            <Button
              variant="outline"
              size="lg"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full w-12 h-12 p-0"
              onClick={() => setSlideshowIndex((v) => (v + 1) % activeSlides.length)}
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
        open={materialPreview.open}
        onOpenChange={(open) => setMaterialPreview((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="w-[92vw] max-w-[92vw] max-h-[92vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{tr("素材预览", "Material preview")}</DialogTitle>
          </DialogHeader>
          {materialPreview.item && (
            <div className="space-y-3">
              <div className="h-[72vh] min-h-[360px] w-full overflow-auto rounded-lg border bg-muted/20 flex items-center justify-center">
                <img
                  src={materialPreview.item.dataUrl}
                  alt={materialPreview.item.name}
                  className="block max-h-full max-w-full object-scale-down"
                />
              </div>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <div>{tr("所在幻灯片", "Slide")}: {materialPreview.slideTitle || "-"}</div>
                <div>{tr("素材编号", "Material label")}: {materialPreview.item.name}</div>
                {materialPreview.item.refLabel ? <div>{tr("来源标签", "Reference label")}: {materialPreview.item.refLabel}</div> : null}
                {materialPreview.item.caption ? <div>{tr("简短说明", "Caption")}: {materialPreview.item.caption}</div> : null}
                {materialPreview.item.sourceFileName ? <div>{tr("来源文件", "Source file")}: {materialPreview.item.sourceFileName}</div> : null}
                {typeof materialPreview.item.sourcePage === "number" ? <div>{tr("来源页码", "Source page")}: {materialPreview.item.sourcePage}</div> : null}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(materialPreview.item!.dataUrl, "_blank", "noopener,noreferrer")}
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


