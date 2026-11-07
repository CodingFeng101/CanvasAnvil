---
name: diagram-skill
description: Generate, edit, and validate draw.io or diagrams.net diagrams as XML, then open them directly in the draw.io online editor so the user can keep editing there. Use for new diagrams, local XML edits, shape-library diagrams, and truncated XML continuation.
---

# Diagram Skill

## Trigger

Use when the user asks for a diagram, flowchart, architecture diagram, network diagram, ER diagram, BPMN diagram, or a cloud/infrastructure diagram, or mentions draw.io, diagrams.net, drawio, or a `.drawio` file.

## Order

1. Classify the request.
2. Read the required references.
3. Plan: in 1–3 sentences, say what the diagram shows, its layout kind, its groups and its main flow (for an edit, what changes and why). Show the plan to the user.
4. Produce or modify draw.io XML, laid out on a grid for that layout kind.
5. Write the XML to a `.drawio` file (a scratch file if file writes are limited).
6. Validate the structure with `scripts/validate-drawio-xml.mjs`.
7. Check the layout with `scripts/check-layout.mjs`. Fix every error it reports and run it again, keeping the arrangement while fixing.
8. Build an online editor URL and open it in the agent's built-in browser.
9. Return the plan, the XML code, the `.drawio` path, the layout score and the online editor link.

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

There is no automatic layout after you: the coordinates you write are the layout. See `references/layout-rules.md`.

- Declare a layout kind and follow its arrangement: `flow-down`, `flow-right`, `flow-up`, `tree-down`, `tree-right`, `mindmap`, `swimlane`, `sequence`, `timeline` or `free`.
- Shapes in one rank share a centre line exactly. Shapes with the same role share a size.
- Leave 40px or more between shapes and between groups.
- Put the title above the drawing and legends below it.
- Use orthogonal edges, and normally no ports or waypoints.
- Hand over only a diagram the layout check passes with no errors.

## Output Contract

- Prefer complete XML for new diagrams.
- Prefer the smallest safe edit set for local changes, then return the full updated XML.
- Stop at a clean boundary when output length is at risk.
- Continue from the exact next character when appending.
- Return the XML as a code block in chat.
- Write the same XML to `<name>.drawio` when file writes are available.
- Do not produce PNG, SVG, PDF, xmlpng, or metadata artifacts.
- Do not run Playwright and do not install browser dependencies.

## Online Editor Handoff

1. Save the XML to a `.drawio` file.
2. Build the editor URL:

   ```powershell
   node <skill-dir>/scripts/build-drawio-url.mjs --input path\to\diagram.drawio
   ```

   The script prints a self-contained `https://app.diagrams.net/?offline=1#R...` URL with the diagram compressed inside it.
3. Open that URL with the agent's built-in browser tool in a new tab and leave the tab open.
4. Tell the user the diagram is loaded and can be edited directly in the online editor. Do not automate edits.
5. If no browser tool is available, or the page fails to load, give the user the URL and the `.drawio` path instead.
6. If the script reports `tooLong`, or the browser rejects the URL, fall back to the `.drawio` file: open `https://app.diagrams.net` and use File > Open From > Device.
7. Re-running the handoff opens a fresh editor tab with the current XML. It does not update a tab the user has already edited; ask before replacing manual changes.
8. Do not ask the user to log in. `app.diagrams.net` works without an account.

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

Preferred:

- the plan, in one to three sentences
- draw.io XML code in chat
- the layout check score
- `<name>.drawio`
- online editor link (`https://app.diagrams.net/?offline=1#R...`)
