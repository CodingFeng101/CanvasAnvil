<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>Multi-canvas AI creation for Flow, CAD, and PPT.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">Simplified Chinese</a> ·
  <a href="README.zh-TW.md">Traditional Chinese</a> ·
  <a href="README.ja-JP.md">Japanese</a> ·
  <a href="README.ko-KR.md">Korean</a> ·
  <a href="README.fr-FR.md">French</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.2-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil is an AI creation platform that combines flowchart generation, CAD-oriented workflows, and PPT production in one workspace.

## Release

Current release: `v1.0.2`

- `v1.0.2`: switched PPT to an image-first workflow, deferred OCR/text refill to editable PPTX export, and persisted PPT templates in IndexedDB
- `v1.0.1`: fixed workspace persistence issues for PPT and CAD images

## ✨ Overview

| Workspace | What it focuses on | Typical output |
| --- | --- | --- |
| `Flow` | draw.io XML based generation and partial edits | flowcharts, system diagrams, logic diagrams |
| `CAD` | interior workflow planning and analysis | boards, 2D plans, render tasks, BOM |
| `PPT` | structured slide generation and image-first iteration | presentation decks, slide visuals, exports |

## 🚀 Latest Update

- PPT now follows an image-first workflow
- In-editor refinement and rerendering regenerate slide images directly instead of processing editable text layers during creation
- Export is split into `PDF`, `image-based PPT`, and `editable PPTX`
- OCR, textless background generation, and text refill run only when exporting `editable PPTX`
- Uploaded PPT templates and hidden preset-template preferences are now persisted through IndexedDB-backed local storage

## 🖼️ Canvas Previews

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

## 🌐 Online Demo

- [Open CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 🎬 Video Tutorials

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 Capability Overview

- `Flow`: flowchart generation and partial edits based on draw.io XML
- `CAD`: interior workflow planning, analysis boards, 2D floor plans, render-task generation, and BOM
- `PPT`: structured slide generation, image-first iteration, template persistence, and multi-format export

## ⚡ Quick Start

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

## 🛠️ Useful Scripts

- `npm run dev`: start the Vite development server
- `npm run dev:full`: start the web and API dev servers together
- `npm run dev:web`: start the frontend dev server
- `npm run dev:api`: start the API dev server
- `npm run check`: run TypeScript checks
- `npm run lint`: run ESLint
- `npm run build`: build for production
- `npm run preview`: preview the built app
- `npm start`: run the API server

## 🧪 Development Notes

- AI configuration is read from local app settings and can be routed to custom providers
- PPT local development depends on the local `/api/ppt-ai` proxy route
- After changing local API route wiring in `vite.config.ts`, restart the dev server

## 🗂️ Project Structure

```text
.
├── agent/                      # Agent prompts and sub-agent specs
├── public/                     # Static assets
├── src/
│   └── workspaces/
│       ├── flow/               # Flow canvas
│       ├── cad/                # CAD canvas
│       └── ppt/                # PPT canvas
├── api/                        # Local API route entrypoints
└── README.md
```

## 🔗 Origins and Integrations

- Flow canvas: integrated and extended from [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT canvas: integrated and extended from [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD canvas: built in-house, including agent workflow, 2D SVG editing, render orchestration, and BOM pipeline

## 📚 Docs

- Deployment guide: [deploy/README.md](deploy/README.md)

## 📮 Contact

Scan the WeChat QR code below to contact the author.

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
