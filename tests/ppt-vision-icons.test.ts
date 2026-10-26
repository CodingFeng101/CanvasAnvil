import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildIconSheets,
  cropForIcon,
  cutCleanedSheet,
  inkAlignedBox,
  SHEET_SIZE,
  type IconRequest,
} from "../client/workspaces/ppt/vision/icon-assets";
import { keyToAlpha } from "../client/workspaces/ppt/vision/sheets";
import type { RgbaImage } from "../client/workspaces/ppt/vision/types";

/**
 * Lifting drawings off a page as transparent pictures.
 *
 * The two failures worth pinning both look fine in a list of thumbnails: a
 * neighbouring element dragged into a crop, which makes the cleaned sheet
 * hold more drawings than it has cells; and a picture placed by stretching it
 * to its box, which comes out squat or narrow on the page.
 */

const filled = (width: number, height: number, colour: [number, number, number], alpha = 255): RgbaImage => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = colour[0];
    data[i * 4 + 1] = colour[1];
    data[i * 4 + 2] = colour[2];
    data[i * 4 + 3] = alpha;
  }
  return { data, width, height };
};

const paint = (
  image: RgbaImage,
  rect: { x: number; y: number; w: number; h: number },
  colour: [number, number, number],
  alpha = 255,
) => {
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const at = (y * image.width + x) * 4;
      image.data[at] = colour[0];
      image.data[at + 1] = colour[1];
      image.data[at + 2] = colour[2];
      image.data[at + 3] = alpha;
    }
  }
};

const colourAt = (image: RgbaImage, x: number, y: number) => {
  const at = (y * image.width + x) * 4;
  return [image.data[at], image.data[at + 1], image.data[at + 2]];
};

test("a crop carries a margin around the icon", () => {
  const page = filled(400, 300, [255, 255, 255]);
  paint(page, { x: 100, y: 100, w: 40, h: 40 }, [18, 103, 230]);

  const crop = cropForIcon(page, { x: 100 / 400, y: 100 / 300, w: 40 / 400, h: 40 / 300 });
  // The margin is what gives the cleaner room to see where the icon ends.
  assert.ok(crop.width > 40 && crop.width < 80);
  assert.ok(crop.height > 40 && crop.height < 80);
});

test("a neighbour caught in the margin is painted out", () => {
  // Without this the sheet comes back holding more objects than it has cells,
  // and every icon after it is handed the wrong picture.
  // The neighbour sits just inside the margin the crop takes, which is
  // exactly the case that drags it into the frame.
  const page = filled(400, 300, [255, 255, 255]);
  paint(page, { x: 100, y: 100, w: 40, h: 40 }, [18, 103, 230]);
  paint(page, { x: 143, y: 100, w: 40, h: 40 }, [220, 40, 40]);

  const icon = { x: 100 / 400, y: 100 / 300, w: 40 / 400, h: 40 / 300 };
  const neighbour = { x: 143 / 400, y: 100 / 300, w: 40 / 400, h: 40 / 300 };

  const withNeighbour = cropForIcon(page, icon, []);
  const cleaned = cropForIcon(page, icon, [neighbour]);

  const hasRed = (image: RgbaImage) => {
    for (let i = 0; i < image.width * image.height; i += 1) {
      if (image.data[i * 4] > 200 && image.data[i * 4 + 1] < 80) return true;
    }
    return false;
  };

  assert.ok(hasRed(withNeighbour), "the fixture must actually catch the neighbour");
  assert.ok(!hasRed(cleaned), "the neighbour has to be painted out");
  // And the icon itself survives.
  assert.deepEqual(colourAt(cleaned, Math.floor(cleaned.width / 2), Math.floor(cleaned.height / 2)), [18, 103, 230]);
});

test("crops are laid out in sheets, and a page's icons never share one with another page's", () => {
  const page = filled(400, 300, [255, 255, 255]);
  const requests: IconRequest[] = Array.from({ length: 10 }, (_, i) => {
    const box = { x: (10 + i * 30) / 400, y: 40 / 300, w: 20 / 400, h: 20 / 300 };
    paint(page, { x: 10 + i * 30, y: 40, w: 20, h: 20 }, [18, 103, 230]);
    return { id: `i${i}`, box, desc: `icon ${i}` };
  });

  const sheets = buildIconSheets(page, requests);
  assert.equal(sheets.length, 2, `ten icons at ${SHEET_SIZE} per sheet is two sheets`);
  assert.equal(sheets[0].requests.length, SHEET_SIZE);
  assert.equal(sheets[1].requests.length, 10 - SHEET_SIZE);
  assert.ok(sheets[0].montage.width > 0 && sheets[0].montage.height > 0);
});

test("a cleaned sheet is cut back into one picture per icon", () => {
  const page = filled(400, 300, [255, 255, 255]);
  const requests: IconRequest[] = [0, 1, 2].map((i) => {
    paint(page, { x: 40 + i * 90, y: 40, w: 40, h: 40 }, [18, 103, 230]);
    return {
      id: `i${i}`,
      desc: `icon ${i}`,
      box: { x: (40 + i * 90) / 400, y: 40 / 300, w: 40 / 400, h: 40 / 300 },
    };
  });

  const [sheet] = buildIconSheets(page, requests);
  // The model returns the sheet unchanged in this test: the cutting is what
  // is under test, not the cleaning.
  const notes: string[] = [];
  const cut = cutCleanedSheet(sheet.montage, sheet, "#FF00FF", notes);

  assert.equal(cut.length, 3);
  assert.deepEqual(cut.map((item) => item.request.id), ["i0", "i1", "i2"]);
  assert.deepEqual(notes, [], "a clean round trip has nothing to report");
});

test("a sheet that comes back with the wrong number of drawings says so", () => {
  const page = filled(400, 300, [255, 255, 255]);
  const requests: IconRequest[] = [0, 1, 2].map((i) => {
    paint(page, { x: 40 + i * 90, y: 40, w: 40, h: 40 }, [18, 103, 230]);
    return {
      id: `i${i}`,
      desc: `icon ${i}`,
      box: { x: (40 + i * 90) / 400, y: 40 / 300, w: 40 / 400, h: 40 / 300 },
    };
  });
  const [sheet] = buildIconSheets(page, requests);

  // A model that dropped one drawing. Pairing the rest hopefully would place
  // an icon in the wrong spot on the page, which is worse than losing it.
  const damaged = filled(sheet.montage.width, sheet.montage.height, [255, 0, 255]);
  for (let y = 0; y < sheet.montage.height; y += 1) {
    for (let x = 0; x < Math.floor(sheet.montage.width * 0.66); x += 1) {
      const at = (y * sheet.montage.width + x) * 4;
      const to = (y * damaged.width + x) * 4;
      damaged.data[to] = sheet.montage.data[at];
      damaged.data[to + 1] = sheet.montage.data[at + 1];
      damaged.data[to + 2] = sheet.montage.data[at + 2];
    }
  }

  const notes: string[] = [];
  const cut = cutCleanedSheet(damaged, sheet, "#FF00FF", notes);
  assert.equal(cut.length, 2);
  assert.ok(notes.some((note) => note.includes("2 drawings for 3 icons")), notes.join(" | "));
});

test("a picture is placed by its own proportions, not stretched to its box", () => {
  // A tall drawing in a box a fifth too wide. Filling the box in both
  // directions makes it squat; the box is allowed to decide position and
  // size, never shape.
  const asset = filled(40, 80, [0, 0, 0], 0);
  paint(asset, { x: 10, y: 10, w: 20, h: 60 }, [18, 103, 230]);

  const target = { x: 0.2, y: 0.2, w: 0.12, h: 0.2 };
  const placed = inkAlignedBox(asset, target, 16 / 9);

  // The picture's aspect ratio, on a 16:9 slide, is preserved.
  const drawnAspect = ((placed.w * (16 / 9)) / placed.h) * (asset.height / asset.width);
  assert.ok(Math.abs(drawnAspect - 1) < 1e-6, `proportions drifted: ${drawnAspect}`);
  // And it is centred on the box it was given.
  assert.ok(Math.abs(placed.x + placed.w / 2 - (target.x + target.w / 2)) < 1e-9);
  assert.ok(Math.abs(placed.y + placed.h / 2 - (target.y + target.h / 2)) < 1e-9);
});

test("placement accounts for the padding around a drawing", () => {
  // The cleaned picture has transparent margins, and the drawn pixels inside
  // it are what has to land in the box -- not the picture's own edges.
  const asset = filled(100, 100, [0, 0, 0], 0);
  paint(asset, { x: 40, y: 40, w: 20, h: 20 }, [18, 103, 230]);

  const target = { x: 0.3, y: 0.3, w: 0.1, h: 0.1 };
  const placed = inkAlignedBox(asset, target, 16 / 9);

  // The picture is placed larger than the box and offset up and left, so that
  // the fifth of it that is actually drawn on lands centred in the box.
  assert.ok(placed.w > target.w && placed.h > target.h);
  assert.ok(placed.x < target.x && placed.y < target.y);

  const inkLeft = placed.x + (40 / 100) * placed.w;
  const inkTop = placed.y + (40 / 100) * placed.h;
  const inkWidth = (20 / 100) * placed.w;
  const inkHeight = (20 / 100) * placed.h;
  assert.ok(Math.abs(inkLeft + inkWidth / 2 - (target.x + target.w / 2)) < 1e-9);
  assert.ok(Math.abs(inkTop + inkHeight / 2 - (target.y + target.h / 2)) < 1e-9);
  // And it fits inside the box on its tighter axis.
  assert.ok(inkHeight <= target.h + 1e-9);
});

test("an empty picture keeps the box it was given rather than vanishing", () => {
  const blank = filled(20, 20, [0, 0, 0], 0);
  const target = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  assert.deepEqual(inkAlignedBox(blank, target), target);
});

test("keying and cutting survive a sheet the model tinted slightly", () => {
  // Image models rarely return the exact key colour. The tolerance is what
  // stops a two-level drift from making the whole background opaque.
  const sheet = filled(200, 200, [250, 6, 249]);
  paint(sheet, { x: 60, y: 60, w: 80, h: 80 }, [18, 103, 230]);

  const keyed = keyToAlpha(sheet, "#FF00FF");
  assert.equal(keyed.data[3], 0, "a near-miss key colour is still background");
  assert.equal(keyed.data[(100 * 200 + 100) * 4 + 3], 255);
});
