---
name: infographic-skill
description: Generate final infographic images from structured content requirements. Use for single infographic tasks, data summaries, process explainers, comparison boards, timelines, and other single-frame information graphics that should export directly to local image files.
---

# Infographic Skill

## Trigger

Use when the task requires one final infographic image.

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

1. Confirm the task is an infographic task.
2. Collect required fields.
3. Ask follow-up questions for missing required fields.
4. Read the required references.
5. Produce the final infographic prompt.
6. Generate the image through the configured provider.
7. Export or bundle artifacts when requested.

## Required Fields

- `theme`
- `size` or `aspect_ratio`
- `style_direction`
- `color_direction`
- `information_points`
- `data_status`

Do not guess missing required fields.

## Required References

- `references/infographic-fields.md`
- `references/prompt-rules.md`
- `references/image-provider-config.md`
- `references/output-contract.md`

## Prompt Contract

- Produce one final infographic prompt.
- Keep the output specific to one frame.
- Emphasize structure, hierarchy, and readability.
- Include information sections, chart intent, and visual grouping when provided.
- Keep provided copy and data explicit.
- Do not invent unsupported metrics, rankings, dates, or claims.
- Treat reference images as visual guidance only.
- Do not treat reference images as factual sources for data, copy, dates, or claims.

## Provider Contract

- Use the configured image provider for image generation.
- Require `config/image-provider.json` before image generation.
- Do not ask the user to paste API keys into chat.
- Stop and tell the user to fill `config/image-provider.json` when provider, apiKey, or model is missing.
- Pass a reference image only when `reference_image_status` is positive and a usable reference image URL is available.

## Scripts

- `scripts/generate-infographic-image.mjs`
- `scripts/build-infographic-bundle.mjs`

## Deliverables

Preferred:

- `png`
- metadata JSON

Optional on request:

- `jpg`
- prompt text
