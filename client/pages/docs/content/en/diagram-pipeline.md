# Diagram chat pipeline

Between leaving the input and landing on the canvas, a message passes through a few stages inside `/api/chat`. Each does one thing, in its own file under `server/chat/`.

```diagram
diagram-pipeline
```

## Reading documents: fitting them into the prompt

Uploaded PDF and Word files are parsed on the server (`files.ts`). Long documents are condensed by `summarize.ts`: a short one gets one pass per chunk plus a merge; a long one folds repeatedly until few enough summaries remain.

> [!WHY]
> A model that refuses to summarise, or asks for more material instead, is retried once; if it still fails, its place is taken by a mechanical extract of the text. A bad summary silently poisons the diagram that follows, so it must never reach the prompt.

## Repairing history: the model sees only the current diagram

Every earlier tool call carries the whole diagram's XML. Sent back as is, those old diagrams would crowd every request. `messages.ts` swaps the XML in history for placeholders and keeps the current diagram as the single source of truth. It also fixes providers that stream tool arguments as strings.

## Shape libraries on demand

draw.io has a great many specialised shapes: AWS, Azure, Kubernetes, network gear, UML… Putting all of them in the system prompt would be costly and distracting. When the model needs one, it fetches that library's notes through a tool call (`shape-library.ts`), taking only what it uses.

## Streaming and onto the canvas

The model writes the XML through streamed tool calls, and the page shows progress as it arrives. Once the full XML is in, it gets the quick tidy described in [Diagram layout](/docs/diagram-layout) and is handed to draw.io. While generating, the conversation and the diagram are saved every 3 seconds.
