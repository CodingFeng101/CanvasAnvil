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

You run it yourself, step by step, following
`references/editable-pptx-workflow.md`: you make the judgments by looking at
the images (which slides share a background, what each page's elements are,
where everything goes, what to fix after each check), and
`editable/editable_run.py` does the mechanical work with the Python tools in
`editable/tools/scripts`. No separate chat model is configured, and nothing
outside this skill folder is needed.

Characteristics:

- every slide is rebuilt in layers: clean base image -> editable geometry -> generated PNG icons and illustrations -> editable text
- text stays editable text; cards, lines, dots, rings and bars become native shapes
- icons and illustrations are redrawn by the image model, so they match the source in design, not pixel for pixel
- slow: usually 10+ minutes for a deck, longer for many pages; say so before starting

What the run does, in order:

1. read the text on every slide (OCR)
2. plan the clean backgrounds: which slides share one, and the edit prompt for each
3. generate the clean bases; a base off the source's aspect ratio is regenerated, never stretched
4. analyse each page's elements with its base beside it so background art is not taken for an element; fold components repeated across pages into one; the tool fills the mechanical fields and validates the result
5. draw the shared icons (3x3 sheets) and illustrations (one canvas each, shaped like the element) on a solid key colour, and slice them by finding each drawing; a sheet whose drawing count is wrong is redrawn
6. rebuild every page: place shapes, assets and text, export a preview, check it against the source, fix and check again until it passes or the rework rounds run out
7. merge the pages into one `.pptx`

Settings:

- pages: which slides to export (all by default)
- rework rounds per page: 3 to 10, default 3; a page that passes its check stops early

Requirements:

- Python 3 with the packages in `editable/requirements.txt`: `pip install -r editable/requirements.txt` from this skill folder (Pillow, python-pptx, numpy, OpenCV, RapidOCR, PyMuPDF)
- for the previews the checks compare: Microsoft PowerPoint on Windows; otherwise (macOS, Linux, or no PowerPoint) LibreOffice, found on PATH, in its usual install folder, or at `SOFFICE`
- an image model: this skill's `config/image-provider.json` (the same file the other modes use), or `SLIDE_AGENT_IMAGE_API_KEY`, `SLIDE_AGENT_IMAGE_BASE_URL`, `SLIDE_AGENT_IMAGE_MODEL` in the environment; a variable already set in the environment wins
- never ask the user to paste keys into chat; if a setting is missing, tell them which file to fill

Output: the `.pptx` at `merge --output`, and the run folder (for example
`<name>.editable-run/`) with the intermediate files (bases, asset sheets,
per-round previews and check images) for anyone who wants to see how a page was
built.

## Default rule

If the user does not specify a mode, prefer:

- `pdf`
- `image_ppt`

Offer `editable_pptx` when the user says they need to edit the deck, and say it takes a while.
