<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil hero" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>AI-powered multi-canvas creation for Flow, CAD, PPT, Poster, Infographic, and Product storytelling.</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v2.0.0-blue" />
  <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0-green" />
  <img alt="React" src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-6-orange" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" />
</p>

<p align="center">
  <a href="#creative-canvases">Canvases</a> ·
  <a href="#skills">Skills</a> ·
  <a href="#ppt-canvas">PPT Showcase</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="README.zh-CN.md">Chinese</a>
</p>

> CanvasAnvil brings diagramming, interior design workflows, presentation production, poster creation, infographic composition, and product storytelling into one unified workspace.

## ✦ Release

Current release: `v2.0.0`

- Added local workflow skills for `Flow`, `CAD`, `PPT`, `Poster`, `Infographic`, and `Product`
- Added the embedded PPT editor for editable presentation workflows
- Improved Flow generation continuity so oversized diagrams can continue after truncation
- Expanded canvas editing with better partial modification workflows
- Added built-in icon-library support for richer visual composition

## ◇ Creative Canvases

| Workspace | Focus | Typical output |
| --- | --- | --- |
| `Flow` | structured diagram generation and partial editing | flowcharts, architecture diagrams, logic diagrams |
| `CAD` | interior planning, drawing coordination, and delivery packaging | concept boards, 2D drawings, render briefs, material lists |
| `PPT` | structured presentation generation and mixed export workflows | presentations, pitch decks, editable decks, report slides |
| `Poster` | single-frame visual communication | event posters, promotional posters, campaign key visuals |
| `Infographic` | information design and visual explanation | explainer graphics, thematic information boards, comparison charts |
| `Product` | product storytelling and feature communication | product showcase pages, selling-point visuals, launch pages |

## ⚙ Skills

CanvasAnvil includes dedicated local skills for each canvas so workflows stay opinionated, repeatable, and easier to maintain.

- `flow-skill` · Diagram generation and packaging
  Outputs clean diagram assets and skips standalone HTML preview by default.
- `cad-skill` · Interior-delivery workflow
  Exports drawing bundles and a CSV material list for downstream delivery.
- `ppt-skill` · Full presentation production
  Enforces outline review before generation and supports editable PPT, PDF, and image-based PPT output.
- `poster-skill` · Single-frame campaign visuals
  Focuses on strong composition, typography, and poster-ready output.
- `infographic-skill` · Information-to-visual translation
  Organizes dense content into readable infographic layouts.
- `product-skill` · Feature-led product storytelling
  Builds showcase visuals around positioning, selling points, and launch messaging.

All skills use the host text model by default. Only image generation requires explicit provider configuration.

## ◎ Flow Canvas

Turn structured prompts into clear diagrams for research, systems, delivery plans, and teaching maps, then keep refining layout, labels, and node relationships in one place.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/flow/01.png" alt="Flow example: academic research framework" width="100%" height="340" style="object-fit:contain;border-radius:10px;background:#ffffff;" /><br/><strong>Academic Research Framework</strong></td>
    <td width="50%" align="center"><img src="public/examples/flow/02.png" alt="Flow example: intelligent Q&A system architecture" width="100%" height="340" style="object-fit:contain;border-radius:10px;background:#ffffff;" /><br/><strong>Intelligent Q&A System Architecture</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/flow/03.png" alt="Flow example: project implementation roadmap" width="100%" height="340" style="object-fit:contain;border-radius:10px;background:#ffffff;" /><br/><strong>Project Implementation Roadmap</strong></td>
    <td width="50%" align="center"><img src="public/examples/flow/04.png" alt="Flow example: course design mind map" width="100%" height="340" style="object-fit:contain;border-radius:10px;background:#ffffff;" /><br/><strong>Course Design Mind Map</strong></td>
  </tr>
</table>

## ◫ Interior Design Canvas

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

## ▣ PPT Canvas

Generate full presentations through a controlled pipeline: outline first, visual production second, then export as editable PPT, PDF, or image-based PPT.

### Showcase

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <table cellspacing="0" cellpadding="2">
        <tr><td><img src="public/examples/ppt/ppt1/01.png" alt="AI content creation workflow slide 1" width="100%" /></td><td><img src="public/examples/ppt/ppt1/02.png" alt="AI content creation workflow slide 2" width="100%" /></td><td><img src="public/examples/ppt/ppt1/03.png" alt="AI content creation workflow slide 3" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt1/04.png" alt="AI content creation workflow slide 4" width="100%" /></td><td><img src="public/examples/ppt/ppt1/05.png" alt="AI content creation workflow slide 5" width="100%" /></td><td><img src="public/examples/ppt/ppt1/06.png" alt="AI content creation workflow slide 6" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt1/07.png" alt="AI content creation workflow slide 7" width="100%" /></td><td><img src="public/examples/ppt/ppt1/08.png" alt="AI content creation workflow slide 8" width="100%" /></td><td><img src="public/examples/ppt/ppt1/09.png" alt="AI content creation workflow slide 9" width="100%" /></td></tr>
      </table>
      <strong>AI Content Creation Workflow</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <table cellspacing="0" cellpadding="2">
        <tr><td><img src="public/examples/ppt/ppt2/01.png" alt="Intelligent collaboration growth slide 1" width="100%" /></td><td><img src="public/examples/ppt/ppt2/02.png" alt="Intelligent collaboration growth slide 2" width="100%" /></td><td><img src="public/examples/ppt/ppt2/03.png" alt="Intelligent collaboration growth slide 3" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt2/04.png" alt="Intelligent collaboration growth slide 4" width="100%" /></td><td><img src="public/examples/ppt/ppt2/05.png" alt="Intelligent collaboration growth slide 5" width="100%" /></td><td><img src="public/examples/ppt/ppt2/06.png" alt="Intelligent collaboration growth slide 6" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt2/07.png" alt="Intelligent collaboration growth slide 7" width="100%" /></td><td><img src="public/examples/ppt/ppt2/08.png" alt="Intelligent collaboration growth slide 8" width="100%" /></td><td><img src="public/examples/ppt/ppt2/09.png" alt="Intelligent collaboration growth slide 9" width="100%" /></td></tr>
      </table>
      <strong>Intelligent Collaboration Growth</strong>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <table cellspacing="0" cellpadding="2">
        <tr><td><img src="public/examples/ppt/ppt3/01.png" alt="AI-driven business innovation slide 1" width="100%" /></td><td><img src="public/examples/ppt/ppt3/02.png" alt="AI-driven business innovation slide 2" width="100%" /></td><td><img src="public/examples/ppt/ppt3/03.png" alt="AI-driven business innovation slide 3" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt3/04.png" alt="AI-driven business innovation slide 4" width="100%" /></td><td><img src="public/examples/ppt/ppt3/05.png" alt="AI-driven business innovation slide 5" width="100%" /></td><td><img src="public/examples/ppt/ppt3/06.png" alt="AI-driven business innovation slide 6" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt3/07.png" alt="AI-driven business innovation slide 7" width="100%" /></td><td><img src="public/examples/ppt/ppt3/08.png" alt="AI-driven business innovation slide 8" width="100%" /></td><td><img src="public/examples/ppt/ppt3/09.png" alt="AI-driven business innovation slide 9" width="100%" /></td></tr>
      </table>
      <strong>AI-Driven Business Innovation</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <table cellspacing="0" cellpadding="2">
        <tr><td><img src="public/examples/ppt/ppt4/01.png" alt="Low-carbon smart campus transformation slide 1" width="100%" /></td><td><img src="public/examples/ppt/ppt4/02.png" alt="Low-carbon smart campus transformation slide 2" width="100%" /></td><td><img src="public/examples/ppt/ppt4/03.png" alt="Low-carbon smart campus transformation slide 3" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt4/04.png" alt="Low-carbon smart campus transformation slide 4" width="100%" /></td><td><img src="public/examples/ppt/ppt4/05.png" alt="Low-carbon smart campus transformation slide 5" width="100%" /></td><td><img src="public/examples/ppt/ppt4/06.png" alt="Low-carbon smart campus transformation slide 6" width="100%" /></td></tr>
        <tr><td><img src="public/examples/ppt/ppt4/07.png" alt="Low-carbon smart campus transformation slide 7" width="100%" /></td><td><img src="public/examples/ppt/ppt4/08.png" alt="Low-carbon smart campus transformation slide 8" width="100%" /></td><td><img src="public/examples/ppt/ppt4/09.png" alt="Low-carbon smart campus transformation slide 9" width="100%" /></td></tr>
      </table>
      <strong>Low-Carbon Smart Campus Transformation</strong>
    </td>
  </tr>
</table>

## ✺ Poster Canvas

Create high-impact single-frame visuals built for announcements, campaigns, events, and brand moments where composition has to carry fast.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/poster/01.png" alt="Poster example: Youth Design Forum 2026" width="100%" /><br/><strong>Youth Design Forum 2026</strong></td>
    <td width="50%" align="center"><img src="public/examples/poster/02.png" alt="Poster example: Jiangnan Guochao Culture Festival" width="100%" /><br/><strong>Jiangnan Guochao Culture Festival</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/poster/03.png" alt="Poster example: Urban Summer Indie Music Festival" width="100%" /><br/><strong>Urban Summer Indie Music Festival</strong></td>
    <td width="50%" align="center"><img src="public/examples/poster/04.png" alt="Poster example: Future Intelligent Technology Summit 2026" width="100%" /><br/><strong>Future Intelligent Technology Summit 2026</strong></td>
  </tr>
</table>

## ◈ Infographic Canvas

Translate dense information into visual explanation boards that stay readable, structured, and presentation-ready.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/infographic/01.png" alt="Infographic example: AI computing power growth trend" width="100%" /><br/><strong>AI Computing Power Growth Trend</strong></td>
    <td width="50%" align="center"><img src="public/examples/infographic/02.png" alt="Infographic example: smart car user priorities" width="100%" /><br/><strong>Smart Car User Priorities</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/infographic/03.png" alt="Infographic example: healthy daily routine guide" width="100%" /><br/><strong>Healthy Daily Routine Guide</strong></td>
    <td width="50%" align="center"><img src="public/examples/infographic/04.png" alt="Infographic example: low-carbon lifestyle guide" width="100%" /><br/><strong>Low-Carbon Lifestyle Guide</strong></td>
  </tr>
</table>

## ⬢ Product Canvas

Present products through feature-led layouts that combine hero imagery, selling points, and narrative structure for launch and showcase use.

### Showcase

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/product/01.png" alt="Product example: wireless noise-cancelling earbuds" width="100%" /><br/><strong>Wireless Noise-Cancelling Earbuds</strong></td>
    <td width="50%" align="center"><img src="public/examples/product/02.png" alt="Product example: flagship gaming laptop" width="100%" /><br/><strong>Flagship Gaming Laptop</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/product/03.png" alt="Product example: brightening essence skincare" width="100%" /><br/><strong>Brightening Essence Skincare</strong></td>
    <td width="50%" align="center"><img src="public/examples/product/04.png" alt="Product example: intelligent electric SUV" width="100%" /><br/><strong>Intelligent Electric SUV</strong></td>
  </tr>
</table>

## ▶ Quick Start

1. Install dependencies

```bash
npm install
```

2. Start local development

CanvasAnvil has both a web app and a local API service. Use the combined dev command so the frontend proxy routes and local API endpoints are available.

```bash
npm run dev:full
```

Default URLs:

- Web app: `http://127.0.0.1:5173`
- API service: `http://127.0.0.1:8080`

3. Run type checks

```bash
npm run check
```

4. Build for production

```bash
npm run build
```

## ⌘ Common Commands

- `npm run dev:full`: start the web app and local API service together
- `npm run check`: run TypeScript checks
- `npm run build`: build the production bundle

## ☰ Development Notes

- AI configuration is read from local app settings; image-generation workflows use the configured image provider
- Local development depends on the API service for routes such as `/api/ppt-ai`
- After changing local API route wiring in `vite.config.ts`, restart the dev server

## ⌂ Docs

- Deployment guide: [deploy/README.md](deploy/README.md)

## ⚖ License

CanvasAnvil is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See [LICENSE](LICENSE) for the full license text.

## ✉ Contact

- `3524962421@qq.com`
