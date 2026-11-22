import assert from "node:assert/strict";
import { test } from "node:test";
import { planFromCadText, previewFromCadText } from "../client/workspaces/cad/lib/stream-plan";

test("a streaming floor plan becomes a plan wall by wall, sharing corners, with named rooms", () => {
  const partial = '{"type":"cad_spec","spec":{"walls":[{"a":[0,0],"b":[5000,0],"t":240},{"a":[5000,0],"b":[5000,40';
  const first = planFromCadText(partial);
  assert.equal(first?.walls.length, 1, "the half-written wall waits");
  assert.equal(first?.walls[0].t, 240);

  const full = '{"walls":[{"a":[0,0],"b":[5000,0],"t":240},{"a":[5000,0],"b":[5000,4000]}],"rooms":[{"at":[2500,2000],"name":"客厅"}],"furniture":[{"key":"sofa","at":[1,1],"name":"x"}]}';
  const plan = planFromCadText(full);
  assert.ok(plan);
  assert.equal(plan.walls.length, 2);
  assert.equal(plan.nodes.length, 3, "the shared corner is one node");
  assert.equal(plan.walls[0].b, plan.walls[1].a);
  assert.equal(plan.walls[1].t, 120, "a wall without a thickness gets the default");
  assert.deepEqual(plan.rooms.map((room) => room.name), ["客厅"], "furniture is not a room");
  assert.deepEqual([plan.openings, plan.furniture], [[], []]);

  // No walls (a plan in words, a list of operations): nothing to show.
  assert.equal(planFromCadText('{"rooms":[{"at":[1,1],"name":"a"}]}'), null);
});

test("a streaming cad_layout becomes a step per room, each with its outline and the plan so far", () => {
  const head = '{"type":"cad_layout","layout":{"cols":[4000,3000],"rows":[3000,3000],"rooms":[';
  const living = '{"name":"客厅","cells":"A1:A2"}';
  const bed = '{"name":"主卧","cells":"B1"}';
  // The second room's cells are not closed yet: it waits.
  const partial = previewFromCadText(`${head}${living},{"name":"主卧","cells":"B`);
  assert.equal(partial?.steps.length, 1);
  assert.deepEqual(partial?.steps[0].outline, [[0, 0], [4000, 0], [4000, 6000], [0, 6000], [0, 0]]);
  assert.ok(partial!.steps[0].plan.walls.length >= 4, "the living room is closed by walls");

  const two = previewFromCadText(`${head}${living},${bed}`);
  assert.equal(two?.steps.length, 2);
  assert.deepEqual(two?.steps[1].outline, [[4000, 0], [7000, 0], [7000, 3000], [4000, 3000], [4000, 0]]);
  assert.deepEqual(two?.full.rooms.map((room) => room.name), ["客厅", "主卧"]);
  // Not a layout and no walls: nothing to draw.
  assert.equal(previewFromCadText('{"type":"cad_plan","plan":{"rooms":[]}}'), null);
});

test("a streaming HouseSpec becomes a step per wall, drawn end to end", () => {
  const preview = previewFromCadText('{"walls":[{"a":[0,0],"b":[5000,0],"t":240},{"a":[5000,0],"b":[5000,4000]}]');
  assert.equal(preview?.steps.length, 2);
  assert.deepEqual(preview?.steps[1].outline, [[5000, 0], [5000, 4000]]);
  assert.equal(preview?.steps[0].plan.walls.length, 1);
});
