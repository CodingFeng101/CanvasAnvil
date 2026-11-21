# Canvases in coding agents

The canvases do not live only on this site. With the plugin or a skill installed, one sentence in a coding agent such as Claude Code or Codex opens the same canvas beside the conversation.

## Four skills

| Skill | What it does |
| --- | --- |
| `diagram-skill` | Draw.io diagrams from the conversation, editable by hand, exported as drawio / SVG / PNG; data under the project's `diagram/` |
| `cad-skill` | Plan rebuilding, layout, electrics, checks, quotes and drawing sets; data under `cad/` |
| `ppt-skill` | Decks the way the site makes them: templates, outline review, all slides at once, PPTX / PDF export |
| `canvas-skill` | An Excalidraw whiteboard for pictures and edits by annotation, also carrying the diagram and interior canvases |

Every skill uses the host's own text model by default, with no extra API key. Only image generation needs an image service of its own.

## The plugin (recommended)

The plugin packages the canvases as an MCP server: once installed, the agent can open a canvas directly and read the changes you make on it.

### Claude Code

```bash
claude plugin marketplace add CodingFeng101/CanvasAnvil --sparse .claude-plugin skill/canvas-skill
claude plugin install canvasanvil-canvas@canvasanvil
```

The `--sparse` in these commands makes the host download only the marketplace file and the plugin folder, not the whole repository (website code, example images and history).

### Codex

```bash
codex plugin marketplace add CodingFeng101/CanvasAnvil --ref main --sparse .agents/plugins --sparse skill/canvas-skill
codex plugin add canvasanvil-canvas@canvasanvil
```

Restart the agent afterwards, and call `$canvas-skill`, `$diagram-skill` or `$cad-skill` to open a canvas. `$ppt-skill` is in the plugin too; it opens no editor, the agent runs the outline, slides and export itself, with the image settings in `skills/ppt-skill/config/image-provider.json` of the installed plugin. It needs Node 20 or later; the package already includes the MCP server and the interface, so there are no npm dependencies to install.

> [!NOTE]
> If you installed from the `canvasanvil-local` marketplace before, it has been renamed to `canvasanvil`; run the first command again to add it.

## Installing a single skill

To use one skill alone, put its folder in the agent's skills directory (`~/.claude/skills` for Claude Code, `~/.codex/skills` for Codex). Settings → Skills and plugins offers four ways; pick the one that suits your setup:

- **One click**: when running locally, the site copies it there for you;
- **npx**: one `npx degit` command that fetches just that folder;
- **git**: a shallow sparse clone, then a copy;
- **Zip**: download it and unpack it yourself.

> [!WHY]
> Every skill folder is **self-contained**: it references no other code in the repository and carries the scripts and assets it needs. So it can be copied into any project on its own, without bringing the whole of CanvasAnvil along.
