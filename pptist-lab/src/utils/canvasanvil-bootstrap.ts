import type { Slide, PPTElement, PPTImageElement, PPTTextElement } from '@/types/slides'

const STORAGE_KEY = 'canvasanvil-pptist-bootstrap'
export const CANVASANVIL_PPTIST_MESSAGE_TYPE = 'canvasanvil:pptist-bootstrap'
const PPTIST_CANVAS_WIDTH = 1000
const PPTIST_CANVAS_HEIGHT = 562.5

interface CanvasAnvilBootstrapSlide {
  id: string
  elements: Array<
    | {
        id: string
        type: 'image'
        left: number
        top: number
        width: number
        height: number
        rotate: number
        fixedRatio: boolean
        src: string
        lock?: boolean
        imageType?: 'background'
      }
    | {
        id: string
        type: 'text'
        left: number
        top: number
        width: number
        height: number
        rotate: number
        content: string
        defaultFontName: string
        defaultColor: string
        lineHeight?: number
        wordSpace?: number
        opacity?: number
        paragraphSpace?: number
        vertical?: boolean
        textType?: PPTTextElement['textType']
      }
  >
}

interface CanvasAnvilBootstrapPayload {
  source: 'canvasanvil'
  version: 1
  createdAt: string
  slides: CanvasAnvilBootstrapSlide[]
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const toCanvasX = (value: unknown, fallback: number) => {
  if (!isFiniteNumber(value)) return fallback
  if (value >= 0 && value <= 1) return value * PPTIST_CANVAS_WIDTH
  return value
}
const toCanvasY = (value: unknown, fallback: number) => {
  if (!isFiniteNumber(value)) return fallback
  if (value >= 0 && value <= 1) return value * PPTIST_CANVAS_HEIGHT
  return value
}

const toTextElement = (element: CanvasAnvilBootstrapSlide['elements'][number]): PPTTextElement | null => {
  if (element.type !== 'text') return null
  return {
    id: element.id,
    type: 'text',
    left: toCanvasX(element.left, 0),
    top: toCanvasY(element.top, 0),
    width: toCanvasX(element.width, 240),
    height: toCanvasY(element.height, 80),
    rotate: isFiniteNumber(element.rotate) ? element.rotate : 0,
    content: String(element.content || '<p></p>'),
    defaultFontName: element.defaultFontName || 'Microsoft YaHei',
    defaultColor: element.defaultColor || '#111111',
    lineHeight: isFiniteNumber(element.lineHeight) ? element.lineHeight : 1.3,
    wordSpace: isFiniteNumber(element.wordSpace) ? element.wordSpace : 0,
    opacity: isFiniteNumber(element.opacity) ? element.opacity : 1,
    paragraphSpace: isFiniteNumber(element.paragraphSpace) ? element.paragraphSpace : 5,
    vertical: Boolean(element.vertical),
    textType: element.textType,
  }
}

const toImageElement = (element: CanvasAnvilBootstrapSlide['elements'][number]): PPTImageElement | null => {
  if (element.type !== 'image') return null
  return {
    id: element.id,
    type: 'image',
    left: toCanvasX(element.left, 0),
    top: toCanvasY(element.top, 0),
    width: toCanvasX(element.width, PPTIST_CANVAS_WIDTH),
    height: toCanvasY(element.height, PPTIST_CANVAS_HEIGHT),
    rotate: isFiniteNumber(element.rotate) ? element.rotate : 0,
    fixedRatio: Boolean(element.fixedRatio),
    src: String(element.src || ''),
    lock: Boolean(element.lock),
    imageType: element.imageType,
  }
}

const normalizeSlide = (slide: CanvasAnvilBootstrapSlide): Slide => {
  const elements: PPTElement[] = []

  for (const element of slide.elements) {
    if (element.type === 'text') {
      const textElement = toTextElement(element)
      if (textElement) elements.push(textElement)
      continue
    }
    if (element.type === 'image') {
      const imageElement = toImageElement(element)
      if (imageElement) elements.push(imageElement)
    }
  }

  return {
    id: slide.id,
    elements,
  }
}

export const parseCanvasAnvilBootstrapPayload = (raw: unknown): Slide[] | null => {
  try {
    const parsed = raw as CanvasAnvilBootstrapPayload
    if (!parsed || parsed.source !== 'canvasanvil' || !Array.isArray(parsed.slides)) return null
    return parsed.slides.map(normalizeSlide)
  }
  catch {
    return null
  }
}

export const readCanvasAnvilBootstrapSlides = (): Slide[] | null => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null

  try {
    return parseCanvasAnvilBootstrapPayload(JSON.parse(raw))
  }
  catch {
    return null
  }
}

export const clearCanvasAnvilBootstrapSlides = () => {
  localStorage.removeItem(STORAGE_KEY)
}
