# Diagram layout

The coordinates a model draws are a sketch: it means "these boxes are a row" and "these two belong in one column", and its hand slips by a few pixels. Layout means reading that sketch correctly, then working out the geometry again.

## Tidy: reading the sketch as intent

The tidy pass runs on every new diagram before it reaches the canvas. It is plain string work on the XML with no DOM, so it behaves the same in the browser and in the tests. Five steps:

1. **Rows**: within each container, group boxes into rows by their vertical position and give each row one centre line; where widths are already close, give them one width.
2. **Fewer crossings**: reorder boxes inside a row when that removes edge crossings and bends.
3. **Alignment**: place the fullest row evenly, then line every other box up with the boxes it connects to, keeping their order and a minimum gap.
4. **Snapping**: snap coordinates to the 10px grid, and grow any container that no longer holds its row.
5. **Routing**: an edge whose ends now line up is made straight; otherwise it takes one jog in the gap between the two rows.

Every cell it does not move stays exactly as the model wrote it, byte for byte.

> [!WHY]
> Only **layered, orthogonally routed** diagrams are tidied. A mind map, a ring or a free scatter has no rows to recover, and guessing at one would wreck it, so those come back unchanged. Better untidied than tidied wrong.

## ELK: a more thorough relayout

Tidy only fine-tunes. Some diagrams are muddled in their layers, and those need a real layout algorithm. CanvasAnvil uses [ELK](https://eclipse.dev/elk/)'s **layered** algorithm, and:

- passes the model's original order and positions to ELK as preferences, so it keeps as much of them as it can;
- loads it on demand: ELK weighs about 1.5MB, is fetched only when needed, and runs in the background after the new diagram is already on screen.

We also tried ELK's mrtree, radial and stress algorithms. On the evaluation set they either scrambled the model's intent or scored below the layered algorithm, and none was kept.

## Which one wins: a comparison

```diagram
diagram-arrange
```

Each diagram has three candidates: the model's drawing, the tidied one and the ELK one. All three are scored by **layout-lint**, the scores are listed in the conversation, and you choose:

- **layout-lint** scores any draw.io diagram from 0 to 100. Hard problems: shapes overlapping, shapes outside their container, containers overlapping, edges running through shapes, text that does not fit, edges missing an end. Softer measures: crossings, bends, and near-misses where two connected shapes were almost lined up.
- A new diagram goes up tidied (or as drawn, when tidying scores lower). ELK finishes in the background and only lists its score: it is **never swapped in on its own**.
- Click a candidate to see it on the canvas; when you are happy, click **Confirm**, and later changes build on that diagram.

> [!WHY]
> Why not pick automatically? A high score does not mean your intent survived. ELK lines up each layer on its own and often breaks up the columns that ran across layers: on the evaluation diagrams it kept only about 30% of the original alignment on average, yet those diagrams still scored well on layout-lint. Gates that guessed whether it broke something meant ELK was almost never chosen; a look from you settles it more directly.

## You can always look back

Every tidy and relayout keeps all the candidates. Until you confirm, the "Layout correction" step in the conversation switches freely between the model's drawing, the tidied one and the ELK one.

## During a local edit

A local edit touches only a few cells. Then tidy lays out again only the rows holding those cells and leaves everything else where it is, so a position you just tuned by hand does not wander off because you changed one word.
