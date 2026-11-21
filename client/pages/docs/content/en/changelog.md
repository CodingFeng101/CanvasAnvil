# Changelog

Every change worth mentioning, newest first.

## 2026-11-20

### New

- **A new home page and a detail page for each canvas**: a long, quiet page in a warm, literary style, with real screenshots of each canvas and the prompts that made them. "Start creating" carries a prompt typed on the home page into the canvas.
- **Workspaces laid out like Claude**: a sidebar with New work, Search (`Ctrl K`), My works, the four canvases and recent works (pin, rename, delete). A new work opens on a greeting with three example cards, each a request this canvas really ran, shown with what it made; click one to send it.
- **Saved automatically**: every work is kept as you go, with no Save button. "New work" starts a fresh one and the old one stays in My works, so the clear-chat button and its setting are gone.
- **Built-in docs** (`#/docs`): 22 pages in Chinese and English covering getting started, each canvas, My works, Settings, skills, development, the FAQ and the changelog, plus a "How it works" group that explains the algorithms and why each was chosen (diagram layout correction, the generate-check-revise loop, the interior layout engine, the PPT pipeline, canvas edits, how works are stored). Search, an outline of the page, and copy buttons on code blocks.
- **More in Settings**:
  - **Usage stats**: a year heatmap; daily, monthly, hourly and weekday charts; generation time, models, images, works and tokens. Token counts are the provider's real usage, shown per turn and counted per canvas.
  - **Skills & plugins**: one-click install on localhost, `npx` and `git` commands, and zip downloads.
  - **Also new**: more completion chimes, storage used per canvas, and Memory (the global rules), Videos, Docs and About pages.
- **Claude Code plugin**: `.claude-plugin` manifests alongside the Codex ones, so the canvas skill installs in Claude Code too.

### Improved

- The interface language follows the browser on the first visit; the only switch is in Settings.
- Empty states, the sidebar and the About page read in a calmer voice, with small hand-drawn ornaments where they fit. Chinese is never set in slanted fake italics.
- Deep thinking shows file reading, reference images and the sketch as steps; the Interior Design 2D plan follows dark mode; the PPT canvas gets a slide rail and a slideshow.

### Fixed

- PPT: the start screen shows again how it reads your input ("a topic" / "an outline" / "a file to restyle") and the chosen style, and the reading can be switched with one click.
- Clicking "No model set" under the input now opens Settings → Models on narrow windows too.
- "Start creating" on the home page no longer overshoots to the footer while images below are still loading.
- Docs headings with the same name (the changelog's "New" under each date) get their own anchors.

### Notes

- Removed: the old tutorials page (videos now live in Settings → Videos), the Save button and save dialogs, the clear-chat button and "Confirm before clearing".

## 2026-11-18

### New

- **My works**: every canvas can hold many works. My works, at the top, lists them by canvas; they can be opened, renamed, duplicated and deleted, and opening one from another canvas switches straight to it.
- Whatever you had before the upgrade becomes your first work automatically, with the original data left in place.

### Improved

- **The diagram canvas now stores in IndexedDB**: long conversations no longer fail to save when localStorage fills up; old data moves across the first time it opens; while generating, everything is saved every 3 seconds.
- **A fallback when draw.io will not load**: if the default address has not loaded within 8 seconds, a mirror on GitHub Pages is used; if neither loads, a notice and a Retry button appear.
- **Installing the plugin no longer needs a clone**: the marketplace is added straight from GitHub. It is now named `canvasanvil`; if you added it as `canvasanvil-local`, add it again.

## 2026-11-13

### Fixed

- **Diagram**: the diagram was drawn but "Drawing" kept spinning, and local edits failed. After a dependency upgrade the message format changed and old-format tool results could not be written back. Old conversations are now brought up to date when opened.
- **Interior design**: pending choices seemed to have no effect. Your choices now go to the model separately as "decided by the user", and win wherever they conflict with the scheme.
- **Interior design**: `Designer unavailable` sometimes appeared while generating a plan. Every step now uses the current designer.
- **Interior design**: after switching canvases or reloading, a generation step kept spinning. Coming back now shows "Interrupted" with a "Generate the plan again" button.

### Improved

- The interior design canvas now fills the left side like the other canvases.
- The quote, drawing set, DXF, colour plan and renders all export from the top right of the designer.
