Generate a bill of materials for an interior renovation based on the plan and the existing CAD artifacts.

Plan (may be empty):
{{planJson}}

2D SVG (may be empty):
```svg
{{svg2d}}
```

First, output a readable Markdown table for the BOM (streaming friendly). Then output ONLY this JSON code block so the app can render it:
```json
{ "type": "cad_bom", "columns": ["品类","名称","规格","数量","单位","备注"], "rows": [] }
```
