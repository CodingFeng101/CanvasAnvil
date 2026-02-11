import React, { useState, useEffect, useRef } from 'react';
import { motion } from "framer-motion";
import { generateImage } from '@/lib/ai-client';
import { pptService, PptPage } from '@/lib/ppt-service';
import { getTemplateGenerationPrompt } from '@/lib/ppt-prompts';
import { Loader2, Plus, Image as ImageIcon, MessageSquarePlus, Upload, Presentation, Sparkles, Check, Play, FileText, Download, Lightbulb, X, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/workspaces/ppt/ui/context-menu";
import { Button } from "@/workspaces/ppt/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/workspaces/ppt/ui/dialog";
import { Textarea } from "@/workspaces/ppt/ui/textarea";
import { useUiLanguage } from "@/lib/use-ui-language";

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

interface PptWorkspaceProps {
  data?: PptData;
  onAddToChat?: (json: string, name: string) => void;
  onPptReadyChange?: (ready: boolean) => void;
  onPptStageChange?: (stage: "outline" | "slides") => void;
  incomingEdit?: { id: string; payload: string } | null;
  onIncomingEditHandled?: (id: string) => void;
  onResetWorkspace?: () => void;
}

type CreationStep = 'idle' | 'input' | 'outline' | 'generating_content' | 'generating_images' | 'done';
type CreationMode = 'idea' | 'outline' | 'description' | 'beautify';
type ReferenceFile = { id: string; filename: string; content: string; charCount: number };

type PresetTemplate = { id: string; zhName: string; enName: string; path: string };
type UploadTemplate = { id: string; name: string; dataUrl: string };
type TemplateItem =
  | { id: string; name: string; kind: "preset"; previewSrc: string; presetPath: string }
  | { id: string; name: string; kind: "upload"; previewSrc: string; dataUrl: string };

const PPT_TEMPLATE_UPLOADS_KEY = "ppt_template_uploads_v1";
const PPT_TEMPLATE_HIDDEN_PRESETS_KEY = "ppt_template_hidden_presets_v1";
const PPT_WORKSPACE_STORAGE_KEY = "unified-ai-workspace-ppt-state-v1";

const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "preset-tech-business", zhName: "科技商务", enName: "Tech Business", path: "/templates/template_b.png" },
  { id: "preset-academic", zhName: "学术汇报", enName: "Academic", path: "/templates/template_academic.jpg" },
  { id: "preset-minimal", zhName: "极简主义", enName: "Minimal", path: "/templates/template_s.png" },
  { id: "preset-vector", zhName: "矢量插画", enName: "Vector Illustration", path: "/templates/template_vector_illustration.png" },
  { id: "preset-yellow", zhName: "活力黄", enName: "Vibrant Yellow", path: "/templates/template_y.png" },
  { id: "preset-glass", zhName: "磨砂玻璃", enName: "Frosted Glass", path: "/templates/template_glass.png" },
];

const MODEL_CONCURRENCY = 30;

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
    onPptStageChange?.(creationStep === "done" ? "slides" : "outline");
  }, [creationStep, onPptStageChange]);
  const [creationMode, setCreationMode] = useState<CreationMode>(() => {
    const v = initialPptState?.creationMode;
    return v === "idea" || v === "outline" || v === "description" || v === "beautify" ? v : "idea";
  });
  const [ideaInput, setIdeaInput] = useState(() => (typeof initialPptState?.ideaInput === "string" ? initialPptState.ideaInput : ""));
  const [outlineInput, setOutlineInput] = useState(() => (typeof initialPptState?.outlineInput === "string" ? initialPptState.outlineInput : ""));
  const [descriptionInput, setDescriptionInput] = useState(() => (typeof initialPptState?.descriptionInput === "string" ? initialPptState.descriptionInput : ""));
  const [beautifyRequirement, setBeautifyRequirement] = useState(() => (typeof initialPptState?.beautifyRequirement === "string" ? initialPptState.beautifyRequirement : ""));
  const [beautifyFile, setBeautifyFile] = useState<File | null>(null);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [isParsingReferenceFiles, setIsParsingReferenceFiles] = useState(false);
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false);
  const [referencePreviewFile, setReferencePreviewFile] = useState<ReferenceFile | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, message: "" });
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const beautifyFileInputRef = useRef<HTMLInputElement | null>(null);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [windowDimensions, setWindowDimensions] = useState({ width: 0, height: 0 });

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
    } catch {
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
          descriptionInput,
          beautifyRequirement,
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
    descriptionInput,
    beautifyRequirement,
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

  const addGeneratedTemplate = (dataUrl: string) => {
    const id = `generated-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = `${tr("AI模板", "AI Template")}-${Date.now()}`;
    const created: UploadTemplate = { id, name, dataUrl };
    setUploadedTemplates((prev) => [...prev, created]);
    setSelectedTemplateId(created.id);
    setTemplateImage(created.dataUrl);
  };

  const handleGenerateTemplate = async () => {
    const requirement = templateGeneratorRequirement.trim();
    if (!requirement) {
      alert(tr("请输入模板需求", "Please enter template requirements."));
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
      addGeneratedTemplate(imageUrl);
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

  useEffect(() => {
    if (data && data.slides && data.slides.length > 0) {
      setLocalSlides(data.slides);
      // Reset to first slide if new data comes in
      if (data.slides) {
          setCurrentSlideIndex(0);
      }
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

      const incomingSlides: any[] | null = Array.isArray(parsed?.slides)
          ? parsed.slides
          : Array.isArray(parsed)
              ? parsed
              : null;

      if (!incomingSlides || incomingSlides.length === 0) return;
      const uploadedImages: string[] = Array.isArray(parsed?.uploadedImages) ? parsed.uploadedImages : [];

      const mergedSlides: SlideData[] = (() => {
          const existing = localSlides.length > 0 ? [...localSlides] : [];
          const byId = new Map(existing.map((s) => [s.id, s] as const));
          const order: string[] = existing.map((s) => s.id);

          for (const inc of incomingSlides) {
              const id = String(inc?.id || "");
              if (!id) continue;
              const next: SlideData = {
                  id,
                  title: typeof inc?.title === "string" ? inc.title : (byId.get(id)?.title || tr("幻灯片", "Slide")),
                  content: Array.isArray(inc?.content) ? inc.content.map((x: any) => String(x)) : (byId.get(id)?.content || []),
                  description: typeof inc?.description === "string" ? inc.description : byId.get(id)?.description,
                  note: typeof inc?.note === "string" ? inc.note : byId.get(id)?.note,
                  layout: typeof inc?.layout === "string" ? inc.layout : byId.get(id)?.layout,
              };
              byId.set(id, next);
              if (!order.includes(id)) order.push(id);
          }

          return order.map((id) => byId.get(id)!).filter(Boolean);
      })();

      setLocalSlides(mergedSlides);
      const allowImageEdits = creationStep === 'done';

      const editTasks: Array<() => Promise<void>> = [];
      for (const inc of incomingSlides) {
          const id = String(inc?.id || "");
          if (!id) continue;
          const incomingImageUrl = typeof inc?.imageUrl === "string" ? inc.imageUrl : "";
          const instruction = typeof inc?.imageEditInstruction === "string"
              ? inc.imageEditInstruction
              : typeof inc?.instruction === "string"
                  ? inc.instruction
                  : "";

          const slide = mergedSlides.find((s) => s.id === id);
          if (!slide) continue;

          if (allowImageEdits && incomingImageUrl.trim()) {
              pushImageVersion(id, incomingImageUrl, 'edited', instruction.trim() ? instruction : undefined);
              continue;
          }

          if (!allowImageEdits || !instruction.trim()) continue;
          editTasks.push(async () => {
              const versions = imageVersions[id] || [];
              const currentVersion = currentImageVersionId[id];
              const currentUrl = currentVersion ? versions.find(v => v.id === currentVersion)?.url : generatedImages[id];
              if (!currentUrl) return;

              const page: PptPage = {
                  id,
                  title: slide.title,
                  content: slide.content || [],
                  description: slide.description
              };
              const editedUrl = await pptService.editPageImage(
                  page, 
                  instruction, 
                  currentUrl || undefined, 
                  templateImage || undefined,
                  uploadedImages
              );
              if (editedUrl) {
                  pushImageVersion(id, editedUrl, 'edited', instruction);
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

  useEffect(() => {
      if (!slideshowOpen) return;
      setSlideshowIndex(currentSlideIndex);
  }, [slideshowOpen]);

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

  const addReferenceFiles = async (files: File[]) => {
      if (!files.length) return;
      setIsParsingReferenceFiles(true);
      try {
          const { extractPdfText, extractTextFileContent, isPdfFile, isTextFile } = await import('@/lib/pdf-utils');
          const nextItems: ReferenceFile[] = [];

          for (const file of files) {
              try {
                  let content = "";
                  if (isPdfFile(file)) {
                      content = await extractPdfText(file);
                  } else if (isTextFile(file)) {
                      content = await extractTextFileContent(file);
                  } else {
                      continue;
                  }

                  const clipped = String(content || "").slice(0, 150000);
                  nextItems.push({
                      id: `ref-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                      filename: file.name,
                      content: clipped,
                      charCount: clipped.length
                  });
              } catch (e) {
                  console.error("Failed to parse reference file", file.name, e);
              }
          }

          if (nextItems.length > 0) {
              setReferenceFiles((prev) => [...prev, ...nextItems]);
          }
      } finally {
          setIsParsingReferenceFiles(false);
      }
  };

  const handleReferenceFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      e.target.value = "";
      await addReferenceFiles(files);
  };

  const openReferencePreview = (file: ReferenceFile) => {
      setReferencePreviewFile(file);
      setReferencePreviewOpen(true);
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
                      id: String(it.id || `slide-${i}`),
                      title: String(it.title || tr(`第 ${i + 1} 页`, `Slide ${i + 1}`)),
                      content: Array.isArray(it.content) ? it.content.map((x: any) => String(x)) : [],
                      description: typeof it.description === "string" ? it.description : undefined,
                      note: typeof it.note === "string" ? it.note : undefined,
                      layout: typeof it.layout === "string" ? it.layout : undefined
                  }));
              }
          } catch {
          }
      }

      const lines = trimmed.split(/\r?\n/);
      const slides: SlideData[] = [];
      let current: SlideData | null = null;

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
                  content: []
              };
              continue;
          }
          const bullet = l.match(/^[-•]\s+(.*)$/);
          if (bullet) {
              if (!current) {
                  current = { id: `slide-${slides.length + 1}`, title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`), content: [] };
              }
              current.content.push(bullet[1].trim());
              continue;
          }
          const desc = l.match(/^description[:：]\s*(.*)$/i);
          if (desc) {
              if (!current) {
                  current = { id: `slide-${slides.length + 1}`, title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`), content: [] };
              }
              current.description = desc[1].trim();
              continue;
          }
          const note = l.match(/^note[:：]\s*(.*)$/i);
          if (note) {
              if (!current) {
                  current = { id: `slide-${slides.length + 1}`, title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`), content: [] };
              }
              current.note = note[1].trim();
              continue;
          }
          const layout = l.match(/^layout[:：]\s*(.*)$/i);
          if (layout) {
              if (!current) {
                  current = { id: `slide-${slides.length + 1}`, title: tr(`第 ${slides.length + 1} 页`, `Slide ${slides.length + 1}`), content: [] };
              }
              current.layout = layout[1].trim();
              continue;
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

  const isBeautifyPptxFile = (file: File) => {
    const name = String(file?.name || "").toLowerCase();
    return (
      file?.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      name.endsWith(".pptx")
    );
  };

  const sanitizeSlideHtml = (html: string) => {
    return String(html || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, "");
  };

  const renderHtmlToPngDataUrl = async (opts: { html: string; width: number; height: number; scale: number }) => {
    const html = sanitizeSlideHtml(opts.html);
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));
    const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${width} ${height}">
  <foreignObject x="0" y="0" width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#ffffff;">
      ${html}
    </div>
  </foreignObject>
</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      const loaded = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
      });
      img.src = url;
      await loaded;

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return "";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
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

  const extractPptxSlidesAsImages = async (file: File) => {
    const buf = await file.arrayBuffer();
    const { pptxToHtml } = await import("@jvmr/pptx-to-html");
    const slidesHtml = await pptxToHtml(buf, { width: 960, height: 540, scaleToFit: true, letterbox: true });
    const out: string[] = [];
    for (let i = 0; i < slidesHtml.length; i += 1) {
      setProgress({
        current: i,
        total: slidesHtml.length,
        message: tr(`正在解析 PPT... (${i}/${slidesHtml.length})`, `Parsing PPT... (${i}/${slidesHtml.length})`),
      });
      const dataUrl = await renderHtmlToPngDataUrl({ html: slidesHtml[i], width: 960, height: 540, scale: 2 });
      if (dataUrl && dataUrl.startsWith("data:image")) out.push(dataUrl);
    }
    setProgress({
      current: slidesHtml.length,
      total: slidesHtml.length,
      message: tr(`正在解析 PPT... (${slidesHtml.length}/${slidesHtml.length})`, `Parsing PPT... (${slidesHtml.length}/${slidesHtml.length})`),
    });
    return out;
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

  const handleStartBeautify = async () => {
    const file = beautifyFile;
    if (!file) return;

    resetGenerationState();
    setCreationStep("generating_content");
    setProgress({ current: 0, total: 0, message: tr("正在解析文件...", "Parsing file...") });

    try {
      const pageImages = isBeautifyPdfFile(file)
        ? await extractPdfPagesAsImages(file)
        : isBeautifyPptxFile(file)
          ? await extractPptxSlidesAsImages(file)
          : [];

      if (pageImages.length === 0) {
        alert(tr("未能解析出页面图片，请确认文件格式（.pptx 或 .pdf）", "Failed to extract pages. Please upload .pptx or .pdf."));
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
      const counter = { done: 0 };
      const tasks = slides.map((s, i) => async () => {
        try {
          const page: PptPage = { id: s.id, title: s.title, content: s.content || [], description: s.description || "" };
          const edited = await pptService.editPageImage(page, instruction, pageImages[i], templateImage || undefined);
          if (edited) pushImageVersion(s.id, edited, "edited", instruction);
        } catch (e) {
          console.error(`Beautify failed for slide ${i + 1}`, e);
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

      await runInParallel(tasks, MODEL_CONCURRENCY);
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

  const handleLoadOutline = () => {
      const slides = parseSlides(outlineInput);
      if (!slides || slides.length === 0) {
        alert(tr("未识别到大纲，请粘贴 JSON 数组或 Markdown 大纲。", "Outline not recognized. Paste a JSON array or a Markdown outline."));
          return;
      }
      resetGenerationState();
      setLocalSlides(slides);
      setCreationStep("outline");
      onPptReadyChange?.(true);
  };

  const handleLoadDescriptions = async () => {
      const slides = parseSlides(descriptionInput);
      resetGenerationState();

      if (slides && slides.length > 0) {
          setLocalSlides(slides);
          setCreationStep("outline");
          onPptReadyChange?.(true);
          return;
      }

      setCreationStep('input');
      setProgress({ current: 0, total: 0, message: tr("正在从描述生成大纲与画面...", "Generating outline and visuals from description...") });
      try {
          const pages = await pptService.generateSlidesFromDescription(descriptionInput);
          const nextSlides: SlideData[] = pages.map((p, i) => ({
              id: `slide-${i + 1}`,
              title: p.title,
              content: p.content,
              description: p.description,
              note: p.note,
              layout: p.layout
          }));
          setLocalSlides(nextSlides);
          setCreationStep("outline");
          onPptReadyChange?.(true);
      } catch (e) {
          console.error("Failed to generate slides from description", e);
          alert(tr("从描述生成失败，请重试或改为粘贴 JSON/Markdown。", "Failed to generate from description. Retry or paste JSON/Markdown." ));
          setCreationStep("idle");
      } finally {
          setProgress({ current: 0, total: 0, message: "" });
      }
  };

  const handleGenerateOutline = async () => {
    if (!ideaInput.trim()) return;
    
    resetGenerationState();
    setCreationStep('input'); // Keep input visible but loading
    setProgress({ current: 0, total: 0, message: tr("正在生成大纲...", "Generating outline...") });
    
    try {
        const pages = await pptService.generateOutline(ideaInput);
        if (!Array.isArray(pages) || pages.length === 0) {
            throw new Error("Invalid outline response");
        }
        const slides: SlideData[] = pages.map((p, i) => ({
            id: `slide-${i + 1}`,
            title: p.title,
            content: p.content,
            description: p.description,
            note: p.note,
            layout: p.layout
        }));
        setLocalSlides(slides);
        setCreationStep('outline');
        onPptReadyChange?.(true);
    } catch (e) {
        console.error("Failed to generate outline", e);
        const name = (e as any)?.name;
        const isAbort = name === "AbortError" || name === "APIUserAbortError";
        const msg = isAbort
          ? tr("生成大纲超时或被中断（120s）。请检查网络/模型可用性后重试。", "Outline generation timed out or was interrupted (120s). Check network/model availability and retry.")
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
    setCreationStep('generating_content');
    
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
        // 1. Generate Descriptions
        setProgress({ current: 0, total: pages.length, message: tr("正在生成页面内容描述...", "Generating slide content descriptions...") });
        
        // Parallel description generation
        const descCounter = { done: 0 };
        const descTasks = pages.map((_, i) => async () => {
            try {
                const result = await pptService.generatePageDescription(pages, i, ideaInput, referenceFiles);
                
                // Update local state immediately
                setLocalSlides(prev => {
                    const newSlides = [...prev];
                    const existing = newSlides[i];
                    const hasManualContent = Array.isArray(existing?.content)
                      ? existing.content.some((x) => String(x || "").trim())
                      : false;
                    const hasManualDescription = typeof existing?.description === "string" && existing.description.trim();
                    const hasManualNote = typeof existing?.note === "string" && existing.note.trim();
                    const hasManualLayout = typeof existing?.layout === "string" && existing.layout.trim();
                    newSlides[i] = {
                        ...existing,
                        content: hasManualContent ? (existing.content || []) : result.content,
                        description: hasManualDescription ? existing.description : result.description,
                        note: hasManualNote ? existing.note : result.note,
                        layout: hasManualLayout ? existing.layout : result.layout
                    };
                    return newSlides;
                });
                
                // Update pages array for next step
                pages[i].description = result.description;
                pages[i].content = result.content;
                pages[i].note = result.note;
                pages[i].layout = result.layout;
            } catch (e) {
                console.error(`Failed to generate description for slide ${i}`, e);
            } finally {
                descCounter.done += 1;
                setProgress(prev => ({
                    ...prev,
                    current: descCounter.done,
                    message: tr(`正在生成页面内容描述... (${descCounter.done}/${pages.length})`, `Generating slide content descriptions... (${descCounter.done}/${pages.length})`)
                }));
            }
        });

        await runInParallel(descTasks, MODEL_CONCURRENCY);

        // 2. Generate Images
        setCreationStep('generating_images');
        setProgress({ current: 0, total: pages.length, message: tr("正在生成页面渲染图...", "Rendering slide images...") });

        const imageCounter = { done: 0 };
        const imageTasks = pages.map((_, i) => async () => {
             try {
                 const imageUrl = await pptService.generatePageImage(pages[i], pages, templateImage || undefined);
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
                     message: tr(`正在生成页面渲染图... (${imageCounter.done}/${pages.length})`, `Rendering slide images... (${imageCounter.done}/${pages.length})`)
                 }));
             }
        });

        await runInParallel(imageTasks, MODEL_CONCURRENCY);

        setCreationStep('done');
        onPptReadyChange?.(true);

    } catch (e) {
        console.error("Full generation failed", e);
        alert(tr("生成过程中出错", "An error occurred during generation."));
        setCreationStep('done'); // Allow viewing what's done
        onPptReadyChange?.(true);
    }
  };

  const handleGenerateImagesOnly = async () => {
      if (localSlides.length === 0) return;
      setCreationStep('generating_images');
      setProgress({ current: 0, total: localSlides.length, message: tr("正在生成页面渲染图...", "Rendering slide images...") });

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
              const imageUrl = await pptService.generatePageImage(pages[i], pages, templateImage || undefined);
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
                  message: tr(`正在生成页面渲染图... (${imageCounter.done}/${pages.length})`, `Rendering slide images... (${imageCounter.done}/${pages.length})`)
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
            imageUrl = await pptService.generatePageImage(pages[pageIndex], pages, templateImage || undefined);
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
        onAddToChat(JSON.stringify({ ...slide, imageUrl }, null, 2), `${slideId}.json`);
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

  const handleBackToStart = () => {
    const confirmed = window.confirm(
      tr(
        "返回开始将清空当前 PPT（建议先导出保存）。是否继续？",
        "Restart will clear the current deck (export first if needed). Continue?"
      )
    );
    if (!confirmed) return;
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
    setDescriptionInput("");
    setBeautifyRequirement("");
    setBeautifyFile(null);
    setReferenceFiles([]);
    setTemplateImage(null);
    setSelectedTemplateId(null);
    setProgress({ current: 0, total: 0, message: "" });
  };

  // Render Creation Wizard
  if (activeSlides.length === 0 && (creationStep === 'idle' || creationStep === 'input' || creationStep === 'done')) {
      const tabs = [
        { id: 'idea', label: tr('想法', 'Idea') },
        { id: 'outline', label: tr('大纲', 'Outline') },
        { id: 'description', label: tr('描述', 'Description') },
        { id: 'beautify', label: tr('PPT美化', 'Beautify') },
      ];
      const modeCopy = (() => {
          if (creationMode === "outline") {
              return {
                  hint: tr("已有大纲？直接粘贴即可快速生成，AI 将自动切分为结构化大纲", "Have an outline? Paste it and AI will structure it into slides."),
                  placeholder: tr(
                    "粘贴你的 PPT 大纲…\n\n例如：\n第一部分：AI 的起源\n- 1950 年代的开端\n- 达特茅斯会议\n\n第二部分：发展历程\n- 专家系统\n- 深度学习\n…",
                    "Paste your PPT outline…\n\nExample:\nPart 1: Origins of AI\n- Early beginnings in the 1950s\n- Dartmouth workshop\n\nPart 2: Evolution\n- Expert systems\n- Deep learning\n…"
                  )
              };
          }
          if (creationMode === "beautify") {
              return {
                  hint: tr("上传 PPT/PDF，输入美化要求，然后并发渲染每一页", "Upload PPT/PDF, enter requirements, then beautify each page in parallel."),
                  placeholder: tr(
                    "例如：整体更高级、留白更充足、标题更醒目、配色更统一、增强对比度；保持原文案不变。",
                    "e.g. More premium look, more whitespace, stronger title hierarchy, unified palette, higher contrast; keep all original text unchanged."
                  )
              };
          }
          if (creationMode === "description") {
              return {
                  hint: tr("已有完整描述？AI 将自动解析出大纲并切分为每页描述，直接生成图片", "Have a full description? AI will split it into slides and render images."),
                  placeholder: tr(
                    "粘贴你的完整页面描述…\n\n例如：\n第 1 页\n标题：人工智能的诞生\n内容：1950 年，图灵提出“图灵测试”…\n\n第 2 页\n标题：AI 的发展历程\n内容：1950 年代：符号主义…\n…",
                    "Paste your full slide-by-slide description…\n\nExample:\nSlide 1\nTitle: The birth of AI\nContent: In 1950, Alan Turing proposed the Turing Test…\n\nSlide 2\nTitle: The evolution of AI\nContent: 1950s: symbolic approaches…\n…"
                  )
              };
          }
          return {
              hint: tr("输入你的想法，AI 将为你生成完整的 PPT", "Describe your idea and AI will generate a full deck."),
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
                            accept=".pdf,text/*,.txt,.md,.markdown,.json,.csv,.xml,.yaml,.yml"
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
                                  accept=".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                  className="hidden"
                                  onChange={handleBeautifyFileInputChange}
                                />

                                <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tr("上传 PPT/PDF", "Upload PPT/PDF")}</div>
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
                                        value={creationMode === "idea" ? ideaInput : creationMode === "outline" ? outlineInput : descriptionInput}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (creationMode === "idea") setIdeaInput(v);
                                            else if (creationMode === "outline") setOutlineInput(v);
                                            else setDescriptionInput(v);
                                        }}
                                        className="w-full h-40 p-4 pb-12 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none outline-none"
                                        placeholder={modeCopy.placeholder}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => referenceFileInputRef.current?.click()}
                                        disabled={isParsingReferenceFiles}
                                        className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-200 shadow-sm hover:bg-white dark:hover:bg-zinc-900 transition-colors disabled:opacity-60"
                                    >
                                        {isParsingReferenceFiles ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        {tr("上传文件", "Upload files")}
                                    </button>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {tr("上传 PDF/文本作为参考资料（可选）", "Upload PDF/text as reference (optional)")}
                                    </div>
                                    {referenceFiles.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setReferenceFiles([])}
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
                                                    className="flex items-center gap-2 min-w-0 text-left"
                                                >
                                                    <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                                                    <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">{f.filename}</span>
                                                    <span className="text-xs text-zinc-500 dark:text-zinc-400 flex-shrink-0">({f.charCount} chars)</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                                                    onClick={() => setReferenceFiles((prev) => prev.filter((x) => x.id !== f.id))}
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
                        onClick={creationMode === "beautify" ? handleStartBeautify : creationMode === "idea" ? handleGenerateOutline : creationMode === "outline" ? handleLoadOutline : handleLoadDescriptions}
                        disabled={Boolean(progress.message) || (creationMode === "beautify" ? !beautifyFile : isParsingReferenceFiles || (creationMode === "idea" ? !ideaInput.trim() : creationMode === "outline" ? !outlineInput.trim() : !descriptionInput.trim()))}
                        className="w-full py-6 text-lg font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
                    >
                        {progress.message ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
                        {progress.message || (creationMode === "beautify" ? tr("开始渲染", "Start rendering") : creationMode === "idea" ? tr("开始生成大纲", "Generate outline") : creationMode === "outline" ? tr("载入大纲", "Load outline") : tr("载入描述", "Load descriptions"))}
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
                                "例如：科技感、深色背景、蓝紫渐变、玻璃拟态、留白充足、适合企业汇报；不要出现任何文字。",
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
                    <h3 className="font-semibold text-lg">{creationMode === "description" ? tr("确认内容与描述", "Review content & descriptions") : tr("确认大纲", "Review outline")}</h3>
                    <div className="text-sm text-muted-foreground">{tr(`共 ${localSlides.length} 页`, `${localSlides.length} slides`)}</div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {localSlides.map((slide, i) => (
                        <div key={i} className="flex gap-4 p-4 border rounded-lg bg-zinc-50 dark:bg-zinc-900/50">
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
                                    <Button variant="outline" size="sm" onClick={() => handleAddSlideToChat(slide)} className="shrink-0">
                                        <MessageSquarePlus className="w-4 h-4 mr-2" />
                                        {tr("加入对话", "Add to chat")}
                                    </Button>
                                </div>
                                <div className="space-y-1">
                                    {(slide.content || []).map((point, j) => (
                                        <div key={j} className="flex gap-2 text-sm text-muted-foreground">
                                            <span>•</span>
                                            <input 
                                                value={point}
                                                onChange={(e) => {
                                                    const newSlides = [...localSlides];
                                                    if (!newSlides[i].content) newSlides[i].content = [];
                                                    newSlides[i].content[j] = e.target.value;
                                                    setLocalSlides(newSlides);
                                                }}
                                                className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                                            />
                                        </div>
                                    ))}
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
                                      placeholder={tr("例如：这一页强调三个关键点；讲解时先抛出问题再给答案…", "e.g. Emphasize three key points; start with a question, then answer it…")}
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-foreground mb-1">{tr("画面描述（description，用于生图）", "Visual description (description)")}</div>
                                    <textarea
                                      value={slide.description || ""}
                                      onChange={(e) => {
                                        const newSlides = [...localSlides];
                                        newSlides[i].description = e.target.value;
                                        setLocalSlides(newSlides);
                                      }}
                                      className="w-full h-24 p-3 rounded-md border border-input bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      placeholder={tr("例如：科技感蓝色渐变背景，中心是抽象的 AI 芯片与电路纹理，干净留白…", "e.g. Futuristic blue gradient background, abstract AI chip and circuit textures, clean whitespace…")}
                                    />
                                  </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-6 border-t border-border bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setCreationStep('idle')}>{tr("返回修改", "Back")}</Button>
                    <Button onClick={creationMode === "description" ? handleGenerateImagesOnly : handleGenerateFullPpt} className="bg-blue-600 hover:bg-blue-700">
                        <Sparkles className="w-4 h-4 mr-2" />
                        {creationMode === "description" ? tr("开始渲染图片", "Render images") : tr("生成完整 PPT", "Generate full deck")}
                    </Button>
                </div>
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
                    <h3 className="font-semibold text-lg">AI 正在创作中</h3>
                    <p className="text-sm text-muted-foreground">{progress.message || (creationStep === "generating_content" ? tr("正在生成内容…", "Generating content…") : tr("正在渲染图片…", "Rendering images…"))}</p>
                </div>
                
                <div className="flex justify-center gap-2 text-xs text-muted-foreground">
                   <div className={`flex items-center gap-1 ${creationStep === 'generating_content' ? 'text-blue-600' : 'text-green-600'}`}>
                        {creationStep === 'generating_content' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span>生成内容</span>
                   </div>
                   <span className="text-zinc-300">→</span>
                   <div className={`flex items-center gap-1 ${creationStep === 'generating_images' ? 'text-blue-600' : 'text-zinc-400'}`}>
                        {creationStep === 'generating_images' && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span>渲染图片</span>
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
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{tr("返回开始", "Back")}</span>
            </button>
            <button
                onClick={() => setSlideshowOpen(true)}
                disabled={activeSlides.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                <Play className="w-3.5 h-3.5" />
                <span>{tr("播放", "Play")}</span>
            </button>
            <div className="h-4 w-px bg-border"></div>
            <button 
                onClick={handleDownloadPpt}
                disabled={activeSlides.length === 0 || !!isExporting}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pptx" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pptx" ? tr("导出中…", "Exporting…") : tr("导出 PPTX", "Export PPTX")}</span>
            </button>
            <button 
                onClick={handleDownloadPdf}
                disabled={activeSlides.length === 0 || !!isExporting}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-xs rounded transition-colors shadow-sm"
            >
                {isExporting === "pdf" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>{isExporting === "pdf" ? tr("导出中…", "Exporting…") : tr("导出 PDF", "Export PDF")}</span>
            </button>
        </div>
        <div className="text-xs text-muted-foreground">
            {activeSlides.length > 0 ? tr(`第 ${currentSlideIndex + 1} / ${activeSlides.length} 页`, `Slide ${currentSlideIndex + 1} / ${activeSlides.length}`) : tr("空文档", "Empty")}
        </div>
      </div>

      {/* Main View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-64 bg-zinc-50 dark:bg-zinc-900 border-r border-border overflow-y-auto p-4 space-y-4">
          {activeSlides.map((slide, index) => {
            const hasGeneratedImage = generatedImages[slide.id || index];
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
              重渲染本页
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
                    {idx + 1} · {new Date(v.timestamp).toLocaleString()}
                  </option>
                ))}
              </select>
            )}
          </div>
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

      <Dialog open={slideshowOpen} onOpenChange={setSlideshowOpen}>
        <DialogContent className="inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none sm:max-w-none rounded-none p-0 bg-black/95 border-none flex flex-col">
          <div className="h-16 px-6 flex items-center justify-between text-white/90 bg-black/50 backdrop-blur-sm z-50">
            <div className="text-sm font-medium">
              {activeSlides.length > 0 ? `第 ${slideshowIndex + 1} / ${activeSlides.length} 页` : ""}
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white hover:bg-white/10 gap-2"
                onClick={() => setSlideshowOpen(false)}
              >
                <X className="w-4 h-4" />
                退出
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
