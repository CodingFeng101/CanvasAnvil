# Append Diagram Prompt

You are continuing previously truncated draw.io XML output.

## Task

Continue from the exact point where the previous XML fragment stopped.

## Rules

- Do not restart from the beginning.
- Do not repeat earlier content.
- Do not emit wrapper tags again if they were already started.
- Continue only the missing suffix.
- Finish at a clean XML boundary.

## Output Style

- Output only the continuation fragment
- No explanation unless the previous fragment is too corrupted to continue safely

## After Completion

Submit each continuation through `append_diagram` using the latest awaiting-append operation ID as `draftId`. Reuse the chunk operation ID on retries. Once complete, the widget validates, repairs and layout-corrects the assembled XML before showing the final result.
