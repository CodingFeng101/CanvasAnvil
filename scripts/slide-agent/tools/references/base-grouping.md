# Base Grouping

Do not ask the user an open-ended base-grouping question first. Inspect page images, propose a grouping, then ask the user to accept or modify it.

## How To Infer Groups

Use visual similarity and page role:

- **Cover base**: first page, large title, sparse central content, stronger hero background.
- **Content base**: repeated header/footer, repeated side decoration, same background with different middle content.
- **Section base**: divider page, large chapter title, less body content, often a distinct accent layout.
- **Ending base**: final page, "thanks" or closing layout, often sparse and centered.
- **Per-page base**: use when page backgrounds or outer decorations differ substantially.

If only a few pages are provided, recommend conservatively. For two visually different pages, recommend one base per page.

## What To Present

Show a short recommendation:

```text
Recommended base grouping:
- Base A: page 1, cover-style background.
- Base B: pages 2-5, repeated content-page background.
- Base C: page 6, ending page.

I will use this grouping unless you want different pages grouped together.
```

If confidence is low, say why:

```text
The pages have similar borders but different center structures. I recommend grouping by outer background, not by card layout.
```

## Rules

- The recommendation is not final until the user accepts or modifies it.
- Do not generate bases before the user confirms the grouping.
- Do not assume a fixed three-base scheme. Three bases is common, not mandatory.
- Group by background/edge decoration, not by central cards or content blocks, because central objects are rebuilt separately.
