import type { PresetTemplate, TemplateCategory } from "@/workspaces/ppt/canvas/types";

/** Marks a version synthesised from a slide that had no explicit version yet. */
export const SYNTHETIC_PRIMARY_VERSION_PREFIX = "synthetic-primary:";

/** PowerPoint measures type in points; the canvas draws in CSS pixels. */
export const PPT_POINT_TO_CSS_PX = 96 / 72;

export const PPT_TEMPLATE_UPLOADS_KEY = "ppt_template_uploads_v1";
export const PPT_TEMPLATE_HIDDEN_PRESETS_KEY = "ppt_template_hidden_presets_v1";

export const REVIEW_BOX_COLOR = "#22d3ee";
export const REVIEW_BOX_SELECTED_COLOR = "#f59e0b";

/**
 * Buckets for the template picker, in the order the filter shows them.
 *
 * There are more of these than there are templates on purpose: the library is
 * meant to grow, and a new template should only need a file, a name and one or
 * more of these ids. A bucket with nothing in it is not rendered, so an unused
 * id costs nothing until it is used.
 */
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { id: "business", zhName: "商务办公", enName: "Business" },
  { id: "tech", zhName: "科技互联网", enName: "Tech" },
  { id: "academic", zhName: "学术教育", enName: "Academic" },
  { id: "report", zhName: "总结汇报", enName: "Report" },
  { id: "marketing", zhName: "营销发布", enName: "Marketing" },
  { id: "minimal", zhName: "极简", enName: "Minimal" },
  { id: "creative", zhName: "创意插画", enName: "Creative" },
  { id: "data", zhName: "数据图表", enName: "Data" },
  { id: "finance", zhName: "金融财经", enName: "Finance" },
  { id: "medical", zhName: "医疗健康", enName: "Medical" },
  { id: "culture", zhName: "文化艺术", enName: "Culture" },
  { id: "nature", zhName: "自然环保", enName: "Nature" },
  { id: "festival", zhName: "节日庆典", enName: "Festival" },
  { id: "resume", zhName: "简历求职", enName: "Resume" },
  { id: "other", zhName: "其他", enName: "Other" },
];

export const PRESET_TEMPLATES: PresetTemplate[] = [
  { id: "preset-tech-business", zhName: "科技商务", enName: "Tech Business", path: "/templates/template_b.png", categories: ["tech", "business"] },
  { id: "preset-academic", zhName: "学术汇报", enName: "Academic", path: "/templates/template_academic.jpg", categories: ["academic", "report"] },
  { id: "preset-minimal", zhName: "极简主义", enName: "Minimal", path: "/templates/template_s.png", categories: ["minimal", "business"] },
  { id: "preset-vector", zhName: "矢量插画", enName: "Vector Illustration", path: "/templates/template_vector_illustration.png", categories: ["creative", "marketing"] },
  { id: "preset-yellow", zhName: "活力黄", enName: "Vibrant Yellow", path: "/templates/template_y.png", categories: ["marketing", "creative"] },
  { id: "preset-glass", zhName: "磨砂玻璃", enName: "Frosted Glass", path: "/templates/template_glass.png", categories: ["tech", "minimal"] },
];

/** Fan-out limits: the provider rejects larger bursts of per-slide calls. */
export const MODEL_CONCURRENCY = 5;
export const BEAUTIFY_CONCURRENCY = 5;
export const EDITABLE_EXPORT_CONCURRENCY = 3;
/**
 * Pictures one chat message may carry into slide generation.
 *
 * Kept below the generation ceiling so a slide's own materials and the deck
 * template still fit alongside them.
 */
export const UPLOADED_IMAGE_LIMIT = 3;
export const EDITABLE_REVIEW_CONCURRENCY = 4;
export const BEAUTIFY_RETRY_MAX_ATTEMPTS = 3;
export const BEAUTIFY_RETRY_BASE_DELAY_MS = 1200;
