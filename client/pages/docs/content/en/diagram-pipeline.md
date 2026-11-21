# Diagram chat pipeline

Between leaving the input and landing on the canvas, a message passes through a few stages inside `/api/chat`. Each does one thing, in its own file under `server/chat/`.

```diagram
diagram-pipeline
```

## Reading intent: edit one thing, or redraw

`intent.ts` decides whether you are adjusting a node or asking for a new diagram. The first must preserve the existing XML; the second may replace it.

> [!WHY]
> The cost of a wrong call is lopsided: treating an edit as a redraw silently throws away your whole diagram, while treating a redraw as an edit costs you one more sentence at most. So an explicit "redraw" always wins, and otherwise it leans towards a local edit.

## Reading documents: fitting them into the prompt

Uploaded PDF and Word files are parsed on the server (`files.ts`). Long documents are condensed by `summarize.ts`: a short one gets one pass per chunk plus a merge; a long one folds repeatedly until few enough summaries remain.

> [!WHY]
> A model that refuses to summarise, or asks for more material instead, is retried once; if it still fails, its place is taken by a mechanical extract of the text. A bad summary silently poisons the diagram that follows, so it must never reach the prompt.

## Repairing history: the model sees only the current diagram

Every earlier tool call carries the whole diagram's XML. Sent back as is, those old diagrams would crowd every request. `messages.ts` swaps the XML in history for placeholders and keeps the current diagram as the single source of truth. It also fixes providers that stream tool arguments as strings.

## Shape libraries on demand

draw.io has a great many specialised shapes: AWS, Azure, Kubernetes, network gear, UML… Putting all of them in the system prompt would be costly and distracting. When the model needs one, it fetches that library's notes through a tool call (`shape-library.ts`), taking only what it uses.

## Deep Think: a sketch first

With Deep Think on, `deep-thinking.ts` has an image model draw the diagram first, then hands the picture to the text model as a layout reference. When a debug directory is configured, the sketch is saved to disk.

> [!WHY]
> When a layout is bad, the fault may lie in the thinking or in translating that thinking into XML. The only way to tell them apart is to look at what the image model actually drew.

## Streaming and onto the canvas

The model writes the XML through streamed tool calls, and the page shows progress as it arrives. Once the full XML is in, it gets the quick tidy described in [Diagram layout](/docs/diagram-layout) and is handed to draw.io. While generating, the conversation and the diagram are saved every 3 seconds.
