import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePartialJson } from "../client/workspaces/cad/chat/cad-steps-text";

// The plan streams in as JSON; read at every length, its text only ever grows (no characters swallowed).
test("a half-written plan never loses text it already showed", () => {
  const full = JSON.stringify({
    plan: {
      summary: "现代原木风, 三室两厅，主卧带衣帽间 \"开放式\" 厨房",
      rooms: [{ name: "客厅, 餐厅", area: 24 }, { name: "主卧", area: 13 }],
    },
  });
  let previous = "";
  for (let length = 1; length <= full.length; length++) {
    const summary = String(parsePartialJson(full.slice(0, length))?.plan?.summary ?? "");
    assert.ok(summary.startsWith(previous), `shrank at ${length}: "${previous}" → "${summary}"`);
    previous = summary;
  }
  assert.equal(previous, "现代原木风, 三室两厅，主卧带衣帽间 \"开放式\" 厨房");
  assert.deepEqual(parsePartialJson(full), JSON.parse(full));
});
