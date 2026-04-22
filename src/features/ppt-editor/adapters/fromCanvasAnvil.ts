import {
  pptElementsToTextBlocks,
  textBlocksToPptElements,
  type PptElement,
} from "@/lib/ppt-service";
import type {
  CanvasAnvilRenderLayerLike,
  CanvasAnvilSlideLike,
  EditorAudioElement,
  EditorChartElement,
  EditorElement,
  EditorFormulaElement,
  EditorImageElement,
  EditorShapeElement,
  EditorSlide,
  EditorTableElement,
  EditorTextElement,
  EditorVideoElement,
} from "@/features/ppt-editor/types";

const toEditorElements = (elements?: PptElement[], textBlocksFallback = []): EditorElement[] => {
  const source = Array.isArray(elements) && elements.length > 0 ? elements : textBlocksToPptElements(textBlocksFallback);
  return source
    .map((element): EditorElement | null => {
      if (element?.type === "text") {
        const textElement: EditorTextElement = {
          id: element.id,
          type: "text",
          text: element.text,
          role: element.role,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          style: element.style,
        };
        return textElement;
      }

      if (element?.type === "image") {
        const imageElement: EditorImageElement = {
          id: element.id,
          type: "image",
          src: element.src,
          fit: element.fit,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return imageElement;
      }

      if (element?.type === "shape") {
        const shapeElement: EditorShapeElement = {
          id: element.id,
          type: "shape",
          shape: element.shape,
          fill: element.fill,
          stroke: element.stroke,
          strokeWidth: element.strokeWidth,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return shapeElement;
      }

      if (element?.type === "table") {
        const tableElement: EditorTableElement = {
          id: element.id,
          type: "table",
          rows: Array.isArray(element.rows) ? element.rows.map((row) => Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []) : [],
          headerRows: element.headerRows,
          fill: element.fill,
          stroke: element.stroke,
          textColor: element.textColor,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return tableElement;
      }

      if (element?.type === "chart") {
        const chartElement: EditorChartElement = {
          id: element.id,
          type: "chart",
          chartType: element.chartType,
          title: element.title,
          data: Array.isArray(element.data)
            ? element.data.map((item) => ({
                label: String(item?.label ?? ""),
                value: Number(item?.value ?? 0),
              }))
            : [],
          color: element.color,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return chartElement;
      }

      if (element?.type === "formula") {
        const formulaElement: EditorFormulaElement = {
          id: element.id,
          type: "formula",
          latex: element.latex,
          fontSize: element.fontSize,
          color: element.color,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return formulaElement;
      }

      if (element?.type === "video") {
        const videoElement: EditorVideoElement = {
          id: element.id,
          type: "video",
          src: element.src,
          poster: element.poster,
          title: element.title,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return videoElement;
      }

      if (element?.type === "audio") {
        const audioElement: EditorAudioElement = {
          id: element.id,
          type: "audio",
          src: element.src,
          title: element.title,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
        };
        return audioElement;
      }

      return null;
    })
    .filter((element): element is EditorElement => !!element);
};

export const canvasAnvilToEditorSlide = (
  slide: CanvasAnvilSlideLike,
  options?: {
    renderLayer?: CanvasAnvilRenderLayerLike | null;
    backgroundImageUrl?: string;
  }
): EditorSlide => {
  const layer = options?.renderLayer || undefined;
  const textBlocks = Array.isArray(layer?.textBlocks) ? layer!.textBlocks! : [];
  const elements = toEditorElements(layer?.elements, textBlocks);

  return {
    id: slide.id,
    title: slide.title,
    content: slide.content || [],
    description: slide.description,
    note: slide.note,
    layout: slide.layout,
    backgroundImageUrl: layer?.backgroundImageUrl || options?.backgroundImageUrl,
    elements,
  };
};

export const canvasAnvilSlidesToEditorSlides = (
  slides: CanvasAnvilSlideLike[],
  getRenderLayer?: (slideId: string) => CanvasAnvilRenderLayerLike | undefined,
  getBackgroundImageUrl?: (slideId: string) => string | undefined,
): EditorSlide[] =>
  slides.map((slide) =>
    canvasAnvilToEditorSlide(slide, {
      renderLayer: getRenderLayer?.(slide.id),
      backgroundImageUrl: getBackgroundImageUrl?.(slide.id),
    })
  );

export const extractEditorTextElements = (slide: EditorSlide) =>
  slide.elements.filter((element): element is EditorTextElement => element.type === "text");

export const extractEditorTextBlocks = (slide: EditorSlide) =>
  pptElementsToTextBlocks(
    extractEditorTextElements(slide).map((element) => ({
      id: element.id,
      type: "text" as const,
      text: element.text,
      role: element.role,
      x: element.x,
      y: element.y,
      w: element.w,
      h: element.h,
      style: element.style,
    }))
  );
