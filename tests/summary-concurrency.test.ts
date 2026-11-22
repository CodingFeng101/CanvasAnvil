import assert from "node:assert/strict";
import { test } from "node:test";
import { SUMMARY_CONCURRENCY, summaryConcurrency } from "../server/chat/files";

test("the request's file concurrency is kept between 1 and the ceiling", () => {
  assert.equal(summaryConcurrency(10), 10);
  assert.equal(summaryConcurrency(500), SUMMARY_CONCURRENCY);
  assert.equal(summaryConcurrency(undefined), SUMMARY_CONCURRENCY, "no setting sent: as before");
  assert.equal(summaryConcurrency("abc"), SUMMARY_CONCURRENCY);
  assert.equal(summaryConcurrency(0), SUMMARY_CONCURRENCY);
});
