import assert from "node:assert/strict";
import { test } from "node:test";
import {
  materialToken,
  referencedMaterials,
} from "../client/workspaces/ppt/canvas/lib/material-tokens";

/**
 * Which of a slide's attached pictures are actually sent to the image model.
 *
 * Attached is not the same as referenced. The prompt names every reference
 * image it is given and tells the model where to put it, so a picture the
 * user uploaded and never mentioned is one the prompt cannot account for.
 */

const mat = (name: string) => ({ name, dataUrl: `${name}.png` });

test("only the pictures the description mentions come through", () => {
  const picked = referencedMaterials(
    `左侧放 ${materialToken("第1张")}，右侧留白。`,
    [mat("第1张"), mat("第2张")],
  );
  assert.deepEqual(picked.map((m) => m.name), ["第1张"]);
});

test("an upload nobody referenced is not sent", () => {
  assert.deepEqual(referencedMaterials("一张普通的示意图，没有引用任何素材。", [mat("第1张")]), []);
});

test("references are ordered by where the description mentions them", () => {
  // If a cap ever bites, what survives should be what the description leads
  // with, not whatever order the files happened to be uploaded in.
  const description = `先看 ${materialToken("第3张")}，再看 ${materialToken("第1张")}。`;
  const picked = referencedMaterials(description, [mat("第1张"), mat("第2张"), mat("第3张")]);
  assert.deepEqual(picked.map((m) => m.name), ["第3张", "第1张"]);
});

test("a description that mentions everything keeps everything", () => {
  const description = `${materialToken("第1张")} ${materialToken("第2张")}`;
  const picked = referencedMaterials(description, [mat("第1张"), mat("第2张")]);
  assert.equal(picked.length, 2);
});

test("an empty description references nothing", () => {
  assert.deepEqual(referencedMaterials("", [mat("第1张")]), []);
  assert.deepEqual(referencedMaterials(undefined as unknown as string, [mat("第1张")]), []);
});

test("a name that only appears as bare text is not a reference", () => {
  // The token is the reference; the words around it are just prose.
  assert.deepEqual(referencedMaterials("把第1张放在左边", [mat("第1张")]), []);
});

test("no attachments means nothing to send", () => {
  assert.deepEqual(referencedMaterials(`看 ${materialToken("第1张")}`, []), []);
});
