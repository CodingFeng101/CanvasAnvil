# Compose Spec

`scripts/compose_component_pptx.py` reads a JSON compose spec and creates a PPTX.

The script expects positions as source-pixel bboxes by default. It can also use fraction bboxes.

## Slide Size

- `ref_width` / `ref_height`: the source page size in pixels (default 1920x1080).
- `slide_width_in`: slide width in inches (default 13.333333).
- `slide_height_in`: optional. When it is left out, the slide takes the source page's aspect ratio: `slide_width_in * ref_height / ref_width`. Set it only to override that. A 4:3 page forced onto a 16:9 slide stretches every shape and image sideways while text keeps its measured size.

## Minimal Example

```json
{
  "ref_width": 1920,
  "ref_height": 1080,
  "slide_width_in": 13.333333,
  "slides": [
    {
      "base": "base/slide_001_base.png",
      "geometry": [
        {
          "id": "title_line",
          "kind": "line",
          "bbox_px": [220, 250, 600, 4],
          "fill": "#C00000"
        },
        {
          "id": "card",
          "kind": "round_rect",
          "bbox_px": [200, 300, 450, 420],
          "fill": "#FFF7EE",
          "fill_transparency": 20,
          "line": "#EBC8A7",
          "line_width": 1.2,
          "corner_radius_px": 24
        }
      ],
      "images": [
        {
          "id": "code_icon",
          "path": "assets/png/code_icon.png",
          "bbox_px": [360, 410, 140, 120]
        }
      ],
      "texts": [
        {
          "id": "title",
          "text": "Example",
          "bbox_px": [300, 100, 500, 80],
          "font_size_pt": 36,
          "color": "#A52922",
          "bold": true,
          "align": "center"
        }
      ]
    }
  ]
}
```

## Geometry Kinds

Supported editable geometry:

- `rect`
- `round_rect`
- `oval`
- `star`
- `line`

Use these for the same objects classified as `simple_geometry_svg_ooxml`. For complex SVG paths, use the full ppt-master pipeline if available, or reclassify as PNG.

Geometry fields:

- `fill`: `#RRGGBB` or `none`.
- `fill_transparency`: optional, a percentage from 0 (opaque) to 100 (invisible), the same scale as PowerPoint's Transparency slider.
- `line`, `line_width` (points): outline colour and width; `none` or absent means no outline.
- `corner_radius_px`: `round_rect` only. The corner radius in source pixels, measured on the source slide. Without it, PowerPoint's default radius applies (about 17% of the shorter side), which is usually rounder than the source.

## Images

- `path`: the sliced PNG asset.
- `bbox_px` / `bbox_frac`: the bounds of the drawing on the source slide, as recorded in `element_analysis.json`. Do not widen it to make room for the PNG's transparent padding. It must cover exactly what the PNG depicts: if the asset is a white glyph on its own green disc, the bbox is the disc's bounds, not the glyph's.
- `fit`: how the PNG is placed in the bbox. The spec-level `image_fit` sets the default for every image.
  - `visible` (default): the PNG's drawn pixels (alpha >= 16) are fitted into the bbox at their own aspect ratio and centred. The transparent padding falls outside the bbox, which is expected.
  - `frame`: the whole PNG, padding included, is stretched to the bbox. Use this only when the bbox already includes the padding, as in the bundled `_strict-rebuild-run` example.

## Text Fields

Copy text entries from `texts_layout.json` (written by `scripts/extract_text.py`) as they are.

- `bbox_px` / `bbox_frac`: the text box frame. Never use `ink_bbox_*` here.
- `text`: each `\n` starts a new paragraph.
- `line_spacing_pt`: optional; applied as exact line spacing to every paragraph of the box.
- `font_size_pt`, `color`, `bold`, `italic`, `align`, `font_family`: run style.

Keep `slide_width_in` equal to the width used for extraction, because font sizes are measured against it.

## Layering

The composer always adds:

1. `base`,
2. `geometry` in array order,
3. `images` in array order,
4. `texts` in array order.

This avoids accidental duplicate full-slide screenshots above editable content.

Array order is the only stacking control; there is no `z_order` field. Put larger containers before the things that sit on them.
