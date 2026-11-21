# Design stance

The four canvases look nothing alike, yet underneath they share one idea: let the model do the judging it is good at, let code do the precise work it is good at, and let a check decide which result stays.

## What a model is good at, and what it is not

A large language model knows which layer belongs on top in an architecture diagram, that the main bedroom of a three-bedroom flat should face the sun, that a report should open with its conclusion. These are **relations and choices**, its real strengths.

But it is poor at arithmetic. In one recorded architecture diagram, every row the model drew had equal widths and equal gaps, yet of its fourteen edges not one joined two boxes that actually lined up. They were off by a dozen pixels or so, and orthogonal routing turned each slip into a small Z. Floor plans are the same: the model says "the main bedroom is 4 m by 3.6 m", yet the wall coordinates it gives often fail to close, and the dimensions do not add up to the total.

## So the work is divided

```diagram
stance
```

1. **The model states intent**: structure, relations, choices. Its coordinates are read as a sketch, not as the answer.
2. **Code makes it exact**: coordinates, sizes, alignment and formats are computed in ways that can be proven.
3. **A check decides**: every candidate is scored, and adopted only if it scores no lower than what it replaces.
4. **If it fails, back to the model**: with the concrete problems, until it is clean, stops improving, or runs out of rounds.

## How it looks in each canvas

| Canvas | The model gives | Code handles | The check |
| --- | --- | --- | --- |
| Diagram | Nodes, edges, rough rows and columns | Rows, alignment, grid snapping, routing | layout-lint, 0–100, keeping the original order and alignment |
| Interior | Grid dimension chains, rooms, doors, furniture intent | Real coordinates of walls, openings and furniture | Designer self-check, electrical audit, delivery check |
| Slides | Outline, each slide's content and layout intent | Concurrency, retries, export | You review the outline |
| Free canvas | Reads the marks into one sentence | Gathers marks by geometry, composites at the image's resolution | The new version sits beside the old, never over it |

## Principles that run throughout

> [!WHY]
> **Never worse than before.** Automatic tidying, fixing and relayout all fall back to the original the moment the score says the result got worse. Nobody loses a perfectly good diagram to "automatic help".

- **You can see what changed.** Layout can be switched between before and after correction; every automatic adjustment to a floor plan is listed; the sentence the vision model read off your marks is shown. Automation should not be a black box.
- **Read intent cautiously.** When in doubt, make only a local edit. Anything irreversible, like redrawing, clearing or deleting, happens only when you say so outright, or after a confirmation.
- **Your data stays with you.** Works in the browser, keys in local settings; the server is only a layer that relays and computes.
