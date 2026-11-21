# Architecture

CanvasAnvil is three programs in one repository: a Vite + React browser app, a small Node API, and the contract between them. Four canvases share one shell, one UI kit and one model client.

```diagram
architecture
```

## Layout

```text
client/                 the browser app
  app/                  the shell: App, the canvas registry, settings, error boundary
  ai/                   the browser's model facade and where it stores settings
  workspaces/<id>/      one directory per canvas, all the same shape:
      <Id>Workspace.tsx   the entry the registry lazy-loads
      canvas/             the canvas half
      chat/               the chat half
      lib/                pure logic only that canvas uses
      hooks/              its stateful pieces
      storage.ts          its persisted keys
  pages/                the home page and these docs
  shared/               anything more than one canvas uses

server/                 the API
  routes/               one file per endpoint
  chat/                 the /api/chat pipeline, a module per stage
  ai/                   the OpenAI transport
  http/                 the route table, the Node<->Web adapter, the Vite middleware

contracts/              what client and server agree on (AIConfig and its normalisation); no browser or Node APIs
resources/              data read at runtime: prompts, draw.io shape library notes
skill/                  four skills, each able to be copied out alone
```

## Rules the structure depends on

**Nothing in `server/` imports from `client/`.** They are two programs, and the only thing they share is `contracts/`.

> [!WHY]
> For a while the draw.io system prompt and the Langfuse client lived inside the Diagram canvas's folder, because the backend had helped itself from a frontend folder. This rule comes from that lesson.

**`server/**` uses relative imports, not the `@/` alias.** `vite.config.ts` imports the dev middleware so that `npm run dev` brings the API with it, and Vite loads its own config through plain Node, which knows nothing of the tsconfig paths.

**`shared/` and `workspaces/` never import `@/app`.** Dependencies only point downward: the shell may use a canvas, never the other way round.

**Storage keys are load-bearing.** IndexedDB names and localStorage keys carry people's works across releases. Diagram's keys still carry their `next-ai-draw-io-` prefix, because renaming them would orphan the old data.

## Inside a canvas

A canvas grows in one direction: the component that owns the screen keeps getting bigger. `PptCanvas.tsx` once reached 5,300 lines. It was split into three layers, by how much of React each needs:

- **`lib/`: none.** Plain functions over plain values: the version a slide resolves to, the geometry of a resize handle, the shape of a prompt. The rules live here, so the tests cover these.
- **`hooks/`: state and effects, one feature each.** A hook that needs something another feature owns takes it as an argument rather than reaching for it.
- **`views/`: JSX only.** One file per screen, taking the hooks' return values as props. A view holding its own state means the state was in the wrong place.

> [!WHY]
> **Extract the state before the view.** The deck start screen once needed 30 values from the component; after `useCreationInputs` was pulled out, it needed 9. In the other order, a long file would only have been traded for a long prop list.
>
> But not everything belongs in a hook. The deck itself, `localSlides` and its companions, stayed in `PptCanvas`: every generation flow touches it, 214 references. The test is whether a boundary already exists. If it does, a hook names it; if it does not, a hook invents one, and everything downstream pays for it.

## Bundle

The entry chunk holds the shell only. Every canvas and every heavy dependency (`pptxgenjs`, `pdf-lib`, `pdfjs`, `mammoth`, ELK) loads on demand; these docs are a chunk of their own too.

`manualChunks` in `vite.config.ts` uses the function form on purpose: the object form let Vite's dynamic-import preload helper get hoisted into a vendor chunk, which pulled that whole chunk into the first load.
