---
name: diagram-skill
description: Create and edit draw.io diagrams in a live draw.io editor the user can also edit by hand; every model change starts from the user's latest saved version. Shown in the conversation where the host renders MCP App widgets, otherwise opened in the built-in or the user's browser. Use for new diagrams, local XML edits, shape-library diagrams, and truncated XML continuation.
---

# Diagram Skill

## Trigger

Use when the user asks for a diagram, flowchart, architecture diagram, network diagram, ER diagram, BPMN diagram, or a cloud/infrastructure diagram, or mentions draw.io, diagrams.net, drawio, or a `.drawio` file.

## Order

1. Classify the request.
2. Read the required references.
3. Plan: in 1–3 sentences, say what the diagram shows, its layout kind, its groups and its main flow (for an edit, what changes and why). Show the plan to the user.
4. Produce draw.io XML for new diagrams, or add/update/delete cell operations for local edits.
5. Write the XML to a `.drawio` file (a scratch file if file writes are limited).
6. Validate the structure with `scripts/validate-drawio-xml.mjs`.
7. Check the layout with `scripts/check-layout.mjs`. Fix every error it reports and run it again, keeping the arrangement while fixing.
8. Open the editor (see "Reaching the editor") with the absolute active workspace as `projectDir`, or reuse the one already open. Read `get_diagram_state` before editing.
9. Use `set_diagram_xml` for new diagrams or explicit relayouts, `edit_diagram` for local cell changes, and `append_diagram` for truncated XML as described below. Read the latest revision before a new request. Use a stable operation ID for each call and reuse it for transport retries. A corrected XML payload or changed operation set uses a new operation ID. Poll pending operations until applied or failed. Manual edits synchronize back into the project.

## Reaching the editor

The same tools exist on two paths; use the first that is available.

1. **MCP tools** (`canvasanvil_canvas`, from the CanvasAnvil plugin): call `render_diagram_widget`. A host that renders MCP App widgets shows the editor in the conversation. Otherwise open its returned `browserUrl` in the built-in browser, or give that URL to the user.
2. **Command line** (no plugin needed; this folder carries the runtime in `runtime/`, Node 20+):

   ```bash
   node <skill-dir>/runtime/scripts/canvas.mjs open diagram <projectDir>
   ```

   It prints the editor's `url` (`http://127.0.0.1:…`). Open it in the built-in browser, or give it to the user (add `--launch` to open the system browser). Then run every tool below as

   ```bash
   node <skill-dir>/runtime/scripts/canvas.mjs call <tool> @args.json
   ```

   with the same arguments as a JSON file (`projectDir` included). It prints the tool's JSON result. `canvas.mjs tools` lists the tools.

On both paths the editor page must stay open: it applies queued changes with the website's code and saves the user's manual edits. Nothing changes on the canvas while it is closed.

## Classification

- `prompts/display.md`
  - new diagram
  - major rewrite
  - major relayout
  - any case where local editing is fragile
- `prompts/edit.md`
  - current XML exists
  - change is small and precise
  - ids can remain stable
- `prompts/append.md`
  - earlier XML output was truncated
- `prompts/router.md`
  - routing decision needed before generation

## Required References

- `references/xml-rules.md`
- `references/layout-rules.md`
- `references/edit-rules.md`
- `references/shape-library-index.md`
- `references/shape-libraries/<library>.md`

Read the library file before generating any library-backed diagram.

Do not guess undocumented shape-library prefixes or shape names.

## XML Contract

- New diagrams should normally produce a full `<mxGraphModel>` with `<root>`.
- Every `mxCell` is written flat inside `<root>`; nesting is expressed with `parent`.
- Root cells must exist:
  - `<mxCell id="0"/>`
  - `<mxCell id="1" parent="0"/>`
- Every id must be unique; `0` and `1` are reserved, never used for a shape or an edge.
- Groups are real containers: `container=1` (or `swimlane`), with members using `parent="<group id>"` and coordinates relative to the group.
- Edges use `parent="1"`, and their `source` and `target` must reference existing ids.
- Preserve existing ids during local edits unless renaming is explicitly required.
- Escape XML attribute values correctly.
- Do not emit XML comments.

## Layout Contract

The editor reuses the website layout engine. New diagrams try light tidying and ELK optimization, retaining a result that meets the website score and arrangement-preservation gates. Local edits tidy only rows containing changed cells. Give the model a coherent initial layout using `references/layout-rules.md`.

- Declare a layout kind and follow its arrangement: `flow-down`, `flow-right`, `flow-up`, `tree-down`, `tree-right`, `mindmap`, `swimlane`, `sequence`, `timeline`, `free`, or `auto` when none of them fits or you are unsure (the editor then picks the correction itself).
- Shapes in one rank share a centre line exactly. Shapes with the same role share a size.
- Leave 40px or more between shapes and between groups.
- Put the title above the drawing and legends below it.
- Use orthogonal edges, and normally no ports or waypoints.
- Hand over only a diagram the layout check passes with no errors.

## Output Contract

- Prefer complete XML for new diagrams.
- Use the smallest add/update/delete operation set for local changes. The widget computes the full updated XML.
- Stop at a clean boundary when output length is at risk.
- Continue from the exact next character when appending.
- Return the XML as a code block in chat.
- Write the same XML to `<name>.drawio` when file writes are available.
- When requested, use `export_diagram` for drawio, SVG or PNG. Poll `get_editor_operation` for its actual saved file path.
- The plugin or this folder's `runtime/` supplies the editor and its tools. The draw.io editor loads from `https://embed.diagrams.net`, with an initial-load fallback to the official `https://jgraph.github.io/drawio/src/main/webapp/index.html` mirror, and needs network access.

## Working in the editor

The user gives instructions in the chat and may edit the diagram by hand between them. A newly installed or updated plugin may need a host restart before its MCP tools load; the command line works without it.

Read `get_diagram_state` immediately before a modification or export. Its `document.xml` and immutable `documentPath` contain saved manual edits. Use the returned revision as `baseRevision`. Preserve unrelated cells, IDs and layout. Reuse the open widget while commands run. A pending command needs the widget open and responsive. If it remains pending, report that condition instead of claiming success. A revision conflict requires rereading the current document and adapting the change.

Call `export_diagram` with `format` (`drawio`, `svg`, `png`), `baseRevision` and a new stable `operationId` when a file is needed. Read `get_editor_operation` with `editor="diagram"` to get the file path. State is stored under `<projectDir>/diagram/`.

Read `get_diagram_state` after application. Its `document.layoutCorrection` records original and corrected XML, mode, layout, method, scores and moved/straightened counts. Report actual results and remaining issues. The correction finishes before the command is marked applied. Saved manual edits and restored documents load as saved.

## Generation, local edits and continuation

For a new diagram or explicitly requested relayout, call `set_diagram_xml` with `xml`, `baseRevision`, a new stable `operationId`, `mode="create"` and the declared `layout`. The widget runs the website's `wrapWithMxFile` and `validateAndFixXml`, then corrects layout before loading and saving the final diagram. Read `document.xmlFixes` from `get_diagram_state` for the actual XML repairs. Unrepairable errors fail the operation and preserve the saved document.

For a local edit, read the current XML and call `edit_diagram` with `baseRevision`, a stable `operationId` and ordered `operations`. Each operation has `operation` (`add`, `update`, `delete`) and `cell_id`; add/update also require `new_xml` containing exactly one matching `mxCell`. The widget uses the website's `applyDiagramOperations`, including removing descendants and connected edges on deletion. It tidies only rows containing the added or updated IDs. Read the resulting state after completion.

If `set_diagram_xml` returns `awaiting_append`, continue from its exact next character using `append_diagram`. Pass that operation ID as `draftId`, the continuation as `xml`, the original `baseRevision`, and a new stable `operationId` for the chunk. A retry of that chunk reuses the same operation ID. If the chunk also returns `awaiting_append`, use its ID as the next `draftId`. The draft is saved in the project and survives MCP restarts. The canvas changes only after the combined XML is complete, validated, repaired and layout-corrected.

Do not repeat wrappers or root cells during continuation. A `continued` operation names its `nextOperationId`; a `superseded` draft has been replaced by a newer request. A revision conflict means the user changed the canvas during generation. Read the new state and regenerate against that revision. Poll `get_editor_operation` only once the final chunk is `pending`, and report success only after `applied`.

## Scripts

The scripts live in this skill's own folder and need only Node, with no install step. In the commands, `<skill-dir>` is the folder that holds this `SKILL.md`. Use its absolute path, so the commands work from any working directory.

- `scripts/validate-drawio-xml.mjs`: structure (root cells, unique ids, parents, edge ends)
- `scripts/check-layout.mjs`: layout (overlaps, groups, edges through shapes, text fit); prints a score and exits 1 on errors
- `scripts/build-drawio-url.mjs`
- `vendor/pako_deflate.min.cjs` (compression only, no install step)

If the user specifies an output directory or file path, write the `.drawio` file there.

If the user does not specify an output location, create a new output folder automatically and write the `.drawio` file there.

Do not write generated artifacts into the skill folder.

## Deliverables

Report the actual changes and any validation errors. Link requested files after their export operation is applied.
