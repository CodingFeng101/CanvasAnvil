---
name: product-skill
description: Generate final product visual images from structured requirements. Use for single product hero visuals, launch graphics, feature callout boards, spec visuals, and other single-frame product graphics that should export directly to local image files.
---

# Product Skill

## Trigger

Use when the task requires one final product visual image.

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

1. Confirm the task is a product visual task.
2. Collect required fields.
3. Ask follow-up questions for missing required fields.
4. Read the required references.
5. Produce the final product visual prompt.
6. Generate the image through the configured provider.
7. Export or bundle artifacts when requested.

## Required Fields

- `product_name`
- `size` or `aspect_ratio`
- `style_direction`
- `color_direction`
- `selling_points`
- `product_image_status`
- `reference_image_status`

Do not guess missing required fields.

## Required References

- `references/product-fields.md`
- `references/prompt-rules.md`
- `references/image-provider-config.md`
- `references/output-contract.md`

## Prompt Contract

- Produce one final product visual prompt.
- Keep the output specific to one frame.
- Keep the product subject explicit.
- Include composition, focal area, lighting, and background direction.
- Keep provided copy and selling points explicit.
- Do not invent unsupported claims, pricing, certifications, or brand facts.
- Treat reference images as visual guidance only.
- Do not treat reference images as factual sources for copy, branding, pricing, specifications, or claims.

## Provider Contract

- Use the configured image provider for image generation.
- Require `config/image-provider.json` before image generation.
- Do not ask the user to paste API keys into chat.
- Stop and tell the user to fill `config/image-provider.json` when provider, apiKey, or model is missing.
- Request `product_image_url` when `product_image_status` is positive.
- Request `reference_image_url` when `reference_image_status` is positive.
- Pass `product_image_url` and `reference_image_url` only when usable URLs are available and the selected provider path supports them.

## Scripts

- `scripts/generate-product-image.mjs`
- `scripts/build-product-bundle.mjs`

## Deliverables

Preferred:

- `png`
- metadata JSON

Optional on request:

- `jpg`
- prompt text
