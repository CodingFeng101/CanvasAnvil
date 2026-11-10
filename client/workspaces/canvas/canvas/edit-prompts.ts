/**
 * The image-edit prompt for a change already put into words (the annotation read by a vision model on the
 * website, or by the host agent in the canvas skill). Kept free of the canvas so the skill's server bundles it.
 */
export function buildDescribedEditPrompt(uiLang: "zh" | "en", describedChange: string): string {
  return uiLang === "zh"
    ? `请编辑这张图片：${describedChange}\n只修改这一处，图片其它部分（颜色、文字、布局、间距）保持不变，不要重新排版或重绘整张图。引号里的新文字必须逐字照写，不要增删或替换任何字。`
    : `Edit this picture: ${describedChange}\nChange only that. Keep every other part of the picture (color, text, layout, spacing) unchanged -- do not re-layout or redraw the whole picture. Render any quoted new text exactly, character for character.`;
}

/** The image-edit prompt when nothing was drawn on the picture: the user's instruction as it is. */
export function buildPlainEditPrompt(uiLang: "zh" | "en", instruction: string): string {
  return instruction.trim() || (uiLang === "zh" ? "请基于这张图片进行修改。" : "Edit this image.");
}
