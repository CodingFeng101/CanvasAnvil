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

Output: `{"type":"cad_layout","layout":{...}}` — a grid of column widths and row heights (wall centrelines), rooms as cell ranges, open connections, doors between rooms, windows by room side and size, furniture by room with placement intent (`wall`, `at`, `beside`, `front`, `center`, `corner`, `optional`), and per-room `floor` / `wall` / `skirting` / `ceil`. No coordinates.

## 4. Build the HouseSpec — `scripts/build-house-spec.mjs`

```
node scripts/build-house-spec.mjs --layout cad_layout.json --output house-spec.json
```

Runs the app's layout program: walls from the grid (240 exterior, 120 interior), doors placed where they reach the other room, windows sized, furniture placed against solid walls clear of door swings and windows (trying other walls, smaller sizes or a smaller model when it does not fit), curtains, drains and sewer points added, finishes mapped to the designer's materials. Then the app's autofix and validation. The result is the designer's HouseSpec (`designer/reference/spec-format.md`). Exit 1 means the layout must change.

## 5. Finish in the designer — `scripts/run-designer.mjs`

```
node scripts/run-designer.mjs --spec house-spec.json --plan cad_plan.json --out-dir out \
  [--exports quote,drawings,plan-dxf,mep-dxf,colour,render | all | none] [--no-open]
```

The designer (`designer/assets/template.html`), headless through `designer/scripts/browser.mjs`, with the spec as preset:

1. auto-nudge: furniture a few cm into walls or neighbours is pushed clear (the app's step),
2. one-click MEP layout (sockets, switches, lights, water, panel and network box),
3. wiring preferences from the plan's 水电 decisions,
4. the designer's checks → `report.json`,
5. `<name>-装修设计器.html`, built like the designer's `build.py` (template, preset after `<meta charset>`, title) with the finished design (MEP included) as the preset: the full interactive designer as one offline file, opened in the user's default browser at the end. The user keeps editing there; changes are saved in that browser. Pass `--no-open` on a machine without a desktop and give the path instead,
6. the room-by-room MEP audit (`designer/scripts/elecaudit.mjs`) on that page (every light switched, a switch beside the entry door and a room's only door on the handle side, mounting heights, double control and bedside sockets in bedrooms, hood socket and alarm in the kitchen, splash-proof sockets in bathrooms, both boxes present) → `elecAudit` in `report.json`; problems are reported, not fatal,
7. exports: always `design.json`, `plan2d.png`, `design.dxf`; by default also the quote CSV, drawing-set PDF, MEP DXF and colour plan; `render` (2560×1440 3D) on request. The colour plan and render enter 3D the way `designer/scripts/qa.mjs` does (scene ready, transition over, 重置视角).

Exit 1 when errors remain. Typical fixes in the layout: a room too small for its furniture (widen the column or mark items `optional`), a door with no shared wall, a window on an interior wall.

## 6. Deliver — the designer's checks

As `designer/GUIDE.md` section 6 and `designer/reference/delivery.md`:

```
node designer/scripts/qa.mjs <name>-装修设计器.html <dir>/qa --lite --quick
python designer/scripts/qa_files.py <dir>/qa
```

`qa.mjs` drives every feature of the page (several minutes); go through `qa/shots/`. `check.mjs <page> <dir>` gives `plan2d.png` / `view3d.png` and its own report when you want to look again after a change.
