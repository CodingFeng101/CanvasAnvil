# Element Classification

## Categories

### simple_geometry_svg_ooxml

Use only for non-semantic layout geometry that can become editable vector objects:

- straight lines and dividers,
- stars,
- circles and rings,
- rounded rectangles,
- card bases,
- title bars,
- question frames and border frames,
- simple circuit-line decorations.

Generate or describe these as SVG first, then convert/recreate as PPT OOXML objects. Do not use this category for recognizable icons, pictograms, object illustrations, people, devices, badges, buildings, or UI/app symbols. If it represents a thing rather than layout geometry, classify it as PNG even when the drawing is made from simple strokes.

Do not cut true simple geometry as PNG unless the user explicitly wants visual-only fidelity.

### icon_png

Use for standalone illustrative icons:

- trophy,
- flowers,
- book,
- hands and heart,
- computer/code,
- chain link,
- organization/building badge,
- small themed pictograms,
- people or avatars,
- device, app, classroom, cloud, chart, data, security, or building symbols.

Generate these as transparent PNG assets with an image generation/editing model, then slice them from the generated asset sheet. They are editable as movable/scalable images, not internal vector parts. Never crop these assets directly from the original/source slide image.

Default to this category for semantic icons. Do not recreate icons from PPT native shapes just because their source style is flat, outline-only, or visually simple; that usually drifts from the image PPT.

### complex_png_whole

Use for visuals that become worse when split:

- large swirls,
- multi-layer badges,
- glow-heavy decorations,
- complex illustrations,
- compositions with many gradients, shadows, and masks.

Generate as one whole transparent PNG with an image generation/editing model, then slice it from the generated asset sheet. Do not split. Never crop this asset directly from the original/source slide image.

## Reuse Rules

- One star component should serve all star instances through copy/scale.
- One card base should serve repeated cards.
- One title bar should serve repeated title bars.
- Left/right variants may be mirrored if visually acceptable.
- Do not generate `card_left`, `card_center`, `card_right` as separate PNGs when they are the same component.

## Common Mistakes To Avoid

- Keeping cards or title bars in the clean base when the user wanted a general base.
- Rebuilding semantic icons as native PPT shapes and losing visual fidelity.
- Putting stars, frames, title bars, and icon PNGs in the same asset sheet.
- Cropping `icon_png` or `complex_png_whole` assets directly from the source slide instead of regenerating them first.
- Cropping icon assets tightly to their nontransparent bbox.
- Splitting a complex decorative composition into many pieces that cannot be reassembled cleanly.
- Treating decorative text or normal text as icons unless it is artistic lettering that cannot be represented by a text box.
