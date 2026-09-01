const BASE_INSTRUCTION = [
  "Beautify the slide while preserving all original text, numbers, and meaning.",
  "Improve typography, spacing, alignment, color harmony, hierarchy, and visual balance.",
  "Do not add watermarks. Keep 16:9 landscape.",
  "Do not translate or rewrite text unless explicitly requested.",
];

/** The image-edit prompt for one slide, with the user's own wording appended. */
export function buildBeautifyInstruction(requirement: string): string {
  const extra = String(requirement || "").trim();
  return [...BASE_INSTRUCTION, extra ? `User requirements: ${extra}` : ""]
    .filter(Boolean)
    .join("\n");
}
