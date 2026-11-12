---
name: ppt-skill
description: Make presentations the way CanvasAnvil's PPT workspace does -- pick a template from the bundled library, then build the deck from an idea, from an outline, or by beautifying an existing PPT/PDF; review and adjust the outline with the user before anything is drawn; draw all slides concurrently, redraw failures, edit single slides; export PDF, image PPTX or editable PPTX. Also makes template backgrounds on their own and exports existing slides.
---

# PPT Skill

Slides are images drawn by an image model with the website's own prompts (bundled in `scripts/lib/website-prompts.mjs`). You plan and talk with the user; the scripts draw, retry and export.

Script paths below are relative to this skill folder (use its absolute path). Write every output to a deck folder the user names, or a new folder in their workspace -- never into this skill folder.

## First use

Image generation reads `config/image-provider.json` (`apiKey`, `model`, optional `baseUrl`; any OpenAI-compatible endpoint). On the first use in a conversation, remind the user it must be filled in; if missing, they copy `config/image-provider.example.json` to it. Never ask for the key in chat. `references/image-provider-config.md` has details.

Optional: `config/file-parser.json` (`mineruToken`, from `config/file-parser.example.json`) lets step 2 take figures out of the user's PDF and Word documents through MinerU, as the website does. Without it no figures are extracted.

## Modes

| The user wants | Mode |
|---|---|
| A deck from a topic or brief ("做一个 AI 医疗的 PPT") | **idea** |
| A deck from their own outline or headings | **outline** |
| Their existing PPT/PDF made better-looking, same content | **beautify** |
| Only template backgrounds | template only (end of this file) |
| Existing slide images exported | export only (step 7) |

Documents, pasted text and pictures the user supplies are reference material in every mode: facts for the plan, and pictures as materials a slide can show.

## 1. Template

Offer the bundled library: `templates/index.json` lists every template (`id`, `name`, `category`, `file`) in categories (商务办公, 科技互联网, 学术教育, 总结汇报 ...). Suggest a few that fit the topic by name and category, and show the images when the host can display them (`templates/<file>`). The user can also give their own image, ask for a generated one (template only, below), or go without. The template is a style and colour-tone reference: slides take its palette, colour tone and art style, never its layout.

## 2. Outline (idea / outline)

If the user gave PDF or Word documents, first take their figures (the script does nothing when MinerU is not configured):

```bash
node scripts/extract-figures.mjs --out-dir <deck>/materials <doc.pdf> [<doc.docx> ...]
```

It writes `FIG_1`, `FIG_2`, ... (up to 10 per document, 24 in all) and `figures.json` with MinerU's caption text. Look at each figure and write one short caption (18-36 字, what it shows, no invented numbers) as a `FIG_n: caption` line in the materials file below, and add each to `plan.json` `materials` (`"FIG_1": "materials/FIG_1.png"`). Drop figures that are not useful (logos, decorations).

Then print the website's planning prompt and follow it exactly:

```bash
node scripts/prompt.mjs plan --mode idea --input-file <brief.txt> --language zh [--template] [--references-file <facts.txt>] [--materials-file <labels.txt>]
```

`--mode outline` takes the user's outline. `--template` adds the template rules; look at the template image while planning. `--references-file` holds the relevant text from the user's documents. `--materials-file` lists the extracted figures and the user's own pictures as `Name: what it shows` lines; slides may use them via `materialLabels` or `{{image:Name}}`. Write the result as `<deck>/plan.json` (`references/plan-schema.md`: add `language`, `template`, `materials`, `title`).

## 3. Outline review -- required

Before drawing anything, show the user the outline as a table: page, title, bullets, visual description (short). Ask whether to change anything. For changes, follow `prompts/outline-edit.md`: change only the slides the feedback is about, keep ids, keep every field complete, then show the changed slides again. Adding or removing slides is fine; keep ids unique. Repeat until the user confirms. Only then draw.

## 4. Draw the slides

```bash
node scripts/generate-slides.mjs --plan <deck>/plan.json [--concurrency 4]
```

All slides go out at once, 4 in flight by default (the website uses 5; lower it if the gateway rate-limits). Each request has a 4-minute limit and is retried on timeouts, rate limits and gateway errors. Slides land in `<deck>/slides/`, and the manifest `<deck>/slides.manifest.json` is updated after each one. If slides still fail, the script exits 2 and prints a `--only slide-3,slide-7` command: tell the user which pages failed and why, then run it. Expect about 1-2 minutes per batch of slides; tell the user before starting.

Look at every image. Show them to the user when the host can display images, and report anything off (garbled text, missing bullets).

## 5. Beautify mode

```bash
node scripts/beautify-deck.mjs --input <deck.pdf|deck.pptx> --out-dir <deck> [--template <image>] [--requirement "<user's wording>"]
```

Every page is rendered to `<deck>/source/` (a PPTX goes through LibreOffice first; without it, ask for a PDF export), then edited in place, concurrently, with the website's beautify instruction: same text, numbers and meaning; better typography, spacing, hierarchy and colour; with `--template`, that template's style. It writes `plan.json` and the manifest, so steps 6-7 work the same. `--only` redoes chosen pages from their source images.

## 6. Change slides

When the user asks for changes after drawing, route them with `prompts/slide-edit-router.md` (the website's slide-edit chat prompt): decide which slides change and each one's instruction, update those slides' fields in `plan.json`, then apply all of them in one run:

```bash
node scripts/edit-slide.mjs --plan <deck>/plan.json --edits <edits.json>
```

`edits.json` is `[{"slideId": "slide-3", "mode": "edit" | "redraw", "instruction": "...", "refs": ["chat.png"], "styleRefs": ["slide-2"], "styleRefPolicy": "style_only"}]`, chosen as the website does:

- `edit` is the default, as on the website (its chat toolbar is set to 改图 unless the user switches it): the current image is the base, the composition is kept, and the instruction plus the slide's updated title and bullets are applied. This holds whatever `editType` the router gives, text changes included.
- `redraw` only when the user asks for it ("重画", "重新生成这页", "整页重做", "构图大改"; the website's 重画 switch), or when the slide has no image yet: drawn again from its updated plan entry, the instruction added as an extra requirement.
- `styleRefSlideIds` / `styleRefPolicy` from the router -> `styleRefs` (slide ids, or image files for outside references) and `styleRefPolicy` (`style_only` or `style_and_layout`). The script labels them and adds the website's "参考映射" line.
- Pictures the user gives in chat go in `refs` of the slides they are for. The script labels them 对话图1, 对话图2, ... and tells the model to place them unchanged.

An `edit` sends at most 2 extra pictures (style references first) besides the current slide and the template; if it is rejected, it is tried once more with the current slide and template alone. Any failed request is retried.

The new image replaces the old one. A new slide: add it to `plan.json`, then `generate-slides.mjs --only <its id>`.

## 7. Export

```bash
node scripts/export-pdf.mjs --manifest-file <deck>/slides.manifest.json --output <deck>/<title>.pdf
node scripts/build-image-ppt.mjs --manifest-file <deck>/slides.manifest.json --output <deck>/<title>.pptx
```

`pdf` and image `pptx` are the default; offer both. **Editable PPTX** (text, shapes and icons the user can edit in PowerPoint) is a long agent-driven job (10+ minutes, 3-10 rework rounds per page): you make the judgments by looking at the images and `editable/editable_run.py` does the mechanical steps; follow `references/editable-pptx-workflow.md` and say how long it takes before starting. Its previews use PowerPoint on Windows and LibreOffice elsewhere; requirements are in `references/export-modes.md`. The exports refuse a deck with a failed slide: redraw it first.

Report the files written and any slide that needed a retry or still looks off.

## Template only

Get the website's template prompt and draw it (one call per variant; `prompts/template.md` helps write several distinct directions):

```bash
node scripts/prompt.mjs template --requirements "<visual direction>" --language zh > <out>/template-prompt.txt
node scripts/generate-ppt-template-image.mjs --prompt-file <out>/template-prompt.txt --output <out>/template-1.png
```

Templates are text-free 16:9 backgrounds (`references/template-contract.md`).

## References

- `references/plan-schema.md` -- `plan.json` and the manifest
- `references/layout-hints.md`, `references/image-rules.md`, `references/template-contract.md`
- `references/export-modes.md`, `references/editable-pptx-workflow.md` -- exports
- `references/image-provider-config.md` -- the image config

## Folder

- `templates/` -- the website's template library (`index.json` + images)
- `prompts/plan-system.md`, `prompts/outline-edit.md`, `prompts/slide-edit-router.md` -- the website's planning, outline-edit and slide-edit-router prompts; `prompts/template.md` -- template variants
- `scripts/` -- `prompt.mjs`, `extract-figures.mjs`, `generate-slides.mjs`, `edit-slide.mjs`, `beautify-deck.mjs`, `generate-ppt-template-image.mjs`, the exports; `scripts/lib/` -- gateway, deck helpers, bundled website prompts
- `editable/` -- the editable PPTX tools

`templates/`, `scripts/lib/website-prompts.mjs`, `scripts/lib/mineru.mjs`, `scripts/vendor/`, the three website prompts and `editable/render_preview.py` are generated by CanvasAnvil's `scripts/sync-ppt-skill.mjs`; do not edit them here.

Requirements: Node 20+. Beautify also needs Python with `pymupdf` (and LibreOffice for a PPTX input).
