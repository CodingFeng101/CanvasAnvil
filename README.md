<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil hero" width="100%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>A multi-canvas AI creation platform for Flow, CAD, PPT, Poster, Infographic, and Product storytelling.</strong>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">Simplified Chinese</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v2.0.0-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-6-0f766e?style=for-the-badge" />
  <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0-f97316?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil brings diagramming, interior design workflows, presentation production, poster creation, infographic composition, and product storytelling into one unified workspace.

## Release

Current release: `v2.0.0`

- `v2.0.0`: added Poster, Infographic, and Product canvases, added local workflow skills, embedded the editable PPT editor, and expanded compatibility across more models and providers
- `v1.0.2`: moved PPT to an image-first workflow and deferred OCR/text refill to editable PPT export
- `v1.0.1`: improved persistence stability for PPT and CAD assets

## What's New in v2.0.0

- Added three new canvases: `Poster`, `Infographic`, and `Product`
- Embedded `pptist-lab` directly inside the PPT workspace for editable PPT authoring
- Updated editable PPT export to run through `text box review -> text extraction -> start editing`
- Kept both the original slide image and the `textless background` version available during PPT review
- Improved extracted text mapping so more of the original size, color, weight, spacing, alignment, and line-height carry into the embedded editor
- Expanded compatibility across more AI models and providers for more flexible workspace configuration
- Added local workflow skills for `Flow`, `CAD`, `PPT`, `Poster`, `Infographic`, and `Product`
- Added script-backed skill workflows for diagram export, CAD bundles, PPT template/deck generation, image generation, PDF export, and image-based PPT export
- Standardized skill image-generation configuration through `config/image-provider.json`
- Updated CAD skill BOM output to `cad_bom.csv`
- Updated Flow skill bundles to skip standalone HTML preview generation by default

## Example Assets

Each canvas has a dedicated example-asset directory under `public/examples/`.

| Canvas | Example directory | Suggested naming |
| --- | --- | --- |
| `Flow` | `public/examples/flow/` | `01.png`, `02.png`, `03.png`, `04.png` |
| `CAD` | `public/examples/cad/` | `01.png` through `09.png` |
| `PPT` | `public/examples/ppt/` | `01.png` through `09.png` |
| `Poster` | `public/examples/poster/` | `01.png` through `04.png` |
| `Infographic` | `public/examples/infographic/` | `01.png` through `04.png` |
| `Product` | `public/examples/product/` | `01.png` through `04.png` |

Keep example images lightweight and web-ready. The README showcase tables read from these paths.

## Workspace Overview

| Workspace | Focus | Typical output |
| --- | --- | --- |
| `Flow` | structured diagram generation and partial editing | flowcharts, architecture diagrams, logic diagrams |
| `CAD` | interior workflow planning and spatial analysis | boards, 2D plans, render tasks, BOM |
| `PPT` | structured slide generation and editable export | presentations, pitch decks, visual slides |
| `Poster` | single-surface visual composition | posters, key visuals, campaign graphics |
| `Infographic` | structured visual storytelling | data summaries, explainers, information boards |
| `Product` | product-intro storytelling | feature pages, launch visuals, product narratives |

## Flow Canvas

Turn structured prompts into clean diagrams, then keep iterating on layout, labels, and node relationships inside the same canvas.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/flow/01.png" alt="Flow example 1" width="100%" /><br/>System architecture</td>
    <td width="50%" align="center"><img src="public/examples/flow/02.png" alt="Flow example 2" width="100%" /><br/>Business process</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/flow/03.png" alt="Flow example 3" width="100%" /><br/>Data pipeline</td>
    <td width="50%" align="center"><img src="public/examples/flow/04.png" alt="Flow example 4" width="100%" /><br/>Logic mapping</td>
  </tr>
</table>

## Interior Design Canvas

Build interior-design workflows that connect planning boards, 2D layouts, material thinking, render orchestration, and BOM-oriented outputs.

### Showcase

<table>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/01.png" alt="CAD example 1" width="100%" /><br/>Planning board</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/02.png" alt="CAD example 2" width="100%" /><br/>2D layout</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/03.png" alt="CAD example 3" width="100%" /><br/>Living room concept</td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/04.png" alt="CAD example 4" width="100%" /><br/>Material board</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/05.png" alt="CAD example 5" width="100%" /><br/>Lighting strategy</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/06.png" alt="CAD example 6" width="100%" /><br/>Render task</td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/07.png" alt="CAD example 7" width="100%" /><br/>Functional zoning</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/08.png" alt="CAD example 8" width="100%" /><br/>BOM-oriented summary</td>
    <td width="33.33%" align="center"><img src="public/examples/cad/09.png" alt="CAD example 9" width="100%" /><br/>Final presentation board</td>
  </tr>
</table>

## PPT Canvas

Generate structured decks, iterate in an image-first workflow, review text boxes before extraction, and continue editing inside the embedded PPT editor.

### Showcase

<table>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/ppt/01.png" alt="PPT example 1" width="100%" /><br/>Cover slide</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/02.png" alt="PPT example 2" width="100%" /><br/>Agenda slide</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/03.png" alt="PPT example 3" width="100%" /><br/>Business layout</td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/ppt/04.png" alt="PPT example 4" width="100%" /><br/>Data storytelling</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/05.png" alt="PPT example 5" width="100%" /><br/>Teaching slide</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/06.png" alt="PPT example 6" width="100%" /><br/>Tech presentation</td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/ppt/07.png" alt="PPT example 7" width="100%" /><br/>Product deck</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/08.png" alt="PPT example 8" width="100%" /><br/>Infographic slide</td>
    <td width="33.33%" align="center"><img src="public/examples/ppt/09.png" alt="PPT example 9" width="100%" /><br/>Editable export result</td>
  </tr>
</table>

## Poster Canvas

Create single-frame campaign visuals with fast composition, strong typography, and poster-oriented layout control.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/poster/01.png" alt="Poster example 1" width="100%" /><br/>Campaign poster</td>
    <td width="50%" align="center"><img src="public/examples/poster/02.png" alt="Poster example 2" width="100%" /><br/>Event poster</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/poster/03.png" alt="Poster example 3" width="100%" /><br/>Brand visual</td>
    <td width="50%" align="center"><img src="public/examples/poster/04.png" alt="Poster example 4" width="100%" /><br/>Launch poster</td>
  </tr>
</table>

## Infographic Canvas

Translate information-heavy content into structured visual narratives that stay readable and presentation-ready.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/infographic/01.png" alt="Infographic example 1" width="100%" /><br/>Data summary</td>
    <td width="50%" align="center"><img src="public/examples/infographic/02.png" alt="Infographic example 2" width="100%" /><br/>Process explainer</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/infographic/03.png" alt="Infographic example 3" width="100%" /><br/>Comparison board</td>
    <td width="50%" align="center"><img src="public/examples/infographic/04.png" alt="Infographic example 4" width="100%" /><br/>Timeline layout</td>
  </tr>
</table>

## Product Canvas

Present products through feature-focused layouts that combine specifications, key selling points, and hero imagery.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/product/01.png" alt="Product example 1" width="100%" /><br/>Product hero page</td>
    <td width="50%" align="center"><img src="public/examples/product/02.png" alt="Product example 2" width="100%" /><br/>Feature comparison</td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/product/03.png" alt="Product example 3" width="100%" /><br/>Spec sheet</td>
    <td width="50%" align="center"><img src="public/examples/product/04.png" alt="Product example 4" width="100%" /><br/>Launch narrative</td>
  </tr>
</table>

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Start local development

CanvasAnvil uses two dev services during editable PPT work:

- Main app on `5173`
- `pptist-lab` on `5174`

```bash
npm run dev

cd pptist-lab
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

Default URLs:

- Main app: `http://127.0.0.1:5173`
- PPT editor service: `http://127.0.0.1:5174`

3. Run type checks

```bash
npm run check
```

4. Build for production

```bash
npm run build
```

## Useful Scripts

- `npm run dev`: start the main Vite app on the root project
- `npm run dev:full`: start the web and API dev servers together
- `npm run dev:web`: start the frontend dev server
- `npm run dev:api`: start the API dev server
- `cd pptist-lab && npm run dev -- --host 127.0.0.1 --port 5174`: start the embedded PPT editor service
- `npm run check`: run TypeScript checks
- `npm run lint`: run ESLint
- `npm run build`: build for production
- `npm run preview`: preview the built app
- `npm start`: run the API server

## Development Notes

- AI configuration is read from local app settings and can be routed to custom providers
- PPT local development depends on the local `/api/ppt-ai` proxy route
- After changing local API route wiring in `vite.config.ts`, restart the dev server

## Docs

- Deployment guide: [deploy/README.md](deploy/README.md)

## License

CanvasAnvil is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See [LICENSE](LICENSE) for the full license text.

## Contact

- `3524962421@qq.com`
