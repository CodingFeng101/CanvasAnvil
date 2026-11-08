// Copied from CanvasAnvil by scripts/sync-cad-skill.mjs; edit the source there, not this file. Source: client/workspaces/cad/lib/design/ (bundled)

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

// client/workspaces/cad/lib/design/layout.ts
var EXTERIOR = 240;
var INTERIOR = 120;
var WALL_GAP = 20;
var CURTAIN_GAP = 330;
var SIDES = {
  \u5317: "N",
  \u5357: "S",
  \u4E1C: "E",
  \u897F: "W",
  N: "N",
  S: "S",
  E: "E",
  W: "W",
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  \u4E0A: "N",
  \u4E0B: "S",
  \u5DE6: "W",
  \u53F3: "E"
};
var SIDE_NAME = { N: "\u5317", S: "\u5357", E: "\u4E1C", W: "\u897F" };
var ROT = { N: 0, E: 90, S: 180, W: 270 };
var side = (value) => SIDES[String(value ?? "").trim().replace(/[墙面侧边]$/, "").toLowerCase()] ?? SIDES[String(value ?? "").trim().replace(/[墙面侧边]$/, "")];
var CIRCULATION = /过道|走廊|走道|客厅|餐厅|玄关|门厅|起居|hall|corridor|living|dining|foyer|entry/i;
var CURTAIN_ROOMS = /卧|客厅|起居|书房|厅|bed|living|study/i;
var WET = /卫|厕|浴|bath|toilet|wc/i;
var MOUNTED = /* @__PURE__ */ new Set(["acWall", "waterHeater", "gasHeater", "hood", "wallTV", "mirrorCabinet", "towelWarmer", "wallArt", "wallArt3", "wallClock", "projScreen", "louver", "meterBox", "wallPanel", "evCharger", "cabWall", "ledMirror", "boiler", "thermostat", "manifold"]);
var CEILING = /* @__PURE__ */ new Set(["bathHeater", "clothesRack", "hangingPlant", "chandelier", "ceilLamp", "linearPendant", "bubblePendant", "ceilingFan", "projector", "freshAirUnit", "ductAC", "cassetteAC", "linearVent", "linearVentSide", "linearReturn", "supplyVent", "returnVent"]);
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
  deck: ["\u6728\u5851", "\u6237\u5916\u6728"]
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
function finish(table, value) {
  const text = String(value ?? "").trim();
  if (!text) return void 0;
  if (table[text]) return text;
  let best;
  for (const [key, names] of Object.entries(table)) for (const name of names) if (text.includes(name) && name.length > (best?.[1] ?? 0)) best = [key, name.length];
  return best?.[0];
}
var SOFT = /* @__PURE__ */ new Set(["rug", "roundRug", "doormat", "bayCushion", "yogaMat"]);
var RESIZABLE = /* @__PURE__ */ new Set(["wardrobe", "cabWardrobe", "cabSlide", "cabTall", "counter", "tvCabinet", "cabTV", "shoeCabinet", "cabShoe", "hallCabinet", "desk", "kidsDesk", "sideboard", "cabSideboard", "bookshelf", "sofa", "diningTable", "cabBase", "laundrySink", "vanity", "consoleTable", "longTable", "chest"]);
var SMALLER = { bed20: "bed18", bed18: "bed15", bed15: "bed12", lSofa: "sofa", uSofa: "lSofa", sofa: "loveseat", uCounter: "lCounter", lCounter: "counter", fridgeDouble: "fridge", fridgeFrench: "fridge", bathtub: "shower", freeTub: "shower", shower: "showerScreen", doubleVanity: "vanity", lDesk: "desk", longTable: "diningTable" };
var CATALOG = catalog_default;
var overlaps = (a, b, margin = 0) => a.x0 < b.x1 - margin && b.x0 < a.x1 - margin && a.y0 < b.y1 - margin && b.y0 < a.y1 - margin;
var inside = (a, b) => a.x0 >= b.x0 - 0.5 && a.x1 <= b.x1 + 0.5 && a.y0 >= b.y0 - 0.5 && a.y1 <= b.y1 + 0.5;
var center = (r) => [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
var area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
var round = (value) => Math.round(value);
function parseCells(text, cols, rows) {
  const ranges = [];
  for (const part of String(text ?? "").toUpperCase().split(/[,，;；\s]+/).filter(Boolean)) {
    const match = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(part);
    if (!match) throw new Error(`\u683C\u5B50\u201C${part}\u201D\u5199\u6CD5\u4E0D\u5BF9\uFF0C\u5E94\u4E3A A1 \u6216 A1:B2`);
    const c0 = match[1].charCodeAt(0) - 65, r0 = Number(match[2]) - 1;
    const c1 = match[3] ? match[3].charCodeAt(0) - 65 : c0, r1 = match[4] ? Number(match[4]) - 1 : r0;
    const range = [Math.min(c0, c1), Math.min(r0, r1), Math.max(c0, c1), Math.max(r0, r1)];
    if (range[2] >= cols || range[3] >= rows || range[0] < 0 || range[1] < 0) throw new Error(`\u683C\u5B50\u201C${part}\u201D\u8D85\u51FA\u7F51\u683C\uFF08${cols} \u5217 \xD7 ${rows} \u884C\uFF09`);
    ranges.push(range);
  }
  if (!ranges.length) throw new Error("\u6CA1\u6709\u5199\u683C\u5B50");
  return ranges;
}
function layoutToSpec(layout) {
  const notes = [];
  const errors = [];
  const cols = (layout?.cols ?? []).map(Number), rows = (layout?.rows ?? []).map(Number);
  if (!cols.length || !rows.length || [...cols, ...rows].some((value) => !Number.isFinite(value) || value < 600 || value > 2e4)) throw new Error("cols / rows \u5FC5\u987B\u662F 600\u201320000 \u4E4B\u95F4\u7684\u6BEB\u7C73\u6570\uFF0C\u4ECE\u897F\u5230\u4E1C\u3001\u4ECE\u5317\u5230\u5357\u6392\u5217");
  if (cols.length > 26) throw new Error("\u5217\u6570\u4E0D\u80FD\u8D85\u8FC7 26");
  const X = [0], Y = [0];
  for (const value of cols) X.push(X[X.length - 1] + value);
  for (const value of rows) Y.push(Y[Y.length - 1] + value);
  const owner = cols.map(() => rows.map(() => -1));
  const rooms = (layout.rooms ?? []).map((room, index) => {
    let ranges = [];
    try {
      ranges = parseCells(room.cells, cols.length, rows.length);
    } catch (error) {
      errors.push(`${room.name}\uFF1A${error.message}`);
    }
    for (const [c0, r0, c1, r1] of ranges) for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) {
      if (owner[c][r] >= 0 && owner[c][r] !== index) errors.push(`\u683C\u5B50 ${String.fromCharCode(65 + c)}${r + 1} \u540C\u65F6\u5206\u7ED9\u4E86 ${layout.rooms[owner[c][r]].name} \u548C ${room.name}`);
      owner[c][r] = index;
    }
    return { ...room, ranges };
  });
  if (!rooms.length) errors.push("\u6CA1\u6709\u623F\u95F4");
  if (errors.length) throw new Error(errors.join("\n"));
  const roomIndex = (name) => rooms.findIndex((room) => room.name === String(name ?? "").trim());
  const openPairs = new Set((layout.open ?? []).map((pair) => [roomIndex(pair[0]), roomIndex(pair[1])].sort().join(":")));
  const isOpen = (a, b) => a >= 0 && b >= 0 && openPairs.has([a, b].sort().join(":"));
  const walls = [];
  const pushRun = (vertical, line, start, end, pair) => {
    const t = pair.includes(-1) ? EXTERIOR : INTERIOR;
    const a = vertical ? [X[line], Y[start]] : [X[start], Y[line]];
    const b = vertical ? [X[line], Y[end]] : [X[end], Y[line]];
    walls.push({ a, b, t, vertical, pair, openings: [], hole: isOpen(pair[0], pair[1]) });
  };
  for (let i = 0; i <= cols.length; i++) {
    let run = null;
    for (let r = 0; r <= rows.length; r++) {
      const pair = r < rows.length ? [i > 0 ? owner[i - 1][r] : -1, i < cols.length ? owner[i][r] : -1] : null;
      const needed = pair && pair[0] !== pair[1];
      if (run && (!needed || pair[0] !== run.pair[0] || pair[1] !== run.pair[1])) {
        pushRun(true, i, run.start, r, run.pair);
        run = null;
      }
      if (needed && !run) run = { start: r, pair };
    }
  }
  for (let j = 0; j <= rows.length; j++) {
    let run = null;
    for (let c = 0; c <= cols.length; c++) {
      const pair = c < cols.length ? [j > 0 ? owner[c][j - 1] : -1, j < rows.length ? owner[c][j] : -1] : null;
      const needed = pair && pair[0] !== pair[1];
      if (run && (!needed || pair[0] !== run.pair[0] || pair[1] !== run.pair[1])) {
        pushRun(false, j, run.start, c, run.pair);
        run = null;
      }
      if (needed && !run) run = { start: c, pair };
    }
  }
  const nodeThickness = /* @__PURE__ */ new Map();
  for (const wall of walls) for (const end of [wall.a, wall.b]) nodeThickness.set(end.join(","), Math.max(nodeThickness.get(end.join(",")) ?? 0, wall.t));
  const span = (wall) => wall.vertical ? [wall.a[1], wall.b[1]] : [wall.a[0], wall.b[0]];
  const margins = (wall) => [(nodeThickness.get(wall.a.join(",")) ?? EXTERIOR) / 2 + 60, (nodeThickness.get(wall.b.join(",")) ?? EXTERIOR) / 2 + 60];
  const roomSide = (wall, room) => wall.pair[0] === room ? wall.vertical ? "E" : "S" : wall.pair[1] === room ? wall.vertical ? "W" : "N" : void 0;
  const sideThickness = (range, s) => {
    const [c0, r0, c1, r1] = range;
    let t = 0;
    for (const wall of walls) {
      const [p, q] = span(wall);
      if (s === "W" && wall.vertical && wall.a[0] === X[c0] && p < Y[r1 + 1] && q > Y[r0]) t = Math.max(t, wall.t);
      if (s === "E" && wall.vertical && wall.a[0] === X[c1 + 1] && p < Y[r1 + 1] && q > Y[r0]) t = Math.max(t, wall.t);
      if (s === "N" && !wall.vertical && wall.a[1] === Y[r0] && p < X[c1 + 1] && q > X[c0]) t = Math.max(t, wall.t);
      if (s === "S" && !wall.vertical && wall.a[1] === Y[r1 + 1] && p < X[c1 + 1] && q > X[c0]) t = Math.max(t, wall.t);
    }
    return t / 2;
  };
  const rects = rooms.map((room) => room.ranges.map((range) => {
    const [c0, r0, c1, r1] = range;
    return { x0: X[c0] + sideThickness(range, "W"), x1: X[c1 + 1] - sideThickness(range, "E"), y0: Y[r0] + sideThickness(range, "N"), y1: Y[r1 + 1] - sideThickness(range, "S") };
  }));
  const mainRect = rects.map((list) => [...list].sort((a, b) => area(b) - area(a))[0]);
  const occupied = (wall, from, to) => wall.openings.some((o) => from < o.to + 100 && o.from - 100 < to);
  const place = (wall, width, prefer) => {
    const [p, q] = span(wall), [m0, m1] = margins(wall);
    const lo = p + m0, hi = q - m1;
    const usable = Math.min(width, hi - lo);
    if (usable < Math.min(width, 600)) return null;
    const starts = prefer === "start" ? [lo] : prefer === "end" ? [hi - usable] : [(lo + hi - usable) / 2];
    for (let step = 0; step <= hi - lo; step += 100) starts.push(lo + step, hi - usable - step);
    for (const start of starts) if (start >= lo - 0.5 && start + usable <= hi + 0.5 && !occupied(wall, start, start + usable)) return [round(start), round(start + usable)];
    return null;
  };
  const sharedWalls = (a, b) => walls.filter((wall) => wall.pair[0] === a && wall.pair[1] === b || wall.pair[0] === b && wall.pair[1] === a).sort((p, q) => {
    const length = (wall) => span(wall)[1] - span(wall)[0];
    return length(q) - length(p);
  });
  const exteriorWalls = (room, s) => walls.filter((wall) => wall.pair.includes(-1) && roomSide(wall, room) === s);
  const links = /* @__PURE__ */ new Set();
  const link = (a, b) => links.add([a, b].sort().join(":"));
  for (const wall of walls) if (wall.hole) {
    const at = place(wall, Infinity, "center");
    if (at) {
      wall.openings.push({ type: "hole", from: at[0], to: at[1] });
      link(wall.pair[0], wall.pair[1]);
    }
  }
  let entryRoom = -1;
  const addEntry = (room, s, width = 1e3) => {
    const candidates = (s ? exteriorWalls(room, s) : []).concat(["W", "N", "E", "S"].flatMap((other) => exteriorWalls(room, other)));
    for (const wall of candidates) {
      const at = place(wall, width, "center");
      if (!at) continue;
      wall.openings.push({ type: "door", from: at[0], to: at[1], entry: true, hinge: "from", into: center(mainRect[room]) });
      entryRoom = room;
      return true;
    }
    return false;
  };
  for (const door of layout.doors ?? []) {
    if (!door.entry) continue;
    const room = roomIndex(door.room ?? door.between?.[0]);
    if (room < 0) {
      notes.push(`\u5165\u6237\u95E8\u7684\u623F\u95F4\u201C${door.room ?? ""}\u201D\u4E0D\u5B58\u5728\uFF0C\u6539\u653E\u5728\u7384\u5173\u6216\u5BA2\u5385`);
      continue;
    }
    if (!addEntry(room, side(door.side), door.width ?? 1e3)) notes.push(`${rooms[room].name} \u6CA1\u6709\u80FD\u5F00\u5165\u6237\u95E8\u7684\u5916\u5899`);
  }
  if (entryRoom < 0) {
    const fallback = [/玄关|门厅|entry|foyer/i, /客厅|起居|living/i, /餐厅|dining/i].map((pattern) => rooms.findIndex((room) => pattern.test(room.name))).find((index) => index >= 0) ?? 0;
    if (addEntry(fallback, void 0)) notes.push(`\u6CA1\u5199\u5165\u6237\u95E8\uFF0C\u5DF2\u653E\u5728${rooms[fallback].name}\u5916\u5899\u4E0A`);
  }
  const addDoor = (a, b, spec2 = {}) => {
    const walls2 = sharedWalls(a, b).filter((wall) => !wall.hole);
    if (!walls2.length) return false;
    const intoRoom = spec2.into ? roomIndex(spec2.into) : CIRCULATION.test(rooms[a].name) && !CIRCULATION.test(rooms[b].name) ? b : a;
    const other = intoRoom === a ? b : a;
    const balcony = /阳台|露台|balcony/i.test(rooms[a].name + rooms[b].name);
    const type = spec2.type ?? (balcony ? "sliding" : "door");
    const width = spec2.width ?? (type === "sliding" ? 2400 : WET.test(rooms[a].name + rooms[b].name) ? 800 : 900);
    for (const wall of walls2) {
      const [p, q] = span(wall);
      const near = side(spec2.near);
      const otherCenter = center(mainRect[other]);
      const toward = near ? (wall.vertical ? near === "N" : near === "W") ? "start" : "end" : Math.abs((wall.vertical ? otherCenter[1] : otherCenter[0]) - p) <= Math.abs((wall.vertical ? otherCenter[1] : otherCenter[0]) - q) ? "start" : "end";
      const at = place(wall, width, type === "sliding" ? "center" : toward);
      if (!at) continue;
      if (at[1] - at[0] < width - 1) notes.push(`${rooms[a].name}\u2014${rooms[b].name} \u7684\u95E8\u7F29\u5230 ${at[1] - at[0]}mm`);
      wall.openings.push({ type, from: at[0], to: at[1], hinge: toward === "start" ? "from" : "to", into: center(mainRect[intoRoom]) });
      link(a, b);
      return true;
    }
    return false;
  };
  for (const door of layout.doors ?? []) {
    if (door.entry || !door.between) continue;
    const a = roomIndex(door.between[0]), b = roomIndex(door.between[1]);
    if (a < 0 || b < 0) {
      notes.push(`\u95E8 ${door.between.join("\u2014")} \u91CC\u6709\u4E0D\u5B58\u5728\u7684\u623F\u95F4\uFF0C\u5DF2\u8DF3\u8FC7`);
      continue;
    }
    if (links.has([a, b].sort().join(":"))) continue;
    if (!addDoor(a, b, door)) notes.push(`${rooms[a].name} \u548C ${rooms[b].name} \u4E0D\u76F8\u90BB\u6216\u5899\u592A\u77ED\uFF0C\u95E8\u6CA1\u5F00\u6210`);
  }
  for (let guard = 0; guard < rooms.length; guard++) {
    const reached = /* @__PURE__ */ new Set([Math.max(entryRoom, 0)]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const key of links) {
        const [a, b] = key.split(":").map(Number);
        if (reached.has(a) !== reached.has(b)) {
          reached.add(a);
          reached.add(b);
          grew = true;
        }
      }
    }
    const missing = rooms.map((_, index) => index).filter((index) => !reached.has(index));
    if (!missing.length) break;
    let added = false;
    for (const room of missing) {
      const neighbours = [...reached].filter((other) => sharedWalls(room, other).length).sort((p, q) => Number(CIRCULATION.test(rooms[q].name)) - Number(CIRCULATION.test(rooms[p].name)));
      for (const other of neighbours) if (addDoor(room, other)) {
        notes.push(`${rooms[room].name} \u539F\u6765\u8FDB\u4E0D\u53BB\uFF0C\u5DF2\u52A0\u4E00\u6247\u95E8\u901A${rooms[other].name}`);
        added = true;
        break;
      }
      if (added) break;
    }
    if (!added) {
      notes.push(`${missing.map((index) => rooms[index].name).join("\u3001")} \u4ECE\u5165\u6237\u95E8\u8D70\u4E0D\u5230`);
      break;
    }
  }
  for (const window of layout.windows ?? []) {
    const room = roomIndex(window.room);
    const s = side(window.side);
    if (room < 0) {
      notes.push(`\u7A97\u6237\u7684\u623F\u95F4\u201C${window.room}\u201D\u4E0D\u5B58\u5728\uFF0C\u5DF2\u8DF3\u8FC7`);
      continue;
    }
    let candidates = s ? exteriorWalls(room, s) : [];
    if (!candidates.length) {
      candidates = ["S", "N", "E", "W"].flatMap((other) => exteriorWalls(room, other));
      if (candidates.length && s) notes.push(`${rooms[room].name} \u7684${SIDE_NAME[s]}\u9762\u6CA1\u6709\u5916\u5899\uFF0C\u7A97\u6539\u5F00\u5728\u522B\u7684\u5916\u5899\u4E0A`);
    }
    candidates.sort((p, q) => span(q)[1] - span(q)[0] - (span(p)[1] - span(p)[0]));
    const size = String(window.size ?? "\u4E2D");
    let placed = false;
    for (const wall of candidates) {
      const [p, q] = span(wall), [m0, m1] = margins(wall);
      const usable = q - p - m0 - m1;
      const floor = /落地|floor/i.test(size) || window.type === "floorWindow";
      const width = window.width ?? (floor ? Math.max(1500, usable * 0.75) : /大|large/i.test(size) ? 2100 : /小|small/i.test(size) ? 900 : 1500);
      const type = window.type ?? (floor ? "floorWindow" : "window");
      const at = place(wall, Math.min(width, usable), "center");
      if (!at) continue;
      wall.openings.push({ type, from: at[0], to: at[1] });
      placed = true;
      break;
    }
    if (!placed) notes.push(`${rooms[room].name} \u6CA1\u6709\u5730\u65B9\u5F00\u7A97`);
  }
  const roomOpenings = (room) => {
    const rect = mainRect[room];
    const list = [];
    for (const wall of walls) {
      const s = roomSide(wall, room);
      if (!s) continue;
      const line = wall.vertical ? wall.a[0] : wall.a[1];
      const face = { N: rect.y0, S: rect.y1, W: rect.x0, E: rect.x1 }[s];
      if (Math.abs(line - face) > wall.t / 2 + 1) continue;
      for (const opening of wall.openings) {
        const door = !/window|bay/i.test(opening.type);
        const into = !!opening.into && pointInRect(opening.into, rect);
        list.push({ side: s, from: opening.from, to: opening.to, type: opening.type, door, into });
      }
    }
    return list;
  };
  const pointInRect = (point2, rect) => point2[0] >= rect.x0 && point2[0] <= rect.x1 && point2[1] >= rect.y0 && point2[1] <= rect.y1;
  const zone = (rect, opening, depth) => {
    switch (opening.side) {
      case "N":
        return { x0: opening.from, x1: opening.to, y0: rect.y0, y1: rect.y0 + depth };
      case "S":
        return { x0: opening.from, x1: opening.to, y0: rect.y1 - depth, y1: rect.y1 };
      case "W":
        return { x0: rect.x0, x1: rect.x0 + depth, y0: opening.from, y1: opening.to };
      default:
        return { x0: rect.x1 - depth, x1: rect.x1, y0: opening.from, y1: opening.to };
    }
  };
  const furniture = [];
  const structs = [];
  const footprint = (s, along, w, d, rect, gap) => {
    switch (s) {
      case "N":
        return { x0: along - w / 2, x1: along + w / 2, y0: rect.y0 + gap, y1: rect.y0 + gap + d };
      case "S":
        return { x0: along - w / 2, x1: along + w / 2, y0: rect.y1 - gap - d, y1: rect.y1 - gap };
      case "W":
        return { x0: rect.x0 + gap, x1: rect.x0 + gap + d, y0: along - w / 2, y1: along + w / 2 };
      default:
        return { x0: rect.x1 - gap - d, x1: rect.x1 - gap, y0: along - w / 2, y1: along + w / 2 };
    }
  };
  const furnitureByRoom = layout.furniture ?? {};
  for (const name of Object.keys(furnitureByRoom)) if (roomIndex(name) < 0) notes.push(`\u5BB6\u5177\u91CC\u7684\u623F\u95F4\u201C${name}\u201D\u4E0D\u5B58\u5728\uFF0C\u8FD9\u4E9B\u5BB6\u5177\u6CA1\u653E`);
  rooms.forEach((room, index) => {
    const rect = mainRect[index];
    const openings = roomOpenings(index);
    const windows = openings.filter((opening) => !opening.door);
    const blocked = [];
    for (const opening of openings.filter((opening2) => opening2.door)) {
      const width = opening.to - opening.from;
      const swing = opening.into && /^(door|double|unequal)$/.test(opening.type) ? width + 100 : 0;
      blocked.push(zone(rect, opening, opening.type === "hole" ? 500 : Math.max(swing, 750)));
    }
    const placed = [];
    const curtains = CURTAIN_ROOMS.test(room.name) && !/阳台|balcony/i.test(room.name);
    if (curtains) for (const window of windows) {
      const width = window.to - window.from + 300;
      const r = footprint(window.side, (window.from + window.to) / 2, width, 160, rect, 0);
      const clipped = { x0: Math.max(r.x0, rect.x0), x1: Math.min(r.x1, rect.x1), y0: Math.max(r.y0, rect.y0), y1: Math.min(r.y1, rect.y1) };
      const w = window.side === "N" || window.side === "S" ? clipped.x1 - clipped.x0 : clipped.y1 - clipped.y0;
      furniture.push({ key: "curtain", at: center(clipped).map(round), rot: ROT[window.side], w: round(w) });
      blocked.push(clipped);
    }
    const free = (r, item, ignore) => {
      if (!inside(r, rect)) return false;
      if (blocked.some((b) => overlaps(r, b, 1))) return false;
      if (placed.some((p) => p !== ignore && !SOFT.has(p.key) && (!p.mounted || item.h >= 1800) && overlaps(r, p.rect, 1))) return false;
      if (item.h >= 1400 && windows.some((window) => overlaps(r, zone(rect, window, 400), 1))) return false;
      return true;
    };
    const wallSpan = (s) => s === "N" || s === "S" ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
    const solid = ["N", "S", "E", "W"].reduce((map, s) => {
      const face = { N: rect.y0, S: rect.y1, W: rect.x0, E: rect.x1 }[s];
      const [lo, hi] = wallSpan(s);
      const pieces = [];
      for (const wall of walls) {
        if (roomSide(wall, index) !== s || Math.abs((wall.vertical ? wall.a[0] : wall.a[1]) - face) > wall.t / 2 + 1) continue;
        let parts = [[Math.max(span(wall)[0], lo), Math.min(span(wall)[1], hi)]];
        for (const opening of wall.openings) {
          if (/^(window|slideWindow|highWindow|bay)$/.test(opening.type)) continue;
          parts = parts.flatMap(([a, b]) => [[a, Math.min(b, opening.from)], [Math.max(a, opening.to), b]]).filter(([a, b]) => b - a > 1);
        }
        pieces.push(...parts.filter(([a, b]) => b - a > 1));
      }
      map[s] = pieces;
      return map;
    }, {});
    const backed = (s, a, b) => solid[s].some(([p, q]) => p <= a + 1 && b <= q + 1);
    const gapFor = (s, along0, along1) => curtains && windows.some((window) => window.side === s && along0 < window.to && window.from < along1) ? CURTAIN_GAP : WALL_GAP;
    const tryWall = (s, at, item, mounted, needWall = true) => {
      const [lo, hi] = wallSpan(s);
      if (item.w > hi - lo) return null;
      const aside = side(at);
      const base = aside && (s === "N" || s === "S" ? aside === "W" || aside === "E" : aside === "N" || aside === "S") ? aside === "W" || aside === "N" ? lo + item.w / 2 : hi - item.w / 2 : (lo + hi) / 2;
      const positions = [base];
      for (let step = 25; step <= hi - lo; step += 25) positions.push(base + step, base - step);
      for (const along of positions) {
        if (along - item.w / 2 < lo - 0.5 || along + item.w / 2 > hi + 0.5) continue;
        if ((mounted || needWall) && !backed(s, along - item.w / 2, along + item.w / 2)) continue;
        if (mounted) {
          if (openings.some((opening) => opening.side === s && along - item.w / 2 < opening.to && opening.from < along + item.w / 2)) continue;
          const r2 = footprint(s, along, item.w, item.d, rect, 0);
          if (placed.some((p) => !p.mounted && p.h >= 1800 && overlaps(r2, footprint(s, along, item.w, 700, rect, 0), 1) && overlaps(p.rect, footprint(s, along, item.w, 700, rect, 0), 1))) continue;
          return { key: item.key, rect: r2, rot: ROT[s], side: s, w: item.w, d: item.d, h: item.h, mounted: true };
        }
        const gap = gapFor(s, along - item.w / 2, along + item.w / 2);
        const r = footprint(s, along, item.w, item.d, rect, gap);
        if (free(r, item)) return { key: item.key, rect: r, rot: ROT[s], side: s, w: item.w, d: item.d, h: item.h };
      }
      return null;
    };
    const opposite = { N: "S", S: "N", E: "W", W: "E" };
    const largestWindowSide = () => [...windows].sort((p, q) => q.to - q.from - (p.to - p.from))[0]?.side;
    const record = (p) => {
      placed.push(p);
      const entry = { key: p.key, at: center(p.rect).map(round), rot: p.rot };
      const base = CATALOG[p.key];
      if (base && round(p.w) !== base.w) entry.w = round(p.w);
      if (base && round(p.d) !== base.d) entry.d = round(p.d);
      furniture.push(entry);
    };
    for (const raw of furnitureByRoom[room.name] ?? []) {
      const count = Math.max(1, Math.min(4, Number(raw.count) || 1));
      for (let copy = 0; copy < count; copy++) placeItem(raw, copy);
    }
    function placeItem(raw, copy) {
      let key = String(raw.key ?? "").trim();
      if (key === "curtain" || key === "sheer") return;
      if (!CATALOG[key]) {
        notes.push(`${room.name}\uFF1A\u5BB6\u5177\u5E93\u6CA1\u6709 ${key}\uFF0C\u5DF2\u8DF3\u8FC7`);
        return;
      }
      const mounted = MOUNTED.has(key);
      if (CEILING.has(key)) {
        const at = center(rect);
        furniture.push({ key, at: at.map(round), rot: 0 });
        return;
      }
      if (key === "floorHeat") {
        const w = Math.max(600, rect.x1 - rect.x0 - 200), d = Math.max(600, rect.y1 - rect.y0 - 200);
        furniture.push({ key, at: center(rect).map(round), rot: 0, w: round(w), d: round(d) });
        return;
      }
      if (SOFT.has(key)) {
        const anchor = raw.front ? placed.find((p) => p.key === raw.front) : void 0;
        const at = anchor ? frontOf(anchor, raw.gap ?? 300, CATALOG[key].d) : center(rect);
        furniture.push({ key, at: at.map(round), rot: anchor?.rot ?? 0 });
        return;
      }
      const attempts = [];
      for (let k = key; k && CATALOG[k]; k = SMALLER[k]) {
        const base = CATALOG[k];
        const w = k === key && raw.w ? raw.w : base.w, d = k === key && raw.d ? raw.d : base.d;
        attempts.push({ key: k, w, d, h: base.h });
        if (RESIZABLE.has(k)) {
          for (const scale of [0.85, 0.7, 0.55]) if (w * scale >= 800) attempts.push({ key: k, w: w * scale, d, h: base.h });
        }
      }
      for (const item of attempts) {
        const result = locate(raw, item, mounted, copy);
        if (!result) continue;
        if (item.key !== key) notes.push(`${room.name}\uFF1A${CATALOG[key].name} \u653E\u4E0D\u4E0B\uFF0C\u6362\u6210 ${CATALOG[item.key].name}`);
        else if (round(item.w) !== round(raw.w ?? CATALOG[key].w)) notes.push(`${room.name}\uFF1A${CATALOG[key].name} \u5BBD\u5EA6\u7F29\u5230 ${round(item.w)}mm`);
        record(result);
        if (raw.chairs) addChairs(result, Number(raw.chairs));
        addPlumbing(result);
        return;
      }
      notes.push(raw.optional ? `${room.name}\uFF1A\u7A7A\u95F4\u4E0D\u591F\uFF0C\u7701\u7565\u4E86${CATALOG[key].name}` : `${room.name}\uFF1A\u653E\u4E0D\u4E0B${CATALOG[key].name}\uFF0C\u5DF2\u7701\u7565`);
    }
    function frontOf(anchor, gap, depth) {
      const [cx, cy] = center(anchor.rect);
      switch (anchor.side) {
        case "N":
          return [cx, anchor.rect.y1 + gap + depth / 2];
        case "S":
          return [cx, anchor.rect.y0 - gap - depth / 2];
        case "W":
          return [anchor.rect.x1 + gap + depth / 2, cy];
        case "E":
          return [anchor.rect.x0 - gap - depth / 2, cy];
        default:
          return [cx, cy];
      }
    }
    function locate(raw, item, mounted, copy) {
      if (raw.beside) {
        const anchor = placed.find((p) => p.key === raw.beside || CATALOG[p.key]?.type === raw.beside);
        if (anchor?.side) {
          const horizontal = anchor.side === "N" || anchor.side === "S";
          const [a0, a1] = horizontal ? [anchor.rect.x0, anchor.rect.x1] : [anchor.rect.y0, anchor.rect.y1];
          const order = copy % 2 === 0 ? [a0 - item.w / 2 - 10, a1 + item.w / 2 + 10] : [a1 + item.w / 2 + 10, a0 - item.w / 2 - 10];
          for (const along of order) {
            const r = footprint(anchor.side, along, item.w, item.d, rect, gapFor(anchor.side, along - item.w / 2, along + item.w / 2));
            if (free(r, item)) return { key: item.key, rect: r, rot: ROT[anchor.side], side: anchor.side, w: item.w, d: item.d, h: item.h };
          }
        }
      }
      if (raw.front) {
        const anchor = placed.find((p) => p.key === raw.front || CATALOG[p.key]?.type === raw.front);
        if (anchor?.side) {
          const horizontal = anchor.side === "N" || anchor.side === "S";
          const [cx, cy] = frontOf(anchor, raw.gap ?? 400, horizontal ? item.d : item.d);
          const r = horizontal ? { x0: cx - item.w / 2, x1: cx + item.w / 2, y0: cy - item.d / 2, y1: cy + item.d / 2 } : { x0: cx - item.d / 2, x1: cx + item.d / 2, y0: cy - item.w / 2, y1: cy + item.w / 2 };
          if (free(r, item)) return { key: item.key, rect: r, rot: anchor.rot, w: item.w, d: item.d, h: item.h };
        }
      }
      if (raw.center) {
        const [cx, cy] = center(rect);
        const tall = rect.y1 - rect.y0 > rect.x1 - rect.x0;
        for (const [dx, dy] of [[0, 0], [0, 200], [0, -200], [200, 0], [-200, 0], [0, 400], [0, -400], [400, 0], [-400, 0]]) {
          const [w, d] = tall ? [item.d, item.w] : [item.w, item.d];
          const r = { x0: cx + dx - w / 2, x1: cx + dx + w / 2, y0: cy + dy - d / 2, y1: cy + dy + d / 2 };
          if (free(r, item)) return { key: item.key, rect: r, rot: tall ? 90 : 0, w: item.w, d: item.d, h: item.h };
        }
        return null;
      }
      if (raw.corner) {
        for (const s of ["N", "S"]) for (const at of ["W", "E"]) {
          const result = tryWall(s, at, item, mounted);
          if (result && Math.abs((at === "W" ? result.rect.x0 : result.rect.x1) - (at === "W" ? rect.x0 : rect.x1)) < 1) return result;
        }
      }
      const wanted = /窗|window/i.test(String(raw.wall ?? "")) ? largestWindowSide() : side(raw.wall);
      const sides = wanted ? [wanted, opposite[wanted], ...["N", "E", "S", "W"].filter((s) => s !== wanted && s !== opposite[wanted])] : ["N", "E", "S", "W"];
      for (const s of sides) {
        const result = tryWall(s, raw.at, item, mounted);
        if (result) return result;
      }
      if (!mounted) for (const s of sides) {
        const result = tryWall(s, raw.at, item, mounted, false);
        if (result) return result;
      }
      return null;
    }
    function addChairs(table, n) {
      const chair = CATALOG.chair;
      if (!chair || n <= 0) return;
      const vertical = table.rot === 90 || table.rot === 270;
      const along = vertical ? [table.rect.y0, table.rect.y1] : [table.rect.x0, table.rect.x1];
      const perSide = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const first = i < perSide;
        const k = first ? i : i - perSide;
        const count = first ? perSide : n - perSide;
        const pos = along[0] + (along[1] - along[0]) * (k + 0.5) / count;
        const at = vertical ? [first ? table.rect.x0 - chair.d / 2 + 120 : table.rect.x1 + chair.d / 2 - 120, pos] : [pos, first ? table.rect.y0 - chair.d / 2 + 120 : table.rect.y1 + chair.d / 2 - 120];
        const rot = vertical ? first ? 270 : 90 : first ? 0 : 180;
        furniture.push({ key: "chair", at: at.map(round), rot });
      }
    }
    function addPlumbing(p) {
      const [cx, cy] = center(p.rect);
      if (/toilet/i.test(p.key) && p.side) {
        const at = p.side === "N" ? [cx, rect.y0 + 300] : p.side === "S" ? [cx, rect.y1 - 300] : p.side === "W" ? [rect.x0 + 300, cy] : [rect.x1 - 300, cy];
        structs.push({ kind: "sewer", at: at.map(round) });
      }
      if (/^(washer|washerTower|laundrySink)$/.test(p.key)) {
        const at = frontOf(p, 150, 0);
        structs.push({ kind: "drain", at: at.map(round) });
      }
      if (/^(shower|showerScreen|showerSet|bathtub)$/.test(p.key)) structs.push({ kind: "drain", at: center(p.rect).map(round) });
    }
    if (WET.test(room.name) && !structs.some((s) => s.kind === "drain" && pointInRect(s.at, rect))) {
      structs.push({ kind: "drain", at: center(rect).map(round) });
    }
  });
  const defaultCeil = (name) => /卫|厕|浴|厨|bath|kitchen/i.test(name) ? { type: "alu" } : /阳台|露台|balcony/i.test(name) ? { type: "none" } : /客厅|餐厅|起居|living|dining/i.test(name) ? { type: "edge", cove: true, curtain: 200 } : /卧|bed/i.test(name) ? { type: "edge", cove: true, curtain: 200 } : { type: "flat" };
  const spec = {
    name: layout.name || "\u6237\u578B",
    height: Number(layout.height) || 2800,
    autoElec: true,
    walls: walls.map((wall) => {
      const result = { a: wall.a, b: wall.b, t: wall.t };
      if (wall.t >= 200) result.bearing = true;
      if (wall.openings.length) result.openings = wall.openings.map((opening) => {
        const out = { type: opening.type, from: opening.from, to: opening.to };
        if (opening.entry) out.entry = true;
        if (opening.hinge) out.hinge = opening.hinge;
        if (opening.into) out.into = opening.into.map(round);
        return out;
      });
      return result;
    }),
    rooms: rooms.map((room, index) => {
      const label = { name: room.name, at: center(mainRect[index]).map(round), ceil: typeof room.ceil === "object" && room.ceil ? room.ceil : typeof room.ceil === "string" ? { type: room.ceil } : defaultCeil(room.name) };
      const floor = finish(FLOOR_MATS, room.mat ?? room.floor), wall = finish(WALL_MATS, room.wallMat ?? room.wall), skirting = finish(SKIRTINGS, room.skirting);
      if (floor) label.mat = floor;
      else if (room.mat ?? room.floor) notes.push(`${room.name}\uFF1A\u5730\u9762\u201C${room.mat ?? room.floor}\u201D\u8BBE\u8BA1\u5668\u91CC\u6CA1\u6709\uFF0C\u6309\u9ED8\u8BA4\u94FA`);
      if (wall) label.wallMat = wall;
      else if (room.wallMat ?? room.wall) notes.push(`${room.name}\uFF1A\u5899\u9762\u201C${room.wallMat ?? room.wall}\u201D\u8BBE\u8BA1\u5668\u91CC\u6CA1\u6709\uFF0C\u6309\u9ED8\u8BA4\u5237`);
      if (skirting) label.skirting = skirting;
      return label;
    }),
    furniture,
    structs
  };
  return { spec, notes };
}

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
    const score = queryGrams.filter((gram) => text.includes(gram)).length / Math.max(queryGrams.length, 1);
    return { key, score };
  }).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key)).slice(0, 3).map((item) => item.key);
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

// client/workspaces/cad/lib/design/geometry.ts
var distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segmentDistance(point2, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point2[0] - a[0]) * dx + (point2[1] - a[1]) * dy) / lengthSquared)) : 0;
  return distance(point2, [a[0] + t * dx, a[1] + t * dy]);
}
function pointInPolygon(point2, polygon) {
  let inside2 = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (segmentDistance(point2, a, b) < 1e-3) return true;
    if (a[1] > point2[1] !== b[1] > point2[1] && point2[0] < (b[0] - a[0]) * (point2[1] - a[1]) / (b[1] - a[1]) + a[0]) inside2 = !inside2;
  }
  return inside2;
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
    const area2 = polygon.reduce((sum, p, i) => {
      const q = polygon[(i + 1) % polygon.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0);
    if (area2 > 0) regions.push(polygon);
  }
  return regions;
}

// client/workspaces/cad/lib/design/spec-validate.ts
var isObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var point = (value) => Array.isArray(value) && value.length === 2 && value.every(finite);
function validateSpec(input) {
  const issues = [];
  const add = (code, path, message, level = "error") => issues.push({ level, code, path, msg: `${path} ${message}` });
  if (!isObject(input) || !Array.isArray(input.walls) || !input.walls.length) {
    add("schema", "walls", "\u5FC5\u987B\u63D0\u4F9B\u975E\u7A7A\u5899\u6570\u7EC4\uFF0C\u6BCF\u9762\u5899\u586B\u5199 a\u3001b \u5750\u6807\u548C\u6B63\u6570\u539A\u5EA6 t");
    return issues;
  }
  if (input.name !== void 0 && typeof input.name !== "string") add("schema", "name", "\u6539\u4E3A\u5B57\u7B26\u4E32");
  if (input.height !== void 0 && (!finite(input.height) || input.height <= 0)) add("schema", "height", "\u586B\u5199\u6B63\u6570\u5C42\u9AD8\uFF0C\u5355\u4F4D mm");
  for (const [index, wall] of input.walls.entries()) {
    const path = `walls[${index}]`;
    if (!isObject(wall) || !point(wall.a) || !point(wall.b) || !finite(wall.t) || wall.t <= 0 || distance(wall.a, wall.b) === 0) {
      add("schema", path, "a/b \u5FC5\u987B\u662F\u4E24\u4E2A\u6709\u9650\u6570\u5B57\u7684\u5750\u6807\uFF0C\u7AEF\u70B9\u4E0D\u80FD\u91CD\u5408\uFF0Ct \u5FC5\u987B\u5927\u4E8E 0");
      continue;
    }
    if (wall.openings !== void 0 && !Array.isArray(wall.openings)) add("schema", path + ".openings", "\u6539\u4E3A\u6D1E\u53E3\u6570\u7EC4");
    for (const [oi, opening] of (Array.isArray(wall.openings) ? wall.openings : []).entries()) {
      if (!isObject(opening) || !isOpeningType(opening.type) || !finite(opening.from) || !finite(opening.to) || opening.into !== void 0 && !point(opening.into)) add("schema", `${path}.openings[${oi}]`, `type \u53EF\u9009 ${OPENING_TYPES.join("\u3001")}\uFF0C\u586B\u5199\u6709\u9650\u6570\u5B57 from/to\uFF0C\u4EE5\u53CA\u6709\u6548\u7684 into \u4E24\u5143\u5750\u6807\uFF08\u5982\u6709\uFF09`);
    }
  }
  for (const key of ["rooms", "furniture"]) {
    if (input[key] !== void 0 && !Array.isArray(input[key])) add("schema", key, "\u6539\u4E3A\u6570\u7EC4");
    for (const [index, item] of (Array.isArray(input[key]) ? input[key] : []).entries()) {
      if (!isObject(item) || !point(item.at) || typeof item[key === "rooms" ? "name" : "key"] !== "string") add("schema", `${key}[${index}]`, "\u586B\u5199 at \u4E24\u5143\u5750\u6807\u548C\u540D\u79F0/key \u5B57\u7B26\u4E32");
    }
  }
  for (const key of ["structs", "elec", "beams"]) {
    if (input[key] !== void 0 && !Array.isArray(input[key])) add("schema", key, "\u6539\u4E3A\u6570\u7EC4");
    const items = Array.isArray(input[key]) ? input[key] : [];
    for (const [index, item] of items.entries()) {
      const valid = isObject(item) && (key === "beams" ? point(item.a) && point(item.b) : point(item.at) && typeof item.kind === "string");
      if (!valid) add("schema", `${key}[${index}]`, key === "beams" ? "\u586B\u5199 a/b \u4E24\u5143\u6570\u5B57\u5750\u6807" : "\u586B\u5199 kind \u5B57\u7B26\u4E32\u548C at \u4E24\u5143\u6570\u5B57\u5750\u6807");
    }
  }
  if (issues.length) return issues;
  const spec = input;
  const xs = spec.walls.flatMap((wall) => [wall.a[0], wall.b[0]]);
  const ys = spec.walls.flatMap((wall) => [wall.a[1], wall.b[1]]);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (extent < 2e3 || extent > 2e5) add("unit", "walls", `\u5305\u56F4\u76D2\u6700\u5927\u8FB9 ${extent}\uFF0C\u8BF7\u628A\u5750\u6807\u7EDF\u4E00\u4E3A mm\uFF0C\u4F4F\u5B85\u8F6E\u5ED3\u5E94\u5728 2000\u2013200000mm \u5185`);
  spec.walls.forEach((wall, wi) => {
    const path = `walls[${wi}]`;
    for (const end of ["a", "b"]) {
      if (!spec.walls.some((other, i) => i !== wi && segmentDistance(wall[end], other.a, other.b) <= 40)) add("free_end", `${path}.${end}`, `\u7AEF\u70B9 ${wall[end]} \u60AC\u7A7A\uFF0C\u8BF7\u5C06\u7AEF\u70B9\u8FDE\u63A5\u5230\u53E6\u4E00\u9762\u5899\u7684\u7AEF\u70B9\u6216\u4E2D\u7EBF\uFF08\u8DDD\u79BB \u226440mm\uFF09`);
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
        add("opening_range", openingPath, `${opening.type} from=${opening.from} to=${opening.to} \u6362\u7B97\u6CBF\u5899\u8DDD\u79BB ${from}\u2013${to}\uFF0C\u5899\u957F ${Math.round(length)}\uFF0C\u8D8A\u754C ${Math.round(over)}mm\uFF1B\u8BF7\u6EE1\u8DB3 ${origin} < from < to < ${origin + length}\uFF08\u5EFA\u8BAE\u4E24\u7AEF\u81F3\u5C11\u7559 50mm\uFF09`);
      }
      return { from, to, path: openingPath };
    });
    ranges.forEach((range, i) => {
      for (const other of ranges.slice(0, i)) if (Math.max(range.from, other.from) < Math.min(range.to, other.to)) add("opening_overlap", range.path, `\u4E0E ${other.path} \u91CD\u53E0\uFF0C\u8BF7\u79FB\u52A8\u6D1E\u53E3\uFF0C\u786E\u4FDD\u4E24\u8005\u533A\u95F4\u4E0D\u91CD\u53E0`);
    });
  });
  (spec.furniture ?? []).forEach((item, i) => {
    if (!isValidKey(item.key)) add("furniture_key", `furniture[${i}].key`, `\u5BB6\u5177\u5E93\u6CA1\u6709 ${item.key}\uFF0C\u8BF7\u4ECE\u5019\u9009 ${suggestKeys(item.key).join("\u3001")} \u4E2D\u9009\u62E9\u5339\u914D\u9879`);
    if (item.rot !== void 0 && !finite(item.rot)) add("rot", `furniture[${i}].rot`, "\u6539\u4E3A\u6709\u9650\u6570\u5B57\u89D2\u5EA6\uFF0C\u5982 0\u300190\u3001180 \u6216 270");
  });
  const regions = enclosedRegions(spec.walls);
  (spec.rooms ?? []).forEach((room, i) => {
    if (!regions.some((region) => pointInPolygon(room.at, region))) add("room_label_outside", `rooms[${i}].at`, `${room.name} \u6807\u7B7E\u5728\u56F4\u5408\u533A\u57DF\u5916\uFF0C\u8BF7\u5C06\u6807\u7B7E\u70B9\u79FB\u5165\u5899\u4F53\u56F4\u5408\u533A\u57DF`, "warn");
  });
  return issues;
}

// client/workspaces/cad/lib/design/spec-autofix.ts
function autofixSpec(spec) {
  const fixed = structuredClone(spec);
  const roundPoint = (point2) => point2.map((value) => Math.round(value * 2) / 2);
  for (const wall of fixed.walls) {
    wall.a = roundPoint(wall.a);
    wall.b = roundPoint(wall.b);
    for (const opening of wall.openings ?? []) {
      opening.from = Math.round(opening.from * 2) / 2;
      opening.to = Math.round(opening.to * 2) / 2;
      if (Array.isArray(opening.into)) opening.into = roundPoint(opening.into);
      if (opening.from > opening.to) [opening.from, opening.to] = [opening.to, opening.from];
    }
  }
  for (const key of ["rooms", "furniture", "structs", "elec"]) {
    const items = fixed[key];
    for (const item of items ?? []) if (item.at) item.at = roundPoint(item.at);
  }
  for (const room of fixed.rooms ?? []) {
    if (typeof room.ceil === "string") room.ceil = { type: room.ceil };
  }
  const beams = fixed.beams;
  for (const beam of beams ?? []) {
    beam.a = roundPoint(beam.a);
    beam.b = roundPoint(beam.b);
  }
  return fixed;
}
export {
  autofixSpec,
  layoutToSpec,
  validateSpec
};
