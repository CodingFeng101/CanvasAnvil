You are checking a rebuilt slide against the original it was rebuilt from.

Image 1 is the original page.
Image 2 is the rebuild, at the same size.

You are looking for **one thing only: what is present in image 1 and missing
from image 2.** List it, and list nothing else.

## What counts as missing

- `icon` — a drawing of a recognisable thing (database, cap, shield, chat
  bubble, trophy, person, building, monitor, cloud, gear, flask, logo) that is
  in the original and simply is not in the rebuild.
- `native` — a shape a presentation tool draws with its own tools (card,
  panel, rounded rectangle, title bar, divider, rule, circle, ring, disc,
  badge, plain arrow, chevron, frame) that is in the original and not in the
  rebuild.
- `complex` — a composite drawing (pipe run, glow assembly, rendered 3D
  device, chemical structure, chart picture) absent from the rebuild. One box
  around the whole assembly.

Something faint, pale, or low-contrast in the rebuild is **present**. Only
report what is not there at all.

## What is not a gap, and must not be reported

- **Text of any kind.** Missing, wrong, mispositioned, wrong size, wrong
  weight, wrong colour -- text is handled elsewhere and is never your answer.
- **Anything with a wrong colour, size, position or proportion.** Those are
  present. You report absences, not differences.
- **The background.** It was redrawn on purpose: gradients, textures, edge
  ribbons, corner ornaments, scenery, skylines and photographic artwork will
  differ, and none of that is a gap.
- **Bullet dots, list markers and small punctuation.**
- **Shadows, glows and soft blurs.**
- Anything you are not sure about. A false alarm has a drawing invented and
  pasted onto a page that did not need it, which is worse than the gap.

If the rebuild has everything, return an empty list. That is a normal answer
and often the right one.

## Format

Exactly the format used to list a page in the first place, containing only the
missing items:

- `bbox` is `[x, y, w, h]` in fractions of the page, top-left origin, taken
  from **image 1**, the original. Approximate is fine; the bounds are
  re-measured from the pixels.
- `native` also takes `shape`: rect, round_rect, frame, oval, donut, line,
  triangle, right_triangle, diamond, pentagon, hexagon, octagon, trapezoid,
  parallelogram, plus, tag, star4, star5, star6, arrow, left_arrow, up_arrow,
  down_arrow, left_right_arrow, chevron, or `polygon` for any outline none of
  those describe. Colours are measured; do not report them.
- `icon` and `complex` take a `desc` concrete enough to redraw from: subject,
  colours, style, line weight.
- One drawing missing from several places is one entry: the first position in
  `bbox`, the rest in `also_at`.

Return JSON only:

{
  "elements": [
    { "id": "m1", "kind": "native", "shape": "round_rect", "desc": "white card behind the left column", "bbox": [0.06, 0.26, 0.34, 0.25] },
    { "id": "m2", "kind": "icon", "desc": "blue shield with a white padlock, flat style", "bbox": [0.45, 0.61, 0.07, 0.11] }
  ]
}

An empty answer is `{ "elements": [] }`.
