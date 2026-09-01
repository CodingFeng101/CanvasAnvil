import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_FILES, MAX_FILE_SIZE, validateFileParts } from "../server/chat/files";

/**
 * The size and count limits on what a chat turn may carry.
 *
 * `/api/chat` accepts a file in three shapes, because the AI SDK sends
 * whichever the client used: a `parts` entry with `url`, one with `image`, and
 * a `content` entry with `image_url.url`. The limits have to cover all three —
 * a limit that only sees one of them is not a limit.
 */

/** A data URL whose decoded size is just over the cap. */
const oversized = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_FILE_SIZE + 1024) * 4) / 3)}`;
const small = "data:image/png;base64,QUJD";

const turn = (parts: unknown[], content?: unknown[]) => [
  { role: "user", parts: [{ type: "text", text: "hi" }] },
  content ? { role: "user", parts, content } : { role: "user", parts },
];

test("an oversized file sent as a parts url is refused", () => {
  const result = validateFileParts(turn([{ type: "file", url: oversized }]));
  assert.equal(result.valid, false);
  assert.match(result.error || "", /limit/);
});

test("an oversized file sent as a parts image is refused too", () => {
  // The route's own extractor reads `image` as readily as `url`.
  const result = validateFileParts(turn([{ type: "file", image: oversized }]));
  assert.equal(result.valid, false, "the size limit has to see this shape as well");
});

test("an oversized file sent in a content array is refused too", () => {
  const result = validateFileParts(
    turn([{ type: "text", text: "hi" }], [{ type: "image_url", image_url: { url: oversized } }]),
  );
  assert.equal(result.valid, false, "the standard array form is accepted, so it must be checked");
});

test("a small file passes in every shape", () => {
  assert.equal(validateFileParts(turn([{ type: "file", url: small }])).valid, true);
  assert.equal(validateFileParts(turn([{ type: "file", image: small }])).valid, true);
  assert.equal(
    validateFileParts(turn([], [{ type: "image_url", image_url: { url: small } }])).valid,
    true,
  );
});

test("too many files is refused however they are shaped", () => {
  const many = Array.from({ length: MAX_FILES + 1 }, () => ({ type: "file", url: small }));
  assert.equal(validateFileParts(turn(many)).valid, false);

  const manyImages = Array.from({ length: MAX_FILES + 1 }, () => ({ type: "file", image: small }));
  assert.equal(validateFileParts(turn(manyImages)).valid, false);

  const manyInContent = Array.from({ length: MAX_FILES + 1 }, () => ({
    type: "image_url",
    image_url: { url: small },
  }));
  assert.equal(validateFileParts(turn([], manyInContent)).valid, false);
});

test("a remote url carries nothing, so it is not weighed", () => {
  const result = validateFileParts(turn([{ type: "file", url: "https://example.com/a.png" }]));
  assert.equal(result.valid, true);
});

test("a turn with no files at all passes", () => {
  assert.equal(validateFileParts([{ role: "user", parts: [{ type: "text", text: "hi" }] }]).valid, true);
  assert.equal(validateFileParts([]).valid, true);
});

test("a malformed part does not throw", () => {
  assert.equal(validateFileParts(turn([null, "nonsense", { type: "file" }])).valid, true);
});
