---
name: flow-skill
description: Generate, edit, validate, and bundle draw.io or diagrams.net diagrams in XML form. Use for new diagrams, local XML edits, shape-library diagrams, truncated XML continuation, and local image export.
---

# Flow Skill

## Trigger

Use when the task requires draw.io or diagrams.net XML output, local XML editing, shape-library-backed diagrams, or exported image artifacts.

## Order

1. Classify the request.
2. Read the required references.
3. Produce or modify draw.io XML.
4. Validate when needed.
5. Export or bundle artifacts when requested.

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
- `references/edit-rules.md`
- `references/shape-library-index.md`
- `references/shape-libraries/<library>.md`

Read the library file before generating any library-backed diagram.

Do not guess undocumented shape-library prefixes or shape names.

## XML Contract

- New diagrams should normally produce a full `<mxGraphModel>` with `<root>`.
- All `mxCell` elements must be direct children of `<root>`.
- Root cells must exist:
  - `<mxCell id="0"/>`
  - `<mxCell id="1" parent="0"/>`
- Every id must be unique.
- Every edge `source` and `target` must reference existing ids.
- Preserve existing ids during local edits unless renaming is explicitly required.
- Escape XML attribute values correctly.
- Do not emit XML comments.

## Output Contract

- Prefer complete XML for new diagrams.
- Prefer the smallest safe edit set for local changes.
- Stop at a clean boundary when output length is at risk.
- Continue from the exact next character when appending.

## Scripts

- `scripts/validate-drawio-xml.mjs`
- `scripts/export-drawio-image.mjs`
- `scripts/build-flow-bundle.mjs`

If the user specifies an output directory or file path, write artifacts there.

If the user does not specify an output location, create a new output folder automatically and write all artifacts there.

Do not write generated artifacts into the skill folder.

## Deliverables

Preferred:

- `.drawio`
- `png`
- metadata JSON

Optional on request:

- `svg`
- `xmlpng`
