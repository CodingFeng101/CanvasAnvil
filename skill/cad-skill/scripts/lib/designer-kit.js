// Copied from CanvasAnvil by scripts/sync-cad-skill.mjs; edit the source there, not this file. Source: client/workspaces/cad/lib/design/ (bundled)
var CadKit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // client/workspaces/cad/lib/design/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    applyElecPrefs: () => applyElecPrefs,
    applyOps: () => applyOps,
    elecPrefsFromDecisions: () => elecPrefsFromDecisions,
    nudgeFurniture: () => nudgeFurniture,
    summarizePlan: () => summarizePlan
  });

  // client/workspaces/cad/lib/design/auto-nudge.ts
  var STEPS = [25, 50, 100, 150, 200, 300, 400];
  var DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var MAX_PASSES = 8;
  var score = (issues) => ({
    errors: issues.filter((issue) => issue.level === "error").length,
    warnings: issues.filter((issue) => issue.level === "warn").length
  });
  var better = (a, b) => a.errors < b.errors && a.warnings <= b.warnings;
  function nudgeFurniture(start, issuesOf) {
    let plan = structuredClone(start);
    let issues = issuesOf(plan);
    let current = score(issues);
    let moved = 0;
    for (let pass = 0; pass < MAX_PASSES && current.errors > 0; pass++) {
      const ids = [...new Set(issues.filter((issue) => issue.level === "error").flatMap((issue) => (issue.targets ?? []).filter((target) => target.kind === "furn").map((target) => target.id)))];
      const byId = new Map(plan.furniture.map((item) => [item.id, item]));
      ids.sort((a, b) => Number(byId.get(a)?.key === "curtain") - Number(byId.get(b)?.key === "curtain"));
      let improved = false;
      for (const id of ids) {
        const index = plan.furniture.findIndex((item) => item.id === id);
        if (index < 0) continue;
        let best;
        for (const step of STEPS) {
          for (const [dx, dy] of DIRECTIONS) {
            const candidate = structuredClone(plan);
            const item = candidate.furniture[index];
            item.x += dx * step;
            item.y += dy * step;
            const nextIssues = issuesOf(candidate);
            const next = score(nextIssues);
            if (better(next, best?.score ?? current)) best = { plan: candidate, score: next, issues: nextIssues };
          }
          if (best) break;
        }
        if (best) {
          plan = best.plan;
          issues = best.issues;
          current = best.score;
          moved++;
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
    return { plan, moved };
  }

  // client/workspaces/cad/lib/design/elec-prefs.ts
  function elecPrefsFromDecisions(decisions) {
    const prefs = {};
    if (!Array.isArray(decisions)) return prefs;
    for (const item of decisions) {
      const topic = String(item?.topic ?? ""), choice = [item?.choice].flat().map(String).join("\u3001");
      if (!topic || !choice || /^(不|无|标准|默认)/.test(choice) && !/网|电箱/.test(topic)) continue;
      if (/地插/.test(topic)) prefs.floorSocket = !/不/.test(choice);
      else if (/床头/.test(topic)) prefs.bedsideUsb = /USB|usb|Type/i.test(choice);
      else if (/厨房/.test(topic) && /插座/.test(topic)) prefs.kitchenSockets = /多|加/.test(choice) ? 3 : 0;
      else if (/插座/.test(topic)) prefs.moreSockets = /加密|多留|多/.test(choice);
      else if (/网/.test(topic)) prefs.net = /每个房间|全部|所有/.test(choice) ? "all" : /卧/.test(choice) ? "bedrooms" : "living";
      else if (/电箱/.test(topic)) prefs.boxes = /玄关|入户|门口/.test(choice) ? "entry" : /电视/.test(choice) ? "tv" : /过道|走廊|储物/.test(choice) ? "hall" : void 0;
    }
    return prefs;
  }
  var HEIGHT = { socket: 300, socketUSB: 700, net: 300, weak: 300, panel: 1800, socketFloor: 0 };
  var INWARD = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] };
  var rotOf = (side) => Math.round(Math.atan2(-INWARD[side][0], INWARD[side][1]) * 180 / Math.PI);
  var TALL = /^(wardrobe|cabinet|bookshelf|shoeCabinet|sideboard|tallOven|fridge|acFloor|cabWall)/;
  var LIVING = /客|厅|起居/;
  var BEDROOM = /卧|书房|儿童|客房/;
  var WET = /卫|浴|厨|阳台|洗衣/;
  function applyElecPrefs(plan, rooms, prefs) {
    const next = JSON.parse(JSON.stringify(plan));
    const elec = next.elec ?? (next.elec = []);
    const notes = [];
    let changed = 0;
    const nodes = new Map(next.nodes.map((node) => [node.id, node]));
    const furniture = next.furniture;
    const footprint = (item) => {
      const turned = Math.abs(Math.round((item.rot ?? 0) / 90)) % 2 === 1;
      const w = Number(item.w ?? 600), d = Number(item.d ?? 600);
      return { hw: (turned ? d : w) / 2, hd: (turned ? w : d) / 2 };
    };
    const roomOf = (x, y) => rooms.find((room) => room.rects?.some((r) => x >= r.x - 1 && x <= r.x + r.w + 1 && y >= r.y - 1 && y <= r.y + r.h + 1));
    const openingsOn = (rect, side) => {
      const horizontal = side === "N" || side === "S";
      const face = side === "N" ? rect.y : side === "S" ? rect.y + rect.h : side === "W" ? rect.x : rect.x + rect.w;
      const spans = [];
      for (const wall of next.walls) {
        const a = nodes.get(wall.a), b = nodes.get(wall.b);
        if (!a || !b) continue;
        const line = horizontal ? a.y : a.x;
        if ((horizontal ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x)) > 1 || Math.abs(Math.abs(line - face) - wall.t / 2) > 80) continue;
        const length = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
        for (const opening of next.openings.filter((item) => item.wall === wall.id)) {
          const cx = a.x + ux * opening.pos, cy = a.y + uy * opening.pos, at = horizontal ? cx : cy;
          spans.push([at - opening.width / 2 - 150, at + opening.width / 2 + 150]);
        }
      }
      return spans;
    };
    const pointOn = (rect, side, along) => {
      const inset = 60;
      return side === "N" ? [along, rect.y + inset] : side === "S" ? [along, rect.y + rect.h - inset] : side === "W" ? [rect.x + inset, along] : [rect.x + rect.w - inset, along];
    };
    const blocked = (x, y, h) => furniture.some((item) => {
      if (!TALL.test(String(item.type ?? item.key)) || h > 2e3) return false;
      const { hw, hd } = footprint(item);
      return Math.abs(x - item.x) < hw + 80 && Math.abs(y - item.y) < hd + 80;
    });
    const spotOn = (rect, side, kind, prefer) => {
      const horizontal = side === "N" || side === "S";
      const [start, end] = horizontal ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
      if (end - start < 700) return null;
      const target = prefer ?? (start + end) / 2;
      const spans = openingsOn(rect, side);
      const candidates = [];
      for (let at = start + 300; at <= end - 300; at += 50) candidates.push(at);
      candidates.sort((p, q) => Math.abs(p - target) - Math.abs(q - target));
      for (const at of candidates) {
        if (spans.some(([lo, hi]) => at > lo && at < hi)) continue;
        const [x, y] = pointOn(rect, side, at);
        if (blocked(x, y, HEIGHT[kind] ?? 300)) continue;
        const boxes = /^(panel|weak)$/;
        if (elec.some((item) => (item.kind === kind || boxes.test(kind) && boxes.test(item.kind)) && Math.hypot(item.x - x, item.y - y) < (boxes.test(kind) ? 500 : 400))) continue;
        return [x, y];
      }
      return null;
    };
    const add = (kind, x, y, rot, h = HEIGHT[kind] ?? 300) => {
      elec.push({ id: `pref-${kind}-${Math.random().toString(36).slice(2, 9)}`, kind, x: Math.round(x), y: Math.round(y), rot, h });
      changed++;
    };
    const sides = ["N", "S", "W", "E"];
    const nearSide = (rect, side, x, y) => side === "N" ? Math.abs(y - rect.y) < 300 && x >= rect.x && x <= rect.x + rect.w : side === "S" ? Math.abs(y - rect.y - rect.h) < 300 && x >= rect.x && x <= rect.x + rect.w : side === "W" ? Math.abs(x - rect.x) < 300 && y >= rect.y && y <= rect.y + rect.h : Math.abs(x - rect.x - rect.w) < 300 && y >= rect.y && y <= rect.y + rect.h;
    const mainRect = (room) => [...room.rects ?? []].sort((p, q) => q.w * q.h - p.w * p.h)[0];
    if (prefs.moreSockets) {
      let added = 0;
      for (const room of rooms.filter((item) => (LIVING.test(item.name) || BEDROOM.test(item.name)) && !WET.test(item.name))) {
        for (const rect of room.rects ?? []) for (const side of sides) {
          const length = side === "N" || side === "S" ? rect.w : rect.h;
          if (length < 1500) continue;
          if (elec.some((item) => /^socket/.test(item.kind) && item.kind !== "socketAC" && nearSide(rect, side, item.x, item.y))) continue;
          const spot = spotOn(rect, side, "socket");
          if (spot) {
            add("socket", spot[0], spot[1], rotOf(side));
            added++;
          }
        }
      }
      if (added) notes.push(`\u63D2\u5EA7\u52A0\u5BC6\uFF1A\u591A\u7559\u4E86 ${added} \u4E2A\u63D2\u5EA7`);
    }
    if (prefs.net) {
      const wanted = rooms.filter((room) => !WET.test(room.name) && (LIVING.test(room.name) || prefs.net !== "living" && BEDROOM.test(room.name) || prefs.net === "all" && !/玄关|过道|走廊|储物/.test(room.name)));
      let added = 0;
      for (const room of wanted) {
        const rect = mainRect(room);
        if (!rect || elec.some((item) => item.kind === "net" && roomOf(item.x, item.y) === room)) continue;
        const socket = elec.find((item) => /^socket(USB)?$/.test(item.kind) && roomOf(item.x, item.y) === room);
        let side = socket ? sides.find((item) => nearSide(rect, item, socket.x, socket.y)) : void 0;
        let point = side && socket ? spotOn(rect, side, "net", (side === "N" || side === "S" ? socket.x : socket.y) + 150) : null;
        if (!point) for (const item of sides) {
          point = spotOn(rect, item, "net");
          if (point) {
            side = item;
            break;
          }
        }
        if (point && side) {
          add("net", point[0], point[1], rotOf(side));
          added++;
        }
      }
      if (added) notes.push(`\u7F51\u53E3\uFF1A\u8865\u4E86 ${added} \u4E2A\u623F\u95F4\u7684\u7F51\u7EDC\u63D2\u5EA7`);
    }
    if (prefs.boxes) {
      const wallsOf = (room, near) => (room.rects ?? []).flatMap((rect) => sides.map((side) => ({ rect, side }))).sort((p, q) => near ? distanceTo(p.rect, p.side, near.x, near.y) - distanceTo(q.rect, q.side, near.x, near.y) : 0).map(({ rect, side }) => ({ rect, side, prefer: near ? side === "N" || side === "S" ? near.x : near.y : void 0 }));
      let candidates = [], place = "";
      if (prefs.boxes === "tv") {
        const tv = furniture.find((item) => /^(tvCabinet|wallTV)/.test(item.key));
        const room = tv && roomOf(tv.x, tv.y);
        if (tv && room) {
          const { hw } = footprint(tv);
          candidates = wallsOf(room, tv).map((spot, index) => index === 0 && spot.prefer !== void 0 ? { ...spot, prefer: spot.prefer + hw + 300 } : spot);
          place = "\u7535\u89C6\u5899\u65C1";
        }
      } else {
        const door = entryDoor();
        const room = prefs.boxes === "entry" ? rooms.find((item) => /玄关|门厅/.test(item.name)) ?? door?.room : rooms.find((item) => /储物|过道|走廊/.test(item.name));
        if (room) {
          candidates = wallsOf(room, prefs.boxes === "entry" && door ? door : void 0).map((spot) => door && spot.prefer !== void 0 ? { ...spot, prefer: spot.prefer + door.width / 2 + 400 } : spot);
          place = prefs.boxes === "entry" && door ? `${room.name}\u5165\u6237\u95E8\u9644\u8FD1` : room.name;
        }
      }
      let moved = 0;
      for (const kind of ["panel", "weak"]) {
        for (const candidate of candidates) {
          const spot = spotOn(candidate.rect, candidate.side, kind, candidate.prefer === void 0 ? void 0 : candidate.prefer + (kind === "weak" ? 500 : 0));
          if (!spot) continue;
          const existing = elec.find((item) => item.kind === kind);
          if (existing) {
            Object.assign(existing, { x: Math.round(spot[0]), y: Math.round(spot[1]), rot: rotOf(candidate.side), h: HEIGHT[kind] });
            changed++;
          } else add(kind, spot[0], spot[1], rotOf(candidate.side));
          moved++;
          break;
        }
      }
      notes.push(moved ? `\u5F3A\u5F31\u7535\u7BB1\uFF1A\u653E\u5728${place}` : "\u5F3A\u5F31\u7535\u7BB1\uFF1A\u6CA1\u627E\u5230\u5408\u9002\u7684\u5899\uFF0C\u4FDD\u7559\u8BBE\u8BA1\u5668\u7684\u4F4D\u7F6E");
    }
    if (prefs.kitchenSockets) {
      const counter = furniture.find((item) => /^(counter|lCounter|uCounter)$/.test(item.key));
      const room = counter && roomOf(counter.x, counter.y), rect = room && mainRect(room);
      if (counter && rect) {
        const side = sides.slice().sort((p, q) => distanceTo(rect, p, counter.x, counter.y) - distanceTo(rect, q, counter.x, counter.y))[0];
        const { hw, hd } = footprint(counter);
        const half = side === "N" || side === "S" ? hw : hd, middle = side === "N" || side === "S" ? counter.x : counter.y;
        let added = 0;
        const spans = openingsOn(rect, side);
        for (let along = middle - half + 150; along <= middle + half - 150 && added < prefs.kitchenSockets; along += 50) {
          if (spans.some(([lo, hi]) => along > lo && along < hi)) continue;
          const [x, y] = pointOn(rect, side, along);
          if (elec.some((item) => /^socket/.test(item.kind) && Math.abs(item.h - 1100) < 300 && Math.hypot(item.x - x, item.y - y) < 450)) continue;
          add("socketW", x, y, rotOf(side), 1100);
          added++;
        }
        if (added) notes.push(`\u53A8\u623F\u53F0\u9762\uFF1A\u591A\u7559\u4E86 ${added} \u4E2A\u63D2\u5EA7`);
        if (added < prefs.kitchenSockets) notes.push(added ? "\u53A8\u623F\u53F0\u9762\uFF1A\u5176\u4F59\u4F4D\u7F6E\u662F\u7A97\u6216\u5DF2\u6709\u63D2\u5EA7\uFF0C\u6CA1\u518D\u52A0" : "\u53A8\u623F\u53F0\u9762\uFF1A\u53F0\u9762\u90A3\u9762\u5899\u662F\u7A97\u6216\u5DF2\u7ECF\u6709\u63D2\u5EA7\uFF0C\u6CA1\u5730\u65B9\u591A\u7559");
      }
    }
    if (prefs.floorSocket) {
      let added = 0;
      for (const table of furniture.filter((item) => /^(diningTable|roundTable|coffeeTable|roundCoffee|ovalCoffee)/.test(item.key))) {
        if (elec.some((item) => item.kind === "socketFloor" && Math.hypot(item.x - table.x, item.y - table.y) < 600)) continue;
        add("socketFloor", table.x, table.y, 0, 0);
        added++;
      }
      if (added) notes.push(`\u5730\u63D2\uFF1A\u9910\u684C/\u8336\u51E0\u4E0B\u52A0\u4E86 ${added} \u4E2A`);
    }
    if (prefs.bedsideUsb) {
      let swapped = 0;
      for (const stand of furniture.filter((item) => /^nightstand/.test(item.key))) {
        const socket = elec.filter((item) => item.kind === "socket" && Math.hypot(item.x - stand.x, item.y - stand.y) < 700).sort((p, q) => Math.hypot(p.x - stand.x, p.y - stand.y) - Math.hypot(q.x - stand.x, q.y - stand.y))[0];
        if (socket) {
          socket.kind = "socketUSB";
          socket.h = HEIGHT.socketUSB;
          swapped++;
          changed++;
        }
      }
      if (swapped) notes.push(`\u5E8A\u5934\uFF1A${swapped} \u4E2A\u63D2\u5EA7\u6362\u6210 USB \u63D2\u5EA7`);
    }
    return { plan: next, changed, notes };
    function distanceTo(rect, side, x, y) {
      const clamp = (value, lo, hi) => Math.min(Math.max(value, lo), hi);
      const [px, py] = side === "N" ? [clamp(x, rect.x, rect.x + rect.w), rect.y] : side === "S" ? [clamp(x, rect.x, rect.x + rect.w), rect.y + rect.h] : side === "W" ? [rect.x, clamp(y, rect.y, rect.y + rect.h)] : [rect.x + rect.w, clamp(y, rect.y, rect.y + rect.h)];
      return Math.hypot(x - px, y - py);
    }
    function entryDoor() {
      const door = next.openings.find((opening) => opening.entry);
      const wall = door && next.walls.find((item) => item.id === door.wall);
      const a = wall && nodes.get(wall.a), b = wall && nodes.get(wall.b);
      if (!door || !a || !b) return void 0;
      const length = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / length, uy = (b.y - a.y) / length;
      const x = a.x + ux * door.pos, y = a.y + uy * door.pos;
      for (const sign of [1, -1]) {
        const room = roomOf(x - uy * sign * (wall.t / 2 + 300), y + ux * sign * (wall.t / 2 + 300));
        if (room) return { room, x, y, width: door.width };
      }
      return void 0;
    }
  }

  // client/workspaces/cad/lib/design/types.ts
  function isBuilding(plan) {
    return plan.kind === "building";
  }

  // client/workspaces/cad/lib/design/geometry.ts
  var distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function segmentDistance(point, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared)) : 0;
    return distance(point, [a[0] + t * dx, a[1] + t * dy]);
  }
  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if (segmentDistance(point, a, b) < 1e-3) return true;
      if (a[1] > point[1] !== b[1] > point[1] && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function enclosedRegions(walls) {
    const points = [];
    const node = (point) => {
      const found = points.findIndex((existing) => distance(point, existing) <= 40);
      if (found >= 0) return found;
      points.push(point);
      return points.length - 1;
    };
    for (const wall of walls) {
      node(wall.a);
      node(wall.b);
    }
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i], b = walls[j];
      const dx = a.b[0] - a.a[0], dy = a.b[1] - a.a[1];
      const ex = b.b[0] - b.a[0], ey = b.b[1] - b.a[1];
      const cross = dx * ey - dy * ex;
      if (Math.abs(cross) < 1e-3) continue;
      const px = b.a[0] - a.a[0], py = b.a[1] - a.a[1];
      const t = (px * ey - py * ex) / cross, u = (px * dy - py * dx) / cross;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) node([a.a[0] + t * dx, a.a[1] + t * dy]);
    }
    const neighbors = points.map(() => /* @__PURE__ */ new Set());
    for (const wall of walls) {
      const ids = points.map((point, id) => ({ point, id })).filter(({ point }) => segmentDistance(point, wall.a, wall.b) <= 40).sort((a, b) => distance(a.point, wall.a) - distance(b.point, wall.a)).map((item) => item.id);
      for (let i = 1; i < ids.length; i++) {
        neighbors[ids[i - 1]].add(ids[i]);
        neighbors[ids[i]].add(ids[i - 1]);
      }
    }
    const sorted = neighbors.map((ids, i) => [...ids].sort((a, b) => Math.atan2(points[a][1] - points[i][1], points[a][0] - points[i][0]) - Math.atan2(points[b][1] - points[i][1], points[b][0] - points[i][0])));
    const visited = /* @__PURE__ */ new Set();
    const regions = [];
    for (let start = 0; start < points.length; start++) for (const next of sorted[start]) {
      let a = start, b = next;
      const polygon = [];
      while (!visited.has(`${a}:${b}`)) {
        visited.add(`${a}:${b}`);
        polygon.push(points[a]);
        const adjacent = sorted[b];
        const c = adjacent[(adjacent.indexOf(a) - 1 + adjacent.length) % adjacent.length];
        a = b;
        b = c;
      }
      if (a !== start || b !== next) continue;
      const area = polygon.reduce((sum, p, i) => {
        const q = polygon[(i + 1) % polygon.length];
        return sum + p[0] * q[1] - q[0] * p[1];
      }, 0);
      if (area > 0) regions.push(polygon);
    }
    return regions;
  }
  function containingRegion(point, regions) {
    const area = (polygon) => Math.abs(polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0));
    return regions.filter((region) => pointInPolygon(point, region)).sort((a, b) => area(a) - area(b))[0];
  }

  // client/workspaces/cad/lib/design/opening-types.ts
  var OPENING_DEFAULTS = {
    door: { sill: 0, head: 2100 },
    double: { sill: 0, head: 2100 },
    unequal: { sill: 0, head: 2100 },
    sliding: { sill: 0, head: 2400 },
    folding: { sill: 0, head: 2400 },
    pocket: { sill: 0, head: 2100 },
    hole: { sill: 0, head: 2100 },
    garage: { sill: 0, head: 2400 },
    window: { sill: 900, head: 2400 },
    slideWindow: { sill: 900, head: 2400 },
    floorWindow: { sill: 0, head: 2500 },
    highWindow: { sill: 1500, head: 2100 },
    bay: { sill: 450, head: 2400 },
    glassWall: { sill: 0, head: 2600 }
  };
  var OPENING_TYPES = Object.keys(OPENING_DEFAULTS);
  function isOpeningType(value) {
    return typeof value === "string" && Object.prototype.hasOwnProperty.call(OPENING_DEFAULTS, value);
  }

  // client/workspaces/cad/lib/design/finishes.ts
  var FLOOR_MATS = {
    oak: ["\u6A61\u6728", "\u6728\u5730\u677F", "\u5B9E\u6728\u5730\u677F", "\u590D\u5408\u5730\u677F"],
    walnut: ["\u80E1\u6843\u6728", "\u80E1\u6843\u6728\u5730\u677F"],
    herring: ["\u4EBA\u5B57\u62FC", "\u4EBA\u5B57\u62FC\u5730\u677F", "\u9C7C\u9AA8\u62FC"],
    tile: ["\u5927\u677F", "\u74F7\u7816", "\u5730\u7816", "\u7070\u767D"],
    marble: ["\u5927\u7406\u77F3", "\u5CA9\u677F"],
    cement: ["\u5FAE\u6C34\u6CE5", "\u6C34\u6CE5"],
    terrazzo: ["\u6C34\u78E8\u77F3"],
    carpet: ["\u5730\u6BEF"],
    bath: ["\u9632\u6ED1"],
    epoxy: ["\u73AF\u6C27"],
    deck: ["\u6728\u5851", "\u6237\u5916\u6728"],
    paving: ["\u77F3\u6750\u94FA\u88C5", "\u5EAD\u9662\u77F3"],
    grass: ["\u8349\u576A"]
  };
  var WALL_MATS = {
    latexWhite: ["\u767D\u8272", "\u767D\u5899", "\u767D\u8272\u4E73\u80F6\u6F06"],
    latexGrey: ["\u6D45\u7070", "\u7070\u8272"],
    latexSage: ["\u7070\u7EFF", "\u7EFF\u8272"],
    latexWarm: ["\u5976\u5496", "\u7C73\u8272", "\u6696\u8272", "\u5976\u6CB9"],
    wallpaper: ["\u5899\u5E03", "\u58C1\u7EB8", "\u5899\u7EB8"],
    wallTile: ["\u5899\u7816", "\u74F7\u7816\u5899"],
    woodPanel: ["\u6728\u9970\u9762", "\u62A4\u5899\u677F"]
  };
  var SKIRTINGS = { none: ["\u65E0", "\u4E0D\u8981", "\u9690\u5F62", "\u4E0D\u505A"], wood: ["\u5B9E\u6728", "\u6728"], metal: ["\u91D1\u5C5E", "\u94DD", "\u4E0D\u9508\u94A2"] };
  var LOOK_STYLES = { real: ["\u5199\u5B9E"], diorama: ["\u6C99\u76D8", "\u6A21\u578B", "\u5FAE\u7F29"], colorplan: ["\u5F69\u5E73"] };
  var LOOK_PALETTES = {
    plan: ["\u65B9\u6848\u539F\u8272", "\u539F\u8272", "\u9ED8\u8BA4"],
    cream: ["\u5976\u6CB9"],
    wood: ["\u539F\u6728"],
    morandi: ["\u83AB\u5170\u8FEA"],
    wabi: ["\u4F98\u5BC2"],
    nordic: ["\u5317\u6B27"],
    midcentury: ["\u4E2D\u53E4"],
    chinese: ["\u65B0\u4E2D\u5F0F", "\u4E2D\u5F0F"],
    french: ["\u6CD5\u5F0F"],
    industrial: ["\u5DE5\u4E1A"],
    mono: ["\u6781\u7B80", "\u9ED1\u767D"],
    coastal: ["\u6D77\u98CE", "\u5730\u4E2D\u6D77"],
    dusk: ["\u591C\u666F", "\u6DF1\u8272"]
  };
  function finish(table, value) {
    const text = String(value ?? "").trim();
    if (!text) return void 0;
    if (table[text]) return text;
    let best;
    for (const [key, names] of Object.entries(table)) for (const name of names) if (text.includes(name) && name.length > (best?.[1] ?? 0)) best = [key, name.length];
    return best?.[0];
  }

  // client/workspaces/cad/lib/design/plan-ops.ts
  var ELEC_KINDS = [
    "socket",
    "socketUSB",
    "socketW",
    "socket16",
    "socketAC",
    "socketHood",
    "socketFloor",
    "socketEV",
    "panel",
    "switch1",
    "switch2",
    "switch3",
    "dimmer",
    "light",
    "pendant",
    "downlight",
    "spot",
    "wallLamp",
    "weak",
    "net",
    "tv",
    "intercom",
    "smoke",
    "cold",
    "hot",
    "waste",
    "waterIn",
    "acHole",
    "freshAir",
    "gas"
  ];
  var SWITCHES = /* @__PURE__ */ new Set(["switch1", "switch2", "switch3", "dimmer"]);
  var LIGHTS = /* @__PURE__ */ new Set(["light", "pendant", "downlight", "spot", "wallLamp", "strip", "track", "linear"]);
  var UNMOUNTED = /* @__PURE__ */ new Set(["light", "pendant", "downlight", "spot", "smoke", "freshAir", "socketFloor"]);
  var ELEC_HEIGHT = {
    socket: 300,
    socketUSB: 700,
    socketW: 1100,
    socket16: 300,
    socketAC: 2200,
    socketHood: 2150,
    socketEV: 1300,
    panel: 1800,
    switch1: 1300,
    switch2: 1300,
    switch3: 1300,
    dimmer: 1300,
    wallLamp: 1800,
    weak: 300,
    net: 300,
    tv: 1100,
    intercom: 1400,
    cold: 500,
    hot: 500,
    waste: 400,
    waterIn: 300,
    acHole: 2350,
    gas: 600
  };
  var elecOf = (plan) => plan.elec ?? (plan.elec = []);
  function mountOnWall(plan, kind, x, y, h) {
    if (UNMOUNTED.has(kind)) return { x: Math.round(x), y: Math.round(y), rot: 0 };
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    let best;
    for (const wall2 of plan.walls) {
      const a = nodes.get(wall2.a), b = nodes.get(wall2.b);
      if (!a || !b || wall2.status === "removed") continue;
      const length2 = Math.hypot(b.x - a.x, b.y - a.y);
      if (length2 < 1) continue;
      const ux2 = (b.x - a.x) / length2, uy2 = (b.y - a.y) / length2;
      const along2 = Math.max(0, Math.min(length2, (x - a.x) * ux2 + (y - a.y) * uy2));
      const gap = Math.hypot(a.x + ux2 * along2 - x, a.y + uy2 * along2 - y);
      if (!best || gap < best.gap) best = { wall: wall2, along: along2, length: length2, ux: ux2, uy: uy2, ax: a.x, ay: a.y, gap };
    }
    requireValue(best && best.gap <= 600, `\u70B9\u4F4D (${Math.round(x)}, ${Math.round(y)}) \u79BB\u6700\u8FD1\u7684\u5899\u8D85\u8FC7 600mm\uFF1B${kind} \u8981\u88C5\u5728\u5899\u4E0A\uFF0C\u5750\u6807\u8BF7\u7ED9\u5728\u623F\u95F4\u91CC\u8D34\u8FD1\u90A3\u9762\u5899\u7684\u4F4D\u7F6E`);
    const { wall, length, ux, uy, ax, ay } = best;
    const along = Math.max(100, Math.min(length - 100, best.along));
    for (const opening of plan.openings.filter((item) => item.wall === wall.id)) {
      const sill = Number(opening.sill ?? 0);
      if (h + 100 > sill && Math.abs(along - opening.pos) < opening.width / 2 + 50) {
        throw new Error(`\u70B9\u4F4D\u843D\u5728\u6D1E\u53E3 ${opening.id}\uFF08${opening.type}\uFF0C\u6CBF\u5899 ${Math.round(opening.pos - opening.width / 2)}\u2013${Math.round(opening.pos + opening.width / 2)}\uFF09\u4E0A\uFF0C\u8BF7\u632A\u5230\u6D1E\u53E3\u65C1\u8FB9\u7684\u5B9E\u5899\u4E0A\uFF08\u95E8\u65C1\u5F00\u5173\u4E00\u822C\u79BB\u95E8\u8FB9 150\u2013300mm\uFF09`);
      }
    }
    const nx = -uy, ny = ux, cx = ax + ux * along, cy = ay + uy * along;
    const side = (x - cx) * nx + (y - cy) * ny >= 0 ? 1 : -1;
    const ix = nx * side, iy = ny * side, offset = wall.t / 2 + 60;
    return { x: Math.round(cx + ix * offset), y: Math.round(cy + iy * offset), rot: Math.round(Math.atan2(-ix, iy) * 180 / Math.PI) };
  }
  function roomsNamed(plan, name) {
    if (/^(\*|全部|所有|全屋)$/.test(name.trim())) return plan.rooms.filter((room) => !/卫|浴|厕|厨|阳台|露台|庭院|花园|车库/.test(room.name));
    const exact = plan.rooms.filter((room) => room.name === name);
    const found = exact.length ? exact : plan.rooms.filter((room) => room.name.includes(name) || name.includes(room.name));
    requireValue(found.length, `\u627E\u4E0D\u5230\u623F\u95F4\u201C${name}\u201D\uFF0C\u53EF\u7528\uFF1A${plan.rooms.map((room) => room.name).join("\u3001")}`);
    return found;
  }
  var finite = (value) => typeof value === "number" && Number.isFinite(value);
  var isPoint = (value) => Array.isArray(value) && value.length === 2 && value.every(finite);
  function patch(target, operation, fields) {
    const values = operation;
    for (const field of fields) if (values[field] !== void 0) Object.assign(target, { [field]: values[field] });
  }
  function requireValue(condition, message) {
    if (!condition) throw new Error(message);
  }
  function find(items, id) {
    const item = items.find((item2) => item2.id === id);
    requireValue(item, `\u627E\u4E0D\u5230 id=${id}\uFF0C\u8BF7\u4F7F\u7528\u5F53\u524D\u6458\u8981\u91CC\u7684 id`);
    return item;
  }
  function openingDefaults(type) {
    requireValue(
      isOpeningType(type),
      `\u4E0D\u652F\u6301\u6D1E\u53E3\u7C7B\u578B ${String(type)}\uFF0C\u53EF\u9009\u7C7B\u578B\uFF1A${OPENING_TYPES.join("\u3001")}`
    );
    return OPENING_DEFAULTS[type];
  }
  function checkFurniturePosition(plan, x, y) {
    const wallNodes = plan.walls.filter((wall) => wall.status !== "removed").flatMap((wall) => [find(plan.nodes, wall.a), find(plan.nodes, wall.b)]);
    requireValue(wallNodes.length > 0, "\u7F3A\u5C11\u6709\u6548\u5899\u4F53\uFF0C\u65E0\u6CD5\u6821\u9A8C\u5BB6\u5177\u5750\u6807");
    const xs = wallNodes.map((node) => node.x), ys = wallNodes.map((node) => node.y);
    const minX = Math.min(...xs) - 2e3, maxX = Math.max(...xs) + 2e3;
    const minY = Math.min(...ys) - 2e3, maxY = Math.max(...ys) + 2e3;
    requireValue(
      x >= minX && x <= maxX && y >= minY && y <= maxY,
      `\u5BB6\u5177\u5750\u6807 (${x}, ${y}) \u8D85\u51FA\u5899\u4F53\u5305\u56F4\u76D2\u5916\u6269 2000mm \u7684\u8303\u56F4\uFF0C\u8BF7\u6EE1\u8DB3 ${minX} \u2264 x \u2264 ${maxX}\u3001${minY} \u2264 y \u2264 ${maxY}`
    );
  }
  function checkOpenings(plan, wallIds) {
    for (const wallId of wallIds) {
      const wall = find(plan.walls, wallId);
      const a = find(plan.nodes, wall.a), b = find(plan.nodes, wall.b);
      const length = Math.hypot(a.x - b.x, a.y - b.y);
      requireValue(length > 0, "\u5899\u7684\u7AEF\u70B9\u4E0D\u80FD\u91CD\u5408");
      for (const opening of plan.openings.filter((item) => item.wall === wallId)) {
        requireValue(
          finite(opening.pos) && finite(opening.width) && opening.width > 0 && opening.pos - opening.width / 2 > 0 && opening.pos + opening.width / 2 < length,
          `\u6D1E\u53E3 ${opening.id} \u8D8A\u754C\u6216\u5BBD\u5EA6\u65E0\u6548\uFF0C\u8BF7\u6EE1\u8DB3 0 < pos-width/2 < pos+width/2 < ${Math.round(length)}`
        );
      }
    }
  }
  function applyOne(plan, operation, ctx) {
    requireValue(operation && typeof operation === "object", "\u64CD\u4F5C\u5FC5\u987B\u662F\u5BF9\u8C61");
    const values = operation;
    for (const key of ["x", "y", "rot", "w", "d", "h", "t", "pos", "width", "sill", "head", "hinge", "height"]) {
      if (values[key] !== void 0) requireValue(finite(values[key]), `${key} \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57`);
    }
    for (const key of ["w", "d", "h", "t", "width", "height"]) {
      if (values[key] !== void 0) requireValue(Number(values[key]) > 0, `${key} \u5FC5\u987B\u5927\u4E8E 0`);
    }
    if (values.bearing !== void 0) requireValue(typeof values.bearing === "boolean", "bearing \u5FC5\u987B\u662F\u5E03\u5C14\u503C");
    if (values.name !== void 0) requireValue(typeof values.name === "string", "name \u5FC5\u987B\u662F\u5B57\u7B26\u4E32");
    if (values.status !== void 0) requireValue(["existing", "new", "removed"].includes(String(values.status)), "status \u5FC5\u987B\u4E3A existing/new/removed");
    switch (operation.op) {
      case "add_furniture": {
        requireValue(ctx.isValidKey(operation.key), `\u5BB6\u5177\u5E93\u6CA1\u6709 ${operation.key}`);
        requireValue(finite(operation.x) && finite(operation.y), "\u586B\u5199\u5BB6\u5177 x/y");
        checkFurniturePosition(plan, operation.x, operation.y);
        const furniture = ctx.makeFurn(operation.key, operation.x, operation.y, operation.rot ?? 0);
        requireValue(furniture.id && !plan.furniture.some((item) => item.id === furniture.id), "\u5BB6\u5177 id \u7F3A\u5931\u6216\u91CD\u590D");
        const added = structuredClone(furniture);
        patch(added, operation, ["w", "d"]);
        plan.furniture.push(added);
        break;
      }
      case "move_furniture": {
        const furniture = find(plan.furniture, operation.id);
        checkFurniturePosition(plan, operation.x ?? furniture.x, operation.y ?? furniture.y);
        patch(furniture, operation, ["x", "y", "rot"]);
        break;
      }
      case "resize_furniture":
        patch(find(plan.furniture, operation.id), operation, ["w", "d", "h"]);
        break;
      case "replace_furniture": {
        requireValue(ctx.isValidKey(operation.key), `\u5BB6\u5177\u5E93\u6CA1\u6709 ${operation.key}`);
        const old = find(plan.furniture, operation.id);
        const replacement = ctx.makeFurn(operation.key, old.x, old.y, Number(old.rot ?? 0));
        plan.furniture[plan.furniture.indexOf(old)] = { ...structuredClone(replacement), id: old.id, key: operation.key, x: old.x, y: old.y, rot: old.rot };
        break;
      }
      case "remove": {
        const furniture = plan.furniture.find((item) => item.id === operation.id);
        if (furniture) {
          plan.furniture.splice(plan.furniture.indexOf(furniture), 1);
          break;
        }
        const opening = plan.openings.find((item) => item.id === operation.id);
        if (opening) {
          plan.openings.splice(plan.openings.indexOf(opening), 1);
          break;
        }
        const elec = elecOf(plan), point = elec.find((item) => item.id === operation.id);
        if (point) {
          elec.splice(elec.indexOf(point), 1);
          for (const item of elec) if (item.links?.includes(point.id)) item.links = item.links.filter((id) => id !== point.id);
          break;
        }
        const wall = find(plan.walls, operation.id);
        plan.walls.splice(plan.walls.indexOf(wall), 1);
        plan.openings = plan.openings.filter((item) => item.wall !== wall.id);
        const usedNodes = new Set(plan.walls.flatMap((item) => [item.a, item.b]));
        plan.nodes = plan.nodes.filter((item) => usedNodes.has(item.id));
        break;
      }
      case "add_opening": {
        find(plan.walls, operation.wall);
        const defaults = openingDefaults(operation.type);
        const opening = { id: crypto.randomUUID(), wall: operation.wall, type: operation.type, pos: operation.pos, width: operation.width, ...defaults, hinge: 0, side: 1 };
        patch(opening, operation, ["sill", "head", "hinge"]);
        plan.openings.push(opening);
        checkOpenings(plan, [operation.wall]);
        break;
      }
      case "update_opening": {
        const opening = find(plan.openings, operation.id);
        const defaults = openingDefaults(operation.type === void 0 ? opening.type : operation.type);
        if (operation.type !== void 0 && operation.type !== opening.type) Object.assign(opening, defaults);
        patch(opening, operation, ["pos", "width", "type", "hinge", "sill", "head"]);
        checkOpenings(plan, [opening.wall]);
        break;
      }
      case "add_wall": {
        requireValue(isPoint(operation.a) && isPoint(operation.b), "a/b \u5FC5\u987B\u4E3A\u4E24\u5143\u6570\u5B57\u5750\u6807");
        requireValue(finite(operation.t) && operation.t > 0, "\u5899\u539A t \u5FC5\u987B\u5927\u4E8E 0");
        const nodeFor = (point) => {
          const existing = plan.nodes.find((node2) => distance([node2.x, node2.y], point) <= 40);
          if (existing) return existing.id;
          const node = { id: crypto.randomUUID(), x: point[0], y: point[1] };
          plan.nodes.push(node);
          return node.id;
        };
        const a = nodeFor(operation.a), b = nodeFor(operation.b);
        requireValue(a !== b, "\u7AEF\u70B9\u5438\u9644\u540E\u5899\u957F\u4E3A 0\uFF0C\u8BF7\u62C9\u5F00\u4E24\u4E2A\u7AEF\u70B9");
        plan.walls.push({ id: crypto.randomUUID(), a, b, t: operation.t, bearing: operation.bearing ?? false, status: "new" });
        break;
      }
      case "move_node": {
        requireValue(finite(operation.x) && finite(operation.y), "\u586B\u5199\u8282\u70B9 x/y");
        patch(find(plan.nodes, operation.id), operation, ["x", "y"]);
        checkOpenings(plan, plan.walls.filter((wall) => wall.a === operation.id || wall.b === operation.id).map((wall) => wall.id));
        break;
      }
      case "update_wall":
        patch(find(plan.walls, operation.id), operation, ["t", "bearing", "status"]);
        break;
      case "set_room": {
        requireValue(isPoint(operation.at) && typeof operation.name === "string", "\u586B\u5199\u623F\u95F4 at \u5750\u6807\u548C name");
        const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
        const regions = enclosedRegions(plan.walls.filter((wall) => wall.status !== "removed" && nodes.has(wall.a) && nodes.has(wall.b)).map((wall) => ({ a: [nodes.get(wall.a).x, nodes.get(wall.a).y], b: [nodes.get(wall.b).x, nodes.get(wall.b).y] })));
        const region = containingRegion(operation.at, regions);
        const existing = plan.rooms.find((room) => distance([room.x, room.y], operation.at) <= 40) ?? (region && plan.rooms.find((room) => containingRegion([room.x, room.y], regions) === region));
        const given = typeof operation.ceil === "string" ? { type: operation.ceil } : operation.ceil;
        const ceil = given && typeof given === "object" ? { ceil: { type: "none", drop: 0, edgeW: 400, cove: false, ...given } } : {};
        if (existing) Object.assign(existing, { name: operation.name, x: operation.at[0], y: operation.at[1] }, ceil);
        else plan.rooms.push({ id: crypto.randomUUID(), x: operation.at[0], y: operation.at[1], name: operation.name, ...ceil });
        break;
      }
      case "set_plan":
        patch(plan, operation, ["name", "height"]);
        break;
      case "set_finish": {
        requireValue(typeof operation.room === "string" && operation.room, "\u586B\u5199 room \u623F\u95F4\u540D");
        const values2 = {};
        for (const [field, table, label] of [["mat", FLOOR_MATS, "\u5730\u9762"], ["wallMat", WALL_MATS, "\u5899\u9762"], ["skirting", SKIRTINGS, "\u8E22\u811A\u7EBF"]]) {
          const given = operation[field];
          if (given === void 0) continue;
          const key = finish(table, given);
          requireValue(key, `${label}\u6750\u8D28\u201C${String(given)}\u201D\u8BBE\u8BA1\u5668\u91CC\u6CA1\u6709\uFF0C\u53EF\u9009\uFF1A${Object.entries(table).map(([k, names]) => `${k}(${names[0]})`).join("\u3001")}`);
          values2[field] = key;
        }
        requireValue(Object.keys(values2).length, "set_finish \u81F3\u5C11\u586B mat / wallMat / skirting \u4E4B\u4E00");
        for (const room of roomsNamed(plan, operation.room)) Object.assign(room, values2);
        break;
      }
      case "set_look": {
        const look = {};
        if (operation.style !== void 0) {
          const key = finish(LOOK_STYLES, operation.style);
          requireValue(key, `3D \u98CE\u683C\u201C${String(operation.style)}\u201D\u6CA1\u6709\uFF0C\u53EF\u9009\uFF1A${Object.keys(LOOK_STYLES).join("\u3001")}`);
          look.style = key;
        }
        if (operation.palette !== void 0) {
          const key = finish(LOOK_PALETTES, operation.palette);
          requireValue(key, `\u914D\u8272\u201C${String(operation.palette)}\u201D\u6CA1\u6709\uFF0C\u53EF\u9009\uFF1A${Object.entries(LOOK_PALETTES).map(([k, names]) => `${k}(${names[0]})`).join("\u3001")}`);
          look.palette = key;
        }
        requireValue(Object.keys(look).length, "set_look \u81F3\u5C11\u586B style \u6216 palette");
        plan.look = { ...plan.look, ...look };
        break;
      }
      case "add_elec": {
        requireValue(ELEC_KINDS.includes(operation.kind), `\u6CA1\u6709\u70B9\u4F4D\u7C7B\u578B ${String(operation.kind)}\uFF0C\u53EF\u9009\uFF1A${ELEC_KINDS.join("\u3001")}`);
        requireValue(finite(operation.x) && finite(operation.y), "\u586B\u5199\u70B9\u4F4D x/y");
        checkFurniturePosition(plan, operation.x, operation.y);
        const h = operation.h ?? ELEC_HEIGHT[operation.kind] ?? 0;
        const elec = elecOf(plan);
        const point = { id: Math.random().toString(36).slice(2, 10), kind: operation.kind, ...mountOnWall(plan, operation.kind, operation.x, operation.y, h), h };
        if (operation.links !== void 0) {
          requireValue(SWITCHES.has(operation.kind), "links \u53EA\u7528\u4E8E\u5F00\u5173");
          requireValue(Array.isArray(operation.links) && operation.links.every((id) => elec.some((item) => item.id === id && LIGHTS.has(item.kind))), "links \u91CC\u6BCF\u4E2A id \u90FD\u5FC5\u987B\u662F\u6458\u8981\u91CC\u5DF2\u6709\u7684\u706F");
          point.links = [...operation.links];
        }
        elec.push(point);
        break;
      }
      case "move_elec": {
        const point = find(elecOf(plan), operation.id);
        const h = operation.h ?? point.h;
        Object.assign(point, mountOnWall(plan, point.kind, operation.x ?? point.x, operation.y ?? point.y, h), { h });
        break;
      }
      case "link_elec": {
        const elec = elecOf(plan), point = find(elec, operation.id);
        requireValue(SWITCHES.has(point.kind), `${operation.id} \u4E0D\u662F\u5F00\u5173`);
        requireValue(Array.isArray(operation.lights) && operation.lights.every((id) => elec.some((item) => item.id === id && LIGHTS.has(item.kind))), "lights \u91CC\u6BCF\u4E2A id \u90FD\u5FC5\u987B\u662F\u6458\u8981\u91CC\u5DF2\u6709\u7684\u706F");
        point.links = [...operation.lights];
        break;
      }
      case "relayout_elec":
        break;
      default:
        throw new Error(`\u672A\u77E5\u64CD\u4F5C ${values.op}`);
    }
  }
  var TOUCHES = {
    set_finish: "finish",
    set_look: "look",
    set_plan: "finish",
    add_elec: "elec",
    move_elec: "elec",
    link_elec: "elec",
    relayout_elec: "relayoutElec"
  };
  function applyOps(input, ops, ctx) {
    let plan = structuredClone(input);
    const rejected = [];
    const touched = { layout: false, elec: false, finish: false, look: false, relayoutElec: false };
    let applied = 0;
    ops.forEach((operation, index) => {
      try {
        requireValue(!isBuilding(plan), "\u6682\u53EA\u652F\u6301\u5355\u5C42\u4FEE\u6539");
        const candidate = structuredClone(plan);
        applyOne(candidate, operation, ctx);
        const removedPoint = operation.op === "remove" && (plan.elec ?? []).some((item) => item.id === operation.id);
        touched[removedPoint ? "elec" : TOUCHES[operation.op] ?? "layout"] = true;
        plan = candidate;
        applied++;
      } catch (reason) {
        rejected.push({ index, reason: reason instanceof Error ? reason.message : String(reason) });
      }
    });
    return { plan, applied, rejected, touched };
  }

  // client/workspaces/cad/lib/design/plan-summary.ts
  function summarizePlan(plan, rooms, issues) {
    if (isBuilding(plan)) return JSON.stringify({ name: plan.name, kind: "building", message: "\u6682\u53EA\u652F\u6301\u5355\u5C42\u4FEE\u6539", floors: plan.floors.map((floor) => ({ name: floor.plan.name })) });
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    const walls = plan.walls.map((wall) => ({ id: wall.id, aNode: wall.a, bNode: wall.b, a: nodes.get(wall.a), b: nodes.get(wall.b), t: wall.t, bearing: wall.bearing, status: wall.status }));
    const regions = enclosedRegions(walls.filter((wall) => wall.status !== "removed" && wall.a && wall.b).map((wall) => ({ a: [wall.a.x, wall.a.y], b: [wall.b.x, wall.b.y] })));
    const roomList = rooms.length ? rooms : plan.rooms.map((room) => ({ name: room.name, at: [room.x, room.y], area: void 0 }));
    const roomOf = (point) => roomList.find((room) => {
      if ("rects" in room && room.rects?.length) return room.rects.some((rect) => point[0] >= rect.x && point[0] <= rect.x + rect.w && point[1] >= rect.y && point[1] <= rect.y + rect.h);
      const region = containingRegion(point, regions);
      return region !== void 0 && containingRegion(room.at, regions) === region;
    })?.name ?? "\u672A\u5206\u914D\u623F\u95F4";
    const furniture = (compact) => {
      const grouped = /* @__PURE__ */ Object.create(null);
      for (const item of plan.furniture) {
        const room = roomOf([item.x, item.y]);
        const entry = { id: item.id, key: item.key, x: item.x, y: item.y, rot: item.rot };
        (grouped[room] ?? (grouped[room] = [])).push(compact ? entry : { ...entry, name: item.name, w: item.w, d: item.d });
      }
      return grouped;
    };
    const sideNames = { N: "\u5317", S: "\u5357", W: "\u897F", E: "\u4E1C" };
    const roomWalls = (room) => {
      const rects = "rects" in room && room.rects?.length ? room.rects : [];
      const found = [];
      for (const wall of walls) {
        if (!wall.a || !wall.b || wall.status === "removed") continue;
        const horizontal = Math.abs(wall.a.y - wall.b.y) < 1, vertical = Math.abs(wall.a.x - wall.b.x) < 1;
        if (!horizontal && !vertical) continue;
        const reach = wall.t / 2 + 60;
        for (const rect of rects) {
          const edges = horizontal ? [{ side: "N", at: rect.y, out: -1 }, { side: "S", at: rect.y + rect.h, out: 1 }] : [{ side: "W", at: rect.x, out: -1 }, { side: "E", at: rect.x + rect.w, out: 1 }];
          const line = horizontal ? wall.a.y : wall.a.x;
          const [lo, hi] = horizontal ? [Math.min(wall.a.x, wall.b.x), Math.max(wall.a.x, wall.b.x)] : [Math.min(wall.a.y, wall.b.y), Math.max(wall.a.y, wall.b.y)];
          const [start, end] = horizontal ? [rect.x, rect.x + rect.w] : [rect.y, rect.y + rect.h];
          const overlap = Math.min(hi, end) - Math.max(lo, start);
          for (const edge of edges) {
            if (Math.abs(line - edge.at) > reach || overlap < 200 || found.some((item) => item.wall === wall.id)) continue;
            const middle = (Math.max(lo, start) + Math.min(hi, end)) / 2, beyond = line + edge.out * (wall.t + 200);
            const neighbour = roomOf(horizontal ? [middle, beyond] : [beyond, middle]);
            found.push({ wall: wall.id, side: sideNames[edge.side], outside: neighbour === "\u672A\u5206\u914D\u623F\u95F4" ? "\u5BA4\u5916" : neighbour });
          }
        }
      }
      return found.length ? found : void 0;
    };
    const finishesOf = (name) => {
      const label = plan.rooms.find((room) => room.name === name || name.split(" / ").includes(room.name));
      if (!label) return {};
      const { mat, wallMat, skirting } = label;
      return { mat, wallMat, skirting };
    };
    const openingAt = (opening) => {
      const wall = walls.find((item) => item.id === opening.wall);
      if (!wall?.a || !wall.b) return void 0;
      const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1, ux = (wall.b.x - wall.a.x) / length, uy = (wall.b.y - wall.a.y) / length;
      const point = (along) => [Math.round(wall.a.x + ux * along), Math.round(wall.a.y + uy * along)];
      return { at: point(opening.pos), ends: [point(opening.pos - opening.width / 2), point(opening.pos + opening.width / 2)] };
    };
    const elecList = (plan.elec ?? []).filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y));
    const elec = () => {
      var _a;
      const grouped = /* @__PURE__ */ Object.create(null);
      for (const item of elecList) (grouped[_a = roomOf([item.x, item.y])] ?? (grouped[_a] = [])).push([item.id, item.kind, Math.round(item.x), Math.round(item.y), Math.round(item.h ?? 0), ...item.links?.length ? [item.links] : []]);
      return grouped;
    };
    const output = {
      name: plan.name,
      height: plan.height,
      look: plan.look,
      rooms: roomList.map((room) => ({ name: room.name, area: room.area, at: room.at, ...finishesOf(room.name), walls: roomWalls(room) })),
      walls: walls.map((wall) => ({ ...wall, a: wall.a ? [wall.a.x, wall.a.y] : null, b: wall.b ? [wall.b.x, wall.b.y] : null })),
      openings: plan.openings.map((opening) => ({ id: opening.id, wall: opening.wall, type: opening.type, pos: opening.pos, width: opening.width, ...openingAt(opening) })),
      furniture: furniture(false),
      ...elecList.length ? { elecFormat: "[id, kind, x, y, h\u79BB\u5730, \u5F00\u5173\u63A7\u5236\u7684\u706Fid]", elec: elec() } : {},
      issues: issues.filter((issue) => issue.level === "error" || issue.level === "warn")
    };
    const stringify = () => JSON.stringify(output, (key, value) => ["x", "y", "rot", "t", "pos", "width", "w", "d", "height"].includes(key) && typeof value === "number" ? Math.round(value) : value);
    output.rooms.forEach((room) => {
      room.at = room.at.map(Math.round);
    });
    output.walls.forEach((wall) => {
      wall.a = wall.a?.map(Math.round) ?? null;
      wall.b = wall.b?.map(Math.round) ?? null;
    });
    let text = stringify();
    if (text.length > 12e3) {
      output.furniture = furniture(true);
      text = stringify();
    }
    if (text.length > 2e4 && output.elec) {
      output.elec = Object.fromEntries(Object.entries(elec()).map(([room, items]) => [room, `${items.length} \u4E2A\u70B9\u4F4D`]));
      text = stringify();
    }
    return text;
  }
  return __toCommonJS(entry_exports);
})();
