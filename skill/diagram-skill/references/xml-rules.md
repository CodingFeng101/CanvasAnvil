# XML Rules

Use these rules whenever generating or editing draw.io XML.

## Required structure

- The canonical form is `<mxGraphModel> -> <root> -> <mxCell .../>`. Every `mxCell` is written flat inside `<root>`; nesting is expressed with the `parent` attribute, never by putting one `mxCell` inside another.
- Root cells must be present exactly once:
  - `id="0"`
  - `id="1" parent="0"` (the default layer)
- Top-level shapes and every edge use `parent="1"`.

## IDs

- Every `mxCell` needs a unique, non-empty `id`.
- `"0"` and `"1"` are reserved for the root and the default layer. Never give a shape or an edge either id.
- Preserve existing ids during local edits when possible.
- Use deterministic ids for new cells, for example `node2`, `edge2`, `group2`.

## Groups are real containers

When shapes belong to a group, tier, layer, lane, region, cluster or boundary:

- make the group a vertex with `container=1` in its style (or a `swimlane`);
- give each member `parent="<group id>"`;
- write member `x`/`y` relative to the group's top-left corner, not the page;
- leave room at the top of the group for its title (about 30px, or the swimlane's `startSize`);
- size the group so every member fits inside it with 20px or more of padding.

Never fake a group by drawing a rectangle behind shapes that stay on the page layer. Groups side by side never overlap. Nested groups are fine.

```xml
<mxCell id="tier-app" value="Application tier" style="rounded=1;container=1;verticalAlign=top;fontStyle=1;fillColor=#f5f5f5;strokeColor=#999999;" vertex="1" parent="1">
  <mxGeometry x="40" y="120" width="440" height="140" as="geometry"/>
</mxCell>
<mxCell id="api" value="API" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="tier-app">
  <mxGeometry x="40" y="50" width="140" height="60" as="geometry"/>
</mxCell>
<mxCell id="worker" value="Worker" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="tier-app">
  <mxGeometry x="260" y="50" width="140" height="60" as="geometry"/>
</mxCell>
```

## Vertices

- Use `vertex="1"` for node shapes.
- Include `<mxGeometry ... as="geometry"/>`.
- Shapes with the same role share the same width and height.
- Size each shape so its text fits; use `whiteSpace=wrap;html=1;` for labels longer than a few words.
- Avoid empty labels unless intentionally unlabeled.

## Edges

- Use `edge="1"` and `parent="1"`, even when both ends sit inside a group.
- `source` and `target` must reference existing ids.
- Use orthogonal routing (`edgeStyle=orthogonalEdgeStyle`) unless the diagram needs another style.
- Normally omit `exitX/exitY/entryX/entryY` and waypoints: draw.io routes the edge from where the shapes are. Pin ports only when two edges would otherwise share a side, or for a loop back.
- A free line with no shape at one end (a lifeline, a timeline axis, a divider) uses `sourcePoint`/`targetPoint` instead of `source`/`target`.

## Escaping

- Escape XML attribute values with `&lt;`, `&gt;`, `&amp;`, and `&quot;` where needed, including HTML inside `value`.
- Do not emit XML comments.

## Layout

See `references/layout-rules.md`. In short: decide the layout kind first, place shapes on a grid that follows it, keep 40px or more between shapes, title above, legend below.

## Validation

For new diagrams or non-trivial edits, run both:

```powershell
node <skill-dir>/scripts/validate-drawio-xml.mjs --input path\to\diagram.drawio
node <skill-dir>/scripts/check-layout.mjs --input path\to\diagram.drawio
```

The first checks the structure. The second checks the layout and exits 1 on errors; fix what it reports (see `references/layout-rules.md`).

## Online editor

After validation, build a self-contained editor URL:

```powershell
node <skill-dir>/scripts/build-drawio-url.mjs --input path\to\diagram.drawio
```

Open the printed URL in the agent's built-in browser. Do not export images.
