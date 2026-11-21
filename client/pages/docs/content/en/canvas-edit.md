# Editing by annotation

Circle one spot on a picture and only that changes. It sounds simple; underneath are three translations: from strokes to geometry, from geometry to a sentence, and from a sentence to a new picture.

```diagram
canvas-edit
```

## Step one: gathering marks by geometry

You select a picture and draw a few strokes on or beside it. `annotated-edit.ts` first works out which picture those strokes belong to: every arrow, circle and note that falls within a search area around the picture is gathered under it.

The picture and its marks are then composited into one reference image **at the picture's own resolution**; if a mark reaches past the picture's edge, the frame is widened so every stroke shows in full.

> [!WHY]
> Why the picture's own resolution? Zoom on the canvas is only for display. Captured at screen size, a 2048-pixel picture might shrink to a few hundred pixels, the model would lose the detail, and the edited picture would come back blurred.

## Step two: reading the marks into a sentence

The composite goes to a vision model, which writes "what is marked here and what it should become" as one clear instruction. That sentence appears in the conversation as "AI read the edit as: …".

> [!WHY]
> Image editing models are good at "change it as this sentence says" and poor at reading doodles. Letting a vision model translate first means each does what it is good at. More important: if the edit goes wrong, you can see the sentence it read and know at once whether it misunderstood or mis-drew.

## Step three: the image edit

With the original as the main reference and that sentence as the instruction, the image channel's edit route is called (falling back to the chat route when the provider lacks it). The new picture is placed beside the original.

## Lineage

Every picture carries a **lineage id** in its custom data (`lineage.ts`). Every version edited from the same original shares that id, and the version strip uses it to string them together.

> [!WHY]
> Versions never overwrite each other. Edits are hard to predict, and "the last one was better, actually" happens all the time; as long as every version is still there, you can always go back.
