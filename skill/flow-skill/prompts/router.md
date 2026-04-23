# Flow Router

Use this prompt to decide whether a request should go through full generation or local editing.

## Goal

Choose exactly one path:

- `display`
- `edit`

## Decision Rules

- Choose `display` when:
  - there is no current XML
  - the user wants a brand-new diagram
  - the user wants a major relayout or structural rewrite
  - exact local editing would be fragile
- Choose `edit` only when:
  - current XML exists
  - the change is small and local
  - you can safely preserve most of the current XML structure

## Output Contract

Return only one word:

- `display`
- `edit`
