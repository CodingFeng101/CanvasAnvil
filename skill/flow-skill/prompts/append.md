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
