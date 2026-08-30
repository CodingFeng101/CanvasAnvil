# Architecture

CanvasAnvil is three programs in one repository: a Vite + React browser app, a
small Node API, and the contract between them. Three canvases — Flow, Interior
Design (CAD), and PPT — share one shell, one UI kit, and one model client.

## Layout

```
client/                 the browser app
  app/                  the shell: App, the workspace registry, settings, error boundary
  ai/                   the browser's model facade and where it stores settings
  workspaces/<id>/      one directory per canvas, all the same shape:
      <Id>Workspace.tsx   the entry the registry lazy-loads
      canvas/             the canvas half
      chat/               the chat half
      lib/                logic only that workspace uses
      storage.ts          its persisted keys
  features/ppt-editor/  the editable-slide bridge
  pages/portal/         the landing page
  shared/               anything more than one workspace uses
      ui/                 the shadcn component kit
      chat/               the chat components and plumbing the panels share
      files/              upload extraction: PDF, Word, LaTeX archives, figures
      storage/            the IndexedDB key/value store factory
      i18n/               language setting and the app-shell dictionary
      lib/                cn()

server/                 the API
  routes/               one file per endpoint
  chat/                 the /api/chat pipeline, a module per stage
  ai/                   the OpenAI transport
  telemetry/            Langfuse
  http/                 the route table, the Node<->Web adapter, the Vite middleware
  index.ts              the Express entry point

contracts/              what the client and server agree on (AIConfig and its
                        normalisation); no browser or Node APIs
resources/              data read at runtime
  prompts/              agent prompts, as markdown
  shape-libraries/      draw.io shape references the Flow agent can pull in

public/  docs/  deploy/  skill/  tests/
```

## Rules the structure depends on

**Nothing in `server/` imports from `client/`.** They are separate programs;
the only thing they share is `contracts/`. A backend reaching into a frontend
folder is what once put the draw.io system prompt and the Langfuse client
inside the Flow workspace.

**`server/**` uses relative imports, not the `@/` alias.** `vite.config.ts`
imports the dev middleware so `npm run dev` serves the API in-process, and Vite
loads its own config through plain Node, which knows nothing about the tsconfig
paths.

**Storage keys are load-bearing.** IndexedDB database names and localStorage
keys carry users' saved work across releases. Each workspace names its own in
`workspaces/<id>/storage.ts`; Flow's are in `workspaces/flow/lib/storage.ts`
and keep their original `next-ai-draw-io-` prefix from before that workspace
was folded in. Renaming one orphans whatever was stored under it.

**`resources/` is data, not documentation or source.** The server reads it with
`readFile` at request time, so a deployment has to ship it — see the Dockerfile.
`server/chat/resources.ts` is the only place those paths are written down.

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
  `client/ai/client.ts`. The browser never talks to the provider directly, so
  the key stays out of cross-origin requests and the server can inline remote
  images the browser could not fetch.
- **`/api/chat`** — streaming with tool calls, used by Flow. Runs as a pipeline
  whose stages live in `server/chat/`: validate, extract attachments,
  summarise, classify intent, optionally draft a reference image, assemble the
  prompt, stream.

## Adding a canvas

Add an entry to `WORKSPACES` in `client/app/workspaces.ts`. The header tabs, the
persisted selection, and the rendered workspace all read from that array. Give
the entry its own lazy import so it stays out of the initial bundle.

## Adding an API route

Add the handler under `server/routes/`, then one entry to `API_ROUTES` in
`server/http/routes.ts`. Express and the Vite dev middleware both read that
table, so nothing else needs touching.

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
