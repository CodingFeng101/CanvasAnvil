---
name: cad-skill
description: Generate interior design planning artifacts, 2D SVG floorplans, BOM outputs, analysis boards, and renovation image sets from structured requirements. Use for staged interior-design work that moves through plan, 2D drafting, BOM, and image outputs.
---

# CAD Skill

## Trigger

Use when the task requires one step in an interior-design workflow.

## First-Use Reminder

On the first use of this skill in a conversation, remind the user that image generation is configurable and tell them which model vendors are supported in `config/image-provider.json`.

Supported vendors:

- `openai`
- `aliyun`
- `tencent`
- `bytedance`
- `zhipu`
- `google`
- `xai`
- `bfl`
- `adobe`

## Order

1. Confirm the task is an interior-design task.
2. Route the task to one step only: `plan`, `2d_svg`, `bom`, or `images`.
3. Collect missing required context for that step.
4. Read the required references.
5. Produce the step artifact.
6. Export preview artifacts when requested.
7. Bundle artifacts when requested.

## Classification

- `plan`
  - design strategy
  - requirement analysis
  - zoning logic
  - room program
- `2d_svg`
  - new floorplan drafting
  - floorplan edits
  - redraw requests
- `bom`
  - bill of materials
  - procurement-ready lists
- `images`
  - analysis boards
  - renovation drawing boards
  - render sheets

## Required References

- `references/task-types.md`
- `references/output-contract.md`
- `references/image-provider-config.md`
- `references/image-agents/*.md`
- `prompts/router.md`
- `prompts/plan.md`
- `prompts/svg-router.md`
- `prompts/svg-patch.md`
- `prompts/svg-replace.md`
- `prompts/bom.md`
- `prompts/overall-analysis-board.md`
- `prompts/key-strategy-board.md`
- `prompts/master-renovation-scheme.md`
- `prompts/renovation-plan-layout.md`
- `prompts/floor-finish-plan.md`
- `prompts/reflected-ceiling-plan.md`
- `prompts/wall-setting-out-plan.md`
- `prompts/mep-plan.md`
- `prompts/elevation-index-and-interior-elevations.md`
- `prompts/detail-drawings.md`

## Routing Contract

- Route one step at a time.
- Prefer `plan` when no usable plan exists.
- Use `2d_svg` for drawing, redrawing, and localized floorplan edits.
- Use `bom` only when a plan exists.
- Use `images` only when the task is to produce analysis boards, drawing boards, or render images.

## Plan Contract

- Output one `cad_plan` artifact only.
- Keep assumptions explicit.
- Keep room names, functional needs, and constraints executable.
- Do not output SVG, BOM, or image tasks in the same step.

## 2D SVG Contract

- Output one `cad_patch` artifact or one full SVG result.
- Use patch for small precise edits.
- Use replace for broad redraws or unstable patch cases.
- Keep output limited to the 2D floorplan step.
- Export a local preview image when requested.

## BOM Contract

- Output one `cad_bom.csv` artifact only.
- Base BOM on the current plan and 2D SVG.
- Keep columns normalized and machine-readable.

## Images Contract

- Use `prompts/overall-analysis-board.md` to generate the text-model prompt for the overall analysis board.
- Use `prompts/key-strategy-board.md` to generate the text-model prompt for the key strategy board.
- Use `prompts/master-renovation-scheme.md` first to generate the text-model prompt for the master renovation scheme, then lock that JSON as the source of truth.
- After the master scheme, use one dedicated prompt file per sheet to generate seven different text-model prompts:
  - `prompts/renovation-plan-layout.md`
  - `prompts/floor-finish-plan.md`
  - `prompts/reflected-ceiling-plan.md`
  - `prompts/wall-setting-out-plan.md`
  - `prompts/mep-plan.md`
  - `prompts/elevation-index-and-interior-elevations.md`
  - `prompts/detail-drawings.md`
- Do not reuse one prompt for all seven outputs.
- For every analysis board or sheet, first produce a dedicated image prompt with the host model, then pass that image prompt to the configured image provider.
- Require `config/image-provider.json` before image generation.
- Do not ask the user to paste API keys into chat.
- Stop and tell the user to fill `config/image-provider.json` when provider, apiKey, or model is missing.

## Scripts

- `scripts/generate-cad-image.mjs`
- `scripts/export-cad-2d-image.mjs`
- `scripts/build-cad-bundle.mjs`

## Deliverables

Preferred:

- `cad_plan.json`
- `floorplan.svg`
- `floorplan.png`
- `cad_bom.csv`
- generated image files
- metadata JSON

Optional on request:

- `floorplan.jpg`
- prompt text files
