# Diagram

Describe a diagram and it is drawn in draw.io; after that, whatever you ask to change is the only thing that changes.

## The first draft

Describe the diagram you want in the input. The more specific the better: what the parts are, what connects to what, how many layers. You can also drop in a PDF, a Word file or a few screenshots and let it read the structure out of the material.

It suits system architecture, business processes, research frameworks, implementation roadmaps, mind maps, swimlanes and sequence diagrams.

## Keep editing

Once the first draft is up, ask for changes the way you would say them:

- "Move the payment service to the right of the order service"
- "Give the database layer a grey background"
- "Make the message queue Kafka, and the lines dashed"

Each of these is read as a **local edit**: only what you named moves, and every other box and line stays exactly where it was. The whole diagram is replaced only when you clearly say "redraw" or "regenerate".

> [!WHY]
> Mistaking a small edit for a redraw would quietly throw away a whole diagram you had already tuned. So it errs on the side of caution: it redraws only when you ask it to.

You can also drag and retype things by hand in draw.io; the next AI edit reads the version you changed.

## Tidying the layout

The coordinates a model draws are often a few pixels off: boxes that should line up sit slightly apart, and the lines bend into little kinks. Every diagram passes through an automatic tidy before it reaches the canvas (rows, alignment, fewer crossings, grid snapping), and the result is used only if it scores no lower than the original.

A new diagram goes up with this quick tidy first; then a full layered layout (ELK) is worked out in the background. The "Layout correction" step in the conversation shows the layout check score before and after and which problems were fixed, and lists the model's drawing, the tidied one and the ELK one with their scores: click one to see it on the canvas, then confirm it, and later changes build on that diagram. The algorithm and its trade-offs are in [Diagram layout](/docs/diagram-layout).

## Export

Export `.drawio`, SVG or PNG from the top right. A `.drawio` file keeps editing in any draw.io.

## Tips

- `Ctrl + B` enlarges the canvas; press it again to restore.
- Write your usual colours, fonts and line style in Settings → Memory → Diagram, and they are sent with every request.
- When you run it yourself, installing dependencies also downloads a copy of draw.io, which the canvas uses first, so it works offline. Without that copy it loads draw.io online, switching to a mirror if the default address does not load within 8 seconds.
