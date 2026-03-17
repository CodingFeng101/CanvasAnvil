# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and the project aims to follow Semantic Versioning.

## [1.0.0] - 2026-03-17

### Added

- Local PPT AI proxy route at `/api/ppt-ai` for browser-safe PPT chat, vision, and image workflows.
- Major PPT release notes and release-version upgrade to `v1.0.0`.

### Changed

- Promoted the project from `0.1.2` to the first major usable release, `1.0.0`.
- PPT chat now uses single-turn task execution instead of sending full conversation history to the agent.
- PPT image uploads no longer inject raw base64 image payloads into chat text prompts.
- PPT image generation and edit requests now use a local proxy path instead of direct browser-to-provider requests.
- PPT image-reference handling now limits reference count, compresses large image inputs, and retries with a reduced reference set on failure.
- PPT edit routing now treats uploaded images as optional materials unless the user explicitly asks to use them.
- PPT visible version labels are simplified to version number plus timestamp.
- Internal textless-background processing remains in the PPT pipeline but is no longer exposed as a visible user version.
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
