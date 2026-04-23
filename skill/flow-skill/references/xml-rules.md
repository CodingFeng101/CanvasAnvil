# XML Rules

Use these rules whenever generating or editing draw.io XML.

## Required structure

- The canonical form is `<mxGraphModel> -> <root> -> <mxCell .../>`.
- All `mxCell` elements must be direct children of `<root>`.
- Root cells must be present exactly once:
  - `id="0"`
  - `id="1" parent="0"`

## IDs

- Every `mxCell` needs a unique, non-empty `id`.
- Preserve existing ids during local edits when possible.
- Use deterministic ids for new cells, for example `node2`, `edge2`, `group2`.

## Vertices

- Use `vertex="1"` for node shapes.
- Include `<mxGeometry ... as="geometry"/>`.
- Avoid empty labels unless intentionally unlabeled.

## Edges

- Use `edge="1"` for connectors.
- `source` and `target` must reference existing ids.
- Prefer orthogonal routing unless the diagram requires another style.

## Escaping

- Escape XML attribute values with `&lt;`, `&gt;`, `&amp;`, and `&quot;` where needed.
- Do not emit XML comments.

## Layout guidance

- Keep the default viewport readable.
- Prefer compact grouped layouts over scattered placement.
- Minimize edge crossings.

## Validation

For new diagrams or non-trivial edits, run:

```powershell
node skill/flow-skill/scripts/validate-drawio-xml.mjs --input path\to\diagram.drawio
```
