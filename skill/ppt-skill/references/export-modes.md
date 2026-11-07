# Export Modes

Supported output modes:

- `pdf`
- `image_ppt`
- `editable_pptx`

## `pdf`

Use when the user wants a stable read-only presentation deliverable.

Characteristics:

- presentation-safe
- easy to share
- visually stable

## `image_ppt`

Use when the user wants a PPT file but visual fidelity matters more than editability.

Characteristics:

- each slide is delivered as an image inside a PPT
- suitable for presenting and handing off
- minimal editability

## `editable_pptx`

Use when the user wants to edit the slides in PowerPoint: change text, move or
restyle shapes, swap icons.

This is the same run as CanvasAnvil's "Export Editable PPTX" (export menu ->
settings -> run panel). Script: `scripts/export-editable-pptx.mjs`, which runs
the editable export pipeline (`scripts/slide-agent/pipeline.ts` in the
CanvasAnvil repository). The Python tools it calls (OCR, image generation,
slicing, composition, validation, previews) and the rule docs its model steps
read live in this skill's `editable/` folder; nothing outside the repository is
needed.

Characteristics:

- every slide is rebuilt in layers: clean base image -> editable geometry -> generated PNG icons and illustrations -> editable text
- text stays editable text; cards, lines, dots, rings and bars become native shapes
- icons and illustrations are redrawn by the image model, so they match the source in design, not pixel for pixel
- slow: usually 10+ minutes for a deck; pages are rebuilt in parallel

What the run does, in order:

1. read the text on every slide (OCR)
2. plan the clean backgrounds: which slides share one, and the edit prompt for each
3. generate the clean bases; a base off the source's aspect ratio is regenerated, never stretched
4. analyse each page's elements in parallel, with its base beside it so background art is not taken for an element; then merge pages and fold components repeated across pages into one; code fills the mechanical fields and `editable/scripts/validate_element_analysis.py` checks the result
5. draw the shared icons (3x3 sheets) and illustrations (one canvas each, shaped like the element) on a solid key colour, and slice them by finding each drawing; a sheet whose drawing count is wrong is redrawn
6. rebuild every page: place shapes, assets and text, export a preview, check it against the source, fix and check again until it passes or the rework rounds run out
7. merge the pages into one `.pptx`

Settings:

- pages: which slides to export (all by default)
- rework rounds per page: 3 to 10, default 3; a page that passes its check stops early

Requirements:

- Python 3 with this skill's Python packages: `pip install -r skill/ppt-skill/editable/requirements.txt` (Pillow, python-pptx, numpy, OpenCV, RapidOCR)
- Microsoft PowerPoint, for the previews the checks compare
- a chat model: `SLIDE_AGENT_API_KEY`, `SLIDE_AGENT_BASE_URL`, `SLIDE_AGENT_MODEL` in the environment or in the git-ignored `scripts/slide-agent/.env.local`
- an image model: this skill's `config/image-provider.json` (the same file the other modes use), or `SLIDE_AGENT_IMAGE_API_KEY`, `SLIDE_AGENT_IMAGE_BASE_URL`, `SLIDE_AGENT_IMAGE_MODEL` in the environment or `.env.local`; a variable already set in the environment wins
- never ask the user to paste keys into chat; if a setting is missing, tell them which file to fill

Output: the `.pptx` at `--output`, and next to it a `<name>.editable-run/`
folder with the intermediate files (bases, asset sheets, per-round previews and
check images) for anyone who wants to see how a page was built.

## Default rule

If the user does not specify a mode, prefer:

- `pdf`
- `image_ppt`

Offer `editable_pptx` when the user says they need to edit the deck, and say it takes a while.
