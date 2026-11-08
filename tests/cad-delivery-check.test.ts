import test from "node:test";
import assert from "node:assert/strict";
import { deliveryMessage, shotUrl } from "../client/workspaces/cad/lib/design/delivery-check";

test("delivery check message: qa result, open gates, recognition lists and screenshots", () => {
  const message = deliveryMessage(
    {
      jobId: "20261108-abc",
      state: "done",
      seconds: 210,
      total: 40,
      failed: [{ name: "导出 DXF", msg: "没有下载", shot: "012_导出(DXF).png" }],
      shots: ["001_打开.png", "012_导出(DXF).png", "020_鸟瞰.png"],
      files: { ok: true, summary: "" },
      report: "runs/cad-qa/20261108-abc/qa/report.md",
    },
    { errors: [], warnings: ["卫生间门开向不明"], audit: ["厨房：缺少插座"], recognition: "**待确认**\n- 窗台高（估算）" },
  );
  assert.match(message, /交付检查：还有问题/);
  assert.match(message, /39 \/ 40 通过/);
  assert.match(message, /导出 DXF：没有下载/);
  assert.match(message, /0 个错误、1 个警告；水电审计：1 个问题/);
  assert.match(message, /- 厨房：缺少插座/);
  assert.match(message, /\*\*待确认\*\*/);
  // The failed step's screenshot comes first, its parentheses encoded so the markdown image holds.
  const first = message.indexOf("![");
  assert.ok(message.slice(first).startsWith("![012_导出(DXF)](/api/cad/qa/shot?jobId=20261108-abc&name="));
  assert.ok(!shotUrl("x", "a(b).png").includes("("));
  assert.match(message, /runs\/cad-qa\/20261108-abc\/qa\/report\.md/);
});

test("delivery check message: all clear, and a run that broke", () => {
  const clear = deliveryMessage({ jobId: "j", state: "done", total: 3, failed: [], shots: [], files: { ok: true } }, { errors: [], warnings: [], audit: [] });
  assert.match(clear, /交付检查：通过/);
  const broken = deliveryMessage({ jobId: "j", state: "failed", error: "qa.mjs exited 1 without a report" }, { errors: [], warnings: [], audit: [] }, false);
  assert.match(broken, /did not finish/);
  assert.match(broken, /without a report/);
});

test("delivery check message: a run without results never reads as passed", () => {
  const empty = deliveryMessage({ jobId: "j", state: "done", total: 0, failed: [], shots: [] }, { errors: [], warnings: [], audit: [] });
  assert.match(empty, /交付检查：还有问题/);
});
