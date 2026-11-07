# Icon Sheet Prompt Template

Use this template only for components classified as `icon_png` or `complex_png_whole`. This image generation/editing model step is mandatory for PNG icon and complex visual assets; do not replace it with direct crops from the source slide or PPT native shape approximations.

```text
Use the displayed slide image only as the visual reference/edit target. Regenerate these PNG icon assets into a new asset sheet; do not crop or paste pixels directly from the source slide:
<list icon ids and descriptions>

Make one 16:9 asset sheet with solid key-color background <run key_color>.
Use the exact run-level key color supplied in `png_asset_sheet_plan`; do not choose or switch colors per sheet.
Do not include any normal text, labels, page numbers, grid lines, frames, title bars, card boxes, stars, simple lines, or other simple geometry.
Each icon must have large empty space on all sides. Icons must not touch each other.
Remove image noise and high-frequency visual artifacts from the regenerated icons.
Preserve all icon linework exactly. Keep colors and brightness unchanged.
Preserve the original icon style, colors, highlights, shadows, and proportions.
Render every asset fully opaque with crisp edges. Do not let any part of an asset fade, glow, or blend into the key color: pale or translucent parts (faded buildings, mist, soft glows, light reflections) must be painted as solid light colors, because anything mixed with the key color is cut out or tinted when the key is removed.
For complex composite icons, place each whole composite as one isolated asset; do not split it.
Output only the asset sheet, not the slide background.
```

Packing rules:

- Put 9 `icon_png` assets on each sheet in a 3x3 layout.
- Put 4 `complex_png_whole` assets on each sheet in a 2x2 layout.
- Only the final sheet of each category may contain fewer assets when the remaining count is below the sheet capacity.
- Keep every complex composite intact inside its own cell; do not split a composite into multiple assets.

If an asset sheet causes polluted crops, regenerate it with more separation or a clearer layout instead of silently reducing the required capacity.

Never use this prompt to request direct crops from the source slide. Source crops are forbidden for `icon_png` and `complex_png_whole`; only generated asset sheets may be sliced.
