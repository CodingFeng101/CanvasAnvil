---
name: cad-skill
description: Home interior design in a live house designer (2D / 3D / furniture / MEP / ceilings / quote / drawing set) the user can also edit by hand; every model change starts from the user's latest saved version. From an existing floor plan (image, PDF, DXF, CAD) it reconstructs the plan; from a brief it first settles a design plan with the user as clickable decisions, describes the layout as a grid with intent and lets programs draw it; MEP is laid out, the wiring preferences applied, checks and a room-by-room MEP audit run, and exports are produced. Shown in the conversation where the host renders MCP App widgets, otherwise opened by the agent in the built-in browser or the user's default browser. Use for home layout, renovation design, floor plan to designer.
---

# CAD Skill

Everything the user ends up with is the house designer: its page, its checks, its exports. The design lives in a live editor the user can change by hand between your rounds; always read its latest state before a change.

The design itself is the designer's HouseSpec (`designer/reference/spec-format.md`; read it before writing a spec or a patch). Units are mm, x east, y south. The delivery gates are the designer's check at **0 errors and 0 warnings**, the MEP audit without problems, and the designer's qa passed; whatever truly cannot be fixed (the original drawing is like that) is explained item by item.

## Reaching the editor

The same tools exist on two paths; use the first that is available.

1. **MCP tools** (`canvasanvil_canvas`, from the CanvasAnvil plugin): call `render_cad_widget` with the absolute active workspace as `projectDir`. Showing it to the user is your job, in this order: (1) a host that renders MCP App widgets shows the designer in the conversation; (2) otherwise open the returned `browserUrl` yourself, right away, in the host's built-in browser or preview pane where the user can see it; (3) if you have no such tool, call `render_cad_widget` again with `launch: true` to open the user's default browser; (4) hand the URL to the user only if all of that fails. The result's `next` repeats this.
2. **Command line** (no plugin needed; this folder carries the runtime in `runtime/`, Node 20+):

   ```bash
   node <skill-dir>/runtime/scripts/canvas.mjs open cad <projectDir>
   ```

   It prints the designer's `url` (`http://127.0.0.1:…`). Open it yourself in the host's built-in browser or preview pane; if you have no such tool, run the command again with `--launch` to open the user's default browser. Give the URL to the user only if both fail. Then run every tool below as `node <skill-dir>/runtime/scripts/canvas.mjs call <tool> @args.json`, with the same arguments as a JSON file (`projectDir` included). It prints the tool's JSON result; `canvas.mjs tools` lists the tools.

On both paths the designer page must stay open: it applies queued changes with the website's code and saves the user's manual edits. Reuse the open page. Every change is `apply_cad_design` with the latest `baseRevision` and a new stable `operationId` (reuse it only to retry the same call); then poll `get_editor_operation` with `editor="cad"` until `applied` or `failed`. A pending operation means the page is closed or busy: say so instead of claiming success. A revision conflict means the user changed the design meanwhile: read `get_cad_state` again and adapt the change.

`get_cad_state` returns the current `spec`, `summary` (ids for operations), `issues` (errors and warnings), MEP `audit`, the stored `cadPlan` and `lastRun` (what the last change did: furniture the program adjusted, MEP points placed, wiring preferences applied). Large documents come as `documentPath`.

## Pick the route

| The user has | Route |
|---|---|
| An existing floor plan: image, screenshot, scan, CAD PDF, DXF, black CAD screenshot, two plans (original + layout) | **A — reconstruct.** Follow `designer/GUIDE.md` sections 0–5 (paths relative to `designer/`) to get a HouseSpec, then load it with `apply_cad_design` `{"type":"cad_spec","spec":…}` and continue from step 5 below. |
| Only a brief ("90 平两室两厅，三口之家") | **B — design from a brief**, below. |

## Route B — design from a brief

1. **Plan** — read `prompts/plan.md` and write one `cad_plan`.
2. **Decide with the user** — show the plan, then every entry of `plan.decisions` as a question with its options, grouped (布局 / 硬装 / 设备 / 电器 / 智能 / 水电), the recommended `choice` marked. When your host has a question or option tool, use it so the user picks with a click; otherwise list them numbered. Write the picks into each decision's `choice`. If the user changes rooms or wants something new, revise the plan (step 1 with "已定事项"). Do not continue until the user confirms the plan.
3. **Layout** — read `prompts/layout.md` and `references/furniture-catalog.md`; write one `cad_layout` from the confirmed plan. The decisions' choices decide equipment, finishes and kitchen / door / window types as that prompt lays out.
4. **Draw it** — open the editor, read `get_cad_state`, and call `apply_cad_design` with `payload` = the `cad_layout` and `plan` = the confirmed `cad_plan` (kept for later rounds). The page turns the layout into walls, openings and furniture by program, applies and checks it, lays out MEP and applies the plan's wiring preferences. If the layout cannot be built the operation fails with the reason: fix the layout and send it again.
5. **Fix until the gates are met** — every applied change comes back from `get_editor_operation` with a `gate`: the remaining `errors`, `warnings` and MEP `audit` problems, the `round`, and `next`. While `gate.status` is `fix`, change the design for every listed item and apply again (ids from `get_cad_state` `summary`). `clean` means done; `stalled` (a round fixed nothing) or `limit` (8 rounds) ends the loop: explain each remaining item. The spec export of step 6 is refused while the status is `fix`.
   - MEP points: `{"type":"cad_ops","ops":[…]}` with `add_elec` / `move_elec` / `link_elec` / `remove` (`prompts/edit.md`, ids from `summary`).
   - Anything else spec-format describes (door hinge or swing `into`, structures, line lights, `mep` routing, `style`, free shapes, custom-cabinet `kit`, `site` / `north`, `look`, `voids`, `beams`, `comments`, `dims`, `floors`): `{"type":"cad_spec_patch","patch":[…]}` (RFC 6902 on the current `spec`; the end of `prompts/edit.md` shows each kind).
   - Problems that come from the arrangement (a room too small, a door in the wrong wall): change the `cad_layout` and send it again with `replace: true` in the payload and `allowReplace: true`.
   Each warning or audit problem left at the end gets its reason in the report.
6. **Delivery checks — required before delivering** — export the HouseSpec (`export_cad` with `format: "spec"`), then run the designer's own delivery on it: `node <skill-dir>/scripts/run-designer.mjs --spec <exported spec> --plan <cad_plan.json> --out-dir <dir> --qa`. It writes the quote, drawing-set PDF, MEP DXF and colour plan (`--exports all` adds the plan DXF and the 3D render) and runs `designer/scripts/qa.mjs --lite --quick` and `qa_files.py` on them (several minutes; `references/offline-workflow.md` has its requirements and exit codes). Look through `<dir>/qa/shots/`. Never deliver with a ❌ in `qa/report.md`; tell apart a qa script that clicked the wrong place from a real problem.
7. **Report** — as `designer/reference/delivery.md`: the designer is open (where, and that the user can keep editing it there), the room areas, what the program adjusted (`lastRun`), the wiring changes, the checks (errors / warnings, MEP audit, qa) with every problem left and why it stays, the assumptions to confirm (what the brief did not say: storey height, window sills, equipment brands…), and the files written. Show the colour plan or a PNG export when the host can display images.

## Changes after delivery

Read `get_cad_state` first: the user may have moved furniture or MEP points by hand, and those edits must survive. Keep everything the user did not mention.
- Small changes — finishes ("客厅地面换人字拼"), 3D look ("换奶油风"), a piece of furniture, a door or window, a wall, MEP points ("床头加个 USB 插座", "重新布置水电"): `cad_ops` (`prompts/edit.md`). After wall, opening or furniture edits MEP is laid out again by itself (unless the user placed MEP points by hand; "重新布置水电" forces it).
- Anything else the designer can do ("入户门往外开", "主卧回字形吊顶", "餐厅装磁吸轨道", "插座走顶", "加一层"): `cad_spec_patch`. A multi-floor design only takes patches (paths `/floors/<n>/…`).
- Large changes ("主卧再大一点" by a column, a room added or moved): change the `cad_layout`, send it with `replace: true` and `allowReplace: true`, then steps 5–7 again.

## What the user can decide (route B)

Only what the designer can build; `references/workflow.md` lists it. Socket counts, network points, panel and network box location, bedside USB and floor sockets are applied after the designer's automatic MEP layout; exact switch positions and lighting circuits are left to the designer.

## Exports

`export_cad` with `format` `spec`, `designer` (a standalone editable HTML), `png` or `dxf`, the current `baseRevision` and a new `operationId`; `get_editor_operation` gives the saved file path. State and exports live under `<projectDir>/cad/`. The quote, drawing-set PDF, colour plan and 3D render come from step 6.

## Requirements

- The skill folder is self-contained and can sit in any project. Script paths are relative to this skill folder.
- Node 20 or newer for the editor runtime; the page loads in any modern browser.
- Step 6 and route A: `npm run setup` once in this folder (installs `puppeteer-core` for `designer/scripts`; it drives the user's own Chrome / Edge / Chromium, or `CHROME_PATH`), and Python with `pip install numpy pillow opencv-python pymupdf ezdxf pypdf`.
- No API key or image model is needed: every drawing and render comes from the designer.

## Layout of this folder

- `runtime/` — the live editor: page server, command line (`scripts/canvas.mjs`) and the designer page, built by CanvasAnvil's `scripts/sync-canvas-skill.mjs`.
- `designer/` — the house designer: template, reconstruction and check scripts, references, `GUIDE.md` (route A).
- `prompts/plan.md`, `prompts/layout.md`, `prompts/edit.md` — plan (with the decision menu), layout and edit-operation prompts.
- `references/furniture-catalog.md` — every valid furniture key; `references/workflow.md` — route B in detail; `references/output-contract.md` — the files each step writes; `references/offline-workflow.md` — the same design done entirely with the scripts below, without the live editor.
- `scripts/build-house-spec.mjs`, `scripts/run-designer.mjs` — the offline layout and designer scripts (delivery and qa in step 6).

Everything except `SKILL.md`, `references/workflow.md`, `references/output-contract.md`, `references/offline-workflow.md`, `agents/` and the two scripts is generated by CanvasAnvil's `scripts/sync-cad-skill.mjs` and `scripts/sync-canvas-skill.mjs`; do not edit it here.
