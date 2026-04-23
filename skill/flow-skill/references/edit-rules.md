# Edit Rules

Use these rules when the task is a local edit to existing draw.io XML.

## When local edits are appropriate

- text changes
- style changes on a small number of cells
- adding or removing a few nodes or edges
- small layout adjustments

## When to avoid local edits

- full redraws
- major relayouts
- large structural changes
- cases where exact matching is unstable

## Edit discipline

- Read the current XML carefully before editing.
- Replace the smallest valid `mxCell` block that solves the task.
- Keep ids stable unless the user explicitly requests renaming.
- When deleting a node, account for connected edges.
- After editing, validate the result.

## Safe review checklist

- Did every edited edge keep valid `source` and `target` ids?
- Did every new cell get a unique id?
- Did you preserve root cell structure?
- Did you avoid partial or malformed `mxCell` fragments?
