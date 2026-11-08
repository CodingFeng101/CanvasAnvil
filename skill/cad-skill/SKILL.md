---
name: cad-skill
description: Home interior design delivered as an interactive house designer page (one offline HTML, 2D / 3D / furniture / MEP / ceilings / quote / drawing set). From an existing floor plan (image, PDF, DXF, CAD) it reconstructs the plan in the designer. From a brief with no plan, the model first settles a design plan with the user (rooms, finishes, equipment, smart home, wiring preferences as clickable decisions), describes the layout as a grid with intent, and programs draw it; then the designer lays out MEP, the wiring preferences are applied, checks and a room-by-room MEP audit run, and the quote, drawing-set PDF, DXF, colour plan and 3D render are exported automatically. Use for home layout, renovation design, floor plan to designer.
---

# CAD Skill

Everything the user ends up with is the house designer in `designer/`: its page, its checks, its exports. Two routes lead there: reconstructing an existing floor plan, or designing from a brief.

Never write wall or furniture coordinates by hand: on route A the designer's reconstruction scripts produce them, on route B the layout program does.

## Pick the route

| The user has | Route |
|---|---|
| An existing floor plan: image, screenshot, scan, CAD PDF, DXF, black CAD screenshot, two plans (original + layout) | **A — reconstruct.** Read `designer/GUIDE.md` and follow it from section 0 to 6 (its paths are relative to `designer/`). |
| Only a brief ("90 平两室两厅，三口之家") | **B — design from a brief**, below. It ends in the same designer page and the same checks. |

## Route B — design from a brief

1. **Plan** — read `prompts/plan.md` and write one `cad_plan` (save it as `cad_plan.json`).
2. **Decide with the user** — show the plan, then every entry of `plan.decisions` as a question with its options, grouped (布局 / 硬装 / 设备 / 电器 / 智能 / 水电), the recommended `choice` marked. When your host has a question or option tool, use it so the user picks with a click; otherwise list them numbered. Write the user's picks into each decision's `choice` and save `cad_plan.json` again. If the user changes rooms or wants something new, revise the plan (step 1 with "已定事项") before going on. Do not continue until the user confirms the plan.
3. **Layout** — read `prompts/layout.md` and `references/furniture-catalog.md`; write one `cad_layout` from the confirmed plan (`cad_layout.json`). The decisions' choices decide equipment, finishes and kitchen / door / window types as that prompt lays out.
4. **Build the HouseSpec** — `node scripts/build-house-spec.mjs --layout cad_layout.json --output house-spec.json`. The output is the designer's HouseSpec (`designer/reference/spec-format.md`). It prints what the program adjusted (smaller furniture, items left out). On errors (exit 1), fix the layout and run again; never patch coordinates in the spec.
5. **Finish in the designer** — `node scripts/run-designer.mjs --spec house-spec.json --plan cad_plan.json --out-dir <dir>`. It nudges colliding furniture, runs the one-click MEP layout, applies the wiring preferences from the plan, runs the designer's checks, writes `<name>-装修设计器.html` (the designer template with the finished design, MEP included, as its preset), runs the room-by-room MEP audit (`designer/scripts/elecaudit.mjs`) on it, exports the quote, drawing-set PDF, MEP DXF and colour plan (add `--exports all` for the plan DXF and the 3D render), and opens the page in the user's browser. If `report.json` lists errors, change the layout (move a door, resize a room, drop a secondary item) and repeat steps 4–5.
5b. **Fix the MEP audit** — for each `elecAudit` problem write MEP operations (`prompts/edit.md`: `add_elec` / `move_elec` / `link_elec` / `remove`, ids and door ends from `<dir>/summary.json`) into `ops.json` and run `node scripts/run-designer.mjs --design <dir>/design.json --ops ops.json --plan cad_plan.json --out-dir <dir2>`. Refused ops say why (a point on a door opening, too far from a wall); fix and run again, at most a few rounds. What cannot be fixed without moving a wall goes into the report.
6. **Delivery checks** — as `designer/GUIDE.md` section 6 and `designer/reference/delivery.md` say: `node designer/scripts/qa.mjs <page> <dir>/qa --lite --quick` (several minutes; look through `qa/shots/`), and `python designer/scripts/qa_files.py <dir>/qa` when Python is available. The MEP audit already ran in step 5 (`report.json` → `elecAudit`).
7. **Report** — tell the user the designer page is open (give its path: double-click it to open again; edits made there stay in that browser), the room areas, what the program adjusted, the remaining warnings, the wiring changes, every MEP audit problem (the user fixes those under 水电 in the designer page; the layout cannot), the qa result and the files written. Show `plan2d.png` or the colour plan when the host can display images.

For a change after delivery, keep everything the user did not mention:
- Small changes — finishes ("客厅地面换人字拼"), 3D look ("换奶油风"), a piece of furniture, a door or window, a wall, MEP points ("床头加个 USB 插座", "重新布置水电"): write them as operations (`prompts/edit.md`, ids from `<dir>/summary.json`) and run `run-designer.mjs --design <dir>/design.json --ops ops.json …`. After wall, opening or furniture edits the MEP layout runs again by itself.
- Large changes ("主卧再大一点" by a column, a room added or moved): edit `cad_layout.json` and run steps 4–5 again.
A new designer page opens with the change either way.

## What the user can decide (route B)

Only what the designer can build; `references/workflow.md` lists it. Socket counts, network points, panel and network box location, bedside USB and floor sockets are applied after the designer's automatic MEP layout; exact switch positions and lighting circuits are left to the designer.

## Requirements

- The skill folder is self-contained and can sit in any project. Script paths are relative to this skill folder; data files can live anywhere (pass their paths).
- Once: `npm run setup` in this folder. It installs `designer/scripts` (only `puppeteer-core`, which drives the user's own Chrome / Edge / Chromium, found by `designer/scripts/browser.mjs`; no browser is downloaded). If no browser is found, ask the user to install Chrome or Edge, or set `CHROME_PATH`.
- Node 18 or newer. Route B needs nothing else (`scripts/build-house-spec.mjs` has no dependencies).
- Route A, and `qa_files.py` on route B, need Python with: `pip install numpy pillow opencv-python pymupdf ezdxf pypdf`.
- No API key or image model is needed: every drawing and render comes from the designer.

## Layout of this folder

- `designer/` — the house designer: template, reconstruction and check scripts, references, `GUIDE.md` (route A).
- `prompts/plan.md`, `prompts/layout.md`, `prompts/edit.md` — route B's plan (with the decision menu), layout and edit-operation prompts.
- `references/furniture-catalog.md` — every valid furniture key; `references/workflow.md` — route B in detail; `references/output-contract.md` — the files each step writes.
- `scripts/build-house-spec.mjs`, `scripts/run-designer.mjs` — route B's two scripts; `scripts/lib/` — the layout program and in-page helpers (nudge, wiring preferences, edit operations, summary), bundled.

Everything except `SKILL.md`, `references/workflow.md`, `references/output-contract.md`, `agents/` and the two scripts is generated by CanvasAnvil's `scripts/sync-cad-skill.mjs`; do not edit it here.
