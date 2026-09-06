<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil hero" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>AI-powered multi-canvas creation for Diagrams, CAD, and PPT.</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v2.1.0-blue" />
  <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0-green" />
  <img alt="React" src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-3-orange" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" />
</p>

<p align="center">
  <a href="#creative-canvases">Canvases</a> |
  <a href="#ppt-canvas">PPT Showcase</a> |
  <a href="#video-tutorial">Video Tutorial</a> |
  <a href="#skills">Skills</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="README.zh-CN.md">Chinese</a>
</p>

<p align="center">
  <strong>⭐ If CanvasAnvil helps your workflow, please star the repo and fork it for your own canvas experiments.</strong>
</p>

> CanvasAnvil brings diagramming, interior design workflows, and presentation production into one unified workspace.

## 🔷 Diagram Canvas

Turn structured prompts into clear diagrams for research, systems, delivery plans, and teaching maps, then keep refining layout, labels, and node relationships in one place.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/flow/01.png" alt="Diagram example: academic research framework" width="100%" /><br/><strong>Academic Research Framework</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/flow/02.png" alt="Diagram example: intelligent Q&A system architecture" width="100%" /><br/><strong>Intelligent Q&A System Architecture</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/flow/03.png" alt="Diagram example: project implementation roadmap" width="100%" /><br/><strong>Project Implementation Roadmap</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/flow/04.png" alt="Diagram example: course design mind map" width="100%" /><br/><strong>Course Design Mind Map</strong></td>
  </tr>
</table>

## 🏠 Interior Design Canvas

Move from concept framing to drawable outputs by combining planning boards, 2D layouts, render briefs, and material-list delivery in one workflow.

### Showcase

<table>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/01.png" alt="CAD renovation plan layout" width="100%" /><br/><strong>Renovation Plan Layout</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/02.png" alt="CAD floor finish plan" width="100%" /><br/><strong>Floor Finish Plan</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/03.png" alt="CAD reflected ceiling plan" width="100%" /><br/><strong>Reflected Ceiling Plan</strong></td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/04.png" alt="CAD wall setting out plan" width="100%" /><br/><strong>Wall Setting-Out Plan</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/05.png" alt="CAD MEP plan" width="100%" /><br/><strong>MEP Coordination Plan</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/06.png" alt="CAD elevation index and interior elevations" width="100%" /><br/><strong>Elevation Index + Interior Elevations</strong></td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/07.png" alt="CAD detail drawings" width="100%" /><br/><strong>Detail Drawings</strong></td>
    <td width="33.33%" align="center"></td>
    <td width="33.33%" align="center"></td>
  </tr>
</table>

## 📑 PPT Canvas

Generate full presentations through a controlled pipeline: outline first, visual production second, then export as editable PPT, PDF, or image-based PPT.

### Showcase

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt1.png" alt="AI content creation workflow deck preview" width="100%" />
      <strong>AI Content Creation Workflow</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt2.png" alt="Intelligent collaboration growth deck preview" width="100%" />
      <strong>Intelligent Collaboration Growth</strong>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt3.png" alt="AI-driven business innovation deck preview" width="100%" />
      <strong>AI-Driven Business Innovation</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt4.png" alt="Low-carbon smart campus transformation deck preview" width="100%" />
      <strong>Low-Carbon Smart Campus Transformation</strong>
    </td>
  </tr>
</table>

## 🎨 Creative Canvases

| Workspace | Focus | Typical output |
| --- | --- | --- |
| `Diagram` | structured diagram generation and partial editing | flowcharts, architecture diagrams, logic diagrams |
| `CAD` | interior planning, drawing coordination, and delivery packaging | concept boards, 2D drawings, render briefs, material lists |
| `PPT` | structured presentation generation and mixed export workflows | presentations, pitch decks, editable decks, report slides |

## 🌈 Release

Current release: `v2.1.0`

Unreleased on this branch — a structural refactor of the whole project, plus the
fixes that came out of it. See [CHANGELOG.md](CHANGELOG.md) for the full list.

**Narrowed**

- Three canvases only: Diagram, Interior Design and PPT. The poster, product and infographic canvases are gone.
- The embedded `pptist-lab` editor is gone; editable decks export directly as `.pptx`.
- One OpenAI-compatible request path. The provider list is gone from the app *and* from the `cad-skill` and `ppt-skill` bundles, which had carried a nine-vendor image registry of their own — eight of them with no reachable endpoint.
- The Next.js port that shadowed the Vite client is gone, along with roughly 900 lines of unreachable code the old `PptWorkspace` was hiding.

**Restructured**

- The repository now separates `client/`, `server/`, `contracts/` and `resources/`, and every workspace has the same three layers: pure modules, per-feature hooks, one file per screen. Written down in [docs/architecture.md](docs/architecture.md).
- `PptCanvas.tsx` went from 5,300 lines to roughly 2,250 and renders no UI of its own.
- The shared UI kit, storage layer, file pipeline, chat plumbing and i18n each exist once instead of per workspace.
- TypeScript strict mode is on and the bundle is split: initial load dropped from 2.89 MB to roughly 700 KB raw.
- 260 tests (`npm test`, node:test) cover the pure logic the refactor had to preserve.

**PPT workflow**

- Editable export is immediate. It used to open a text-box review and then spend three model calls per slide; a two-slide deck took over five minutes, and now takes about a second.
- The planner is given the deck template and writes slide descriptions that match it. It used to invent its own palette, which then outvoted the template at render time — a deck built on a dark template came out white.
- Material images attached to a slide, and pictures attached in the chat panel, now actually reach the image model. Both were being dropped before the API call.
- The chat toolbar has two toggles for pinning whether a message edits the current slide image or redraws it; leaving both off keeps the router in charge.
- The slideshow has a way in again — it was complete but had no entry point.

**Fixed**

Twenty-one defects found along the way, including an infinite render loop in every chat panel, four CAD catch blocks that swallowed a failed patch apply, and server-side debug logging that wrote entire conversations to the console.

## 🌐 Online Access

Current online access URL:

- 🔗 CanvasAnvil: [https://canvasanvil.codingfgd.asia](https://canvasanvil.codingfgd.asia)

## Video Tutorial

- Bilibili tutorial: [https://b23.tv/pFWv7iI](https://b23.tv/pFWv7iI)

## 🧰 Skills

CanvasAnvil includes dedicated local skills for each canvas so workflows stay opinionated, repeatable, and easier to maintain.

- `flow-skill` · Diagram generation and packaging
  Outputs clean diagram assets and skips standalone HTML preview by default.
- `cad-skill` · Interior-delivery workflow
  Exports drawing bundles and a CSV material list for downstream delivery.
- `ppt-skill` · Full presentation production
  Enforces outline review before generation and supports editable PPT, PDF, and image-based PPT output.

All skills use the host text model by default. Only image generation requires explicit provider configuration.

## 🚀 Quick Start

1. Install dependencies

```bash
npm install
```

2. Start local development

```bash
npm run dev
```

Default URL: `http://127.0.0.1:8001`

CanvasAnvil deploys as a single service. See [deploy/README.md](deploy/README.md) for detailed deployment configuration.

3. Run type checks

```bash
npm run check
```

4. Build for production

```bash
npm run build
```

## 🧪 Common Commands

- `npm run dev`: start the app on `8001`
- `npm run check`: run TypeScript checks
- `npm run build`: build the production bundle

## 📝 Development Notes

- Every model call uses the OpenAI HTTP protocol. To use another vendor, point the base URL in Settings at their OpenAI-compatible endpoint — there is no provider list to pick from.
- AI configuration is read from local app settings; the text and image channels are configured separately.
- Local development depends on the API service for `/api/chat` and `/api/ppt-ai`.
- After changing local API route wiring in `vite.config.ts`, restart the dev server.
- `server/**` uses relative imports: `vite.config.ts` imports the dev middleware so `npm run dev` serves the API in-process, and Vite loads its own config through plain Node, which does not know the `@/` alias.
- Set `PROMPT_LOG_DIR` to write assembled prompts to disk; it is off by default because the log contains the user's content.

## 📚 Docs

- Architecture overview: [docs/architecture.md](docs/architecture.md)
- Deployment guide: [deploy/README.md](deploy/README.md)

## ⚖️ License

CanvasAnvil is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See [LICENSE](LICENSE) for the full license text.

## 💌 Contact

- `3524962421@qq.com`

## 💬 Community

欢迎加入「智构开源社」群聊，一起交流 CanvasAnvil 及开源项目相关内容。

![智构开源社微信群二维码](docs/assets/wechat-group.png)
