# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and the project aims to follow Semantic Versioning.

## [0.1.1] - 2026-03-06

### Changed

- CAD workflow now supports an analysis-first entry: requirement/planning -> analysis images -> 2D editing.
- CAD 2D generation (`cad_svg_agent`) now consumes the two analysis images as visual references when available.
- CAD analysis image agents now accept language as an explicit prompt variable and follow UI language settings.

## [0.1.0] - 2026-02-19

### Added

- First open-source release.
- Flow/CAD/PPT canvases with chat-driven generation and iterative edits.
- Docker/Compose deployment support and Nginx reverse proxy configuration.
