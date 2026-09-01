# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and the project aims to follow Semantic Versioning.

## [Unreleased]

A structural refactor of the whole project. The repository now separates
`client/`, `server/`, `contracts/` and `resources/`, every workspace has the
same shape, and the shared UI kit, storage layer, file pipeline and i18n each
exist once instead of per workspace.

### Removed

- Removed the `pptist-lab` editor integration. The PPT canvas stays; editable decks export directly as `.pptx`.
- Removed the poster, product and infographic canvases, narrowing the product to Flow, Interior Design and PPT.
- Removed the multi-provider model layer and the vendor picker. All model access goes through one OpenAI-compatible transport.
- Removed the Next.js port that shadowed the Vite client, and roughly 900 lines of unreachable code the old `PptWorkspace` was hiding.
- Removed the editable-export review and the pipeline behind it. Asking for an editable `.pptx` used to open a text-box confirmation pass and then spend three model calls per slide; it now writes the file from what the deck already has, in about a second. A deck that went through the old review still exports with its text editable, but new decks export as images -- which makes the editable and image exports the same thing.
- Removed the nine-vendor image registry the `cad-skill` and `ppt-skill` packages still carried, along with the `provider` config key it read. Eight of those vendors had no base URL to reach and each skill shipped its own byte-identical copy of the table. The endpoint now follows from the model's name -- `gpt-image-*` and `dall-e-*` use the images endpoint, everything else answers through chat -- and `baseUrl` points at whichever OpenAI-compatible gateway serves it.

### Added

- Added a **Present** button to the deck toolbar. The slideshow was complete but had no entry point, so full-screen presentation, arrow-key paging and Escape had all been unreachable.
- Added a test suite (`npm test`, node:test) covering the pure logic the refactor had to preserve: AI request shaping, draw.io XML repair, chat storage, PPT persistence and editor adapters, the deck state machine, slide-version resolution, render-layer edits, material tokens and the chat message readers.

### Changed

- Turned on TypeScript strict mode and split the bundle; initial load dropped from 2.89 MB to roughly 700 KB raw.
- Replaced the deck's 25 scattered step assignments with a state machine, so the creation step and its progress bar can no longer drift apart.
- Consolidated the CAD and PPT chat panels, chat inputs and transcript message readers, which had been forks of one another.
- Split the PPT canvas from one 5,300-line component into pure modules, per-feature hooks and one file per screen, and wrote that shape down in `docs/architecture.md` so it is a convention rather than one worked example.
- Gave the CAD workspace one way to read SVG out of a model reply, and one ladder for applying a patch, replacing three drifted copies of the first and two identical copies of the second.

### Fixed

- Fixed an infinite render loop in every workspace's chat panel. Two file-sync effects running one step apart traded two equal-but-distinct arrays back and forth on every render.
- Fixed the theme and dark-mode switches in the Flow chat panel, which received their handlers as props and used none of them.
- Fixed CAD patch failures being swallowed: an exception while applying a patch left no error and no retry, so the patch appeared to do nothing.
- Fixed the SVG load-failure toast keeping the previous language after a language switch.
- Fixed the export-review selection pointing at a text block from an image version no longer on screen.
- Fixed attachment chips in the CAD and PPT transcripts showing an empty character count.
- Fixed messages whose content is a multimodal part array reading as empty text in the CAD and PPT transcripts.
- Fixed a Docker image that copied directories which no longer exist and omitted `resources/`, which the server reads at request time.
- Fixed SVG arriving HTML-escaped being read as "no drawing here" by the CAD canvas, which silently dropped it. The three copies of that reader had drifted; only two decoded entities.
- Fixed the CAD workspace preferring bare `<svg>` text over a declared patch payload, which returned markup with the JSON escaping still in it.
- Fixed the recent-history context dropping the newest turns when over budget and keeping the oldest -- backwards for something the intent router reads for continuity.
- Fixed nine slide edits in the outline editor mutating the state they were replacing, by copying the array but not the slide inside it.
- Fixed `ppt-skill` accepting an unsupported image provider through configuration and failing later at the HTTP layer, where `cad-skill` rejects it up front.
- Fixed text blocks read back from storage reaching the review canvas without their geometry, where they became boxes at undefined coordinates that could be neither seen nor selected.
- Fixed the chat upload limits applying to one of the three shapes an attachment can arrive in, so a file sent as `image` or in a `content` array skipped both the size cap and the file count.
- Fixed the Flow composer never growing past three lines. The shared `Textarea` did not forward its ref, so the height it measured on every keystroke was never applied and the box stayed at its minimum, with resizing disabled.
- Fixed the chosen template being outvoted by the outline. The planner had no parameter for a template and had never seen one, yet it wrote a background colour and art style into every slide's visual description; that concrete text then beat the template reference at render time, so a deck built on the dark navy template came out white and flat. The planner is now given the template image and writes descriptions that match its palette and art style, and the template still outranks a description that disagrees with it at render time.
- Fixed a slide displaying with its text erased after an editable export, from the adapter preferring a render layer's background -- the text-stripped derivative -- over the one the deck view passed.
- Fixed the Flow composer never growing past three lines. The shared `Textarea` did not forward its ref, so the height it measured on every keystroke was never applied and the box stayed at its minimum, with resizing disabled.

### Security

- Removed server-side debug logging that wrote entire conversations, including inline base64 images and everything the user typed, to the console on every request.
- Prompt logging now writes only when `PROMPT_LOG_DIR` is set, instead of dropping a file containing the full prompt into the working directory by default.

## [2.1.0] - 2026-04-25

### Added

- Added a standalone deployment path for `pptist-lab`, allowing the PPT editor to run as an independent service alongside the main CanvasAnvil app.
- Added deployment documentation for the dual-service setup, covering the main application port and the dedicated PPT editor port.

### Changed

- Updated the CanvasAnvil portal interface with a refreshed entry experience and clearer product navigation.
- Standardized the deployment ports around the main CanvasAnvil app and the standalone PPT editor service.
- Updated and synchronized the online access URL to `https://canvasanvil.codingfgd.asia`.
- Updated the PPT editor embedding flow so production deployments behind domain and HTTPS reverse proxy can resolve the correct parent window origin.

### Fixed

- Fixed production PPT editor embedding issues caused by mismatched `postMessage` origins when the main app is served from HTTPS default port and the PPT editor is served from a dedicated HTTPS port.

## [2.0.0] - 2026-04-22

### Added

- Added three new canvases: `Poster`, `Infographic`, and `Product`.
- Embedded `pptist-lab` directly inside the PPT workspace for editable PPT authoring.
- Added a staged editable PPT review flow with automatic text-box detection, manual box correction, text extraction, and per-slide re-extraction.
- Added local skill definitions for `Flow`, `CAD`, `PPT`, `Poster`, `Infographic`, and `Product` workflows under `skill/`.
- Added configurable image-provider support for image-generation skills via `config/image-provider.json`, covering the supported built-in providers.
- Added script-backed skill workflows for image generation, diagram export, CAD output bundling, PPT template generation, slide image rendering, PDF export, and image-based PPT export.

### Changed

- Promoted the release version from `1.0.2` to the next major release, `2.0.0`.
- Expanded CanvasAnvil from `Flow | CAD | PPT` to `Flow | CAD | PPT | Poster | Infographic | Product`.
- Updated editable PPT export to separate `text box review`, `text extraction`, and `start editing`.
- Kept both the original slide image and the derived `textless background` version available during review.
- Improved extracted text mapping so the embedded PPT editor keeps more of the original size, color, weight, spacing, alignment, and line-height.
- Reduced repository documentation to English and Simplified Chinese only.
- Standardized skill prompts and `SKILL.md` files around English instructions while keeping UI-language-specific output labels where needed.
- Simplified the PPT skill export scope to `PDF` and image-based `PPT` deliverables.
- Updated the CAD skill BOM output contract to produce `cad_bom.csv` instead of `cad_bom.json`.
- Updated the Flow skill bundle workflow to skip standalone HTML preview generation by default.

### Fixed

- Fixed editable PPT export popup blocking by switching to an embedded editor flow.
- Fixed oversized editable-export bootstrap payloads that previously overflowed browser storage.
- Fixed review-mode state issues around text-box preparation, extraction progress, per-slide re-extraction visibility, and version switching.

## [1.0.2] - 2026-04-15

### Changed

- Promoted the release version from `1.0.1` to `1.0.2`.
- Switched PPT creation and in-editor iteration to an image-first workflow that regenerates slide images directly.
- Split PPT export into `PDF`, image-based `PPT`, and `editable PPTX`, with OCR and text refill deferred to editable export only.
- Refreshed the localized README files to reflect the new PPT workflow and current release version.

### Fixed

- Persisted uploaded PPT templates and hidden preset-template preferences through IndexedDB-backed local storage.

## [1.0.1] - 2026-03-24

### Changed

- Promoted the release version from `1.0.0` to the patch release `1.0.1`.

### Fixed

- Moved oversized PPT workspace image persistence from `localStorage` to IndexedDB-backed storage to prevent refresh-time data loss.
- Fixed PPT workspace restore order so lightweight snapshots no longer override the latest persisted image state.
- Ensured PPT imported, edited, and generated slide images are converted to persistable URLs before being written into workspace state.
- Moved CAD analysis and render image persistence to IndexedDB-backed storage with lightweight local snapshots for better refresh stability.
- Prevented CAD render/analysis images from being dropped by temporary loading placeholders unless the user explicitly clears the workspace.

## [1.0.0] - 2026-03-17

### Added

- Local PPT AI proxy route at `/api/ppt-ai` for browser-safe PPT chat, vision, and image workflows.
- Major PPT release notes and release-version upgrade to `v1.0.0`.
- Support for text editing workflows on PPT slides exported from NotebookLM.

### Changed

- Promoted the project from `0.1.2` to the first major usable release, `1.0.0`.
- Refined PPT editing workflows to better support real-world slide refinement and text updates on existing decks.
- PPT image uploads no longer inject raw base64 image payloads into chat text prompts.
- PPT image generation and edit requests now use a local proxy path instead of direct browser-to-provider requests.
- PPT image-reference handling now limits reference count, compresses large image inputs, and retries with a reduced reference set on failure.
- PPT edit routing now treats uploaded images as optional materials unless the user explicitly asks to use them.
- Improved PPT error handling for oversized requests, bad payloads, and provider/API failures.

### Fixed

- Resolved multiple garbled-text issues in the PPT workspace source.
- Fixed local storage overflow issues caused by oversized PPT chat history payloads.
- Reduced browser-side CORS failure exposure in PPT image workflows by routing through the local proxy.

## [0.1.2] - 2026-03-06

### Changed

- CAD workflow now supports an analysis-first entry: requirement/planning -> analysis images -> 2D editing.
- CAD 2D generation (`cad_svg_agent`) now consumes the two analysis images as visual references when available.
- CAD analysis image agents now accept language as an explicit prompt variable and follow UI language settings.

## [0.1.0] - 2026-02-19

### Added

- First open-source release.
- Flow/CAD/PPT canvases with chat-driven generation and iterative edits.
- Docker/Compose deployment support and Nginx reverse proxy configuration.
