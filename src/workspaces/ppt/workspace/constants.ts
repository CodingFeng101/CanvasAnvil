import type { PresetTemplate } from "@/workspaces/ppt/workspace/types";

/** Marks a version synthesised from a slide that had no explicit version yet. */
export const SYNTHETIC_PRIMARY_VERSION_PREFIX = "synthetic-primary:";

/** PowerPoint measures type in points; the canvas draws in CSS pixels. */
export const PPT_POINT_TO_CSS_PX = 96 / 72;

export const PPT_TEMPLATE_UPLOADS_KEY = "ppt_template_uploads_v1";
export const PPT_TEMPLATE_HIDDEN_PRESETS_KEY = "ppt_template_hidden_presets_v1";

export const REVIEW_BOX_COLOR = "#22d3ee";
export const REVIEW_BOX_SELECTED_COLOR = "#f59e0b";

export const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "preset-tech-business", zhName: "科技商务", enName: "Tech Business", path: "/templates/template_b.png" },
  { id: "preset-academic", zhName: "学术汇报", enName: "Academic", path: "/templates/template_academic.jpg" },
  { id: "preset-minimal", zhName: "极简主义", enName: "Minimal", path: "/templates/template_s.png" },
  { id: "preset-vector", zhName: "矢量插画", enName: "Vector Illustration", path: "/templates/template_vector_illustration.png" },
  { id: "preset-yellow", zhName: "活力黄", enName: "Vibrant Yellow", path: "/templates/template_y.png" },
  { id: "preset-glass", zhName: "磨砂玻璃", enName: "Frosted Glass", path: "/templates/template_glass.png" },
];

/** Fan-out limits: the provider rejects larger bursts of per-slide calls. */
export const MODEL_CONCURRENCY = 5;
export const BEAUTIFY_CONCURRENCY = 5;
export const EDITABLE_EXPORT_CONCURRENCY = 3;
export const EDITABLE_REVIEW_CONCURRENCY = 4;
export const BEAUTIFY_RETRY_MAX_ATTEMPTS = 3;
export const BEAUTIFY_RETRY_BASE_DELAY_MS = 1200;
