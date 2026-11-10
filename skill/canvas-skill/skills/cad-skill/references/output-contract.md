# Output contract

| Step | File | Content |
|---|---|---|
| Plan | `cad_plan.json` | `{"type":"cad_plan","plan":{...}}`, decisions carrying the user's picks in `choice` |
| Layout | `cad_layout.json` | `{"type":"cad_layout","layout":{...}}` |
| Build | `house-spec.json` | HouseSpec (mm; x east, y south): walls with openings, rooms with finishes and ceilings, furniture, drains, `autoElec` |
| Check | `report.json` | issues before and after, furniture nudged, spec patch applied (`patch`, with `--patch`; `patchError` when it did not apply), edit operations applied and refused (`edits`, with `--ops`), whether MEP was laid out this run, MEP point count, wiring changes, MEP audit (`elecAudit`: problems and notes from `designer/scripts/elecaudit.mjs`), error / warning counts, files, exports, delivery check (`qa`, with `--qa`) |
| Deliver | `<name>-装修设计器.html` | the interactive designer with this design built in; double-click to open offline, opened automatically after the run |
| Deliver | `qa/report.md`, `qa/shots/` | `designer/scripts/qa.mjs` on the page (step 6, `--qa`), required before delivering |
| Check | `design.json` | the designer's internal plan after MEP and wiring preferences (the same design the HTML carries) |
| Check | `spec.json` | the design as the designer's HouseSpec: what the next `--patch` points into, editable directly |
| Check | `summary.json` | rooms (area, finishes, walls), walls, openings (with world `at` / `ends`), furniture and MEP points by room, all with ids: what the next `--ops` refers to |
| Check | `plan2d.png` | 2D layout plan |
| Check | `design.dxf` | layout plan DXF (GB layers, mm) |
| Deliver | `<name>-报价单.csv` | quantities and quote from the designer's unit prices |
| Deliver | `<name>-施工图.pdf` | drawing set: layout, floor finish, ceiling, wall setting-out, MEP, elevations, quote |
| Deliver | `<name>-平面布置图.dxf`, `<name>-水电点位图.dxf` | DXF exports |
| Deliver | `<name>-彩平图.png` | colour plan |
| Deliver | `<name>-渲染-2560x1440.png` | 3D render (only with `--exports render` or `all`) |

Rules:

- One step's artifact per turn; do not jump to the layout before the user confirms the plan.
- No coordinates in the plan or layout; the programs compute them. Details after the layout go into the spec (`--patch`, or `spec.json` edited as spec-format describes).
- Deliver only with the gates met (0 errors, 0 warnings, MEP audit clean, qa passed) or each leftover explained.
- Furniture keys only from `references/furniture-catalog.md`.
- Never claim an export that `report.json` lists with an error.
