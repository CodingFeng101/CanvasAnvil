# Plan Schema (`<deck>/plan.json`)

The plan is what the slide scripts read. Write it after the user confirms the outline.

```json
{
  "type": "ppt_plan",
  "mode": "idea | outline | beautify",
  "title": "deck name (used for the exported file)",
  "language": "zh | en",
  "template": "/abs/path/to/template.jpg (or relative to plan.json; empty for none)",
  "materials": { "标志": "assets/logo.png", "产品图": "assets/product.jpg" },
  "slides": [
    {
      "id": "slide-1",
      "title": "...",
      "content": ["...", "..."],
      "description": "visual description for the image model; may place a material with {{image:标志}}",
      "layout": "cover",
      "note": "speaker note",
      "materialLabels": ["产品图"]
    }
  ]
}
```

## Fields

- `id`: stable; `slide-1`, `slide-2`, ... Keep ids when slides are edited, added or removed.
- `title`, `content`: the visible text (4-6 specific bullets per slide; each short).
- `description`: for image generation only: subject, composition, visual emphasis. With a template it stays inside the template's colours and art style and never copies its layout.
- `layout`: one hint from `references/layout-hints.md`.
- `note`: speaker note, one coherent paragraph; always present.
- `materials` (plan) / `materials` (slide): name -> image file of the pictures the user supplied. A slide sends only the ones it names: `{{image:Name}}` in its description (in order of mention), then its `materialLabels`. At most 4 per slide besides the template.
- `extraRequirements` (optional, per slide): extra text for that slide's image prompt.

## The manifest (`<deck>/slides.manifest.json`)

Written by the slide scripts; read by the exports and `editable_run.py init --manifest-file`. Each entry has
`slideId`, `order`, `title`, `imageFile` (relative to the deck folder), `status` (`ok` / `failed`) and `error`.
