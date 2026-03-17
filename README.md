<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.fr-FR.md">Français</a>
</p>

CanvasAnvil is a multi-canvas AI creation platform for flow diagrams, CAD workflows, and PPT generation/editing.

## Release

Current release: `v1.0.0`

`v1.0.0` marks the first major usable release with stronger PPT editing support, especially for refining existing slide decks such as NotebookLM-exported PPTs.

## Highlights in v1.0.0

- Unified multi-canvas workflow across `Flow`, `CAD`, and `PPT`
- Support for text editing on PPT files exported from NotebookLM
- Better editing workflows for existing PPT decks instead of only first-pass generation
- PPT image uploads no longer bloat chat input with raw base64 data
- PPT image generation and image-edit requests now go through a local proxy route for better browser compatibility
- More stable image-reference routing with image count limits, compression, and fallback retry behavior
- Fixed multiple garbled text issues in PPT workspace and repo docs

## Canvas Previews

<table>
  <tr><td width="680" align="center"><strong>Flow Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT canvas" width="680" /></td></tr>
</table>

## Online Demo

- [Open CanvasAnvil](https://canvasanvil.codingfgd.asia)

## Video Tutorials

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## Capability Overview

- `Flow`: flowchart generation and partial edits based on draw.io XML
- `CAD`: interior workflow planning, analysis boards, 2D floor plans, render-task generation, and BOM
- `PPT`: structured slide generation, page-level editing, image-assisted iteration, and export

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Start local development

```bash
npm run dev
```

Default URL: `http://localhost:5173`

3. Run type checks

```bash
npm run check
```

4. Build for production

```bash
npm run build
```

## Useful Scripts

- `npm run dev`: start Vite development server
- `npm run dev:full`: start web and API dev servers together
- `npm run dev:web`: start frontend dev server
- `npm run dev:api`: start API dev server
- `npm run check`: TypeScript check
- `npm run lint`: ESLint
- `npm run build`: production build
- `npm run preview`: preview built app
- `npm start`: run API server

## Development Notes

- AI configuration is read from local app settings and can be routed to custom providers
- PPT local development now depends on the local `/api/ppt-ai` proxy route
- After changing local API route wiring in `vite.config.ts`, restart the dev server

## Project Structure

```text
.
├─ agent/                      # Agent prompts and sub-agent specs
├─ public/                     # Static assets
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow canvas
│     ├─ cad/                  # CAD canvas
│     └─ ppt/                  # PPT canvas
├─ api/                        # Local API route entrypoints
└─ README.md
```

## Origins and Integrations

- Flow canvas: integrated and extended from [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT canvas: integrated and extended from [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD canvas: built in-house, including agent workflow, 2D SVG editing, render orchestration, and BOM pipeline

## Docs

- Deployment guide: [deploy/README.md](deploy/README.md)

## Contact

Scan the WeChat QR code below to contact the author.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
