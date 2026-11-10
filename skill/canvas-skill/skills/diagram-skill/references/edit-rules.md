# Edit Rules

Use these rules when the task is a local edit to existing draw.io XML.

## When local edits are appropriate

- text changes
- style changes on a small number of cells
- adding or removing a few nodes or edges
- small layout adjustments

## When to avoid local edits

- full redraws
- major relayouts, or a change of layout kind
- large structural changes
- cases where exact matching is unstable

## Edit discipline

- Read the current XML carefully before editing. Note its layout kind, ranks, sizes and groups.
- Say in one or two sentences what you will change and why.
- Replace the smallest valid `mxCell` block that solves the task.
- Keep ids stable unless the user explicitly requests renaming.
- When deleting a node, account for connected edges.
- When adding into a group, use `parent="<group id>"` with relative coordinates, and grow the group if needed.
- After editing, validate the result and run `scripts/check-layout.mjs`. Fix any error your edit introduced, then submit the minimal add/update/delete operation set through `edit_diagram` with the latest revision. The widget limits layout tidying to rows containing added or updated cells.

## Safe review checklist

- Did every edited edge keep valid `source` and `target` ids?
- Did every new cell get a unique id (never `0` or `1`)?
- Did you preserve root cell structure?
- Did you avoid partial or malformed `mxCell` fragments?
- Does the layout check report no new errors?
