# Layout Rules

How to place shapes so a diagram reads cleanly. These rules hold for any kind of diagram. The native widget applies the website layout correction after generation. The initial coordinates still express the intended arrangement and guide that correction.

## 1. Plan before drawing

Before writing XML, write a short plan of 1–3 sentences in the user's language. Cover:

- what the diagram shows;
- its layout kind (from the list below);
- its groups;
- its main flow.

Show the plan to the user before the XML. For an edit, write a 1–2 sentence plan of what changes and why.

## 2. Pick the layout kind

| Kind | Use for | Arrangement |
| --- | --- | --- |
| `flow-down` / `flow-right` / `flow-up` | processes, pipelines, request paths, layered architectures, state machines, data models with a main direction | Ranks along the flow. Each step is one rank further along. Branches sit side by side in the same rank. |
| `tree-down` / `tree-right` | org charts, decomposition, category trees | Parent centred over its children. Siblings in one row, same size. |
| `mindmap` | a central topic with branches | Topic in the middle. Branches split left and right, each branch's children stacked in a column on its own side. |
| `swimlane` | actors, systems or stages in lanes | One swimlane container per lane, lanes the same width (or height) and touching. Steps placed in their lane at the rank of their order. |
| `sequence` | lifelines with messages | Participants in one row, evenly spaced. Lifelines are free vertical lines. Messages are horizontal, each one lower than the last. |
| `timeline` | events along time | One axis line. Events evenly spaced along it in time order, cards all the same size, alternating sides if labels are long. |
| `free` | illustrations, maps, anything where positions carry meaning | Positions as the subject demands; the rules below still apply. |

When nothing fits, use `flow-down`. Pick the direction that keeps the drawing closest to a landscape page: long chains of 6+ steps usually read better as `flow-right` or wrapped into rows.

## 3. Place on a grid

- Work out ranks (along the flow) and slots (across it) first, then turn them into coordinates.
- Shapes in one rank share the same centre line: same `y` centre for `flow-down`, same `x` centre for `flow-right`. A shape a few pixels off its line makes a crooked edge; line them up exactly.
- Leave 40px or more between shapes, and 60–80px between ranks when edges with labels run between them.
- Shapes with the same role share the same width and height.
- Order shapes within a rank to keep edges short and uncrossed. Put a shape near the shapes it connects to. A shape that sits between two connected shapes on their line forces the edge through it; move it aside.
- Put a node's children under (or beside) it in the same order as their own children, so lines fan out without crossing.

## 4. Groups

- Use real containers (see `references/xml-rules.md`): members carry `parent="<group id>"` and relative coordinates.
- Lay out the inside of each group with the same grid, then size the group around its members: title band at the top, 20px or more of padding on every side.
- Place groups in the same ranks and slots as shapes. Groups side by side never overlap, and keep 40px or more between them.
- An edge between groups connects the member shapes, not the groups, unless the relation is really between the groups.

## 5. Text and extras

- Title above the drawing, legends and notes below it or to the right, never on top of shapes or edges.
- Edge labels short: one to three words.
- Icon shapes put their label outside (`verticalLabelPosition=bottom;verticalAlign=top`); leave room for it.

## 6. Check and fix

After writing the XML, run:

```powershell
node <skill-dir>/scripts/check-layout.mjs --input path\to\diagram.drawio
```

It reports, with the ids involved:

| Rule | Severity | Fix |
| --- | --- | --- |
| `overlap` | error | Move one of the shapes. Keep the 40px gap. |
| `container-escape` | error | Enlarge the group or move the member inside it. Check that its coordinates are relative to the group. |
| `container-overlap` | error | Move the groups apart. |
| `edge-through-shape` | error | Move the shape off the edge's line, or reorder the rank. |
| `text-overflow` | warning | Widen the shape, add `whiteSpace=wrap`, or shorten the label. |
| `dangling-edge` | warning | Point `source`/`target` at existing shapes. |
| `near-miss` | warning | Line the two connected shapes up exactly. |

Fix every error and as many warnings as you can, then run it again. Keep the arrangement while fixing: move the offending shape and its rank, rather than reshuffling the whole diagram. A score of 100 is clean; aim for 90 or more with no errors.
