import {
  textBlocksToPptElements,
  type PptAudioElement,
  type PptChartElement,
  type PptElement,
  type PptFormulaElement,
  type PptImageElement,
  type PptPage,
  type PptShapeElement,
  type PptTableElement,
  type PptTextBlock,
  type PptVideoElement,
} from "@/lib/ppt-service";
import type {
  EditorAudioElement,
  EditorChartElement,
  CanvasAnvilRenderLayerLike,
  EditorElement,
  EditorExportPayload,
  EditorFormulaElement,
  EditorImageElement,
  EditorShapeElement,
  EditorSlide,
  EditorTableElement,
  EditorTextElement,
  EditorVideoElement,
} from "@/features/ppt-editor/types";

export const editorTextElementsToTextBlocks = (elements: EditorTextElement[]): PptTextBlock[] =>
  elements.map((element) => ({
    id: element.id,
    role: element.role,
    text: element.text,
    x: element.x,
    y: element.y,
    w: element.w,
    h: element.h,
    style: element.style,
  }));

export const editorSlideToPptElements = (slide: EditorSlide): PptElement[] =>
  slide.elements.map((element): PptElement => {
    if (element.type === "text") {
      return textBlocksToPptElements([
        {
          id: element.id,
          role: element.role,
          text: element.text,
          x: element.x,
          y: element.y,
          w: element.w,
          h: element.h,
          style: element.style,
        },
      ])[0];
    }

    if (element.type === "image") {
      const imageElement: PptImageElement = {
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

    if (element.type === "shape") {
      const shapeElement: PptShapeElement = {
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

    if (element.type === "table") {
      const tableElement: PptTableElement = {
        id: element.id,
        type: "table",
        rows: element.rows,
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

    if (element.type === "chart") {
      const chartElement: PptChartElement = {
        id: element.id,
        type: "chart",
        chartType: element.chartType,
        title: element.title,
        data: element.data,
        color: element.color,
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
      };
      return chartElement;
    }

    if (element.type === "formula") {
      const formulaElement: PptFormulaElement = {
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

    if (element.type === "video") {
      const videoElement: PptVideoElement = {
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

    const audioElement: PptAudioElement = {
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
  });

export const editorSlideToExportPayload = (slide: EditorSlide): EditorExportPayload => {
  const textElements = slide.elements.filter((element): element is EditorTextElement => element.type === "text");
  const textBlocks = editorTextElementsToTextBlocks(textElements);
  const elements = editorSlideToPptElements(slide);

  return {
    page: {
      id: slide.id,
      title: slide.title,
      content: slide.content,
      description: slide.description,
      note: slide.note,
      layout: slide.layout,
      backgroundImageUrl: slide.backgroundImageUrl,
      textBlocks,
      elements,
      status: "completed",
    },
    textBlocks,
    elements,
  };
};

export const editorSlideToRenderLayer = (
  slide: EditorSlide,
  previous?: CanvasAnvilRenderLayerLike
): CanvasAnvilRenderLayerLike => {
  const payload = editorSlideToExportPayload(slide);
  return {
    backgroundImageUrl: slide.backgroundImageUrl || previous?.backgroundImageUrl || "",
    textBlocks: payload.textBlocks,
    elements: payload.elements,
    status: previous?.status || "ready",
    error: previous?.error,
  };
};
