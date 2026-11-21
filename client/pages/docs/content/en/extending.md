# Extending and testing

Adding a canvas or an endpoint takes one line in one table. This page covers how, and how to make sure nothing else broke afterwards.

## Adding a canvas

1. Create `client/workspaces/<id>/` in the shared shape: `<Id>Workspace.tsx`, `canvas/`, `chat/`, `lib/`, `hooks/`, `storage.ts`.
2. Add an entry to the `WORKSPACES` array in `client/app/workspaces.ts`, with its own lazy import so it stays out of the first load.

The sidebar, the remembered selection and the rendered canvas all read that array; nothing else needs touching.

> [!TIP]
> A canvas that stores its data by key in its own IndexedDB gets My works for free: multiple works, switching, export and import. See [How works are stored](/docs/works-storage).

### Don't forget

- Every piece of UI text needs both a Chinese and an English version.
- Storage keys are never renamed once released.
- A canvas's pure logic goes in `lib/`, and so do its tests.

## Adding an endpoint

Write the handler under `server/routes/`, then register one line in `API_ROUTES` in `server/http/routes.ts`. Express and the Vite dev middleware both read that table.

After changing a local API route in `vite.config.ts`, restart the dev server.

## Checks

```bash
npm run check   # tsc, strict
npm run lint    # eslint
npm test        # node:test via tsx
npm run build   # tsc + vite build
```

The tests live in `tests/` and cover the rules in each canvas's `lib/`: layout scoring and its gates, intent reading, floor plan geometry, works storage, the shape of model requests.

> [!WHY]
> With the rules in pure functions, the tests need no browser, no model and no network, and hundreds of them finish in seconds. The interface will change; the rules should not change quietly. The tests guard the second.

## Evaluating diagram layout

Changes to the layout algorithm are not judged by eye. `tools/eval/diagram` holds a set of evaluation diagrams in two splits, dev and holdout: parameters are tuned on dev, checked on holdout to confirm that order and alignment are still kept, and only then adopted.
