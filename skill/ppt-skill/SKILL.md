---
name: ppt-skill
description: Generate PPT templates, full presentation slide sets, and export deliverables. Use for template-only requests, full presentation generation from idea or outline, and PPT delivery in PDF or image-based PPT form.
---

# PPT Skill

## Trigger

Use when the task requires:

- one or more PPT template backgrounds
- a full presentation from idea, outline, or source documents
- slide-image-based presentation rendering
- export delivery as `pdf` or `image_ppt`

## First-Use Reminder

On the first use of this skill in a conversation, remind the user that image generation is configurable.

Image-model vendors supported in `config/image-provider.json`:

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

1. Classify the task.
2. Collect missing required fields for that task type.
3. Read the required references.
4. Produce the planning or generation prompt.
5. Generate template backgrounds or slide images.
6. Route into the requested export mode.
7. Export or bundle artifacts when requested.

## Task Types

- `template_only`
- `deck_from_idea`
- `deck_from_outline`
- `deck_from_documents`
- `deck_edit_routing`
- `export_only`

## Required References

- `references/task-types.md`
- `references/template-contract.md`
- `references/plan-schema.md`
- `references/layout-hints.md`
- `references/image-rules.md`
- `references/export-modes.md`
- `references/image-provider-config.md`

Read only the references needed for the current task type.

## Plan Contract

For full-presentation generation, every slide must include:

- `id`
- `title`
- `content`
- `description`
- `layout`
- `note`

`description` is for visual generation, not for audience-facing copy.

## Template Contract

- Template generation creates text-free 16:9 background images.
- Templates are style references, not completed slides.
- Template output may include one or more variants when the user asks for options.

## Export Contract

Supported delivery modes:

- `pdf`
- `image_ppt`

If the user does not specify an export mode, recommend `pdf` and `image_ppt` first.

## Provider Contract

- Image generation uses `config/image-provider.json`.
- Template generation and slide generation use the same image-provider config unless the user explicitly defines a split configuration.
- Require `provider`, `apiKey`, and `model`.
- Do not ask the user to paste API keys into chat.
- If image generation is requested and config is missing or incomplete, stop and tell the user to fill the config file.

## Prompts

- `prompts/template.md`
- `prompts/plan.md`
- `prompts/slide-image.md`
- `prompts/edit-router.md`

## Scripts

- `scripts/generate-ppt-template-image.mjs`
- `scripts/generate-ppt-deck-images.mjs`
- `scripts/export-pdf.mjs`
- `scripts/build-image-ppt.mjs`

If the user specifies an output directory or file path, write artifacts there.

If the user does not specify an output location, create a new output folder automatically and write all artifacts there.

Do not write generated artifacts into the skill folder.

## Deliverables

Preferred:

- `pdf`
- `pptx`
- metadata JSON

Optional on request:

- slide PNG files
- prompt text
