# How decks are made

A deck is two things: what to say, and how to show it. CanvasAnvil splits them into two stages, settling the first in cheap words before spending on images for the second.

```diagram
ppt
```

## Reading the mode from the first message

`creation-intent.ts` reads your first message and decides whether it is an **idea** (just a topic), an **outline** (a structure already) or a **beautify** request (a finished deck). The three modes use different prompts but meet at the same outline review.

## Outline first, visuals after

> [!WHY]
> One slide image takes tens of seconds and real money; changing one line of an outline costs next to nothing. Catch structural problems at the words stage, and each line you change in review saves reworking a whole page after the images are made.

During review you can add and remove slides, reorder them and rewrite their points. Deleting asks first.

## Templates and per-slide layouts

The template sets the style and palette of the whole deck, keeping it consistent; but no slide is forced into a fixed frame. Each slide's layout is designed for its own content: three points and a comparison table should not be squeezed into the same mould.

The template library is stored apart from decks: clear a deck, and the templates you collected or uploaded are still there.

## Concurrency and retries

All slides generate together, at most 5 at a time by default; Settings → Canvas → "Slides drawn at once" sets it from 1 to 10, and restyling or editing several pages follows it too. A failed slide is retried on its own, and one failure never holds up the rest.

> [!WHY]
> Why 5? Queued one by one, a 15-slide deck takes a long while; sent all at once, providers reject the burst and more slides fail. 5 is the limit that is not rejected, and within it, the more at once, the sooner the deck is done. The editable export is heavier and runs 3 at a time.

## One set of prompts, shared with the skill

The prompts in `slide-prompts.ts` are shared by the site and ppt-skill, synced across by `node scripts/sync-ppt-skill.mjs`. So a deck made with ppt-skill in a coding agent is of the same quality as one made on the site.

## Editable export

An image PPTX looks right but its words cannot be changed. The editable export rebuilds each slide from real text boxes, shapes and images:

- a **code skeleton** handles what is certain: cutting images, positioning, assembling the PPTX, rendering previews;
- a few **model judgment nodes** handle what needs an eye: what is text, what should become a shape, what stays a picture;
- slides are **rebuilt in parallel**, then gathered into one file.

It is the same division once more: the model answers only the questions it is good at, and deterministic code does the rest.
