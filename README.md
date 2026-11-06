<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>AI-powered multi-canvas creation for diagrams, interior design, presentations and images.</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v2.2.0-blue" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="React" src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-4-orange" />
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

## 🆕 Latest update: straighter diagrams

The Diagram canvas no longer trusts the model's pixel coordinates as-is. Each diagram now goes through four steps:

- **Intent**: the model writes a short plan first and declares a layout (flow, tree, mind map, swimlane, sequence, timeline or free). Groups are real draw.io containers, and coordinates are only a sketch of the arrangement.
- **Solve**: the app re-lays the diagram with ELK for its layout kind, with a lighter tidy pass as the fallback.
- **Validate**: a layout check scores overlaps, shapes outside their groups, edges through shapes and text that does not fit. The corrected version is shown only when it scores at least as well as the original and keeps its order and alignment.
- **Show**: the chat shows each diagram as a chain of steps (thinking, drawing, correction). The correction step shows the score before and after, and lets you switch back to the model's original layout.

On a 48-prompt evaluation the average layout score went from 89.0 to 93.4, and from 81.8 to 95.7 on the held-out half. `diagram-skill` follows the same rules and adds `scripts/check-layout.mjs`, so coding agents check and fix a diagram before handing it over.

https://github.com/user-attachments/assets/582c70ae-38df-4949-913c-c3f4369a7c8c

<p align="center">
  <strong>⭐ If CanvasAnvil helps your workflow, please star the repo and fork it for your own canvas experiments.</strong>
</p>

> CanvasAnvil brings diagramming, interior design, presentation production and free-form image work into one workspace, in Chinese or English.

## 🔷 Diagram Canvas

Turn structured prompts into clear diagrams for research, systems, delivery plans, and teaching maps, then keep refining layout, labels, and node relationships in one place.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/01.png" alt="Diagram example: academic research framework" width="100%" /><br/><strong>Academic Research Framework</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/02.png" alt="Diagram example: intelligent Q&A system architecture" width="100%" /><br/><strong>Intelligent Q&A System Architecture</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/03.png" alt="Diagram example: project implementation roadmap" width="100%" /><br/><strong>Project Implementation Roadmap</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/04.png" alt="Diagram example: course design mind map" width="100%" /><br/><strong>Course Design Mind Map</strong></td>
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

Generate full presentations through a controlled pipeline: outline first, visual production second, then export as PDF or image-based PPT. The deck template sets the style and colour palette; each slide gets a layout of its own.

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

## 🖌️ Free Canvas

A whiteboard for images: describe a picture in one sentence and it lands on the board. Circle what to change, write a note beside it, press the wand, and a new version appears next to the original. Every version is kept, and the version strip shows what each one changed and when.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/canvas/01.svg" alt="Free Canvas: an image from one sentence" width="100%" /><br/><strong>An Image from One Sentence</strong></td>
    <td width="50%" align="center"><img src="public/examples/canvas/02.svg" alt="Free Canvas: marking up the image" width="100%" /><br/><strong>Mark It Up on the Board</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/canvas/03.svg" alt="Free Canvas: a new version from the marks" width="100%" /><br/><strong>A New Version from the Marks</strong></td>
    <td width="50%" align="center"><img src="public/examples/canvas/04.svg" alt="Free Canvas: comparing versions" width="100%" /><br/><strong>Compare the Versions</strong></td>
  </tr>
</table>

## 🎨 Creative Canvases

| Workspace | Focus | Typical output |
| --- | --- | --- |
| `Diagram` | structured diagram generation and partial editing | flowcharts, architecture diagrams, logic diagrams |
| `Interior Design` | interior planning, drawing coordination, and delivery packaging | concept boards, 2D drawings, render briefs, material lists |
| `PPT` | structured presentation generation and export | presentations, pitch decks, report slides |
| `Free Canvas` | text-to-image and edit-by-annotation on a whiteboard | posters, illustrations, revised versions of an image |

## 🌐 Online Access

Current online access URL:

- 🔗 CanvasAnvil: [https://canvasanvil.codingfgd.asia](https://canvasanvil.codingfgd.asia)

## Video Tutorial

One walkthrough per canvas on Bilibili (narrated in Chinese). In the app, the **Tutorials** button at the top of the home page plays them in place.

<table>
  <tr>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1wyxs66EEd"><img src="public/tutorials/diagram.jpg" alt="A whole architecture diagram from one sentence, and edits that touch only what you name" width="100%" /></a><br/><strong>🔷 Diagram</strong> · <a href="https://www.bilibili.com/video/BV1wyxs66EEd">A whole architecture diagram from one sentence, and edits that touch only what you name</a></td>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1ryxs6zEtN"><img src="public/tutorials/cad.jpg" alt="A full set of renovation drawings from one request, plus a 3D walkthrough" width="100%" /></a><br/><strong>🏠 Interior Design</strong> · <a href="https://www.bilibili.com/video/BV1ryxs6zEtN">A full set of renovation drawings from one request, plus a 3D walkthrough</a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1oGxs6hEf6"><img src="public/tutorials/ppt.jpg" alt="An 8-slide deck from one sentence, with 200+ templates to choose from" width="100%" /></a><br/><strong>📑 PPT</strong> · <a href="https://www.bilibili.com/video/BV1oGxs6hEf6">An 8-slide deck from one sentence, with 200+ templates to choose from</a></td>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV17Gxs6aETm"><img src="public/tutorials/canvas.jpg" alt="Circle a spot and only that changes; the rest of the image stays put" width="100%" /></a><br/><strong>🖌️ Free Canvas</strong> · <a href="https://www.bilibili.com/video/BV17Gxs6aETm">Circle a spot and only that changes; the rest of the image stays put</a></td>
  </tr>
</table>

## 🧰 Skills

CanvasAnvil includes dedicated local skills for each canvas so workflows stay opinionated, repeatable, and easier to maintain.

- `diagram-skill` · Diagram generation and packaging
  Outputs clean diagram assets and skips standalone HTML preview by default.
- `cad-skill` · Interior-delivery workflow
  Exports drawing bundles and a CSV material list for downstream delivery.
- `ppt-skill` · Full presentation production
  Enforces outline review before generation and supports editable PPT, PDF, and image-based PPT output.

All skills use the host text model by default. Only image generation requires explicit provider configuration.
Editable PPTX export is the exception: it rebuilds slides through the slide-alchemy agent pipeline, which also needs its own chat model, the slide-alchemy skill, Python and PowerPoint (see `skill/ppt-skill/references/export-modes.md`).

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
- `npm run lint`: run ESLint
- `npm test`: run the test suite
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
- Handoff notes (Chinese): [docs/HANDOFF.md](docs/HANDOFF.md)
- Deployment guide: [deploy/README.md](deploy/README.md)

## ⚖️ License

CanvasAnvil is released under the MIT License.
See [LICENSE](LICENSE) for the full license text.

## 💌 Contact

- `3524962421@qq.com`

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CodingFeng101/CanvasAnvil&type=Date)](https://star-history.com/#CodingFeng101/CanvasAnvil&Date)
