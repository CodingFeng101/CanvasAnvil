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
    elecPrefsFromDecisions: () => elecPrefsFromDecisions,
    nudgeFurniture: () => nudgeFurniture
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
  return __toCommonJS(entry_exports);
})();
