# Floor plans, intent to drawings

In a floor plan the walls must close, the dimensions must add up, and the bed must not sit inside a wall. This is geometry that admits no argument, and exactly what models are worst at. So in the interior design canvas the model only **describes** the plan, and code **draws** it.

```diagram
interior
```

## The model writes intent, not coordinates

What the model outputs is a layout description:

- a **grid**: one dimension chain across and one down, such as `3600 / 2400 / 4200`;
- which cells each room takes;
- which two rooms each door joins, and which outer wall each window opens in;
- which wall the bed stands against, which way the sofa faces, where the dining table goes;
- materials for floors, walls and the rest.

`layout.ts` computes every coordinate from that intent: walls always close, dimensions always add up, and furniture is placed with its real footprint, clear of walls, doors and other furniture. When something does not fit, it is shrunk or swapped for a smaller model, and every adjustment is listed in the conversation.

> [!WHY]
> When the model wrote coordinates directly, we kept seeing walls a few centimetres short of meeting and room areas that did not sum to the total. Dimension chains turn "how long is this wall" into an addition, and code does not get additions wrong.

## A deterministic finish

With the geometry in place, two more kinds of problem remain that models are just as poor at: furniture a few centimetres into a wall, blocking a curtain, or clashing with a neighbour. `auto-nudge.ts` shifts each named piece along the axes, and **a move is kept only if the designer's own checks then report fewer errors and no more warnings**. Curtains belong in front of their window, so the other piece moves first.

Electrical and plumbing points are then placed in one go and adjusted to your preferences: more sockets, network ports, the panel beside the front door, floor sockets under the dining or coffee table, USB by the bed.

## The check-and-fix loop

The designer has its own checks, plus a room-by-room electrical audit (`elec-audit.ts`): which switch works which light, mounting heights, whether a switch by a door is on the handle side, each room type's standard points. These rules match the cad-skill audit script, so the site and the skill reach the same verdicts.

When problems turn up, `revise-loop.ts` takes the list back to the model, which edits the designer's own format with an **RFC 6902 JSON Patch** (`spec-patch.ts`), sending only the fields that change rather than the whole scheme.

The loop stops at whichever comes first:

- 0 errors and 0 warnings, which is the designer's delivery bar;
- a round that improves nothing;
- the limit of 6 rounds.

> [!WHY]
> In the scoring, **one error outweighs any number of warnings** (an error counts 1000, a warning 1). If a round does not lower the score, or adds errors, it is rolled back to the previous version. The model's "fixes" can never make a usable plan worse.

## Converting both ways

A scheme the AI generated, your edits in the designer, and a plan recognised from a drawing must all convert into one another. `plan-to-spec.ts` is the inverse of the designer's loader: it turns the plan currently in the designer back into a spec, so the next AI edit reads exactly what you changed.

## Delivery

The quote, drawing set, DXF, colour plan and renders all come from the designer itself rather than from a separate AI pass, whose lists and drawings would not agree. When the server has a browser, Delivery check runs the designer's acceptance script for a full functional check of the page.
