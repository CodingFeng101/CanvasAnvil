# CAD Skill

Everything the user ends up with is the house designer in `designer/`: its page, its checks, its exports. Two routes lead there: reconstructing an existing floor plan, or designing from a brief.

Both routes edit the same thing in the end: the designer's HouseSpec (`designer/reference/spec-format.md`; read it before editing a spec). On route A the reconstruction scripts and the GUIDE's generator scripts write it; on route B the layout program writes the first one, and from then on anything spec-format describes can be changed in the spec itself (below). Both routes have the same delivery gates: the designer's check at **0 errors and 0 warnings**, the MEP audit without ✗, and the designer's qa passed; whatever truly cannot be fixed (the original drawing is like that) is explained item by item.

## Pick the route

| The user has | Route |
|---|---|
| An existing floor plan: image, screenshot, scan, CAD PDF, DXF, black CAD screenshot, two plans (original + layout) | **A — reconstruct.** Read `designer/GUIDE.md` and follow it from section 0 to 6 (its paths are relative to `designer/`). |
| Only a brief ("90 平两室两厅，三口之家") | **B — design from a brief**, below. It ends in the same designer page and the same checks. |

## Route B — design from a brief

1. **Plan** — read `prompts/plan.md` and write one `cad_plan` (save it as `cad_plan.json`).
2. **Decide with the user** — show the plan, then every entry of `plan.decisions` as a question with its options, grouped (布局 / 硬装 / 设备 / 电器 / 智能 / 水电), the recommended `choice` marked. When your host has a question or option tool, use it so the user picks with a click; otherwise list them numbered. Write the user's picks into each decision's `choice` and save `cad_plan.json` again. If the user changes rooms or wants something new, revise the plan (step 1 with "已定事项") before going on. Do not continue until the user confirms the plan.
3. **Layout** — read `prompts/layout.md` and `references/furniture-catalog.md`; write one `cad_layout` from the confirmed plan (`cad_layout.json`). The decisions' choices decide equipment, finishes and kitchen / door / window types as that prompt lays out.
4. **Build the HouseSpec** — `node scripts/build-house-spec.mjs --layout cad_layout.json --output house-spec.json`. The output is the designer's HouseSpec (`designer/reference/spec-format.md`). It prints what the program adjusted (smaller furniture, items left out). On errors (exit 1), fix the layout and run again. Room arrangement (which rooms, their sizes, which rooms connect) belongs in the layout; later details go into the spec (5b).
5. **Finish in the designer** — `node scripts/run-designer.mjs --spec house-spec.json --plan cad_plan.json --out-dir <dir>`. It nudges colliding furniture, runs the one-click MEP layout, applies the wiring preferences from the plan, runs the designer's checks, writes `<name>-装修设计器.html` (the designer template with the finished design, MEP included, as its preset), runs the room-by-room MEP audit (`designer/scripts/elecaudit.mjs`) on it, exports the quote, drawing-set PDF, MEP DXF and colour plan (add `--exports all` for the plan DXF and the 3D render), and opens the page in the user's browser. Its exit code is the gate: 0 = 0 errors, 0 warnings and no MEP audit ✗; 3 = written, but warnings or audit problems are left; 1 = errors, refused ops, a patch that did not apply, or a broken run. On errors that come from the arrangement, change the layout (move a door, resize a room, drop a secondary item) and repeat steps 4–5.
5b. **Self-check loop until the gates are met** (`designer/GUIDE.md` sections 4–5) — for every warning in `report.json` → `issues` and every `elecAudit` problem, change the design and run again from the last output, until the exit code is 0 or a round fixes nothing:
   - MEP points (`prompts/edit.md`: `add_elec` / `move_elec` / `link_elec` / `remove`, ids and door ends from `<dir>/summary.json`) as `ops.json`: `node scripts/run-designer.mjs --design <dir>/design.json --ops ops.json --plan cad_plan.json --out-dir <dir2>`.
   - Anything else spec-format describes (door hinge or swing `into`, `unsure`, structures, line lights, `mep` routing, `style`, free shapes, custom-cabinet `kit`, `site` / `north`, `look`, `voids`, `beams`, `comments`, `dims` / `expectDims`, `floors`) as a JSON Patch on `<dir>/spec.json`: `--patch patch.json` instead of `--ops` (`{"type":"cad_spec_patch","patch":[…]}`, RFC 6902; the end of `prompts/edit.md` shows each kind). You may also edit `spec.json` directly, or write a generator script as `designer/reference/example-gen*.py` do, and run `--spec` on it; `--design … --patch` keeps measures, prices and comments that only live in the design.
   - Refused ops and patches say why (a point on a door opening, a path that does not exist); fix and run again. Each warning or audit problem left at the end gets its reason in the report.
6. **Delivery checks — required before delivering** (`designer/GUIDE.md` section 6, `designer/reference/delivery.md`): run the final design once more with `--qa` (it runs `designer/scripts/qa.mjs <page> <dir>/qa --lite --quick` and `qa_files.py` on its downloads after the export; several minutes, exit 1 if either fails), or run those two commands yourself. Look through `qa/shots/`. Never deliver with a ❌ in `qa/report.md`; tell apart a qa script that clicked the wrong place from a real problem.
7. **Report** — as `designer/reference/delivery.md`: tell the user the designer page is open (give its path: double-click it to open again; edits made there stay in that browser), the room areas, what the program adjusted, the wiring changes, the checks (errors / warnings, MEP audit, qa) with every problem left and why it stays (the user can still fix MEP points under 水电 in the designer page), the assumptions to confirm (what the brief did not say: storey height, window sills, equipment brands…), and the files written. Show `plan2d.png` or the colour plan when the host can display images.

For a change after delivery, keep everything the user did not mention:
- Small changes — finishes ("客厅地面换人字拼"), 3D look ("换奶油风"), a piece of furniture, a door or window, a wall, MEP points ("床头加个 USB 插座", "重新布置水电"): write them as operations (`prompts/edit.md`, ids from `<dir>/summary.json`) and run `run-designer.mjs --design <dir>/design.json --ops ops.json …`. After wall, opening or furniture edits the MEP layout runs again by itself.
- Anything else the designer can do ("入户门往外开", "主卧回字形吊顶", "餐厅装磁吸轨道", "插座走顶", "家具换北欧风", "阳台做个地台", "加一层"): a patch on `<dir>/spec.json` with `--design <dir>/design.json --patch patch.json`. A multi-floor design only takes patches (paths `/floors/<n>/…`).
- Large changes ("主卧再大一点" by a column, a room added or moved): edit `cad_layout.json` and run steps 4–5 again.
A new designer page opens with the change either way; then steps 5b–7 again.

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
- `scripts/build-house-spec.mjs`, `scripts/run-designer.mjs` — route B's two scripts; `scripts/lib/` — the layout program and in-page helpers (nudge, wiring preferences, edit operations, summary, spec export and patches), bundled.

Everything except `SKILL.md`, `references/workflow.md`, `references/output-contract.md`, `agents/` and the two scripts is generated by CanvasAnvil's `scripts/sync-cad-skill.mjs`; do not edit it here.
