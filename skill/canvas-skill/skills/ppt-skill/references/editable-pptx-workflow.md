# Editable PPTX Workflow

How to run the `editable_pptx` export yourself. You, the host agent, make every
judgment by looking at the images; `editable/editable_run.py` does the
mechanical work (OCR, image calls, slicing, composition, PowerPoint previews,
QA, merge). No chat model is configured: you are the model.

All commands run from this skill folder:

```bash
python editable/editable_run.py <step> --run <run dir> ...
```

Use a run directory next to the requested output, e.g. `<name>.editable-run/`.
Every step prints the files to look at next; open them with your image viewer.
Tell the user at each stage what you are doing; the whole run takes a while.

Rule docs you read along the way (in `editable/tools/references/`):

- `base-grouping.md`, `base-prompt-template.md`: step 2
- `element-classification.md`: steps 3 and 5
- `icon-sheet-prompt-template.md`: used by the tool itself; read it if a sheet keeps failing
- `compose-spec.md`: step 5

## 1. init

```bash
python editable/editable_run.py init --run RUN --manifest-file slides.manifest.json --qa-rounds 3
```

Copies the slides to `RUN/source/slide_NNN.png` (any format, converted to PNG)
and OCRs them into `RUN/analysis/texts_layout.json`. `--qa-rounds` is the
user's choice of rework rounds per page, 3 to 10 (default 3).

## 2. clean bases

Look at every slide. Following `base-grouping.md` and `base-prompt-template.md`,
decide yourself which slides share one clean background and write one image-edit
prompt per group: the base is made by editing the group's reference slide, so
the prompt says what to keep (background colour, gradients, waves, scenery,
buildings, edge ornaments) and what to remove on that slide (all text, cards,
icons, shapes, illustrations), specific to what this background shows. Save
each prompt to a text file in `RUN/prompts/`, then per group:

```bash
python editable/editable_run.py base --run RUN --group g1 --slides 1,2 --reference 1 --prompt-file RUN/prompts/g1.txt
```

Every slide belongs to exactly one group. A base off the source's aspect ratio
is regenerated automatically, never stretched. Look at each base: if text,
cards or icons are left on it, sharpen the prompt and run `base` again for that
group. Record the grouping in `RUN/analysis/decisions.md`.

## 3. element analysis

For each page, compare the SOURCE (`RUN/source/slide_NNN.png`, read coordinates
from it at full resolution) with its clean BASE (`RUN/base/slide_NNN_base.png`)
and the OCR text of that page in `texts_layout.json`, then write
`RUN/analysis/pages/page_NNN.json`:

```json
{"components":{"<id>":{"category":"...","reuse":"...","png_hint":"..." }},
 "instances":[{"component":"<id>","id":"<id>","bbox_px":[x,y,w,h]}],
 "notes":"..."}
```

Rules (with `element-classification.md`):

- Every non-text visual element that is NOT part of the clean base. Anything
  also on the base (background gradients, waves, scenery, buildings, edge
  ornaments) is background, never an element.
- One component per distinct visual design, reused within the page (four
  identical cards = one component, four instances).
- `category` is one of `simple_geometry_svg_ooxml` (lines, dividers, circles,
  rings, rounded rects, card bases, title bars, borders, dots),
  `icon_png` (any recognisable object or semantic icon, even simple line art)
  or `complex_png_whole` (composite illustrations, glows, layered badges: one
  PNG, never split).
- PNG components: `png_hint` is the full drawing brief for the image model
  (shape, colours, parts, orientation, style); it sees nothing else about the
  component. Never ask for a transparent background.
- Geometry components: `svg_hint` gives kind (rect, round_rect, oval, line,
  star), fill, outline, corner radius in px, transparency.
- Every instance: `component`, a unique `id`, `bbox_px` = the drawing's own
  bounds in source pixels. Include small things: bullet dots, connectors,
  arrows and arrowheads, accent bars, rings, dividers.
- Ink that belongs to words (e.g. a gradient-coloured word the OCR missed) is
  text, not an element: say so in `notes`.

With more than one page, also write `RUN/analysis/merge.json` naming
components that are the same visual design on different pages (same icon, same
card style, same divider), so each is generated once. Ids get a page prefix
`p<page>_` when merged; use the prefixed ids, same category only:

```json
{"merge":{"p2_card":"p1_card"}}
```

Then:

```bash
python editable/editable_run.py analysis --run RUN
```

It fills the mechanical fields (asset plan, reuse, fractional boxes, sheet
plan), merges the pages into `RUN/analysis/element_analysis.json` and validates
it. Fix your page files if it reports errors.

## 4. shared PNG assets

```bash
python editable/editable_run.py assets --run RUN
```

Draws the PNG components once for the whole deck: icons on 3x3 sheets against
the slide they first appear on, each complex visual on its own canvas shaped
like its element, all on a solid key colour; then slices each sheet by finding
its drawings. A sheet whose drawing count is wrong is thrown away and redrawn
once. Look at `RUN/assets/contact_sheets/shared.png`: each thumbnail is
labelled with its id. A picture that does not match its id is fixed per page in
step 5.

## 5. rebuild each page

For each page:

```bash
python editable/editable_run.py page --run RUN --page N
```

It sets up `RUN/pages/pNNN/` and prints the page's OCR text, element instances,
components and which shared PNGs are ready. Look at the source, the base and the
shared assets, then write `RUN/pages/pNNN/analysis/compose_spec.json`, a
partial spec (the tool adds the base, slide size and OCR text):

```json
{"geometry":[...],
 "images":[{"id":"<asset id>","path":"../assets/png/<asset id>.png","bbox_px":[x,y,w,h]}],
 "extra_texts":[<text entries for ink the OCR missed, same fields as OCR texts>],
 "text_edits":{"<ocr id>":{<fields to change>}},
 "drop_texts":["<ocr id>"]}
```

Rules (with `compose-spec.md` for the geometry and text fields):

- Layer order: base PNG -> editable geometry -> PNG icons -> editable text.
  Geometry and images are stacked in array order: containers first.
- One geometry entry per simple-geometry instance (its `bbox_px`, styled per
  its component's `svg_hint` and what you see); one image per PNG instance
  (path `../assets/png/<component>.png`, its `bbox_px`).
- Never generate simple geometry as PNG; never crop assets from the source
  slide: they are generated.
- Normal text stays editable text. Artistic lettering becomes PNG only if a
  text box cannot approximate it.
- Everything on the source that is not on the base and is not OCR text must be
  on the slide as geometry or a PNG. Add elements the analysis missed.

If a PNG is missing or shows the wrong picture, regenerate just those assets:
write a JSON list `[{"id":"...","description":"...","bbox_px":[x,y,w,h]}]`
(bbox required for complex) and run

```bash
python editable/editable_run.py sheet --run RUN --page N --kind icon --assets-file new_icons.json
```

Then check:

```bash
python editable/editable_run.py check --run RUN --page N
```

It composes the page, exports a preview with PowerPoint, runs QA and prints the
report and the QA image (source | preview, problem regions boxed red). Look at
it and fix what is actually wrong: missing or misplaced elements, wrong size or
colour, text problems, green spill (regenerate that asset with clearer
instructions). Hot regions inside a regenerated illustration are often just
redraw differences. Rewrite the spec and `check` again. A page is done when QA
passes or the rework rounds the user chose are used up; do not stop early on a
fixable failure. Run one `check` at a time: PowerPoint exports one file at a
time.

## 6. merge

```bash
python editable/editable_run.py merge --run RUN --output deck.pptx
```

Merges the pages into one `.pptx`, exports previews of the whole deck and runs
a final QA. Report to the user: the output path, which pages passed, the
remaining defects, and that `RUN/` keeps the bases, asset sheets and each
round's preview and QA image (`pages/pNNN/out/rounds/`).
