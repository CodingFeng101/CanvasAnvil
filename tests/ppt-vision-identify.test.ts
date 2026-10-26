import assert from "node:assert/strict";
import { test } from "node:test";
import {
  contains,
  iou,
  measureShapes,
  readElements,
  toBox,
} from "../client/workspaces/ppt/vision/identify";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * Reading the model's list of elements.
 *
 * A missing element is the expensive failure: whatever is dropped here is
 * erased from the rebuilt slide and nobody sees it again. So the filters are
 * deliberately permissive, the de-duplication is deliberately reluctant, and
 * everything that does not survive leaves a note behind.
 */

const answerOf = (elements: unknown[]) => ({ elements });

test("a box is accepted however the model chose to write it", () => {
  assert.deepEqual(toBox([0.1, 0.2, 0.3, 0.4]), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  // Answered in percent.
  assert.deepEqual(toBox([10, 20, 30, 40]), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  // Strings, which JSON from a model routinely contains.
  assert.deepEqual(toBox(["0.1", "0.2", "0.3", "0.4"]), { x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
});

test("a hairline rule is a real element and is not filtered out", () => {
  // Two pixels on a wide page. A minimum-size filter here would erase every
  // divider on the deck.
  const rule = toBox([0.06, 0.5, 0.001, 0.28]);
  assert.ok(rule);
  assert.equal(rule!.w, 0.001);
});

test("only a box with no extent at all is refused", () => {
  assert.equal(toBox([0.1, 0.2, 0, 0.4]), null);
  assert.equal(toBox([0.1, 0.2, 0.3, -1]), null);
  assert.equal(toBox([Number.NaN, 0.2, 0.3, 0.4]), null);
  assert.equal(toBox([0.1, 0.2]), null);
  assert.equal(toBox("0.1,0.2,0.3,0.4"), null);
});

test("a box running off the page is clamped rather than dropped", () => {
  const clamped = toBox([0.8, 0.9, 0.5, 0.5]);
  assert.ok(clamped);
  assert.ok(clamped!.x + clamped!.w <= 1 + 1e-9);
  assert.ok(clamped!.y + clamped!.h <= 1 + 1e-9);
});

test("overlap and containment measure what their names say", () => {
  const card = { x: 0.1, y: 0.1, w: 0.4, h: 0.4 };
  assert.equal(iou(card, card), 1);
  assert.equal(iou(card, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }), 0);

  const badge = { x: 0.12, y: 0.12, w: 0.08, h: 0.08 };
  assert.ok(contains(card, badge));
  // A box almost as large as its container is a duplicate, not a child.
  assert.ok(!contains(card, { x: 0.1, y: 0.1, w: 0.39, h: 0.39 }));
});

test("a repeated drawing becomes one entry per position, sharing a key", () => {
  const unique = readElements(
    answerOf([
      {
        kind: "icon",
        desc: "green tick",
        bbox: [0.3, 0.4, 0.02, 0.03],
        also_at: [[0.3, 0.48, 0.02, 0.03], [0.3, 0.56, 0.02, 0.03]],
      },
    ]),
    "slide-1",
  );

  assert.equal(unique.length, 3, "three places, three elements");
  assert.equal(new Set(unique.map((item) => item.iconKey)).size, 1, "one drawing, one key");
});

test("a repeated native shape gets no shared key", () => {
  // Native shapes cost nothing to draw and each one's colour is measured
  // separately, so they are never collapsed onto a shared asset.
  const [card] = readElements(
    answerOf([{ kind: "native", shape: "round_rect", bbox: [0.1, 0.1, 0.3, 0.3] }]),
    "slide-1",
  );
  assert.equal(card.iconKey, "");
  assert.equal(card.shape, "roundRect", "the detector's spelling is normalised");
});

test("an unknown kind falls back to icon, which is the safe answer", () => {
  const [entry] = readElements(
    answerOf([{ kind: "widget", bbox: [0.1, 0.1, 0.2, 0.2] }]),
    "s",
  );
  assert.equal(entry.kind, "icon");
});

test("the same card reported twice is merged, and the larger one survives", () => {
  const notes: string[] = [];
  const unique = readElements(
    answerOf([
      { kind: "native", shape: "rect", desc: "card", bbox: [0.1, 0.1, 0.3, 0.3] },
      { kind: "native", shape: "rect", desc: "the same card", bbox: [0.105, 0.105, 0.295, 0.295] },
    ]),
    "s",
    notes,
  );

  assert.equal(unique.length, 1);
  assert.equal(unique[0].desc, "card");
  assert.ok(notes.some((note) => note.includes("merged")), "a merge is recorded, never silent");
});

test("a badge sitting on its own disc stays two entries", () => {
  // They overlap almost perfectly and are two elements on purpose, so the
  // bar for merging across kinds is far higher than within one.
  const unique = readElements(
    answerOf([
      { kind: "native", shape: "oval", desc: "disc", bbox: [0.1, 0.1, 0.08, 0.08] },
      { kind: "icon", desc: "shield on the disc", bbox: [0.104, 0.104, 0.072, 0.072] },
    ]),
    "s",
  );
  assert.equal(unique.length, 2);
});

test("everything dropped leaves a note behind", () => {
  const notes: string[] = [];
  const unique = readElements(
    answerOf([
      "not an object",
      { kind: "native", bbox: "nonsense" },
      { kind: "native", shape: "rect", bbox: [0.1, 0.1, 0.2, 0.2] },
    ]),
    "s",
    notes,
  );

  assert.equal(unique.length, 1);
  assert.equal(notes.length, 2);
});

test("an empty or malformed answer reads as no elements, not as a crash", () => {
  assert.deepEqual(readElements(null, "s"), []);
  assert.deepEqual(readElements({}, "s"), []);
  assert.deepEqual(readElements({ elements: "nope" }, "s"), []);
});

const pageWith = (cards: Array<{ box: [number, number, number, number]; colour: [number, number, number] }>): RgbaImage => {
  const width = 400;
  const height = 300;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 248;
    data[i * 4 + 1] = 250;
    data[i * 4 + 2] = 253;
    data[i * 4 + 3] = 255;
  }
  for (const { box, colour } of cards) {
    for (let y = box[1]; y < box[1] + box[3]; y += 1) {
      for (let x = box[0]; x < box[0] + box[2]; x += 1) {
        const at = (y * width + x) * 4;
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
      }
    }
  }
  return { data, width, height };
};

test("native entries become measured shapes and icons do not", () => {
  const image = pageWith([{ box: [40, 40, 160, 120], colour: [18, 103, 230] }]);
  const shapes = measureShapes(
    image,
    [
      { kind: "native", shape: "rect", desc: "blue card", box: { x: 0.1, y: 0.13, w: 0.4, h: 0.4 }, iconKey: "" },
      { kind: "icon", shape: "rect", desc: "a database", box: { x: 0.6, y: 0.2, w: 0.1, h: 0.1 }, iconKey: "k" },
    ],
    "slide-1",
  );

  assert.equal(shapes.length, 1, "an icon is not a shape");
  assert.equal(shapes[0].type, "shape");
  assert.equal(shapes[0].fill, "#1267E6");
  // Snapped onto the card rather than left where the model guessed.
  assert.ok(Math.abs(shapes[0].x * 400 - 40) <= 4, `left landed at ${shapes[0].x * 400}`);
});

test("shapes come back largest first, so a card cannot cover its own badge", () => {
  const image = pageWith([
    { box: [20, 20, 300, 200], colour: [255, 255, 255] },
    { box: [40, 40, 60, 60], colour: [18, 103, 230] },
  ]);

  const shapes = measureShapes(
    image,
    [
      { kind: "native", shape: "oval", desc: "badge", box: { x: 0.1, y: 0.13, w: 0.15, h: 0.2 }, iconKey: "" },
      { kind: "native", shape: "rect", desc: "card", box: { x: 0.05, y: 0.07, w: 0.75, h: 0.67 }, iconKey: "" },
    ],
    "slide-1",
  );

  assert.ok(shapes.length >= 2);
  assert.ok(shapes[0].w * shapes[0].h > shapes[1].w * shapes[1].h, "the container is drawn first");
});
