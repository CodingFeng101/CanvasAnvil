import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error -- plain .mjs without type declarations
import { cadGate, CAD_MAX_FIX_ROUNDS } from "../skill/canvas-skill/mcp/native-editors.mjs";

/**
 * The CAD fix-round gate: each applied change reports what is left and whether the agent must keep fixing,
 * the way the website's revise loop keeps going by itself.
 */
type Gate = { status: string; round: number; remaining: number; errors: string[]; warnings: string[]; audit: string[]; next: string };
type Op = { id: string; action: string; status: string; payload?: { type: string; replace?: boolean }; gate?: Gate };
const scene = (errors: number, warnings: number, audit: number) => ({
  issues: [...Array(errors)].map((_, i) => ({ level: "error", msg: `e${i}` })).concat([...Array(warnings)].map((_, i) => ({ level: "warn", msg: `w${i}` }))),
  audit: { problems: [...Array(audit)].map((_, i) => `a${i}`) },
});

function apply(state: { scene: unknown; operations: Op[] }, type: string, next: unknown) {
  const command: Op = { id: `op-${state.operations.length + 1}`, action: "apply", status: "applied", payload: { type } };
  state.operations.push(command);
  state.scene = next;
  command.gate = cadGate(state, command) as Gate;
  return command.gate;
}

test("the gate asks for another round until clean, and stops when a round fixes nothing", () => {
  const state = { scene: null as unknown, operations: [] as Op[] };
  let gate = apply(state, "cad_layout", scene(2, 1, 3));
  assert.equal(gate.status, "fix");
  assert.equal(gate.round, 1);
  assert.equal(gate.remaining, 6);
  assert.deepEqual(gate.errors, ["e0", "e1"]);
  assert.match(gate.next, /Not done/);

  gate = apply(state, "cad_ops", scene(0, 1, 1));
  assert.equal(gate.status, "fix");
  assert.equal(gate.round, 2);

  gate = apply(state, "cad_ops", scene(0, 1, 1));
  assert.equal(gate.status, "stalled", "nothing fixed this round");
  assert.match(gate.next, /explain each remaining item/);

  gate = apply(state, "cad_ops", scene(0, 0, 0));
  assert.equal(gate.status, "clean");

  // A new layout starts the count again.
  gate = apply(state, "cad_layout", scene(1, 0, 0));
  assert.equal(gate.round, 1);
});

test("the gate stops at the round limit", () => {
  const state = { scene: null as unknown, operations: [] as Op[] };
  let gate = apply(state, "cad_layout", scene(0, 0, CAD_MAX_FIX_ROUNDS + 5));
  for (let left = CAD_MAX_FIX_ROUNDS + 4; gate.status === "fix"; left -= 1) gate = apply(state, "cad_ops", scene(0, 0, left));
  assert.equal(gate.status, "limit");
  assert.equal(gate.round, CAD_MAX_FIX_ROUNDS);
});
