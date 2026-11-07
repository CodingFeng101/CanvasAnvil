# Base Prompt Template

Use this template when asking an image generation/editing model to create a base background. This model step is mandatory for clean bases; do not replace it with local white masks, local blur, local inpainting, or copied screenshot fragments.

```text
Use the displayed slide image as the only edit target. Generate a clean base background with exactly the same aspect ratio as the displayed slide image.

Remove image noise and high-frequency visual artifacts from all kept areas.
Preserve all kept linework exactly. Keep colors and brightness unchanged.

Keep:
- outer edge decoration and background atmosphere,
- theme colors, gradients, light effects, and texture,
- background-only skyline, technology pattern, ribbon, wave, or similar border visuals,
- large thematic background subject only when it is clearly part of the background.

Remove:
- all text, page numbers, labels, and titles,
- all icons, badges, pictograms, and foreground illustrations,
- all cards, boxes, title bars, charts, frames, dividers, and central layout containers,
- all central content elements.

The middle content area should be mostly clean and ready for rebuilding with editable objects.
Fill removed areas naturally using nearby background texture and light. Do not leave blurred text,
ghost outlines, hard patches, watermarks, or copied content.
Output a complete full-slide base image with no border.
```

If the user explicitly asks for a template with containers, change the remove list to preserve those containers. Otherwise the default base is a general background, not a content template.

After generation, compare the base's width/height ratio with the source page's. If they differ by more than 1%, regenerate; do not stretch or crop the base to fit, because every position on the page is measured against the source.
