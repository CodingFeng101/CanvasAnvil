import { useEffect, useRef, useState } from "react";
import { useFileProcessor } from "@/shared/files/use-file-processor";
import type { CreationMode, ReferenceFile } from "@/workspaces/ppt/canvas/types";

/** Extracted reference text is capped before it reaches the prompt. */
const MAX_REFERENCE_CHARS = 150_000;

interface PersistedInputs {
  creationMode?: unknown;
  ideaInput?: unknown;
  outlineInput?: unknown;
  beautifyRequirement?: unknown;
  beautifyUseTemplate?: unknown;
  beautifyFailures?: unknown;
  imageTransformFailures?: unknown;
}

export interface CreationInputsOptions {
  initialState: PersistedInputs | undefined;
  onCreationModeChange?: (mode: CreationMode) => void;
}

const readString = (v: unknown) => (typeof v === "string" ? v : "");

/** Keeps only the string-to-non-empty-string pairs a failure map should hold. */
function readFailureMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof key === "string" && typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

/**
 * Everything the user supplies before a deck exists: which flow they picked,
 * what they typed, the file they are beautifying or converting, and the
 * reference documents whose text and figures feed the prompt.
 *
 * The per-slide failure maps live here too, because they belong to the run the
 * inputs started and are cleared when a new one begins.
 */
export function useCreationInputs({ initialState, onCreationModeChange }: CreationInputsOptions) {
  const [creationMode, setCreationMode] = useState<CreationMode>(() => {
    const v = initialState?.creationMode;
    return v === "idea" || v === "outline" || v === "beautify" || v === "image_transform" ? v : "idea";
  });

  useEffect(() => {
    onCreationModeChange?.(creationMode);
  }, [creationMode, onCreationModeChange]);

  const [ideaInput, setIdeaInput] = useState(() => readString(initialState?.ideaInput));
  const [outlineInput, setOutlineInput] = useState(() => readString(initialState?.outlineInput));
  const [beautifyRequirement, setBeautifyRequirement] = useState(() =>
    readString(initialState?.beautifyRequirement),
  );
  const [beautifyUseTemplate, setBeautifyUseTemplate] = useState(() =>
    Boolean(initialState?.beautifyUseTemplate),
  );

  const [beautifyFile, setBeautifyFile] = useState<File | null>(null);
  const [imageTransformFile, setImageTransformFile] = useState<File | null>(null);

  // Which slides failed in the last run, so the user can retry just those.
  const [beautifyFailures, setBeautifyFailures] = useState<Record<string, string>>(() =>
    readFailureMap(initialState?.beautifyFailures),
  );
  const [imageTransformFailures, setImageTransformFailures] = useState<Record<string, string>>(() =>
    readFailureMap(initialState?.imageTransformFailures),
  );

  const {
    files: uploadFiles,
    pdfData,
    visualAssets: visualAssetsRaw,
    handleFileChange,
    setFiles: setUploadFiles,
  } = useFileProcessor("ppt");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<ReferenceFile | null>(null);

  const referenceInputRef = useRef<HTMLInputElement | null>(null);
  const beautifyInputRef = useRef<HTMLInputElement | null>(null);
  const imageTransformInputRef = useRef<HTMLInputElement | null>(null);

  const isParsing = Array.from(pdfData.values()).some((x) => x.isExtracting);

  // A file still being extracted has no usable text yet, so it is left out
  // rather than sent to the model half-read.
  const referenceFiles: ReferenceFile[] = uploadFiles
    .map((file) => {
      const meta = pdfData.get(file);
      if (!meta || meta.isExtracting || !meta.text) return null;
      return {
        id: `ref-${file.name}-${file.lastModified}-${file.size}`,
        filename: file.name,
        content: String(meta.text || "").slice(0, MAX_REFERENCE_CHARS),
        charCount: meta.charCount || 0,
      } as ReferenceFile;
    })
    .filter((x): x is ReferenceFile => !!x);

  const handleReferenceInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Cleared so picking the same file again still fires a change event.
    e.target.value = "";
    if (files.length === 0) return;
    await handleFileChange([...uploadFiles, ...files]);
  };

  const handleBeautifyInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    setBeautifyFile(file);
  };

  const handleImageTransformInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    setImageTransformFile(file);
  };

  const openPreview = (file: ReferenceFile) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  return {
    creationMode,
    setCreationMode,
    ideaInput,
    setIdeaInput,
    outlineInput,
    setOutlineInput,
    beautify: {
      requirement: beautifyRequirement,
      setRequirement: setBeautifyRequirement,
      useTemplate: beautifyUseTemplate,
      setUseTemplate: setBeautifyUseTemplate,
      file: beautifyFile,
      setFile: setBeautifyFile,
      inputRef: beautifyInputRef,
      onInputChange: handleBeautifyInputChange,
      failures: beautifyFailures,
      setFailures: setBeautifyFailures,
    },
    imageTransform: {
      file: imageTransformFile,
      setFile: setImageTransformFile,
      inputRef: imageTransformInputRef,
      onInputChange: handleImageTransformInputChange,
      failures: imageTransformFailures,
      setFailures: setImageTransformFailures,
    },
    reference: {
      files: referenceFiles,
      uploadFiles,
      setUploadFiles,
      visualAssetsRaw,
      handleFileChange,
      isParsing,
      inputRef: referenceInputRef,
      onInputChange: handleReferenceInputChange,
      previewOpen,
      setPreviewOpen,
      previewFile,
      openPreview,
    },
  };
}
