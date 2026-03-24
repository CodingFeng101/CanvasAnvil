# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and the project aims to follow Semantic Versioning.

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
