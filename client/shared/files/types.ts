/** Shapes shared by the file-extraction modules. */

export interface ExtractedVisualAsset {
    id: string
    sourceFileName: string
    sourceType: "pdf" | "word" | "latex" | "third_party"
    page?: number
    order: number
    dataUrl: string
    textHint: string
}

export type VisualCategory =
    | "framework"
    | "result_table"
    | "mechanism"
    | "key_visual"
    | "data_structure"
    | "other"
