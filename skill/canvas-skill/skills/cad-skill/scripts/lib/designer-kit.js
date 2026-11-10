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
    applySpecPatch: () => applySpecPatch,
    carryOver: () => carryOver,
    elecPrefsFromDecisions: () => elecPrefsFromDecisions,
    nudgeFurniture: () => nudgeFurniture,
    patchTouches: () => patchTouches,
    planToSpec: () => planToSpec,
    summarizePlan: () => summarizePlan,
    validateSpec: () => validateSpec
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
        const index2 = plan.furniture.findIndex((item) => item.id === id);
        if (index2 < 0) continue;
        let best;
        for (const step of STEPS) {
          for (const [dx, dy] of DIRECTIONS) {
            const candidate = structuredClone(plan);
            const item = candidate.furniture[index2];
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
    const add2 = (kind, x, y, rot, h = HEIGHT[kind] ?? 300) => {
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
            add2("socket", spot[0], spot[1], rotOf(side));
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
        let point2 = side && socket ? spotOn(rect, side, "net", (side === "N" || side === "S" ? socket.x : socket.y) + 150) : null;
        if (!point2) for (const item of sides) {
          point2 = spotOn(rect, item, "net");
          if (point2) {
            side = item;
            break;
          }
        }
        if (point2 && side) {
          add2("net", point2[0], point2[1], rotOf(side));
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
          candidates = wallsOf(room, tv).map((spot, index2) => index2 === 0 && spot.prefer !== void 0 ? { ...spot, prefer: spot.prefer + hw + 300 } : spot);
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
          } else add2(kind, spot[0], spot[1], rotOf(candidate.side));
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
          add2("socketW", x, y, rotOf(side), 1100);
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
        add2("socketFloor", table.x, table.y, 0, 0);
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
  function segmentDistance(point2, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point2[0] - a[0]) * dx + (point2[1] - a[1]) * dy) / lengthSquared)) : 0;
    return distance(point2, [a[0] + t * dx, a[1] + t * dy]);
  }
  function pointInPolygon(point2, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if (segmentDistance(point2, a, b) < 1e-3) return true;
      if (a[1] > point2[1] !== b[1] > point2[1] && point2[0] < (b[0] - a[0]) * (point2[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function enclosedRegions(walls) {
    const points = [];
    const node = (point2) => {
      const found = points.findIndex((existing) => distance(point2, existing) <= 40);
      if (found >= 0) return found;
      points.push(point2);
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
      const ids = points.map((point2, id) => ({ point: point2, id })).filter(({ point: point2 }) => segmentDistance(point2, wall.a, wall.b) <= 40).sort((a, b) => distance(a.point, wall.a) - distance(b.point, wall.a)).map((item) => item.id);
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
  function containingRegion(point2, regions) {
    const area = (polygon) => Math.abs(polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0));
    return regions.filter((region) => pointInPolygon(point2, region)).sort((a, b) => area(a) - area(b))[0];
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
        const elec = elecOf(plan), point2 = elec.find((item) => item.id === operation.id);
        if (point2) {
          elec.splice(elec.indexOf(point2), 1);
          for (const item of elec) if (item.links?.includes(point2.id)) item.links = item.links.filter((id) => id !== point2.id);
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
        const nodeFor = (point2) => {
          const existing = plan.nodes.find((node2) => distance([node2.x, node2.y], point2) <= 40);
          if (existing) return existing.id;
          const node = { id: crypto.randomUUID(), x: point2[0], y: point2[1] };
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
        const point2 = { id: Math.random().toString(36).slice(2, 10), kind: operation.kind, ...mountOnWall(plan, operation.kind, operation.x, operation.y, h), h };
        if (operation.links !== void 0) {
          requireValue(SWITCHES.has(operation.kind), "links \u53EA\u7528\u4E8E\u5F00\u5173");
          requireValue(Array.isArray(operation.links) && operation.links.every((id) => elec.some((item) => item.id === id && LIGHTS.has(item.kind))), "links \u91CC\u6BCF\u4E2A id \u90FD\u5FC5\u987B\u662F\u6458\u8981\u91CC\u5DF2\u6709\u7684\u706F");
          point2.links = [...operation.links];
        }
        elec.push(point2);
        break;
      }
      case "move_elec": {
        const point2 = find(elecOf(plan), operation.id);
        const h = operation.h ?? point2.h;
        Object.assign(point2, mountOnWall(plan, point2.kind, operation.x ?? point2.x, operation.y ?? point2.y, h), { h });
        break;
      }
      case "link_elec": {
        const elec = elecOf(plan), point2 = find(elec, operation.id);
        requireValue(SWITCHES.has(point2.kind), `${operation.id} \u4E0D\u662F\u5F00\u5173`);
        requireValue(Array.isArray(operation.lights) && operation.lights.every((id) => elec.some((item) => item.id === id && LIGHTS.has(item.kind))), "lights \u91CC\u6BCF\u4E2A id \u90FD\u5FC5\u987B\u662F\u6458\u8981\u91CC\u5DF2\u6709\u7684\u706F");
        point2.links = [...operation.lights];
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
    ops.forEach((operation, index2) => {
      try {
        requireValue(!isBuilding(plan), "\u6682\u53EA\u652F\u6301\u5355\u5C42\u4FEE\u6539");
        const candidate = structuredClone(plan);
        applyOne(candidate, operation, ctx);
        const removedPoint = operation.op === "remove" && (plan.elec ?? []).some((item) => item.id === operation.id);
        touched[removedPoint ? "elec" : TOUCHES[operation.op] ?? "layout"] = true;
        plan = candidate;
        applied++;
      } catch (reason) {
        rejected.push({ index: index2, reason: reason instanceof Error ? reason.message : String(reason) });
      }
    });
    return { plan, applied, rejected, touched };
  }

  // client/workspaces/cad/lib/design/plan-summary.ts
  function summarizePlan(plan, rooms, issues) {
    if (isBuilding(plan)) return JSON.stringify({ name: plan.name, kind: "building", message: "\u591A\u5C42\u6237\u578B\uFF1A\u7528 designSpec \u548C cad_spec_patch \u4FEE\u6539\uFF08\u8DEF\u5F84 /floors/\u5C42\u53F7/...\uFF09", floors: plan.floors.map((floor) => ({ name: floor.plan.name })) });
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    const walls = plan.walls.map((wall) => ({ id: wall.id, aNode: wall.a, bNode: wall.b, a: nodes.get(wall.a), b: nodes.get(wall.b), t: wall.t, bearing: wall.bearing, status: wall.status }));
    const regions = enclosedRegions(walls.filter((wall) => wall.status !== "removed" && wall.a && wall.b).map((wall) => ({ a: [wall.a.x, wall.a.y], b: [wall.b.x, wall.b.y] })));
    const roomList = rooms.length ? rooms : plan.rooms.map((room) => ({ name: room.name, at: [room.x, room.y], area: void 0 }));
    const roomOf = (point2) => roomList.find((room) => {
      if ("rects" in room && room.rects?.length) return room.rects.some((rect) => point2[0] >= rect.x && point2[0] <= rect.x + rect.w && point2[1] >= rect.y && point2[1] <= rect.y + rect.h);
      const region = containingRegion(point2, regions);
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
      const point2 = (along) => [Math.round(wall.a.x + ux * along), Math.round(wall.a.y + uy * along)];
      return { at: point2(opening.pos), ends: [point2(opening.pos - opening.width / 2), point2(opening.pos + opening.width / 2)] };
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

  // client/workspaces/cad/lib/design/plan-to-spec.ts
  var pair = (point2) => [point2.x, point2.y];
  var defined = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
  var pick = (source, keys) => defined(Object.fromEntries(keys.map((key) => [key, source[key]])));
  var SIDES = [["N", { x: 0, y: -1 }], ["S", { x: 0, y: 1 }], ["E", { x: 1, y: 0 }], ["W", { x: -1, y: 0 }]];
  function singleToSpec(plan, options = {}) {
    const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
    const raw = plan;
    const walls = plan.walls.flatMap((wall) => {
      const a = nodes.get(wall.a), b = nodes.get(wall.b);
      if (!a || !b) return [];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 1) return [];
      const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
      const horizontal = Math.abs(dir.y) < 1e-3, vertical = Math.abs(dir.x) < 1e-3;
      let flush = "C";
      const align = Number(wall.align ?? 0);
      if (align) {
        let best;
        for (const [name, side] of SIDES) {
          const cross = dir.x * side.y - dir.y * side.x;
          if (Math.sign(cross) === Math.sign(align) && Math.abs(cross) > 0.5 && (!best || Math.abs(cross) > best[1])) best = [name, Math.abs(cross)];
        }
        if (best) flush = best[0];
      }
      const along = (distance2) => horizontal ? a.x + dir.x * distance2 : vertical ? a.y + dir.y * distance2 : distance2;
      const normal = { x: -dir.y, y: dir.x };
      const openings = plan.openings.filter((opening) => opening.wall === wall.id).map((opening) => {
        const half = opening.width / 2;
        const center = { x: a.x + dir.x * opening.pos, y: a.y + dir.y * opening.pos };
        return defined({
          type: opening.type,
          from: along(opening.pos - half),
          to: along(opening.pos + half),
          sill: opening.sill,
          head: opening.head,
          hinge: opening.hinge === 1 ? "to" : "from",
          into: opening.side === -1 ? [Math.round(center.x - normal.x * 600), Math.round(center.y - normal.y * 600)] : void 0,
          entry: opening.entry ? true : void 0,
          name: opening.name,
          material: opening.material,
          fireRating: opening.fireRating
        });
      });
      return [defined({
        a: pair(a),
        b: pair(b),
        t: wall.t,
        bearing: wall.bearing,
        status: wall.status,
        bearingFrom: wall.bearingFrom,
        flush,
        ...openings.length ? { openings } : {}
      })];
    });
    const elec = (raw.elec ?? []).filter((item) => !String(item.auto ?? "").startsWith("cove:")).map((item) => defined({
      id: item.id,
      kind: item.kind,
      at: pair(item),
      rot: item.rot,
      h: item.h,
      links: item.links?.length ? item.links : void 0,
      pts: item.pts?.length ? item.pts.map(pair) : void 0,
      loop: item.loop ? true : void 0,
      cct: item.pts?.length ? item.cct : void 0,
      w: item.pts?.length ? item.w : void 0
    }));
    const mep = raw.mep;
    const site = raw.site;
    const comments = (raw.comments ?? []).filter((item) => item && typeof item.text === "string" && !(item.author === "\u8BC6\u56FE\u5F85\u786E\u8BA4" && item.text.startsWith("\u8FD9\u9762\u5899\uFF08\u539A"))).map((item) => ({ at: pair(item), text: item.text }));
    return defined({
      name: plan.name,
      height: raw.height,
      phase: raw.phase,
      north: raw.north,
      site: site ? defined({ city: site.city || void 0, lat: site.lat, month: site.month }) : void 0,
      mep: mep ? defined({
        power: mep.power,
        water: mep.water,
        floorStyle: mep.floorStyle,
        custom: mep.custom?.length ? mep.custom.map(({ id: _id, pts, ...rest }) => ({ ...rest, pts: pts.map(pair) })) : void 0
      }) : void 0,
      look: raw.look,
      walls,
      voids: (raw.voids ?? []).map((item) => defined({
        rect: [item.x, item.y, item.x + item.w, item.y + item.h],
        depth: item.depth,
        name: item.name,
        shaft: item.shaft ? true : void 0
      })),
      rooms: plan.rooms.map((room) => defined({
        at: [room.x, room.y],
        name: room.name,
        ...pick(room, ["mat", "wallMat", "tile", "skirting", "ceil"])
      })),
      structs: (raw.structs ?? []).map((item) => defined({ kind: item.kind, at: pair(item), w: item.w, d: item.d, rot: item.rot })),
      beams: (raw.beams ?? []).map((item) => defined({ a: pair(item.a), b: pair(item.b), w: item.w, depth: item.depth })),
      furniture: plan.furniture.map((item) => {
        let color = item.color;
        if (color !== void 0 && options.defaults) {
          try {
            if (options.defaults(item.key)?.color === color) color = void 0;
          } catch {
          }
        }
        return defined({
          key: item.key,
          at: [item.x, item.y],
          rot: item.rot,
          ...pick({ ...item, color }, ["w", "d", "h", "z", "name", "color", "price", "brand", "kit", "opt", "cab"])
        });
      }),
      elec,
      comments: comments.length ? comments : void 0
    });
  }
  function planToSpec(plan, options = {}) {
    if (!isBuilding(plan)) return singleToSpec(plan, options);
    const building = plan;
    const floors = building.floors.map((floor) => {
      const { north: _north, site: _site, look: _look, name: _name, ...rest } = singleToSpec(floor.plan, options);
      return { name: String(floor.name ?? floor.plan.name), ...rest };
    });
    const first = floors.length ? singleToSpec(building.floors[0].plan) : {};
    const site = first.site || building.grade ? defined({ ...first.site, grade: building.grade || void 0 }) : void 0;
    return defined({
      name: building.name,
      cur: building.cur,
      slab: building.slab,
      base: building.base,
      north: first.north,
      site,
      look: first.look,
      floors
    });
  }
  function carryOver(before, after, options = {}) {
    const keep = (from, to) => {
      const source = from;
      return {
        ...to,
        ...source.measures !== void 0 ? { measures: structuredClone(source.measures) } : {},
        ...source.prices !== void 0 ? { prices: structuredClone(source.prices) } : {},
        ...options.comments !== false && source.comments !== void 0 ? { comments: structuredClone(source.comments) } : {}
      };
    };
    if (isBuilding(before) && isBuilding(after)) {
      return { ...after, floors: after.floors.map((floor, index2) => before.floors[index2] ? { ...floor, plan: keep(before.floors[index2].plan, floor.plan) } : floor) };
    }
    if (!isBuilding(before) && !isBuilding(after)) return keep(before, after);
    return after;
  }

  // client/workspaces/cad/lib/design/spec-patch.ts
  var unescape = (token) => token.replace(/~1/g, "/").replace(/~0/g, "~");
  function tokens(pointer) {
    if (pointer === "") return [];
    if (!pointer.startsWith("/")) throw new Error(`\u8DEF\u5F84 ${pointer} \u8981\u4EE5 / \u5F00\u5934\uFF08JSON Pointer\uFF0C\u4F8B\u5982 /rooms/2/mat\uFF09`);
    return pointer.slice(1).split("/").map(unescape);
  }
  function parentOf(root, pointer) {
    const list = tokens(pointer);
    if (!list.length) throw new Error("\u4E0D\u80FD\u66FF\u6362\u6574\u4E2A spec\uFF0C\u8BF7\u5199\u5230\u5177\u4F53\u5B57\u6BB5");
    let node = root;
    for (const token of list.slice(0, -1)) {
      if (Array.isArray(node)) node = node[Number(token)];
      else if (node && typeof node === "object") node = node[token];
      else node = void 0;
      if (node === void 0 || node === null || typeof node !== "object") throw new Error(`\u8DEF\u5F84 ${pointer} \u4E0D\u5B58\u5728\uFF08${token} \u5904\u65AD\u4E86\uFF09\uFF0C\u8BF7\u5BF9\u7167\u5F53\u524D designSpec`);
    }
    return { parent: node, key: list[list.length - 1] };
  }
  function index(list, key, pointer, adding) {
    if (adding && key === "-") return list.length;
    const at = Number(key);
    if (!/^\d+$/.test(key) || at > list.length || !adding && at === list.length) throw new Error(`\u8DEF\u5F84 ${pointer} \u7684\u4E0B\u6807 ${key} \u8D8A\u754C\uFF08\u6570\u7EC4\u957F\u5EA6 ${list.length}\uFF09`);
    return at;
  }
  function get(root, pointer) {
    let node = root;
    for (const token of tokens(pointer)) {
      node = Array.isArray(node) ? node[Number(token)] : node && typeof node === "object" ? node[token] : void 0;
      if (node === void 0) throw new Error(`\u8DEF\u5F84 ${pointer} \u4E0D\u5B58\u5728`);
    }
    return node;
  }
  function add(root, pointer, value) {
    const { parent, key } = parentOf(root, pointer);
    if (Array.isArray(parent)) parent.splice(index(parent, key, pointer, true), 0, value);
    else parent[key] = value;
  }
  function remove(root, pointer) {
    const { parent, key } = parentOf(root, pointer);
    if (Array.isArray(parent)) return parent.splice(index(parent, key, pointer, false), 1)[0];
    if (!(key in parent)) throw new Error(`\u8DEF\u5F84 ${pointer} \u4E0D\u5B58\u5728\uFF0C\u65E0\u6CD5\u5220\u9664`);
    const old = parent[key];
    delete parent[key];
    return old;
  }
  function applySpecPatch(spec, patch2) {
    if (!Array.isArray(patch2) || !patch2.length) throw new Error("patch \u5FC5\u987B\u662F\u975E\u7A7A\u6570\u7EC4");
    const root = structuredClone(spec);
    patch2.forEach((operation, at) => {
      try {
        if (!operation || typeof operation !== "object" || typeof operation.path !== "string") throw new Error("\u6BCF\u6761\u90FD\u8981\u6709 op \u548C path");
        switch (operation.op) {
          case "add":
            add(root, operation.path, structuredClone(operation.value));
            break;
          case "remove":
            remove(root, operation.path);
            break;
          case "replace": {
            const { parent, key } = parentOf(root, operation.path);
            if (!Array.isArray(parent) && !(key in parent)) parent[key] = structuredClone(operation.value);
            else {
              remove(root, operation.path);
              add(root, operation.path, structuredClone(operation.value));
            }
            break;
          }
          case "move": {
            const value = remove(root, operation.from);
            add(root, operation.path, value);
            break;
          }
          case "copy":
            add(root, operation.path, structuredClone(get(root, operation.from)));
            break;
          case "test":
            if (JSON.stringify(get(root, operation.path)) !== JSON.stringify(operation.value)) throw new Error(`test \u4E0D\u901A\u8FC7\uFF1A${operation.path}`);
            break;
          default:
            throw new Error(`op \u53EA\u80FD\u662F add / remove / replace / move / copy / test`);
        }
      } catch (reason) {
        throw new Error(`patch \u7B2C ${at + 1} \u6761\uFF08${operation?.op} ${operation?.path}\uFF09\uFF1A${reason instanceof Error ? reason.message : String(reason)}`);
      }
    });
    restyle(root, patch2);
    return root;
  }
  function restyle(root, patch2) {
    const floors = Array.isArray(root.floors) ? root.floors : null;
    const scopes = /* @__PURE__ */ new Set();
    for (const operation of patch2) {
      if (operation.op === "remove" || operation.op === "test") continue;
      const parts = tokens(operation.path);
      if (parts.length === 1 && parts[0] === "style") (floors ?? [root]).forEach((scope) => scopes.add(scope));
      else if (floors && parts.length === 3 && parts[0] === "floors" && parts[2] === "style" && floors[Number(parts[1])]) scopes.add(floors[Number(parts[1])]);
    }
    for (const scope of scopes) {
      for (const item of Array.isArray(scope.furniture) ? scope.furniture : []) {
        const opt = item.opt;
        if (!opt || typeof opt !== "object" || !("style" in opt)) continue;
        delete opt.style;
        delete item.color;
        if (!Object.keys(opt).length) delete item.opt;
      }
    }
  }
  function patchTouches(patch2) {
    const touched = { layout: false, elec: false, finish: false, look: false, relayoutElec: false, comments: false };
    for (const operation of patch2) {
      const parts = tokens(operation.path).map(String);
      const at = parts[0] === "floors" ? parts.slice(2) : parts;
      const [section, , field] = at;
      if (section === "elec") touched.elec = true;
      else if (section === "autoElec") touched.relayoutElec = true;
      else if (section === "look") touched.look = true;
      else if (section === "comments") touched.comments = true;
      else if (section === "rooms" && field && ["mat", "wallMat", "tile", "skirting", "ceil"].includes(field)) touched.finish = true;
      else if (section === "furniture" && field && ["color", "opt", "name", "price", "brand"].includes(field)) touched.finish = true;
      else if (["name", "phase", "north", "site", "mep", "style", "height", "dims", "expectDims", "heightFrom"].includes(section)) touched.finish = true;
      else touched.layout = true;
    }
    return touched;
  }

  // resources/hpd/catalog.json
  var catalog_default = {
    bed18: {
      name: "\u53CC\u4EBA\u5E8A 1.8m",
      type: "bed",
      w: 1800,
      d: 2100,
      h: 1050
    },
    bed15: {
      name: "\u53CC\u4EBA\u5E8A 1.5m",
      type: "bed",
      w: 1500,
      d: 2050,
      h: 1e3
    },
    bed12: {
      name: "\u5355\u4EBA\u5E8A 1.2m",
      type: "bed",
      w: 1200,
      d: 2e3,
      h: 950
    },
    bed20: {
      name: "\u53CC\u4EBA\u5E8A 2.0m",
      type: "bed",
      w: 2e3,
      d: 2200,
      h: 1050
    },
    roundBed: {
      name: "\u5706\u5E8A",
      type: "roundBed",
      w: 2200,
      d: 2200,
      h: 900
    },
    bunkBed: {
      name: "\u4E0A\u4E0B\u5E8A",
      type: "bunkBed",
      w: 1e3,
      d: 2e3,
      h: 1750
    },
    crib: {
      name: "\u5A74\u513F\u5E8A",
      type: "crib",
      w: 1250,
      d: 700,
      h: 950
    },
    tatami: {
      name: "\u69BB\u69BB\u7C73",
      type: "tatami",
      w: 2e3,
      d: 2e3,
      h: 400
    },
    nightstand: {
      name: "\u5E8A\u5934\u67DC\uFF08\u53F0\u706F\u53EF\u70B9\u4EAE\uFF09",
      type: "nightstand",
      w: 500,
      d: 420,
      h: 500
    },
    bedBench: {
      name: "\u5E8A\u5C3E\u51F3",
      type: "bedBench",
      w: 1400,
      d: 400,
      h: 450
    },
    wardrobe: {
      name: "\u8863\u67DC",
      type: "wardrobe",
      w: 2e3,
      d: 600,
      h: 2400
    },
    chest: {
      name: "\u4E94\u6597\u67DC",
      type: "chest",
      w: 900,
      d: 480,
      h: 1100
    },
    coatRack: {
      name: "\u8863\u5E3D\u67B6",
      type: "coatRack",
      w: 500,
      d: 500,
      h: 1750
    },
    stool: {
      name: "\u5706\u51F3 / \u5316\u5986\u51F3",
      type: "stool",
      w: 400,
      d: 400,
      h: 450
    },
    bayCushion: {
      name: "\u98D8\u7A97\u57AB",
      type: "bayCushion",
      w: 1800,
      d: 500,
      h: 80
    },
    dresser: {
      name: "\u68B3\u5986\u53F0",
      type: "dresser",
      w: 1e3,
      d: 450,
      h: 750
    },
    mirror: {
      name: "\u7A7F\u8863\u955C",
      type: "mirror",
      w: 600,
      d: 60,
      h: 1650
    },
    desk: {
      name: "\u4E66\u684C",
      type: "desk",
      w: 1200,
      d: 600,
      h: 750
    },
    officeChair: {
      name: "\u529E\u516C\u6905",
      type: "officeChair",
      w: 600,
      d: 600,
      h: 1050
    },
    lDesk: {
      name: "L \u5F62\u4E66\u684C",
      type: "lDesk",
      w: 1600,
      d: 1400,
      h: 750
    },
    kidsDesk: {
      name: "\u513F\u7AE5\u5B66\u4E60\u684C",
      type: "desk",
      w: 1e3,
      d: 600,
      h: 700
    },
    gamingChair: {
      name: "\u7535\u7ADE\u6905",
      type: "officeChair",
      w: 700,
      d: 700,
      h: 1300
    },
    fileCabinet: {
      name: "\u6587\u4EF6\u67DC",
      type: "chest",
      w: 450,
      d: 550,
      h: 1050
    },
    bookshelf: {
      name: "\u4E66\u67B6",
      type: "bookshelf",
      w: 900,
      d: 350,
      h: 2e3
    },
    sofa: {
      name: "\u4E09\u4EBA\u6C99\u53D1",
      type: "sofa",
      w: 2200,
      d: 950,
      h: 820
    },
    lSofa: {
      name: "L \u5F62\u8F6C\u89D2\u6C99\u53D1",
      type: "lSofa",
      w: 2800,
      d: 1700,
      h: 820
    },
    loveseat: {
      name: "\u53CC\u4EBA\u6C99\u53D1",
      type: "sofa",
      w: 1600,
      d: 900,
      h: 820
    },
    uSofa: {
      name: "U \u5F62\u6C99\u53D1",
      type: "uSofa",
      w: 3200,
      d: 2e3,
      h: 820
    },
    curvedSofa: {
      name: "\u5F27\u5F62\u6C99\u53D1",
      type: "curvedSofa",
      w: 2600,
      d: 1100,
      h: 780
    },
    bendSofa: {
      name: "\u5F02\u5F62\u7EC4\u5408\u6C99\u53D1\uFF08\u66F2\u7EBF\u53EF\u8C03\uFF09",
      type: "bendSofa",
      w: 3200,
      d: 2200,
      h: 760
    },
    bendSofa_cornerChaise: {
      name: "\u8F6C\u89D2\u5F27\u5F62\u6C99\u53D1\uFF08\u5E26\u8D35\u5983\uFF09",
      type: "bendSofa",
      w: 2600,
      d: 3400,
      h: 760
    },
    bendSofa_roundL: {
      name: "\u5706\u89D2 L \u5F62\u6C99\u53D1",
      type: "bendSofa",
      w: 3200,
      d: 2400,
      h: 760
    },
    bendSofa_serpentine: {
      name: "S \u5F62\u86C7\u5F62\u6C99\u53D1",
      type: "bendSofa",
      w: 4200,
      d: 1900,
      h: 760
    },
    bendSofa_crescent: {
      name: "\u6708\u7259\u5F62\u6C99\u53D1",
      type: "bendSofa",
      w: 3e3,
      d: 1300,
      h: 760
    },
    chaise: {
      name: "\u8D35\u5983\u6905",
      type: "chaise",
      w: 1700,
      d: 750,
      h: 800
    },
    beanbag: {
      name: "\u61D2\u4EBA\u6C99\u53D1",
      type: "beanbag",
      w: 900,
      d: 900,
      h: 700
    },
    ottoman: {
      name: "\u5706\u811A\u51F3 / \u5750\u58A9",
      type: "ottoman",
      w: 550,
      d: 550,
      h: 420
    },
    rockingChair: {
      name: "\u6447\u6905",
      type: "rockingChair",
      w: 700,
      d: 950,
      h: 900
    },
    hangingChair: {
      name: "\u540A\u6905",
      type: "hangingChair",
      w: 1e3,
      d: 1e3,
      h: 1900
    },
    armchair: {
      name: "\u5355\u4EBA\u6C99\u53D1",
      type: "armchair",
      w: 850,
      d: 850,
      h: 800
    },
    coffeeTable: {
      name: "\u8336\u51E0",
      type: "coffeeTable",
      w: 1200,
      d: 600,
      h: 400
    },
    roundCoffee: {
      name: "\u5706\u8336\u51E0",
      type: "roundTable",
      w: 900,
      d: 900,
      h: 380
    },
    ovalCoffee: {
      name: "\u692D\u5706\u8336\u51E0",
      type: "ovalTable",
      w: 1300,
      d: 800,
      h: 380
    },
    tvCabinet: {
      name: "\u7535\u89C6\u67DC\uFF08\u7535\u89C6\u53EF\u5F00\u5173\uFF09",
      type: "tvCabinet",
      w: 2e3,
      d: 400,
      h: 450
    },
    diningTable: {
      name: "\u9910\u684C",
      type: "diningTable",
      w: 1600,
      d: 900,
      h: 750
    },
    longTable: {
      name: "\u957F\u9910\u684C\uFF088 \u4EBA\uFF09",
      type: "diningTable",
      w: 2400,
      d: 1e3,
      h: 750
    },
    roundTable: {
      name: "\u5706\u9910\u684C",
      type: "roundTable",
      w: 1300,
      d: 1300,
      h: 750
    },
    ovalTable: {
      name: "\u692D\u5706\u9910\u684C",
      type: "ovalTable",
      w: 2400,
      d: 1100,
      h: 750
    },
    booth: {
      name: "\u5361\u5EA7",
      type: "booth",
      w: 1800,
      d: 600,
      h: 1e3
    },
    diningBench: {
      name: "\u9910\u51F3",
      type: "bedBench",
      w: 1400,
      d: 350,
      h: 450
    },
    chair: {
      name: "\u9910\u6905",
      type: "chair",
      w: 460,
      d: 520,
      h: 880
    },
    sideboard: {
      name: "\u9910\u8FB9\u67DC",
      type: "sideboard",
      w: 1600,
      d: 400,
      h: 2200
    },
    wineCabinet: {
      name: "\u9152\u67DC",
      type: "wineCabinet",
      w: 900,
      d: 450,
      h: 2e3
    },
    displayCabinet: {
      name: "\u5C55\u793A\u67DC\uFF08\u73BB\u7483\u95E8\uFF09",
      type: "displayCabinet",
      w: 1e3,
      d: 400,
      h: 2e3
    },
    consoleTable: {
      name: "\u7384\u5173\u684C / \u8FB9\u684C",
      type: "consoleTable",
      w: 1200,
      d: 350,
      h: 800
    },
    fireplace: {
      name: "\u7535\u58C1\u7089",
      type: "fireplace",
      w: 1400,
      d: 400,
      h: 1100
    },
    fishTank: {
      name: "\u9C7C\u7F38",
      type: "fishTank",
      w: 1200,
      d: 450,
      h: 1300
    },
    projScreen: {
      name: "\u6295\u5F71\u5E55\u5E03",
      type: "projScreen",
      w: 2400,
      d: 80,
      h: 1500
    },
    speaker: {
      name: "\u843D\u5730\u97F3\u7BB1",
      type: "speaker",
      w: 300,
      d: 350,
      h: 1e3
    },
    screenDivider: {
      name: "\u5C4F\u98CE",
      type: "screenDivider",
      w: 1800,
      d: 40,
      h: 1800
    },
    kitchenIsland: {
      name: "\u4E2D\u5C9B\u53F0",
      type: "kitchenIsland",
      w: 1800,
      d: 900,
      h: 900
    },
    barStool: {
      name: "\u5427\u6905",
      type: "barStool",
      w: 400,
      d: 400,
      h: 750
    },
    shoeCabinet: {
      name: "\u978B\u67DC",
      type: "shoeCabinet",
      w: 1200,
      d: 350,
      h: 1e3
    },
    hallCabinet: {
      name: "\u7384\u5173\u67DC\uFF08\u4E2D\u7A7A\uFF09",
      type: "cabinet",
      w: 1200,
      d: 400,
      h: 2400
    },
    entryBench: {
      name: "\u6362\u978B\u51F3",
      type: "entryBench",
      w: 900,
      d: 350,
      h: 450
    },
    piano: {
      name: "\u7ACB\u5F0F\u94A2\u7434",
      type: "piano",
      w: 1500,
      d: 600,
      h: 1250
    },
    rug: {
      name: "\u5730\u6BEF",
      type: "rug",
      w: 2e3,
      d: 1700,
      h: 12
    },
    plant: {
      name: "\u7EFF\u690D",
      type: "plant",
      w: 500,
      d: 500,
      h: 1400
    },
    acWall: {
      name: "\u6302\u673A\u7A7A\u8C03",
      type: "acWall",
      w: 900,
      d: 260,
      h: 300
    },
    acFloor: {
      name: "\u67DC\u673A\u7A7A\u8C03",
      type: "acFloor",
      w: 520,
      d: 380,
      h: 1850
    },
    waterHeater: {
      name: "\u7535\u70ED\u6C34\u5668",
      type: "waterHeater",
      w: 800,
      d: 450,
      h: 450
    },
    miniHeater: {
      name: "\u5C0F\u53A8\u5B9D\uFF08\u53F0\u4E0B\u50A8\u6C34\u5F0F\uFF09",
      type: "waterHeater",
      w: 380,
      d: 320,
      h: 420
    },
    gasHeater: {
      name: "\u71C3\u6C14\u70ED\u6C34\u5668",
      type: "gasHeater",
      w: 360,
      d: 180,
      h: 600
    },
    waterDispenser: {
      name: "\u996E\u6C34\u673A",
      type: "waterDispenser",
      w: 320,
      d: 330,
      h: 1050
    },
    purifier: {
      name: "\u51C0\u6C34\u5668\uFF08\u53F0\u4E0B\uFF09",
      type: "purifier",
      w: 400,
      d: 200,
      h: 420
    },
    dishwasher: {
      name: "\u6D17\u7897\u673A",
      type: "dishwasher",
      w: 600,
      d: 600,
      h: 820
    },
    tallOven: {
      name: "\u7535\u5668\u9AD8\u67DC\uFF08\u84B8\u70E4\u7BB1\uFF09",
      type: "tallOven",
      w: 600,
      d: 600,
      h: 2200
    },
    hood: {
      name: "\u6CB9\u70DF\u673A",
      type: "hood",
      w: 900,
      d: 520,
      h: 550
    },
    microwave: {
      name: "\u5FAE\u6CE2\u7089",
      type: "microwave",
      w: 480,
      d: 380,
      h: 280
    },
    washer: {
      name: "\u6D17\u8863\u673A",
      type: "washer",
      w: 600,
      d: 600,
      h: 850
    },
    dryer: {
      name: "\u70D8\u5E72\u673A",
      type: "dryer",
      w: 600,
      d: 620,
      h: 850
    },
    wallTV: {
      name: "\u58C1\u6302\u7535\u89C6\uFF08\u53EF\u5F00\u5173\uFF09",
      type: "wallTV",
      w: 1450,
      d: 60,
      h: 830
    },
    airPurifier: {
      name: "\u7A7A\u6C14\u51C0\u5316\u5668",
      type: "airPurifier",
      w: 380,
      d: 250,
      h: 700
    },
    robotVac: {
      name: "\u626B\u5730\u673A\u5668\u4EBA\u57FA\u7AD9",
      type: "robotVac",
      w: 380,
      d: 420,
      h: 450
    },
    treadmill: {
      name: "\u8DD1\u6B65\u673A",
      type: "treadmill",
      w: 800,
      d: 1800,
      h: 1350
    },
    floorLamp: {
      name: "\u843D\u5730\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "floorLamp",
      w: 400,
      d: 400,
      h: 1650
    },
    deskLamp: {
      name: "\u53F0\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "deskLamp",
      w: 250,
      d: 250,
      h: 450
    },
    curtain: {
      name: "\u843D\u5730\u7A97\u5E18\uFF08\u53EF\u5F00\u5408\uFF09",
      type: "curtain",
      w: 2400,
      d: 160,
      h: 2650
    },
    sheer: {
      name: "\u7EB1\u5E18\uFF08\u53EF\u5F00\u5408\uFF09",
      type: "curtain",
      w: 2400,
      d: 120,
      h: 2650
    },
    bigPlant: {
      name: "\u5927\u578B\u7EFF\u690D",
      type: "plant",
      w: 800,
      d: 800,
      h: 1800
    },
    smallPlant: {
      name: "\u5C0F\u76C6\u683D",
      type: "plant",
      w: 300,
      d: 300,
      h: 500
    },
    hangingPlant: {
      name: "\u540A\u5170\uFF08\u5438\u9876\uFF09",
      type: "hangingPlant",
      w: 400,
      d: 400,
      h: 600
    },
    floorVase: {
      name: "\u843D\u5730\u82B1\u74F6",
      type: "vase",
      w: 350,
      d: 350,
      h: 900
    },
    wallPanel: {
      name: "\u5899\u9762\u9020\u578B\u677F",
      type: "wallPanel",
      w: 2400,
      d: 60,
      h: 2600
    },
    wallArt: {
      name: "\u88C5\u9970\u753B",
      type: "wallArt",
      w: 900,
      d: 40,
      h: 650
    },
    wallArt3: {
      name: "\u88C5\u9970\u753B\uFF08\u4E09\u8054\uFF09",
      type: "wallArt",
      w: 1500,
      d: 40,
      h: 600
    },
    wallClock: {
      name: "\u6302\u949F",
      type: "clock",
      w: 400,
      d: 50,
      h: 400
    },
    roundRug: {
      name: "\u5706\u5730\u6BEF",
      type: "rugRound",
      w: 2e3,
      d: 2e3,
      h: 12
    },
    doormat: {
      name: "\u95E8\u53E3\u5730\u57AB",
      type: "rug",
      w: 900,
      d: 600,
      h: 10
    },
    fan: {
      name: "\u843D\u5730\u6247",
      type: "fan",
      w: 400,
      d: 400,
      h: 1200
    },
    radiator: {
      name: "\u6696\u6C14\u7247",
      type: "radiator",
      w: 1e3,
      d: 100,
      h: 600
    },
    cabWardrobe: {
      name: "\u5B9A\u5236\u8863\u67DC",
      type: "cabinet",
      w: 2400,
      d: 600,
      h: 2600
    },
    cabSlide: {
      name: "\u63A8\u62C9\u95E8\u8863\u67DC",
      type: "cabinet",
      w: 2e3,
      d: 650,
      h: 2600
    },
    cabCorner: {
      name: "\u8F6C\u89D2\u8863\u67DC\uFF08L \u5F62\uFF09",
      type: "cabinet",
      w: 2400,
      d: 1800,
      h: 2600
    },
    cabShoe: {
      name: "\u5B9A\u5236\u978B\u67DC\uFF08\u4E2D\u7A7A\uFF09",
      type: "cabinet",
      w: 1200,
      d: 380,
      h: 2400
    },
    cabSideboard: {
      name: "\u5B9A\u5236\u9910\u8FB9\u67DC",
      type: "cabinet",
      w: 1800,
      d: 400,
      h: 2400
    },
    cabTall: {
      name: "\u4E66\u67DC / \u9AD8\u67DC",
      type: "cabinet",
      w: 1200,
      d: 400,
      h: 2400
    },
    cabBase: {
      name: "\u5730\u67DC",
      type: "cabinet",
      w: 1600,
      d: 600,
      h: 850
    },
    cabWall: {
      name: "\u540A\u67DC",
      type: "cabinet",
      w: 1600,
      d: 350,
      h: 700
    },
    cabTV: {
      name: "\u60AC\u7A7A\u7535\u89C6\u67DC",
      type: "cabinet",
      w: 2400,
      d: 400,
      h: 400
    },
    counter: {
      name: "\u4E00\u5B57\u6A71\u67DC\uFF08\u53EF\u5B9A\u5236\uFF09",
      type: "counter",
      w: 2100,
      d: 600,
      h: 900
    },
    fridge: {
      name: "\u51B0\u7BB1",
      type: "fridge",
      w: 700,
      d: 700,
      h: 1850
    },
    fridgeDouble: {
      name: "\u5BF9\u5F00\u95E8\u51B0\u7BB1",
      type: "fridge",
      w: 910,
      d: 720,
      h: 1780
    },
    fridgeFrench: {
      name: "\u6CD5\u5F0F\u591A\u95E8\u51B0\u7BB1",
      type: "fridge",
      w: 830,
      d: 700,
      h: 1900
    },
    lCounter: {
      name: "L \u5F62\u6A71\u67DC\uFF08\u53EF\u5B9A\u5236\uFF09",
      type: "lCounter",
      w: 2400,
      d: 1800,
      h: 900
    },
    uCounter: {
      name: "U \u5F62\u6A71\u67DC\uFF08\u53EF\u5B9A\u5236\uFF09",
      type: "uCounter",
      w: 2700,
      d: 2100,
      h: 900
    },
    freezer: {
      name: "\u51B0\u67DC",
      type: "freezer",
      w: 1e3,
      d: 600,
      h: 850
    },
    trashBin: {
      name: "\u5783\u573E\u6876",
      type: "bin",
      w: 300,
      d: 300,
      h: 600
    },
    toilet: {
      name: "\u9A6C\u6876",
      type: "toilet",
      w: 400,
      d: 700,
      h: 780
    },
    wallToilet: {
      name: "\u58C1\u6302\u9A6C\u6876",
      type: "toilet",
      w: 380,
      d: 550,
      h: 400
    },
    squatToilet: {
      name: "\u8E72\u4FBF\u5668",
      type: "squat",
      w: 450,
      d: 600,
      h: 200
    },
    vanity: {
      name: "\u6D74\u5BA4\u67DC\uFF08\u542B\u955C\uFF09",
      type: "vanity",
      w: 800,
      d: 500,
      h: 850
    },
    mirrorCabinet: {
      name: "\u955C\u67DC",
      type: "mirrorCabinet",
      w: 800,
      d: 150,
      h: 700
    },
    doubleVanity: {
      name: "\u53CC\u76C6\u6D74\u5BA4\u67DC",
      type: "vanity",
      w: 1400,
      d: 550,
      h: 850
    },
    pedestalSink: {
      name: "\u7ACB\u67F1\u76C6",
      type: "pedestalSink",
      w: 500,
      d: 450,
      h: 850
    },
    freeTub: {
      name: "\u72EC\u7ACB\u6D74\u7F38",
      type: "freeTub",
      w: 1700,
      d: 800,
      h: 620
    },
    bathShelf: {
      name: "\u7F6E\u7269\u67B6",
      type: "shelfRack",
      w: 600,
      d: 250,
      h: 1600
    },
    shower: {
      name: "\u6DCB\u6D74\u623F",
      type: "shower",
      w: 900,
      d: 900,
      h: 2e3
    },
    showerScreen: {
      name: "\u4E00\u5B57\u6DCB\u6D74\u9694\u65AD",
      type: "showerScreen",
      w: 1200,
      d: 80,
      h: 2e3
    },
    bathtub: {
      name: "\u6D74\u7F38",
      type: "bathtub",
      w: 1600,
      d: 750,
      h: 600
    },
    showerSet: {
      name: "\u5D4C\u5165\u5F0F\u6052\u6E29\u6DCB\u6D74",
      type: "showerSet",
      w: 900,
      d: 200,
      h: 1100
    },
    towelWarmer: {
      name: "\u7535\u70ED\u6BDB\u5DFE\u67B6",
      type: "towelWarmer",
      w: 500,
      d: 100,
      h: 800
    },
    bathHeater: {
      name: "\u98CE\u6696\u6D74\u9738\uFF08\u5438\u9876\uFF09",
      type: "bathHeater",
      w: 300,
      d: 300,
      h: 160
    },
    laundrySink: {
      name: "\u6D17\u8863\u6C60\u67DC",
      type: "laundrySink",
      w: 700,
      d: 550,
      h: 850
    },
    clothesRack: {
      name: "\u5347\u964D\u667E\u8863\u67B6\uFF08\u5438\u9876\uFF09",
      type: "clothesRack",
      w: 2400,
      d: 450,
      h: 500
    },
    lounge: {
      name: "\u4F11\u95F2\u6905",
      type: "lounge",
      w: 700,
      d: 750,
      h: 800
    },
    sideTable: {
      name: "\u8FB9\u51E0",
      type: "sideTable",
      w: 500,
      d: 500,
      h: 550
    },
    island: {
      name: "\u8863\u5E3D\u5C9B\u53F0",
      type: "island",
      w: 1200,
      d: 600,
      h: 900
    },
    stairU: {
      name: "U \u5F62\u4E09\u8DD1\u697C\u68AF",
      type: "stairU",
      w: 3300,
      d: 2400,
      h: 3320
    },
    stairRun: {
      name: "\u76F4\u8DD1\u68AF\u6BB5",
      type: "stairRun",
      w: 1100,
      d: 3e3,
      h: 1700
    },
    stairLanding: {
      name: "\u697C\u68AF\u5E73\u53F0",
      type: "stairRun",
      w: 1100,
      d: 1100,
      h: 1700
    },
    elevator: {
      name: "\u5BB6\u7528\u7535\u68AF\uFF08\u6F2B\u6E38\u65F6\u53EF\u4E58\u5750\uFF09",
      type: "elevator",
      w: 910,
      d: 1160,
      h: 2600
    },
    stairDogleg: {
      name: "\u53CC\u8DD1\u6247\u5F62\u8F6C\u89D2\u697C\u68AF",
      type: "stairDogleg",
      w: 2400,
      d: 3600,
      h: 3150
    },
    riser: {
      name: "\u7ACB\u7BA1\uFF08\u6392\u6C34 / \u96E8\u6C34 \u03A6110\uFF0C\u901A\u9AD8\uFF09",
      type: "riser",
      w: 110,
      d: 110,
      h: 2800
    },
    acOutdoor: {
      name: "\u7A7A\u8C03\u5BA4\u5916\u673A",
      type: "acOutdoor",
      w: 850,
      d: 320,
      h: 600
    },
    louver: {
      name: "\u767E\u53F6\uFF08\u7A7A\u8C03\u4F4D / \u98CE\u4E95\uFF09",
      type: "louver",
      w: 1e3,
      d: 60,
      h: 1800
    },
    meterBox: {
      name: "\u7535\u8868\u7BB1 / \u914D\u7EBF\u7BB1\uFF08\u4E95\u9053\uFF09",
      type: "meterBox",
      w: 500,
      d: 160,
      h: 700
    },
    cornerShelf: {
      name: "\u659C\u89D2\u5F00\u653E\u5C55\u793A\u683C\uFF08\u4E09\u89D2\u591A\u5C42\uFF09",
      type: "cornerShelf",
      w: 450,
      d: 450,
      h: 1800
    },
    modularSofa: {
      name: "\u6A21\u5757\u6C99\u53D1\uFF08\u6309\u683C\u6570\uFF0C\u53EF\u5E26\u811A\u8E0F\uFF09",
      type: "modularSofa",
      w: 2700,
      d: 1e3,
      h: 760
    },
    bayDeck: {
      name: "\u5BA4\u5185\u98D8\u7A97\u53F0\uFF08450 \u9AD8\u53F0\u9762\uFF09",
      type: "bayDeck",
      w: 1800,
      d: 550,
      h: 450
    },
    plushToy: {
      name: "\u6BDB\u7ED2\u73A9\u5076",
      type: "plushToy",
      w: 300,
      d: 250,
      h: 380
    },
    tableVase: {
      name: "\u82B1\u74F6\uFF08\u684C\u9762\u6446\u4EF6\uFF09",
      type: "tableVase",
      w: 180,
      d: 180,
      h: 350
    },
    bookSet: {
      name: "\u4E66\u6446\uFF08\u4E00\u6392\u4E66 + \u4E66\u7ACB\uFF09",
      type: "bookSet",
      w: 400,
      d: 220,
      h: 260
    },
    car: {
      name: "\u8F7F\u8F66",
      type: "car",
      w: 1850,
      d: 4800,
      h: 1450
    },
    suv: {
      name: "SUV",
      type: "car",
      w: 1950,
      d: 4900,
      h: 1750
    },
    evCharger: {
      name: "\u5145\u7535\u6869\uFF08\u58C1\u6302 7kW\uFF09",
      type: "evCharger",
      w: 300,
      d: 150,
      h: 450
    },
    carport: {
      name: "\u8F66\u68DA\uFF08\u5355\u8F66\u4F4D\uFF09",
      type: "carport",
      w: 3200,
      d: 5600,
      h: 2600
    },
    carport2: {
      name: "\u8F66\u68DA\uFF08\u53CC\u8F66\u4F4D\uFF09",
      type: "carport",
      w: 6e3,
      d: 5600,
      h: 2600
    },
    garageShelf: {
      name: "\u8F66\u5E93\u50A8\u7269\u67B6",
      type: "garageShelf",
      w: 1800,
      d: 500,
      h: 2e3
    },
    workbench: {
      name: "\u5DE5\u5177\u53F0 + \u6D1E\u6D1E\u677F",
      type: "workbench",
      w: 1800,
      d: 650,
      h: 1800
    },
    bicycle: {
      name: "\u81EA\u884C\u8F66",
      type: "bicycle",
      w: 600,
      d: 1750,
      h: 1050
    },
    pool: {
      name: "\u6CF3\u6C60",
      type: "pool",
      w: 3500,
      d: 8e3,
      h: 60
    },
    lawn: {
      name: "\u8349\u576A",
      type: "lawn",
      w: 4e3,
      d: 4e3,
      h: 15
    },
    stepStones: {
      name: "\u6C40\u6B65 / \u77F3\u677F\u8DEF",
      type: "stepStones",
      w: 600,
      d: 3600,
      h: 30
    },
    tree: {
      name: "\u5EAD\u9662\u4E54\u6728",
      type: "tree",
      w: 2600,
      d: 2600,
      h: 4500
    },
    shrub: {
      name: "\u704C\u6728\u7403",
      type: "shrub",
      w: 900,
      d: 900,
      h: 800
    },
    gazebo: {
      name: "\u51C9\u4EAD",
      type: "gazebo",
      w: 3200,
      d: 3200,
      h: 3e3
    },
    parasol: {
      name: "\u906E\u9633\u4F1E + \u684C\u6905",
      type: "parasol",
      w: 2800,
      d: 2800,
      h: 2500
    },
    sunLounger: {
      name: "\u6CF3\u6C60\u8EBA\u6905",
      type: "sunLounger",
      w: 700,
      d: 1950,
      h: 450
    },
    swing: {
      name: "\u5EAD\u9662\u79CB\u5343",
      type: "swing",
      w: 2e3,
      d: 1300,
      h: 2100
    },
    bbq: {
      name: "\u6237\u5916\u70E7\u70E4\u53F0",
      type: "bbq",
      w: 1600,
      d: 650,
      h: 950
    },
    waterFeature: {
      name: "\u53E0\u6C34\u666F\u5899",
      type: "waterFeature",
      w: 1600,
      d: 600,
      h: 1500
    },
    fence: {
      name: "\u5EAD\u9662\u56F4\u680F",
      type: "fence",
      w: 2e3,
      d: 60,
      h: 1200
    },
    gate: {
      name: "\u5EAD\u9662\u5927\u95E8",
      type: "gate",
      w: 3e3,
      d: 150,
      h: 1800
    },
    lawnLamp: {
      name: "\u8349\u576A\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "lawnLamp",
      w: 200,
      d: 200,
      h: 650
    },
    billiards: {
      name: "\u53F0\u7403\u684C",
      type: "billiards",
      w: 1600,
      d: 2850,
      h: 800
    },
    mahjong: {
      name: "\u81EA\u52A8\u9EBB\u5C06\u684C",
      type: "mahjong",
      w: 950,
      d: 950,
      h: 780
    },
    teaTable: {
      name: "\u8336\u53F0",
      type: "teaTable",
      w: 1800,
      d: 800,
      h: 700
    },
    theaterSofa: {
      name: "\u5F71\u9662\u6C99\u53D1\uFF08\u4E09\u8FDE\u5EA7\uFF09",
      type: "theaterSofa",
      w: 2600,
      d: 1e3,
      h: 1e3
    },
    grandPiano: {
      name: "\u4E09\u89D2\u94A2\u7434",
      type: "grandPiano",
      w: 1550,
      d: 1900,
      h: 1e3
    },
    barCounter: {
      name: "\u5427\u53F0\uFF08\u5E26\u6C34\u69FD\uFF09",
      type: "barCounter",
      w: 2400,
      d: 650,
      h: 1100
    },
    sauna: {
      name: "\u6851\u62FF\u623F",
      type: "sauna",
      w: 1500,
      d: 1500,
      h: 2100
    },
    chandelier: {
      name: "\u6311\u7A7A\u6C34\u6676\u5927\u540A\u706F",
      type: "chandelier",
      w: 1200,
      d: 1200,
      h: 1600
    },
    boiler: {
      name: "\u58C1\u6302\u7089\uFF08\u5730\u6696 + \u70ED\u6C34\uFF09",
      type: "boiler",
      w: 450,
      d: 350,
      h: 750
    },
    manifold: {
      name: "\u5730\u6696\u5206\u96C6\u6C34\u5668",
      type: "manifold",
      w: 800,
      d: 120,
      h: 450
    },
    waterSoftener: {
      name: "\u4E2D\u592E\u8F6F\u6C34\u673A",
      type: "waterSoftener",
      w: 350,
      d: 450,
      h: 1100
    },
    trainingTable: {
      name: "\u57F9\u8BAD\u684C",
      type: "trainingTable",
      w: 1200,
      d: 450,
      h: 750
    },
    curveTrainingTable: {
      name: "\u5F27\u5F62\u57F9\u8BAD\u684C",
      type: "curveTrainingTable",
      w: 3e3,
      d: 600,
      h: 750
    },
    conferenceTable: {
      name: "\u4F1A\u8BAE\u684C",
      type: "diningTable",
      w: 3600,
      d: 1200,
      h: 750
    },
    trainingChair: {
      name: "\u57F9\u8BAD\u6905",
      type: "chair",
      w: 500,
      d: 500,
      h: 830
    },
    lectern: {
      name: "\u53EF\u5347\u964D\u8BB2\u53F0",
      type: "lectern",
      w: 900,
      d: 650,
      h: 1100
    },
    stage: {
      name: "\u57F9\u8BAD\u5BA4\u5730\u53F0",
      type: "stage",
      w: 6e3,
      d: 2400,
      h: 300
    },
    slidingBoard: {
      name: "\u4E0A\u4E0B\u5347\u964D\u9ED1\u677F",
      type: "slidingBoard",
      w: 4e3,
      d: 180,
      h: 2300
    },
    mobileDisplay: {
      name: "\u79FB\u52A8\u4F1A\u8BAE\u5E73\u677F",
      type: "mobileDisplay",
      w: 1700,
      d: 650,
      h: 1850
    },
    printer: {
      name: "\u529E\u516C\u590D\u5408\u6253\u5370\u673A",
      type: "printer",
      w: 650,
      d: 650,
      h: 1100
    },
    coffeeMachine: {
      name: "\u5496\u5561\u673A",
      type: "coffeeMachine",
      w: 450,
      d: 450,
      h: 550
    },
    urinal: {
      name: "\u58C1\u6302\u5C0F\u4FBF\u5668",
      type: "urinal",
      w: 410,
      d: 360,
      h: 650
    },
    serviceSink: {
      name: "\u6E05\u6D01\u62D6\u5E03\u6C60",
      type: "serviceSink",
      w: 600,
      d: 500,
      h: 600
    },
    wifiAP: {
      name: "\u5438\u9876\u65E0\u7EBF AP",
      type: "wifiAP",
      w: 220,
      d: 220,
      h: 45
    },
    ceilingSpeaker: {
      name: "\u5D4C\u5165\u5F0F\u626C\u58F0\u5668",
      type: "ceilingSpeaker",
      w: 240,
      d: 240,
      h: 70
    },
    supplyVent: {
      name: "\u7A7A\u8C03\u9001\u98CE\u53E3 A/S",
      type: "airVent",
      w: 600,
      d: 300,
      h: 60
    },
    returnVent: {
      name: "\u7A7A\u8C03\u56DE\u98CE\u53E3 A/R",
      type: "airVent",
      w: 600,
      d: 300,
      h: 60
    },
    outdoorSet: {
      name: "\u6237\u5916\u684C\u6905",
      type: "outdoorSet",
      w: 1600,
      d: 1600,
      h: 750
    },
    plantShelf: {
      name: "\u82B1\u67B6",
      type: "plantShelf",
      w: 1e3,
      d: 350,
      h: 1200
    },
    bike: {
      name: "\u52A8\u611F\u5355\u8F66",
      type: "bike",
      w: 550,
      d: 1100,
      h: 1200
    },
    yogaMat: {
      name: "\u745C\u4F3D\u57AB",
      type: "yogaMat",
      w: 610,
      d: 1830,
      h: 6
    },
    catTree: {
      name: "\u732B\u722C\u67B6",
      type: "catTree",
      w: 600,
      d: 600,
      h: 1600
    },
    petBed: {
      name: "\u5BA0\u7269\u7A9D",
      type: "petBed",
      w: 700,
      d: 550,
      h: 250
    },
    fourSofa: {
      name: "\u56DB\u4EBA\u6C99\u53D1",
      type: "sofa",
      w: 2800,
      d: 1e3,
      h: 820
    },
    singleSofa: {
      name: "\u5355\u4EBA\u4F4D\u6C99\u53D1",
      type: "sofa",
      w: 1e3,
      d: 900,
      h: 820
    },
    chaiseSofa: {
      name: "\u8D35\u5983\u4F4D\u6C99\u53D1\uFF082.6m\uFF09",
      type: "lSofa",
      w: 2600,
      d: 1600,
      h: 820
    },
    readingChair: {
      name: "\u9605\u8BFB\u6905",
      type: "armchair",
      w: 750,
      d: 800,
      h: 950
    },
    nestTables: {
      name: "\u7EC4\u5408\u5706\u8336\u51E0\uFF08\u5C0F\uFF09",
      type: "roundTable",
      w: 600,
      d: 600,
      h: 450
    },
    diningTable4: {
      name: "\u56DB\u4EBA\u9910\u684C",
      type: "diningTable",
      w: 1200,
      d: 800,
      h: 750
    },
    diningTable6: {
      name: "\u516D\u4EBA\u9910\u684C",
      type: "diningTable",
      w: 1800,
      d: 900,
      h: 750
    },
    roundTable10: {
      name: "\u5706\u9910\u684C\uFF0810 \u4EBA\uFF09",
      type: "roundTable",
      w: 1800,
      d: 1800,
      h: 760
    },
    barTable: {
      name: "\u5427\u53F0\u684C\uFF08\u9AD8\u684C\uFF09",
      type: "diningTable",
      w: 1400,
      d: 500,
      h: 1050
    },
    armDiningChair: {
      name: "\u6276\u624B\u9910\u6905",
      type: "chair",
      w: 560,
      d: 560,
      h: 820
    },
    kingBed: {
      name: "\u53CC\u4EBA\u5E8A 2.2m\uFF08King\uFF09",
      type: "bed",
      w: 2200,
      d: 2200,
      h: 1100
    },
    kidsBed: {
      name: "\u513F\u7AE5\u5E8A 1.0m",
      type: "bed",
      w: 1e3,
      d: 1900,
      h: 900
    },
    dayBed: {
      name: "\u7F57\u6C49\u5E8A / \u5367\u69BB",
      type: "chaise",
      w: 1900,
      d: 800,
      h: 750
    },
    wardrobe2: {
      name: "\u4E24\u95E8\u8863\u67DC 1.0m",
      type: "wardrobe",
      w: 1e3,
      d: 600,
      h: 2200
    },
    wardrobe3: {
      name: "\u4E09\u95E8\u8863\u67DC 1.5m",
      type: "wardrobe",
      w: 1500,
      d: 600,
      h: 2300
    },
    toyCabinet: {
      name: "\u513F\u7AE5\u73A9\u5177\u67DC",
      type: "chest",
      w: 900,
      d: 350,
      h: 800
    },
    playMat: {
      name: "\u513F\u7AE5\u722C\u884C\u57AB",
      type: "rug",
      w: 1800,
      d: 1500,
      h: 15
    },
    standingDesk: {
      name: "\u5347\u964D\u4E66\u684C 1.4m",
      type: "desk",
      w: 1400,
      d: 700,
      h: 750
    },
    bookshelfLow: {
      name: "\u77EE\u4E66\u67B6",
      type: "bookshelf",
      w: 1200,
      d: 300,
      h: 900
    },
    officeDesk: {
      name: "\u529E\u516C\u684C 1.4m",
      type: "desk",
      w: 1400,
      d: 700,
      h: 750
    },
    deskBench2: {
      name: "\u5DE5\u4F4D\uFF08\u4E24\u4EBA\u4F4D\uFF09",
      type: "trainingTable",
      w: 2400,
      d: 700,
      h: 750
    },
    deskBench4: {
      name: "\u5DE5\u4F4D\uFF08\u56DB\u4EBA\u4F4D\u5BF9\u5750\uFF09",
      type: "trainingTable",
      w: 2400,
      d: 1400,
      h: 750
    },
    bossDesk: {
      name: "\u5927\u73ED\u53F0",
      type: "lDesk",
      w: 2200,
      d: 1900,
      h: 760
    },
    roundMeeting: {
      name: "\u5706\u5F62\u6D3D\u8C08\u684C",
      type: "roundTable",
      w: 1e3,
      d: 1e3,
      h: 750
    },
    reception: {
      name: "\u524D\u53F0\u63A5\u5F85\u53F0",
      type: "barCounter",
      w: 2400,
      d: 800,
      h: 1100
    },
    lockers: {
      name: "\u50A8\u7269\u67DC / \u66F4\u8863\u67DC",
      type: "cabinet",
      w: 1200,
      d: 450,
      h: 1850
    },
    officeSofa: {
      name: "\u529E\u516C\u63A5\u5F85\u6C99\u53D1",
      type: "sofa",
      w: 1800,
      d: 800,
      h: 780
    },
    whiteboard: {
      name: "\u79FB\u52A8\u767D\u677F",
      type: "slidingBoard",
      w: 1800,
      d: 150,
      h: 1900
    },
    pantryCounter: {
      name: "\u8336\u6C34\u95F4\u53F0\u9762\uFF08\u4E00\u5B57\uFF09",
      type: "counter",
      w: 2e3,
      d: 600,
      h: 850
    },
    shoeBench: {
      name: "\u7A7F\u978B\u51F3\uFF08\u957F\uFF09",
      type: "entryBench",
      w: 1200,
      d: 380,
      h: 450
    },
    wineFridge: {
      name: "\u7EA2\u9152\u67DC / \u5D4C\u5165\u51B0\u5427",
      type: "fridge",
      w: 600,
      d: 600,
      h: 850
    },
    kitchenTrolley: {
      name: "\u53A8\u623F\u5C0F\u63A8\u8F66",
      type: "shelfRack",
      w: 450,
      d: 350,
      h: 800
    },
    arcLamp: {
      name: "\u9493\u9C7C\u706F\uFF08\u843D\u5730\uFF09",
      type: "floorLamp",
      w: 450,
      d: 1300,
      h: 1900
    },
    ductAC: {
      name: "\u98CE\u7BA1\u673A\u5185\u673A\uFF08\u85CF\u540A\u9876\u5185\uFF09",
      type: "ductAC",
      w: 1e3,
      d: 500,
      h: 250
    },
    linearVent: {
      name: "\u7EBF\u6027\u51FA\u98CE\u53E3\uFF08\u4E0B\u51FA\u98CE\uFF09",
      type: "linearVent",
      w: 1500,
      d: 150,
      h: 40
    },
    linearVentSide: {
      name: "\u4FA7\u51FA\u98CE\u53E3\uFF08\u8FB9\u540A\u4FA7\u9762\uFF09",
      type: "linearVent",
      w: 1500,
      d: 60,
      h: 120
    },
    linearReturn: {
      name: "\u56DE\u98CE\u53E3\uFF08\u5E26\u68C0\u4FEE\u53E3\uFF09",
      type: "linearVent",
      w: 1200,
      d: 300,
      h: 40
    },
    cassetteAC: {
      name: "\u5929\u82B1\u673A\uFF08\u56DB\u9762\u51FA\u98CE\uFF09",
      type: "cassetteAC",
      w: 840,
      d: 840,
      h: 250
    },
    vrfOutdoor: {
      name: "\u591A\u8054\u673A\u5BA4\u5916\u673A\uFF08\u53CC\u98CE\u6247\uFF09",
      type: "vrfOutdoor",
      w: 940,
      d: 370,
      h: 1380
    },
    freshAirUnit: {
      name: "\u65B0\u98CE\u4E3B\u673A\uFF08\u5168\u70ED\u4EA4\u6362\uFF0C\u540A\u9876\u5185\uFF09",
      type: "freshAirUnit",
      w: 800,
      d: 600,
      h: 270
    },
    thermostat: {
      name: "\u6E29\u63A7\u9762\u677F",
      type: "thermostat",
      w: 86,
      d: 15,
      h: 86
    },
    heatPump: {
      name: "\u7A7A\u6C14\u80FD\u70ED\u6CF5\u5916\u673A",
      type: "acOutdoor",
      w: 1e3,
      d: 400,
      h: 760
    },
    bufferTank: {
      name: "\u7F13\u51B2\u6C34\u7BB1 / \u50A8\u70ED\u6C34\u7BB1",
      type: "tank",
      w: 500,
      d: 500,
      h: 1500
    },
    centralPurifier: {
      name: "\u4E2D\u592E\u51C0\u6C34\u673A",
      type: "waterSoftener",
      w: 350,
      d: 300,
      h: 1200
    },
    preFilter: {
      name: "\u524D\u7F6E\u8FC7\u6EE4\u5668",
      type: "preFilter",
      w: 180,
      d: 150,
      h: 450
    },
    dehumidifier: {
      name: "\u9664\u6E7F\u673A",
      type: "airPurifier",
      w: 400,
      d: 300,
      h: 650
    },
    floorHeat: {
      name: "\u5730\u6696\u76D8\u7BA1\uFF08\u94FA\u6EE1\u623F\u95F4\uFF0C\u9009\u4E2D\u540E\u62C9\u5927\uFF09",
      type: "floorHeat",
      w: 3e3,
      d: 3e3,
      h: 5
    },
    linearPendant: {
      name: "\u7EBF\u6027\u540A\u706F\uFF08\u9910\u5385\uFF0C\u53EF\u70B9\u4EAE\uFF09",
      type: "linearPendant",
      w: 1200,
      d: 80,
      h: 800
    },
    ceilLamp: {
      name: "\u5438\u9876\u706F\uFF08\u5976\u6CB9\u5706\u5F62\uFF0C\u53EF\u70B9\u4EAE\uFF09",
      type: "ceilLamp",
      w: 600,
      d: 600,
      h: 90
    },
    ceilingFan: {
      name: "\u98CE\u6247\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "ceilingFan",
      w: 1320,
      d: 1320,
      h: 420
    },
    bubblePendant: {
      name: "\u6CE1\u6CE1\u540A\u706F / \u9B54\u8C46\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "bubblePendant",
      w: 900,
      d: 900,
      h: 900
    },
    gardenLamp: {
      name: "\u5EAD\u9662\u706F\uFF082.8m\uFF0C\u53EF\u70B9\u4EAE\uFF09",
      type: "gardenLamp",
      w: 380,
      d: 380,
      h: 2800
    },
    inGround: {
      name: "\u5730\u57CB\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "inGround",
      w: 140,
      d: 140,
      h: 20
    },
    wallWasher: {
      name: "\u6237\u5916\u58C1\u706F\uFF08\u53EF\u70B9\u4EAE\uFF09",
      type: "wallWasher",
      w: 160,
      d: 140,
      h: 260
    },
    integratedStove: {
      name: "\u96C6\u6210\u7076\uFF08\u4E0B\u6392\u6CB9\u70DF\uFF09",
      type: "integratedStove",
      w: 900,
      d: 600,
      h: 850
    },
    washerTower: {
      name: "\u6D17\u70D8\u5957\u88C5\uFF08\u53E0\u653E\uFF09",
      type: "washerTower",
      w: 600,
      d: 650,
      h: 1750
    },
    builtinFridge: {
      name: "\u5D4C\u5165\u5F0F\u51B0\u7BB1 0.6m",
      type: "fridge",
      w: 600,
      d: 600,
      h: 1780
    },
    smartToilet: {
      name: "\u667A\u80FD\u9A6C\u6876\uFF08\u4E00\u4F53\u673A\uFF09",
      type: "toilet",
      w: 400,
      d: 700,
      h: 500
    },
    ledMirror: {
      name: "\u667A\u80FD\u6D74\u955C\uFF08\u80CC\u5149\uFF0C\u53EF\u70B9\u4EAE\uFF09",
      type: "ledMirror",
      w: 800,
      d: 40,
      h: 1e3
    },
    projector: {
      name: "\u540A\u88C5\u6295\u5F71\u4EEA",
      type: "projector",
      w: 400,
      d: 320,
      h: 130
    },
    hedge: {
      name: "\u7EFF\u7BF1\uFF08\u4FEE\u526A\u6210\u5F62\uFF09",
      type: "hedge",
      w: 2e3,
      d: 600,
      h: 900
    },
    flowerBed: {
      name: "\u7816\u780C\u82B1\u575B",
      type: "flowerBed",
      w: 1600,
      d: 800,
      h: 450
    },
    planterBox: {
      name: "\u82B1\u7BB1\uFF08\u6728\u8D28\uFF09",
      type: "planterBox",
      w: 1e3,
      d: 400,
      h: 500
    },
    palm: {
      name: "\u68D5\u6988 / \u6930\u6811",
      type: "palm",
      w: 2400,
      d: 2400,
      h: 5e3
    },
    bamboo: {
      name: "\u7AF9\u5B50\uFF08\u4E00\u4E1B\uFF09",
      type: "bamboo",
      w: 1500,
      d: 600,
      h: 4e3
    },
    rock: {
      name: "\u666F\u89C2\u77F3",
      type: "rock",
      w: 1200,
      d: 800,
      h: 700
    },
    pergola: {
      name: "\u82B1\u67B6\u5ECA / \u8461\u8404\u67B6",
      type: "pergola",
      w: 3e3,
      d: 3e3,
      h: 2600
    },
    outdoorSofa: {
      name: "\u6237\u5916\u85E4\u7F16\u6C99\u53D1\u7EC4",
      type: "outdoorSofa",
      w: 2600,
      d: 2e3,
      h: 750
    },
    hammock: {
      name: "\u540A\u5E8A\uFF08\u5E26\u652F\u67B6\uFF09",
      type: "hammock",
      w: 3e3,
      d: 1e3,
      h: 1200
    },
    kidsSlide: {
      name: "\u513F\u7AE5\u6ED1\u68AF",
      type: "kidsSlide",
      w: 1e3,
      d: 2600,
      h: 1500
    },
    dogHouse: {
      name: "\u72D7\u5C4B",
      type: "dogHouse",
      w: 800,
      d: 1e3,
      h: 900
    },
    firePit: {
      name: "\u6237\u5916\u706B\u76C6",
      type: "firePit",
      w: 1e3,
      d: 1e3,
      h: 400
    },
    outdoorSink: {
      name: "\u6237\u5916\u6D17\u624B\u6C60",
      type: "serviceSink",
      w: 600,
      d: 500,
      h: 850
    },
    landLawn: {
      name: "\u8349\u576A\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 4e3,
      d: 3e3,
      h: 30
    },
    landGravel: {
      name: "\u788E\u77F3 / \u783E\u77F3\u94FA\u5730\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 3e3,
      d: 1500,
      h: 30
    },
    landPaver: {
      name: "\u77F3\u6750\u94FA\u88C5\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 3e3,
      d: 2e3,
      h: 40
    },
    landDeck: {
      name: "\u6237\u5916\u6728\u5E73\u53F0\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 3e3,
      d: 2400,
      h: 150
    },
    landWater: {
      name: "\u6C34\u666F / \u9C7C\u6C60\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 2500,
      d: 1800,
      h: 20
    },
    landBed: {
      name: "\u82B1\u5883 / \u79CD\u690D\u6C60\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 2400,
      d: 1200,
      h: 120
    },
    ceilZone: {
      name: "\u5C40\u90E8\u540A\u9876\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 2400,
      d: 1800,
      h: 150
    },
    ceilZoneCove: {
      name: "\u5C40\u90E8\u540A\u9876 + \u706F\u5E26\uFF08\u60AC\u6D6E\uFF09",
      type: "free",
      w: 2400,
      d: 1800,
      h: 150
    },
    ceilZoneRound: {
      name: "\u5706\u5F62\u540A\u9876\uFF08\u9910\u5385\uFF09",
      type: "free",
      w: 1800,
      d: 1800,
      h: 120
    },
    ceilBeamWood: {
      name: "\u6728\u6881 / \u88C5\u9970\u5047\u6881",
      type: "free",
      w: 3600,
      d: 150,
      h: 180
    },
    ceilSlats: {
      name: "\u6728\u683C\u6805\u540A\u9876\u7247",
      type: "free",
      w: 2400,
      d: 1200,
      h: 60
    },
    freeBox: {
      name: "\u7ACB\u65B9\u4F53",
      type: "free",
      w: 1e3,
      d: 1e3,
      h: 1e3
    },
    freeRoundBox: {
      name: "\u5706\u89D2\u65B9\u5757",
      type: "free",
      w: 1e3,
      d: 600,
      h: 450
    },
    freePlatform: {
      name: "\u5730\u53F0 / \u69BB\u69BB\u7C73\u53F0",
      type: "free",
      w: 2400,
      d: 1800,
      h: 300
    },
    freeWallBlock: {
      name: "\u80CC\u666F\u5899\u51F8\u5757",
      type: "free",
      w: 2400,
      d: 150,
      h: 2600
    },
    freeCeilBlock: {
      name: "\u540A\u9876\u9020\u578B\u5757",
      type: "free",
      w: 2e3,
      d: 2e3,
      h: 150
    },
    freeCyl: {
      name: "\u5706\u67F1",
      type: "free",
      w: 400,
      d: 400,
      h: 2700
    },
    freeRoundStage: {
      name: "\u5706\u5F62\u5730\u53F0",
      type: "free",
      w: 2e3,
      d: 2e3,
      h: 200
    },
    freeHalfCyl: {
      name: "\u534A\u5706\u67F1 / \u534A\u5706\u5899\u579B",
      type: "free",
      w: 800,
      d: 400,
      h: 2700
    },
    freeTube: {
      name: "\u5706\u7BA1 / \u5706\u73AF\u9694\u65AD",
      type: "free",
      w: 1800,
      d: 1800,
      h: 2400
    },
    freeSphere: {
      name: "\u7403\u4F53",
      type: "free",
      w: 500,
      d: 500,
      h: 500
    },
    freeHemi: {
      name: "\u534A\u7403 / \u7A79\u9876",
      type: "free",
      w: 1200,
      d: 1200,
      h: 600
    },
    freeCone: {
      name: "\u5706\u9525",
      type: "free",
      w: 500,
      d: 500,
      h: 800
    },
    freePyramid: {
      name: "\u56DB\u68F1\u9525",
      type: "free",
      w: 800,
      d: 800,
      h: 800
    },
    freeWedge: {
      name: "\u6954\u5F62 / \u5761\u9053",
      type: "free",
      w: 1200,
      d: 1500,
      h: 200
    },
    freeArch: {
      name: "\u62F1\u95E8\u9020\u578B",
      type: "free",
      w: 1400,
      d: 240,
      h: 2600
    },
    freeArcWall: {
      name: "\u5F27\u5F62\u5899 / \u5F27\u5F62\u9694\u65AD",
      type: "free",
      w: 2400,
      d: 600,
      h: 2700
    },
    freeSlats: {
      name: "\u6728\u683C\u6805",
      type: "free",
      w: 1800,
      d: 60,
      h: 2700
    },
    freeGlassScreen: {
      name: "\u957F\u8679\u73BB\u7483\u9694\u65AD",
      type: "free",
      w: 1500,
      d: 60,
      h: 2400
    },
    freeSteps: {
      name: "\u53F0\u9636",
      type: "free",
      w: 1200,
      d: 900,
      h: 450
    },
    freeTorus: {
      name: "\u5706\u73AF / \u73AF\u5F62\u706F",
      type: "free",
      w: 1200,
      d: 1200,
      h: 60
    },
    freeLightBox: {
      name: "\u53D1\u5149\u706F\u5E26 / \u706F\u7BB1",
      type: "free",
      w: 2e3,
      d: 40,
      h: 30
    },
    freeMirror: {
      name: "\u955C\u9762\u677F",
      type: "free",
      w: 900,
      d: 20,
      h: 1800
    },
    freeVase: {
      name: "\u65CB\u8F6C\u4F53 \xB7 \u82B1\u74F6",
      type: "free",
      w: 350,
      d: 350,
      h: 600
    },
    freeColumn: {
      name: "\u65CB\u8F6C\u4F53 \xB7 \u7F57\u9A6C\u67F1",
      type: "free",
      w: 450,
      d: 450,
      h: 2700
    },
    freeExtrude: {
      name: "\u62C9\u4F38\u4F53\uFF08\u753B\u8F6E\u5ED3\uFF09",
      type: "free",
      w: 1500,
      d: 1e3,
      h: 300
    },
    freeModel: {
      name: "\u81EA\u7531\u9020\u578B",
      type: "free",
      w: 600,
      d: 600,
      h: 600
    }
  };

  // client/workspaces/cad/lib/design/catalog.ts
  function isValidKey(key) {
    return Object.prototype.hasOwnProperty.call(catalog_default, key);
  }
  function suggestKeys(badKey) {
    const query = badKey.toLowerCase();
    const grams = (value) => Array.from(value, (_, i) => value.slice(i, i + 2));
    const queryGrams = grams(query);
    return Object.entries(catalog_default).map(([key, item]) => {
      const text = `${key} ${item.name} ${item.type}`.toLowerCase();
      const score2 = queryGrams.filter((gram) => text.includes(gram)).length / Math.max(queryGrams.length, 1);
      return { key, score: score2 };
    }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 3).map((item) => item.key);
  }

  // client/workspaces/cad/lib/design/spec-validate.ts
  var isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  var finite2 = (value) => typeof value === "number" && Number.isFinite(value);
  var point = (value) => Array.isArray(value) && value.length === 2 && value.every(finite2);
  function validateSpec(input) {
    const issues = [];
    const add2 = (code, path, message, level = "error") => issues.push({ level, code, path, msg: `${path} ${message}` });
    if (!isObject(input) || !Array.isArray(input.walls) || !input.walls.length) {
      add2("schema", "walls", "\u5FC5\u987B\u63D0\u4F9B\u975E\u7A7A\u5899\u6570\u7EC4\uFF0C\u6BCF\u9762\u5899\u586B\u5199 a\u3001b \u5750\u6807\u548C\u6B63\u6570\u539A\u5EA6 t");
      return issues;
    }
    if (input.name !== void 0 && typeof input.name !== "string") add2("schema", "name", "\u6539\u4E3A\u5B57\u7B26\u4E32");
    if (input.height !== void 0 && (!finite2(input.height) || input.height <= 0)) add2("schema", "height", "\u586B\u5199\u6B63\u6570\u5C42\u9AD8\uFF0C\u5355\u4F4D mm");
    for (const [index2, wall] of input.walls.entries()) {
      const path = `walls[${index2}]`;
      if (!isObject(wall) || !point(wall.a) || !point(wall.b) || !finite2(wall.t) || wall.t <= 0 || distance(wall.a, wall.b) === 0) {
        add2("schema", path, "a/b \u5FC5\u987B\u662F\u4E24\u4E2A\u6709\u9650\u6570\u5B57\u7684\u5750\u6807\uFF0C\u7AEF\u70B9\u4E0D\u80FD\u91CD\u5408\uFF0Ct \u5FC5\u987B\u5927\u4E8E 0");
        continue;
      }
      if (wall.openings !== void 0 && !Array.isArray(wall.openings)) add2("schema", path + ".openings", "\u6539\u4E3A\u6D1E\u53E3\u6570\u7EC4");
      for (const [oi, opening] of (Array.isArray(wall.openings) ? wall.openings : []).entries()) {
        if (!isObject(opening) || !isOpeningType(opening.type) || !finite2(opening.from) || !finite2(opening.to) || opening.into !== void 0 && !point(opening.into)) add2("schema", `${path}.openings[${oi}]`, `type \u53EF\u9009 ${OPENING_TYPES.join("\u3001")}\uFF0C\u586B\u5199\u6709\u9650\u6570\u5B57 from/to\uFF0C\u4EE5\u53CA\u6709\u6548\u7684 into \u4E24\u5143\u5750\u6807\uFF08\u5982\u6709\uFF09`);
      }
    }
    for (const key of ["rooms", "furniture"]) {
      if (input[key] !== void 0 && !Array.isArray(input[key])) add2("schema", key, "\u6539\u4E3A\u6570\u7EC4");
      for (const [index2, item] of (Array.isArray(input[key]) ? input[key] : []).entries()) {
        if (!isObject(item) || !point(item.at) || typeof item[key === "rooms" ? "name" : "key"] !== "string") add2("schema", `${key}[${index2}]`, "\u586B\u5199 at \u4E24\u5143\u5750\u6807\u548C\u540D\u79F0/key \u5B57\u7B26\u4E32");
      }
    }
    for (const key of ["structs", "elec", "beams"]) {
      if (input[key] !== void 0 && !Array.isArray(input[key])) add2("schema", key, "\u6539\u4E3A\u6570\u7EC4");
      const items = Array.isArray(input[key]) ? input[key] : [];
      for (const [index2, item] of items.entries()) {
        const valid = isObject(item) && (key === "beams" ? point(item.a) && point(item.b) : typeof item.kind === "string" && (point(item.at) || key === "elec" && Array.isArray(item.pts) && item.pts.length >= 2 && item.pts.every(point)));
        if (!valid) add2("schema", `${key}[${index2}]`, key === "beams" ? "\u586B\u5199 a/b \u4E24\u5143\u6570\u5B57\u5750\u6807" : key === "elec" ? "\u586B\u5199 kind \u5B57\u7B26\u4E32\u548C at \u4E24\u5143\u6570\u5B57\u5750\u6807\uFF08\u706F\u5E26 / \u8F68\u9053 / \u7EBF\u6027\u706F\u5199 pts \u70B9\u5217\uFF09" : "\u586B\u5199 kind \u5B57\u7B26\u4E32\u548C at \u4E24\u5143\u6570\u5B57\u5750\u6807");
      }
    }
    if (issues.length) return issues;
    const spec = input;
    const xs = spec.walls.flatMap((wall) => [wall.a[0], wall.b[0]]);
    const ys = spec.walls.flatMap((wall) => [wall.a[1], wall.b[1]]);
    const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (extent < 2e3 || extent > 2e5) add2("unit", "walls", `\u5305\u56F4\u76D2\u6700\u5927\u8FB9 ${extent}\uFF0C\u8BF7\u628A\u5750\u6807\u7EDF\u4E00\u4E3A mm\uFF0C\u4F4F\u5B85\u8F6E\u5ED3\u5E94\u5728 2000\u2013200000mm \u5185`);
    spec.walls.forEach((wall, wi) => {
      const path = `walls[${wi}]`;
      for (const end of ["a", "b"]) {
        if (!spec.walls.some((other, i) => i !== wi && segmentDistance(wall[end], other.a, other.b) <= 40)) add2("free_end", `${path}.${end}`, `\u7AEF\u70B9 ${wall[end]} \u60AC\u7A7A\uFF0C\u8BF7\u5C06\u7AEF\u70B9\u8FDE\u63A5\u5230\u53E6\u4E00\u9762\u5899\u7684\u7AEF\u70B9\u6216\u4E2D\u7EBF\uFF08\u8DDD\u79BB \u226440mm\uFF09`);
      }
      const length = distance(wall.a, wall.b);
      const ux = (wall.b[0] - wall.a[0]) / length, uy = (wall.b[1] - wall.a[1]) / length;
      const horizontal = Math.abs(uy) < 1e-3;
      const vertical = Math.abs(ux) < 1e-3;
      const origin = horizontal ? Math.min(wall.a[0], wall.b[0]) : vertical ? Math.min(wall.a[1], wall.b[1]) : 0;
      const ranges = (wall.openings ?? []).map((opening, oi) => {
        const alongWall = (value) => horizontal ? (value - wall.a[0]) * Math.sign(ux) : vertical ? (value - wall.a[1]) * Math.sign(uy) : value;
        const start = alongWall(opening.from), end = alongWall(opening.to);
        const from = Math.min(start, end), to = Math.max(start, end);
        const openingPath = `${path}.openings[${oi}]`;
        if (!(opening.from < opening.to && from > 0 && from < to && to < length)) {
          const over = Math.max(0, to - length, -from);
          add2("opening_range", openingPath, `${opening.type} from=${opening.from} to=${opening.to} \u6362\u7B97\u6CBF\u5899\u8DDD\u79BB ${from}\u2013${to}\uFF0C\u5899\u957F ${Math.round(length)}\uFF0C\u8D8A\u754C ${Math.round(over)}mm\uFF1B\u8BF7\u6EE1\u8DB3 ${origin} < from < to < ${origin + length}\uFF08\u5EFA\u8BAE\u4E24\u7AEF\u81F3\u5C11\u7559 50mm\uFF09`);
        }
        return { from, to, path: openingPath };
      });
      ranges.forEach((range, i) => {
        for (const other of ranges.slice(0, i)) if (Math.max(range.from, other.from) < Math.min(range.to, other.to)) add2("opening_overlap", range.path, `\u4E0E ${other.path} \u91CD\u53E0\uFF0C\u8BF7\u79FB\u52A8\u6D1E\u53E3\uFF0C\u786E\u4FDD\u4E24\u8005\u533A\u95F4\u4E0D\u91CD\u53E0`);
      });
    });
    (spec.furniture ?? []).forEach((item, i) => {
      if (!isValidKey(item.key)) add2("furniture_key", `furniture[${i}].key`, `\u5BB6\u5177\u5E93\u6CA1\u6709 ${item.key}\uFF0C\u8BF7\u4ECE\u5019\u9009 ${suggestKeys(item.key).join("\u3001")} \u4E2D\u9009\u62E9\u5339\u914D\u9879`);
      if (item.rot !== void 0 && !finite2(item.rot)) add2("rot", `furniture[${i}].rot`, "\u6539\u4E3A\u6709\u9650\u6570\u5B57\u89D2\u5EA6\uFF0C\u5982 0\u300190\u3001180 \u6216 270");
    });
    const regions = enclosedRegions(spec.walls);
    (spec.rooms ?? []).forEach((room, i) => {
      if (!regions.some((region) => pointInPolygon(room.at, region))) add2("room_label_outside", `rooms[${i}].at`, `${room.name} \u6807\u7B7E\u5728\u56F4\u5408\u533A\u57DF\u5916\uFF0C\u8BF7\u5C06\u6807\u7B7E\u70B9\u79FB\u5165\u5899\u4F53\u56F4\u5408\u533A\u57DF`, "warn");
    });
    return issues;
  }
  return __toCommonJS(entry_exports);
})();
