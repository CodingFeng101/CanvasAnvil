import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  createMaterialChip,
  readDescriptionFrom,
  renderDescriptionInto,
} from "@/workspaces/ppt/canvas/lib/description-editor";
import {
  materialLabel,
  materialToken,
  removeMaterialToken,
} from "@/workspaces/ppt/canvas/lib/material-tokens";
import type { SlideData, SlideMaterialImage } from "@/workspaces/ppt/canvas/types";

export interface SlideMaterialsOptions {
  localSlides: SlideData[];
  setLocalSlides: Dispatch<SetStateAction<SlideData[]>>;
  uiLang: string;
  /** Materials restored from the persisted workspace, if there were any. */
  initialMaterials: Record<string, SlideMaterialImage[]>;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/**
 * Reference images attached to a slide, and the description field that refers
 * to them.
 *
 * These are one feature rather than two: a material only reaches the image
 * model through a `{{image:Name}}` token in the slide's description, so
 * attaching, removing and inserting all have to keep the description in step.
 * The picker is the "/" menu that puts a token in at the caret.
 */
export function useSlideMaterials({
  localSlides,
  setLocalSlides,
  uiLang,
  initialMaterials,
}: SlideMaterialsOptions) {
  const [slideMaterials, setSlideMaterials] =
    useState<Record<string, SlideMaterialImage[]>>(initialMaterials);

  const [pickerSlideId, setPickerSlideId] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number } | null>(null);
  const [pickerActiveIndex, setPickerActiveIndex] = useState(0);
  const pickerReplaceRangeRef = useRef<Range | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const [preview, setPreview] = useState<{
    open: boolean;
    slideTitle: string;
    item: SlideMaterialImage | null;
  }>({ open: false, slideTitle: "", item: null });

  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  /** The value each editor's DOM currently reflects, to avoid redrawing it. */
  const appliedRef = useRef<Record<string, string>>({});
  const focusedRef = useRef<string | null>(null);

  const closePicker = () => {
    setPickerSlideId(null);
    setPickerPos(null);
    setPickerActiveIndex(0);
    pickerReplaceRangeRef.current = null;
  };

  const addImages = async (slideId: string, files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const startingCount = (slideMaterials[slideId] || []).length;
    const created: SlideMaterialImage[] = [];
    for (let i = 0; i < imageFiles.length; i += 1) {
      const file = imageFiles[i];
      try {
        const dataUrl = await readAsDataUrl(file);
        if (!dataUrl.startsWith("data:image")) continue;
        created.push({
          id: `mat-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: materialLabel(startingCount + i + 1, uiLang as "zh" | "en"),
          fileName: file.name,
          dataUrl,
        });
      } catch (e) {
        // One unreadable file should not lose the rest of the selection.
        console.error("Failed to read slide material image", file.name, e);
      }
    }
    if (created.length === 0) return;

    setSlideMaterials((prev) => ({ ...prev, [slideId]: [...(prev[slideId] || []), ...created] }));
  };

  /** Removing an image takes its token out of the description and the editor. */
  const removeImage = (slideId: string, id: string) => {
    const removed = (slideMaterials[slideId] || []).find((x) => x.id === id);
    setSlideMaterials((prev) => ({
      ...prev,
      [slideId]: (prev[slideId] || []).filter((x) => x.id !== id),
    }));
    if (!removed) return;

    setLocalSlides((prev) =>
      prev.map((s) =>
        s.id === slideId
          ? { ...s, description: removeMaterialToken(s.description || "", removed.name) }
          : s,
      ),
    );

    // The editor holds its own DOM, so the chip has to go from there too.
    const editor = editorRefs.current[slideId];
    if (!editor) return;
    for (const node of Array.from(editor.querySelectorAll("[data-material-token]"))) {
      if (node.getAttribute("data-material-token") === removed.name) node.remove();
    }
  };

  const getImageUrls = (slideId: string) =>
    (slideMaterials[slideId] || []).map((x) => x.dataUrl).filter(Boolean);

  const getImageRefs = (slideId: string) =>
    (slideMaterials[slideId] || [])
      .map((x) => ({ url: x.dataUrl, label: x.name }))
      .filter((x) => !!x.url);

  /** Redraws a slide's editor unless the user is typing in it. */
  const renderEditor = (slideId: string, value: string) => {
    const editor = editorRefs.current[slideId];
    if (!editor) return;
    if (focusedRef.current === slideId) return;
    if (appliedRef.current[slideId] === value) return;
    appliedRef.current[slideId] = value;
    renderDescriptionInto(editor, value);
  };

  const parseEditor = (slideId: string) => {
    const editor = editorRefs.current[slideId];
    return editor ? readDescriptionFrom(editor) : "";
  };

  /**
   * Puts a material's token into the slide's description at the caret,
   * replacing the "/" that opened the picker. Falls back to the plain
   * textarea, and then to appending, when the rich editor is not mounted.
   */
  const insertToken = (slideIndex: number, slideId: string, materialName: string) => {
    const token = materialToken(materialName);
    const editor = editorRefs.current[slideId];

    if (editor) {
      const selection = window.getSelection();
      const replaceRange = pickerReplaceRangeRef.current;

      if (replaceRange) {
        replaceRange.deleteContents();
        replaceRange.insertNode(createMaterialChip(materialName));
        const space = document.createTextNode(" ");
        replaceRange.collapse(false);
        replaceRange.insertNode(space);

        // Leave the caret after the chip so typing continues naturally.
        const next = document.createRange();
        next.setStartAfter(space);
        next.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(next);
      } else {
        editor.appendChild(createMaterialChip(materialName));
      }

      const nextValue = readDescriptionFrom(editor);
      appliedRef.current[slideId] = nextValue;
      setLocalSlides((prev) =>
        prev.map((slide, n) => (n === slideIndex ? { ...slide, description: nextValue } : slide)),
      );
      closePicker();
      return;
    }

    const textarea = textareaRefs.current[slideId];
    const currentDescription = localSlides[slideIndex]?.description || "";

    if (!textarea) {
      setLocalSlides((prev) =>
        prev.map((slide, n) =>
          n === slideIndex ? { ...slide, description: `${currentDescription}${token}` } : slide,
        ),
      );
      closePicker();
      return;
    }

    const cursor = textarea.selectionStart ?? currentDescription.length;
    const before = currentDescription.slice(0, cursor);
    const slashAt = Math.max(before.lastIndexOf("/"), before.lastIndexOf("／"));
    const nextValue =
      slashAt >= 0
        ? `${currentDescription.slice(0, slashAt)}${token}${currentDescription.slice(cursor)}`
        : `${before}${token}${currentDescription.slice(cursor)}`;
    const nextCursor = (slashAt >= 0 ? slashAt : cursor) + token.length;

    setLocalSlides((prev) =>
      prev.map((slide, n) => (n === slideIndex ? { ...slide, description: nextValue } : slide)),
    );
    closePicker();

    requestAnimationFrame(() => {
      const input = textareaRefs.current[slideId];
      if (!input) return;
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
    });
  };

  /** Opens the picker when the caret sits just after a "/" the user typed. */
  const openPickerAtCaret = (slideId: string) => {
    const editor = editorRefs.current[slideId];
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return;
    if (!range.collapsed) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const textNode = range.startContainer as Text;
    if (range.startOffset <= 0) return;
    const prevChar = textNode.data[range.startOffset - 1];
    if (prevChar !== "/" && prevChar !== "／") return;

    // Remember the "/" so choosing a material replaces it with the chip.
    const replaceRange = document.createRange();
    replaceRange.setStart(textNode, range.startOffset - 1);
    replaceRange.setEnd(textNode, range.startOffset);
    pickerReplaceRangeRef.current = replaceRange;

    const marker = range.cloneRange();
    marker.setStart(textNode, range.startOffset);
    marker.collapse(true);
    const caret = marker.getBoundingClientRect();
    const host = editor.getBoundingClientRect();
    setPickerPos({
      left: editor.offsetLeft + (caret.left - host.left),
      top: editor.offsetTop + (caret.bottom - host.top) + 2,
    });
    setPickerActiveIndex(0);
    setPickerSlideId(slideId);
  };

  // A click anywhere else dismisses the picker.
  useEffect(() => {
    if (!pickerSlideId) return;
    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as Node | null;
      if (!target || pickerRef.current?.contains(target)) return;
      setPickerSlideId(null);
      setPickerPos(null);
      setPickerActiveIndex(0);
      pickerReplaceRangeRef.current = null;
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [pickerSlideId]);

  // Keeps the highlighted row inside the list when materials are added or removed.
  useEffect(() => {
    if (!pickerSlideId) return;
    const count = (slideMaterials[pickerSlideId] || []).length;
    if (count <= 0) return;
    setPickerActiveIndex((prev) => Math.max(0, Math.min(prev, count - 1)));
  }, [pickerSlideId, slideMaterials]);

  return {
    slideMaterials,
    setSlideMaterials,
    addImages,
    removeImage,
    getImageUrls,
    getImageRefs,
    picker: {
      slideId: pickerSlideId,
      pos: pickerPos,
      activeIndex: pickerActiveIndex,
      setActiveIndex: setPickerActiveIndex,
      ref: pickerRef,
      openAtCaret: openPickerAtCaret,
      close: closePicker,
      insertToken,
    },
    preview,
    setPreview,
    editor: {
      refs: editorRefs,
      textareaRefs,
      inputRefs,
      appliedRef,
      focusedRef,
      render: renderEditor,
      parse: parseEditor,
    },
  };
}
