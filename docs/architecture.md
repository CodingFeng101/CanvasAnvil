# Architecture

CanvasAnvil is a Vite + React single-page app with a small Node API beside it.
Three canvases — Flow, Interior Design (CAD), and PPT — share one shell, one UI
kit, and one model client.

## Layout

```
src/
  app/          the shell: App, the workspace registry, error boundary
  ai/           the model client — one OpenAI-compatible transport
  shared/       everything more than one workspace uses
    ui/           the shadcn component kit (one copy)
    chat/         the chat components and plumbing the panels share
    files/        upload extraction: PDF, Word, LaTeX archives, figures
    storage/      the IndexedDB key/value store factory
    i18n/         language setting and the app-shell dictionary
    lib/          cn()
  workspaces/   flow / cad / ppt — each canvas's own logic
  features/     ppt-editor: the editable-slide bridge
  pages/        the portal / landing page
  server/       the API: routes, chat pipeline, telemetry
  components/   the settings dialog
api/            thin route shims plus the Express entry point
agent/          system prompts, as markdown, loaded with ?raw
skill/          the per-canvas skill bundles
```

## Rules the structure depends on

**Nothing in `src/server/` imports from `src/workspaces/`.** The server is a
separate program that happens to share a repository; a backend reaching into a
frontend folder is what put the draw.io system prompt and the Langfuse client
inside the Flow workspace for a while.

**`src/ai/**` and `src/server/**` use relative imports, not the `@/` alias.**
Vite loads `vite.config.ts` through plain Node, and that config imports the API
route handlers — Node does not know about the tsconfig path alias.

**Storage keys are load-bearing.** IndexedDB database names and localStorage
keys carry users' saved work across releases. `src/workspaces/*/storage.ts` and
`flow/next/lib/flow-storage-keys.ts` name them in one place each; renaming one
orphans whatever was stored under the old name.

## The model client

Every model call speaks the OpenAI HTTP protocol:

| Purpose | Route |
| --- | --- |
| Chat, vision, all text generation | `POST {baseUrl}/chat/completions` |
| Image generation | `POST {baseUrl}/images/generations` |
| Image editing, given a reference | `POST {baseUrl}/images/edits` |

There is no provider list. Using a different vendor means pointing the base URL
at their OpenAI-compatible endpoint in Settings.

Image generation tries the images route first and falls back to
`/chat/completions` with `image_url` parts, because a number of
OpenAI-compatible gateways expose their image models as chat models. The
fallback order is pinned by `tests/ai-request-shape.test.ts`.

Two paths reach the model:

- **`/api/ppt-ai`** — non-streaming, used by the CAD and PPT workspaces through
  `src/ai/client.ts`. The browser never talks to the provider directly, so the
  key stays out of cross-origin requests and the server can inline remote
  images the browser could not fetch.
- **`/api/chat`** — streaming with tool calls, used by Flow. Runs as a pipeline
  whose stages live in `src/server/chat/`: validate, extract attachments,
  summarise, classify intent, optionally draft a reference image, assemble the
  prompt, stream.

## Adding a canvas

Add an entry to `WORKSPACES` in `src/app/workspaces.ts`. The header tabs, the
persisted selection, and the rendered workspace all read from that array. Give
the shell its own lazy import so it does not land in the initial bundle.

## Bundle

The entry chunk holds the shell only. Each workspace, and the heavy
dependencies (`pptxgenjs`, `pdf-lib`, `pdfjs`, `mammoth`), loads on demand.
`manualChunks` in `vite.config.ts` uses the function form deliberately: the
object form let Vite's dynamic-import preload helper get hoisted into a vendor
chunk, which pulled that whole chunk into the initial load.

## Checks

```bash
npm run check   # tsc, strict
npm run lint    # eslint
npm test        # node:test via tsx
npm run build   # tsc + vite build
```
