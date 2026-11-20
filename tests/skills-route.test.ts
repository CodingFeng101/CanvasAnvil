import test from "node:test";
import assert from "node:assert/strict";
import { isLocalRequest, shouldSkip } from "../server/routes/skills";

test("skill zips and installs leave out dependencies and the user's provider keys", () => {
  assert.equal(shouldSkip("node_modules/x/index.js"), true);
  assert.equal(shouldSkip("scripts/__pycache__/a.pyc"), true);
  assert.equal(shouldSkip("config/image-provider.json"), true);
  assert.equal(shouldSkip("config/file-parser.json"), true);
  assert.equal(shouldSkip("config/image-provider.example.json"), false);
  assert.equal(shouldSkip("SKILL.md"), false);
});

test("one-click install only from this computer", () => {
  assert.equal(isLocalRequest(new Request("http://localhost:8002/api/skills/install")), true);
  assert.equal(isLocalRequest(new Request("http://127.0.0.1:3000/api/skills/install")), true);
  assert.equal(isLocalRequest(new Request("https://canvas.example.com/api/skills/install")), false);
});
