# Workflow — route B (design from a brief)

The same flow as CanvasAnvil's CAD workspace: plan → decisions → layout → floorplan → finish in the designer → delivery checks. Route A (an existing floor plan) is `designer/GUIDE.md`.

## 1. Plan (`prompts/plan.md`)

Output: `{"type":"cad_plan","plan":{...}}` with the room program (name, area, orientation, neighbours, must-have furniture), zoning, entry, constraints, assumptions and `decisions`.

## 2. Decisions

Each decision: `group`, `topic`, `question`, `options`, `choice` (the recommendation), `multi`. The groups and what they cover:

| Group | Topics |
|---|---|
| 布局 | kitchen open / semi-open / closed; counter straight / L / U; spare room use; balcony use |
| 硬装 | living/dining floor; bedroom floor; wall colour; feature walls; skirting; ceiling; interior doors; windows |
| 设备 | air conditioning; fresh air; heating; hot water; water purification |
| 电器 | kitchen appliances; bathroom (smart toilet, LED mirror, towel warmer); shower type |
| 智能 | smart home (lighting, curtains, security lock, robot vacuum dock) |
| 水电 | 插座数量, 厨房插座, 网口, 强弱电箱, 床头插座, 地插 (keep these topic names; the script reads them) |

Ask them all at once, with the recommendation preselected; the user only changes what they disagree with. Their picks go into `choice` (an array when `multi`). Floor and wall names must stay the designer's materials (橡木地板, 胡桃木地板, 人字拼地板, 灰白大板瓷砖, 米白大理石, 微水泥, 水磨石, 方块地毯; 白色/浅灰/灰绿/奶咖乳胶漆, 墙布, 木饰面).

## 3. Layout (`prompts/layout.md`)

Output: `{"type":"cad_layout","layout":{...}}` — a grid of column widths and row heights (wall centrelines), rooms as cell ranges, open connections, doors between rooms, windows by room side and size, furniture by room with placement intent (`wall`, `at`, `beside`, `front`, `center`, `corner`, `optional`), and per-room `floor` / `wall` / `skirting` / `ceil`; optional `look` (3D style / palette). No coordinates.

## 4. Build the HouseSpec — `scripts/build-house-spec.mjs`

```
node scripts/build-house-spec.mjs --layout cad_layout.json --output house-spec.json
```

Runs the app's layout program: walls from the grid (240 exterior, 120 interior), doors placed where they reach the other room, windows sized, furniture placed against solid walls clear of door swings and windows (trying other walls, smaller sizes or a smaller model when it does not fit), curtains, drains and sewer points added, finishes mapped to the designer's materials. Then the app's autofix and validation. The result is the designer's HouseSpec (`designer/reference/spec-format.md`). Exit 1 means the layout must change.

## 5. Finish in the designer — `scripts/run-designer.mjs`

```
node scripts/run-designer.mjs --spec house-spec.json --plan cad_plan.json --out-dir out \
  [--patch patch.json] [--ops ops.json] [--exports quote,drawings,plan-dxf,mep-dxf,colour,render | all | none] [--qa] [--no-open]
node scripts/run-designer.mjs --design out/design.json (--patch patch.json | --ops ops.json) --plan cad_plan.json --out-dir out2 [...]
```

The designer (`designer/assets/template.html`), headless through `designer/scripts/browser.mjs`, with the spec as preset:

1. auto-nudge: furniture a few cm into walls or neighbours is pushed clear (the app's step),
2. one-click MEP layout (sockets, switches, lights, water, panel and network box) when the spec says `autoElec: true` and has no `elec`; hand-written `elec` stays as written (with `autoElec` the designer adds the rest as it loads), as the designer itself does,
3. wiring preferences from the plan's 水电 decisions (after a layout),
3a. a spec patch from `--patch` (below): the design exported as a HouseSpec, patched, loaded again with its measures, prices and comments,
3b. edit operations from `--ops` (below), then auto-nudge again and, after wall / opening / furniture edits, steps 2–3 again,
4. the designer's checks → `report.json`,
5. `<name>-装修设计器.html`, built like the designer's `build.py` (template, preset after `<meta charset>`, title) with the finished design (MEP included) as the preset: the full interactive designer as one offline file, opened in the user's default browser at the end. The user keeps editing there; changes are saved in that browser. Pass `--no-open` on a machine without a desktop and give the path instead,
6. the room-by-room MEP audit (`designer/scripts/elecaudit.mjs`) on that page (every light switched, a switch beside the entry door and a room's only door on the handle side, mounting heights, double control and bedside sockets in bedrooms, hood socket and alarm in the kitchen, splash-proof sockets in bathrooms, both boxes present) → `elecAudit` in `report.json`; problems are reported, not fatal,
7. exports: always `design.json`, `spec.json` (the design as a HouseSpec: what `--patch` paths point into, and what you can edit directly), `summary.json` (rooms with finishes, walls, openings with world coordinates, furniture and MEP points, all with ids), `plan2d.png`, `design.dxf`; by default also the quote CSV, drawing-set PDF, MEP DXF and colour plan; `render` (2560×1440 3D) on request. The colour plan and render enter 3D the way `designer/scripts/qa.mjs` does (scene ready, transition over, 重置视角).

8. with `--qa`, the delivery check of step 6 on that page (after the run's own browser is closed).

Exit codes: 0 = the gates are met (0 errors, 0 warnings, MEP audit clean, qa passed when asked); 3 = written, warnings or audit problems left; 1 = errors, refused ops, a patch that did not apply, failed qa; 2 = bad arguments. Typical fixes in the layout: a room too small for its furniture (widen the column or mark items `optional`), a door with no shared wall, a window on an interior wall.

## 6. Deliver — the designer's checks

As `designer/GUIDE.md` section 6 and `designer/reference/delivery.md`:

```
node scripts/run-designer.mjs --design <dir>/design.json --plan cad_plan.json --out-dir <final> --qa
# or by hand:
node designer/scripts/qa.mjs <name>-装修设计器.html <dir>/qa --lite --quick
python designer/scripts/qa_files.py <dir>/qa
```

Required before delivering, and only with the gates of step 5 met (or each leftover explained). `qa.mjs` drives every feature of the page (several minutes); go through `qa/shots/`; `report.json` → `qa` has both results. `check.mjs <page> <dir>` gives `plan2d.png` / `view3d.png` and its own report when you want to look again after a change.

## Edit operations — `--ops` (`prompts/edit.md`)

The same operations as CanvasAnvil's design assistant, as `{"type":"cad_ops","ops":[…]}` (`prompts/edit.md` has every op and its rules; ids come from the last run's `summary.json`). Use them on `--design <last out>/design.json` for:

- **MEP audit problems** (step 6 of `report.json` → `elecAudit.problems`): `add_elec` a switch beside the door (`openings[].ends` are the door's ends; 150–300mm past one end, on the room's side) with `links` to the room's light, `link_elec` an unswitched light, `move_elec` / `remove` a misplaced point. Points on a wall snap onto the nearest wall face; a point on a door or window opening is refused with the opening's span, so move it along the wall. Run again with the fixed design until the audit is clean or what is left cannot be fixed without moving a wall (say so).
- **Small changes after delivery** ("客厅地面换人字拼", "换奶油风", "主卧加个书架", "这个开关挪到门右边"): `set_finish`, `set_look`, furniture / opening / wall ops, MEP point ops. After wall, opening or furniture edits the MEP layout runs again (so hand-placed points from earlier runs are replaced) unless the same batch edits points; `relayout_elec` lays it out again on request.
- **Large changes** (rooms moved, a room added): change `cad_layout.json` and run steps 4–5 from the spec again.

`report.json` → `edits` lists what was applied and each refused op with its reason (exit 1); fix those and run again.

## Spec patches — `--patch` (`cad_spec_patch`)

Everything `designer/reference/spec-format.md` describes, as an RFC 6902 JSON Patch on the last run's `spec.json` (`{"type":"cad_spec_patch","patch":[…]}` or the bare list; `add` / `remove` / `replace` / `move` / `copy` / `test`, JSON Pointer paths with array indices, `/-` to append). The end of `prompts/edit.md` has an example of each kind: door `hinge` / `into` / `unsure`, tray ceilings, line lights (`strip` / `track` / `linear` with `pts`), `mep` routing and `custom` pipes, `structs`, free shapes and `opt`, custom-cabinet `kit`, `style`, `site`, `north`, `look`, `voids`, `beams`, `comments`, `expectDims`, and `floors` for a building (paths `/floors/<n>/…`; a building takes no `--ops`).

- With `--design`, the design is exported, patched and loaded again; measures, prices and comments that only live in the design come along. With `--spec`, the patch applies to that spec.
- `replace` on a field the export left out (a default, such as `hinge: "from"`) sets it.
- A new top-level `style` restyles every piece an earlier style reached, as the designer's 整套家具换成某风格 does.
- MEP follows what the patch touched, as with ops: walls, openings or furniture changed → laid out again, unless the patch also edits `elec`; `remove /elec` + `add /autoElec true` starts the MEP over.
- A patch that does not apply, or adds spec errors, changes nothing: `report.json` → `patchError` says which op and why (exit 1).
