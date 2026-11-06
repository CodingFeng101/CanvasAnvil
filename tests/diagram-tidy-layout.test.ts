import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readDiagramLayout, tidyDiagramXml } from "../client/workspaces/diagram/lib/tidy-layout";

/**
 * The layout pass between the model's XML and the canvas.
 *
 * The fixture is the architecture diagram from the tutorial recording, the
 * one whose edges all came out with a small Z in them: the model put every
 * box a few pixels to the side of the box it connects to.
 */

const ecommerce = readFileSync(new URL("./fixtures/diagram-ecommerce.drawio", import.meta.url), "utf8");

/**
 * A RAG flow as a model drew it for a user: a pipeline along an "offline"
 * lane, a second one along an "online" lane that snakes down in a staircase,
 * the two lanes overlapping by 50px and each lane's title floating in the
 * middle of it. No single direction fits, so this is the grid mode's case.
 */
const rag = readFileSync(new URL("./fixtures/diagram-rag.drawio", import.meta.url), "utf8");

const wrap = (cells: string) =>
  `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel></diagram></mxfile>`;

const box = (id: string, x: number, y: number, w = 120, h = 40, style = "rounded=1;whiteSpace=wrap;html=1;") =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;

const ORTHO = "edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=classic;";
const edge = (id: string, source: string, target: string, style = ORTHO) =>
  `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`;

function styleNumber(style: string, key: string, fallback: number): number {
  const m = style.match(new RegExp(`(?:^|;)${key}=([^;]*)`));
  return m ? Number(m[1]) : fallback;
}

/** How far apart the two ends of an edge are across its direction of travel. */
function edgeOffsets(xml: string) {
  const layout = readDiagramLayout(xml);
  return layout.edges.map((e) => {
    const s = layout.boxes.get(e.source)!;
    const t = layout.boxes.get(e.target)!;
    const vertical = Math.abs(s.y + s.h / 2 - (t.y + t.h / 2)) >= Math.abs(s.x + s.w / 2 - (t.x + t.w / 2));
    const offset = vertical
      ? s.x + styleNumber(e.style, "exitX", 0.5) * s.w - (t.x + styleNumber(e.style, "entryX", 0.5) * t.w)
      : s.y + styleNumber(e.style, "exitY", 0.5) * s.h - (t.y + styleNumber(e.style, "entryY", 0.5) * t.h);
    return { id: e.id, offset: Math.abs(offset), points: e.points };
  });
}

test("the recorded architecture diagram has a kink in every edge", () => {
  const kinked = edgeOffsets(ecommerce).filter((e) => e.offset >= 1);
  assert.equal(kinked.length, 14, "the problem the tidy pass exists for");
});

test("tidying the recorded diagram makes every edge straight", () => {
  const { xml, report } = tidyDiagramXml(ecommerce);
  assert.equal(report.applied, true);
  assert.equal(report.direction, "TB");
  for (const e of edgeOffsets(xml)) {
    assert.ok(e.offset < 0.5, `${e.id} is still offset by ${e.offset}px`);
    assert.equal(e.points, 0, `${e.id} needs no waypoints`);
  }
});

test("tidying puts every box on the 10px grid and every row on one line", () => {
  const { xml } = tidyDiagramXml(ecommerce);
  const before = readDiagramLayout(ecommerce);
  const after = readDiagramLayout(xml);
  for (const id of after.leaves) {
    const b = after.boxes.get(id)!;
    assert.equal(b.x % 10, 0, `${id} x=${b.x}`);
    assert.equal(b.y % 10, 0, `${id} y=${b.y}`);
  }
  const rows = [
    ["web", "app", "mini", "cdn", "gateway"],
    ["user_svc", "product_svc", "order_svc", "stock_svc", "payment_svc", "coupon_svc", "delivery_svc"],
    ["kafka", "redis", "es", "nacos"],
  ];
  for (const row of rows) {
    const centres = row.map((id) => after.boxes.get(id)!).map((b) => b.y + b.h / 2);
    assert.equal(new Set(centres).size, 1, `${row.join(", ")} share one centre line`);
    const widths = row.map((id) => after.boxes.get(id)!.w);
    assert.equal(new Set(widths).size, 1, `${row.join(", ")} share one width`);
  }
  // Every box stays inside the lane it started in.
  for (const [lane, members] of [["group_access", rows[0]], ["group_business", rows[1]], ["group_middleware", rows[2]]] as const) {
    const l = after.boxes.get(lane)!;
    for (const id of members) {
      const b = after.boxes.get(id)!;
      assert.ok(b.x >= l.x && b.x + b.w <= l.x + l.w && b.y >= l.y && b.y + b.h <= l.y + l.h, `${id} inside ${lane}`);
    }
  }
  // The drawing does not run away: it keeps its corner and grows modestly.
  const span = (layout: typeof after) => {
    const xs = [...layout.boxes.values()];
    return [Math.min(...xs.map((b) => b.x)), Math.max(...xs.map((b) => b.x + b.w))];
  };
  const [l0, r0] = span(before);
  const [l1, r1] = span(after);
  assert.ok(Math.abs(l1 - l0) <= 10, `left edge ${l0} -> ${l1}`);
  assert.ok(r1 - l1 <= (r0 - l0) * 1.15, `width ${r0 - l0} -> ${r1 - l1}`);
});

test("tidying is stable: a tidied diagram tidies to itself", () => {
  const once = tidyDiagramXml(ecommerce).xml;
  assert.equal(tidyDiagramXml(once).xml, once);
});

test("cells the pass does not move are left exactly as written", () => {
  const { xml } = tidyDiagramXml(ecommerce);
  const cell = (source: string, id: string) =>
    source.match(new RegExp(`<mxCell id="${id}"[^>]*>[\\s\\S]*?</mxCell>`))?.[0];
  assert.ok(xml.startsWith('<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>'));
  assert.ok(xml.endsWith("</root></mxGraphModel></diagram></mxfile>"));
  // The page title is a single box in a row of its own; tidying may nudge
  // it onto the grid but never rewrites its text or style.
  assert.match(cell(xml, "title")!, /value="电商平台微服务架构" style="text;html=1;align=center;/);
  // Labels and styles of moved boxes survive.
  assert.match(cell(xml, "web")!, /value="Web"/);
  assert.match(cell(xml, "web")!, /strokeColor=#79AFCF/);
});

test("a mind map with curved edges is not touched", () => {
  const curved = "curved=1;endArrow=none;html=1;";
  const xml = wrap(
    box("root", 300, 200) +
      box("a", 520, 80) +
      box("b", 523, 190) +
      box("c", 517, 310) +
      box("d", 60, 140) +
      edge("e1", "root", "a", curved) +
      edge("e2", "root", "b", curved) +
      edge("e3", "root", "c", curved) +
      edge("e4", "root", "d", curved),
  );
  const result = tidyDiagramXml(xml);
  assert.equal(result.report.applied, false);
  assert.equal(result.xml, xml);
});

test("a scatter with no rows or columns is not touched", () => {
  const xml = wrap(
    box("a", 0, 0) + box("b", 200, 130) + box("c", 430, 290) + box("d", 90, 420) +
      edge("e1", "a", "b") + edge("e2", "b", "c") + edge("e3", "c", "d") + edge("e4", "d", "a"),
  );
  const result = tidyDiagramXml(xml);
  assert.equal(result.report.applied, false);
  assert.equal(result.xml, xml);
});

test("a top-down flowchart drawn a few pixels off lines up in one column", () => {
  const xml = wrap(
    box("start", 200, 20) +
      box("step1", 206, 110) +
      box("step2", 193, 200) +
      box("end", 211, 290) +
      edge("e1", "start", "step1") +
      edge("e2", "step1", "step2") +
      edge("e3", "step2", "end"),
  );
  const { xml: out, report } = tidyDiagramXml(xml);
  assert.equal(report.applied, true);
  const layout = readDiagramLayout(out);
  const centres = ["start", "step1", "step2", "end"].map((id) => {
    const b = layout.boxes.get(id)!;
    return b.x + b.w / 2;
  });
  assert.equal(new Set(centres).size, 1, `centres ${centres.join(", ")}`);
  for (const e of edgeOffsets(out)) assert.ok(e.offset < 0.5, e.id);
});

test("a left-to-right pipeline lines up on one horizontal", () => {
  const xml = wrap(
    box("a", 20, 100) +
      box("b", 200, 106) +
      box("c", 380, 95) +
      box("d", 560, 103) +
      box("a2", 20, 220) +
      box("c2", 380, 228) +
      edge("e1", "a", "b") +
      edge("e2", "b", "c") +
      edge("e3", "c", "d") +
      edge("e4", "a2", "c2"),
  );
  const { xml: out, report } = tidyDiagramXml(xml);
  assert.equal(report.applied, true);
  assert.equal(report.direction, "grid");
  const layout = readDiagramLayout(out);
  const middles = ["a", "b", "c", "d"].map((id) => {
    const b = layout.boxes.get(id)!;
    return b.y + b.h / 2;
  });
  assert.equal(new Set(middles).size, 1, `middles ${middles.join(", ")}`);
  for (const e of edgeOffsets(out)) assert.ok(e.offset < 0.5, e.id);
});

test("an edit tidies only the row it touched", () => {
  const tidied = tidyDiagramXml(ecommerce).xml;
  // The model adds a search service to the business lane, drawn off the line
  // and half on top of the last box.
  const added =
    '<mxCell id="search_svc" value="搜索服务" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="775" y="226" width="90" height="38" as="geometry"/></mxCell>';
  const edited = tidied.replace("</root>", `${added}</root>`);
  const { xml, report } = tidyDiagramXml(edited, { only: ["search_svc"] });
  assert.equal(report.applied, true);
  const before = readDiagramLayout(tidied);
  const after = readDiagramLayout(xml);
  const search = after.boxes.get("search_svc")!;
  const user = after.boxes.get("user_svc")!;
  assert.equal(search.y + search.h / 2, user.y + user.h / 2, "the new box joins the row's line");
  const delivery = after.boxes.get("delivery_svc")!;
  assert.ok(search.x >= delivery.x + delivery.w, "and no longer sits on its neighbour");
  const lane = after.boxes.get("group_business")!;
  assert.ok(search.x + search.w <= lane.x + lane.w, "the lane grew to hold it");
  for (const id of ["web", "kafka", "mysql", "grafana", "title"]) {
    assert.deepEqual(after.boxes.get(id), before.boxes.get(id), `${id} did not move`);
  }
});

test("an edit that touches no box changes nothing", () => {
  const tidied = tidyDiagramXml(ecommerce).xml;
  const result = tidyDiagramXml(tidied, { only: ["e3"] });
  assert.equal(result.xml, tidied);
});

test("attribute values containing '>' do not confuse the scanner", () => {
  const xml = wrap(
    `<mxCell id="a" value="a -&gt; b > c" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="203" y="20" width="120" height="40" as="geometry"/></mxCell>` +
      box("b", 197, 120) +
      box("c", 205, 220) +
      edge("e1", "a", "b") +
      edge("e2", "b", "c"),
  );
  const { xml: out, report } = tidyDiagramXml(xml);
  assert.equal(report.applied, true);
  assert.match(out, /value="a -&gt; b > c"/);
});

test("broken input comes back unchanged instead of throwing", () => {
  for (const input of ["", "not xml", "<mxCell id=", wrap(box("a", 0, 0))]) {
    const result = tidyDiagramXml(input);
    assert.equal(result.xml, input);
    assert.equal(result.report.applied, false);
  }
});

// ---------------------------------------------------------------------------
// Grid mode
// ---------------------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };

/** The line each edge is drawn along: exit point, waypoints, entry point. */
function edgePaths(xml: string) {
  const layout = readDiagramLayout(xml);
  return layout.edges.map((e) => {
    const s = layout.boxes.get(e.source)!;
    const t = layout.boxes.get(e.target)!;
    const cell = xml.match(new RegExp(`<mxCell id="${e.id}"[^>]*>[\\s\\S]*?</mxCell>`))![0];
    const points = [...cell.matchAll(/<mxPoint x="([^"]+)" y="([^"]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const start = [s.x + styleNumber(e.style, "exitX", 0.5) * s.w, s.y + styleNumber(e.style, "exitY", 0.5) * s.h];
    const end = [t.x + styleNumber(e.style, "entryX", 0.5) * t.w, t.y + styleNumber(e.style, "entryY", 0.5) * t.h];
    return { id: e.id, source: e.source, target: e.target, path: [start, ...points, end], bends: points.length };
  });
}

const inside = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

test("a flow that snakes through two lanes is laid out as a grid", () => {
  const { xml, report } = tidyDiagramXml(rag);
  assert.equal(report.applied, true);
  assert.equal(report.direction, "grid");
  const after = readDiagramLayout(xml);
  const box = (id: string) => after.boxes.get(id)!;

  const columns = [["doc", "q"], ["parse", "qv"], ["chunk", "search", "prompt"], ["embed", "rerank", "llm"], ["vdb", "ans"]];
  for (const col of columns) {
    const centres = col.map((id) => box(id).x + box(id).w / 2);
    assert.equal(new Set(centres).size, 1, `${col.join(", ")} share one column: ${centres.join(", ")}`);
  }
  const rows = [["doc", "parse", "chunk", "embed", "vdb"], ["q", "qv", "search"], ["llm", "ans"]];
  for (const row of rows) {
    const middles = row.map((id) => box(id).y + box(id).h / 2);
    assert.equal(new Set(middles).size, 1, `${row.join(", ")} share one row`);
  }
  // The staircase keeps its steps, each a full row below the last.
  for (const [upper, lower] of [["search", "rerank"], ["rerank", "prompt"], ["prompt", "llm"]]) {
    assert.ok(box(lower).y >= box(upper).y + box(upper).h + 20, `${lower} sits below ${upper}`);
  }
});

test("lanes stop overlapping, hold their boxes and carry their title on top", () => {
  const { xml } = tidyDiagramXml(rag);
  const after = readDiagramLayout(xml);
  const box = (id: string) => after.boxes.get(id)!;
  const off = box("lane_off");
  const on = box("lane_on");
  assert.ok(off.y + off.h <= on.y, `offline lane ends at ${off.y + off.h}, online starts at ${on.y}`);
  assert.equal(off.x, on.x, "stacked lanes stay flush");
  assert.equal(off.w, on.w);
  const lanes = [
    ["lane_off", "lane_off_label", ["doc", "parse", "chunk", "embed", "vdb"]],
    ["lane_on", "lane_on_label", ["q", "qv", "search", "rerank", "prompt", "llm", "ans"]],
  ] as const;
  for (const [lane, label, members] of lanes) {
    const l = box(lane);
    const title = box(label);
    assert.ok(inside(l, title), `${label} inside ${lane}`);
    const top = Math.min(...members.map((id) => box(id).y));
    assert.ok(title.y + title.h <= top, `${label} above the boxes of ${lane}`);
    assert.ok(Math.abs(title.x + title.w / 2 - (l.x + l.w / 2)) < 1, `${label} stays centred`);
    for (const id of members) assert.ok(inside(l, box(id)), `${id} inside ${lane}`);
  }
  // The page title stays above the drawing, centred over it.
  const title = box("title");
  assert.ok(title.y + title.h <= off.y);
  assert.ok(Math.abs(title.x + title.w / 2 - (off.x + off.w / 2)) < 1);
});

test("grid edges are straight or turn once, and run through no box", () => {
  const { xml } = tidyDiagramXml(rag);
  const after = readDiagramLayout(xml);
  const leaves = after.leaves.map((id) => [id, after.boxes.get(id)!] as const);
  const paths = edgePaths(xml);
  assert.equal(paths.filter((p) => p.bends === 0).length, 7, "every edge along a row is straight");
  for (const p of paths) {
    assert.ok(p.bends <= 1, `${p.id} has ${p.bends} bends`);
    for (let i = 1; i < p.path.length; i++) {
      const [x1, y1] = p.path[i - 1];
      const [x2, y2] = p.path[i];
      assert.ok(Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5, `${p.id} segment ${i} is not orthogonal`);
      for (const [id, b] of leaves) {
        if (id === p.source || id === p.target) continue;
        const hits =
          Math.max(x1, x2) > b.x + 1 &&
          Math.min(x1, x2) < b.x + b.w - 1 &&
          Math.max(y1, y2) > b.y + 1 &&
          Math.min(y1, y2) < b.y + b.h - 1;
        assert.ok(!hits, `${p.id} runs through ${id}`);
      }
    }
  }
  // No box has an arrow coming in on the side another line leaves from.
  const sideOf = (id: string, [x, y]: number[]) => {
    const b = after.boxes.get(id)!;
    if (Math.abs(x - b.x) < 0.5) return "L";
    if (Math.abs(x - b.x - b.w) < 0.5) return "R";
    return Math.abs(y - b.y) < 0.5 ? "T" : "B";
  };
  const exits = new Set(paths.map((p) => `${p.source}:${sideOf(p.source, p.path[0])}`));
  for (const p of paths) {
    const entry = `${p.target}:${sideOf(p.target, p.path[p.path.length - 1])}`;
    assert.ok(!exits.has(entry), `${p.id} enters ${entry}, where another edge leaves`);
  }
});

test("a tidied grid tidies to itself", () => {
  const once = tidyDiagramXml(rag).xml;
  assert.equal(tidyDiagramXml(once).xml, once);
});

test("an edit to a grid lines the new box up with its column and row", () => {
  const tidied = tidyDiagramXml(rag).xml;
  const before = readDiagramLayout(tidied);
  // A cache beside the retrieval step, in the empty cell under 向量化.
  const added =
    '<mxCell id="cache" value="缓存" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="713" y="352" width="150" height="90" as="geometry"/></mxCell>' +
    `<mxCell id="e12" style="${ORTHO}" edge="1" parent="1" source="search" target="cache"><mxGeometry relative="1" as="geometry"/></mxCell>`;
  const edited = tidied.replace("</root>", `${added}</root>`);
  const { xml, report } = tidyDiagramXml(edited, { only: ["cache", "e12"] });
  assert.equal(report.applied, true);
  assert.equal(report.direction, "grid");
  const after = readDiagramLayout(xml);
  const cache = after.boxes.get("cache")!;
  const embed = after.boxes.get("embed")!;
  const search = after.boxes.get("search")!;
  assert.equal(cache.x + cache.w / 2, embed.x + embed.w / 2, "joins the column");
  assert.equal(cache.y + cache.h / 2, search.y + search.h / 2, "joins the row");
  assert.deepEqual([cache.w, cache.h], [embed.w, search.h], "takes the size its column and row use");
  for (const id of before.boxes.keys()) {
    assert.deepEqual(after.boxes.get(id), before.boxes.get(id), `${id} did not move`);
  }
  const e12 = edgePaths(xml).find((p) => p.id === "e12")!;
  assert.equal(e12.bends, 0, "the new edge runs straight along the row");
});
