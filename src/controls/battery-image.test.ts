import {
  ACCENTS,
  batteryGlyph,
  boltGlyph,
  mouseGlyph,
  percentageGlyph,
  TILES,
  WHITE,
} from "@daczarne/streamdeck-icons";
import { describe, expect, it, vi } from "vitest";

import type { Battery } from "../mouse/battery";
import { type BatterySettings, batterySettingsSchema, parseSettings } from "../settings/schemas";
import { batteryImage, batterySvg, type Style, styleOf } from "./battery-image";

/** A reading of the battery, 95%, full and not charging unless given otherwise, as the mouse was measured. */
function reading(battery: Partial<Battery> = {}): Battery {
  return { percentage: 95, level: "full", charging: false, ...battery };
}

//* Fakes

const logger = { warn: vi.fn() };

//* Fixtures

// The settings of a key that hasn't chosen any, and the style they give: the charcoal tile, the filled white mouse, the
// battery, the bolt, and the default levels.
const DEFAULTS: BatterySettings = parseSettings({}, batterySettingsSchema, logger);
const TILE = styleOf(DEFAULTS);

/** The colors an SVG uses, for its fills and strokes. */
function colors(svg: string): Set<string> {
  return new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1] ?? ""));
}

// The side of the percentage's canvas.
const NUMBER = 144 * 0.9;

//* Tests

describe("batterySvg", () => {
  it.each([
    [100, ACCENTS.leaf],
    [40, ACCENTS.leaf],
    [39, ACCENTS.gold],
    [15, ACCENTS.gold],
    [14, ACCENTS.scarlet],
    [0, ACCENTS.scarlet],
  ])("colors a battery at %s%%, and its percentage, by the default levels", (percentage, color) => {
    const svg = batterySvg({ battery: reading({ percentage }), found: true }, TILE);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, WHITE, color, TILE.bolt.idle]));
  });

  it.each([
    ["full", 10, ACCENTS.scarlet],
    ["critical", 95, ACCENTS.leaf],
    [undefined, 35, ACCENTS.gold],
  ] as const)("colors a battery the mouse puts at %s by its percentage, %s%%", (level, percentage, color) => {
    const svg = batterySvg({ battery: reading({ level, percentage }), found: true }, TILE);

    expect(colors(svg)).toContain(color);
  });

  it.each([
    [80, "#111111"],
    [79, "#222222"],
    [10, "#222222"],
    [9, "#333333"],
  ])("colors a battery at %s%% by the levels the key chooses", (percentage, color) => {
    const levels = { high: "#111111", medium: "#222222", mediumFrom: 10, mediumTo: 80, low: "#333333" };

    const svg = batterySvg({ battery: reading({ percentage }), found: true }, { ...TILE, levels });

    expect(svg).toContain(percentageGlyph(NUMBER, { percentage, color }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: percentage / 100, color }));
  });

  it.each([
    [80, "#111111"],
    [50, "#222222"],
    [9, "#333333"],
  ])("takes the medium level's percentages in either order, at %s%%", (percentage, color) => {
    const levels = { high: "#111111", medium: "#222222", mediumFrom: 80, mediumTo: 10, low: "#333333" };

    const svg = batterySvg({ battery: reading({ percentage }), found: true }, { ...TILE, levels });

    expect(colors(svg)).toContain(color);
  });

  it.each([
    [50, "#111111"],
    [49, "#333333"],
  ])("shows no medium level when its percentages are the same, at %s%%", (percentage, color) => {
    const levels = { high: "#111111", medium: "#222222", mediumFrom: 50, mediumTo: 50, low: "#333333" };

    const svg = batterySvg({ battery: reading({ percentage }), found: true }, { ...TILE, levels });

    expect(colors(svg)).toContain(color);
    expect(colors(svg)).not.toContain("#222222");
  });

  it("draws the percentage, and the battery filled as far", () => {
    const svg = batterySvg({ battery: reading({ percentage: 35 }), found: true }, TILE);

    expect(svg).toContain(percentageGlyph(NUMBER, { percentage: 35, color: ACCENTS.gold }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.35, color: ACCENTS.gold }));
  });

  it("draws the bolt always, pink while the mouse is charging and slate while it isn't", () => {
    expect(batterySvg({ battery: reading({ charging: true }), found: true }, TILE)).toContain(
      boltGlyph(144 * 0.34, { color: TILE.bolt.charging }),
    );
    expect(batterySvg({ battery: reading({ charging: false }), found: true }, TILE)).toContain(
      boltGlyph(144 * 0.34, { color: TILE.bolt.idle }),
    );
  });
});

describe("its background", () => {
  it("is the charcoal tile by default, filling the key", () => {
    expect(batterySvg({ battery: reading(), found: true }, TILE)).toContain(
      `<rect width="144" height="144" fill="${TILES.charcoal}"/>`,
    );
  });

  it("is the color the key chooses", () => {
    const svg = batterySvg({ battery: reading(), found: true }, { ...TILE, background: "#123456" });

    expect(svg).toContain(`<rect width="144" height="144" fill="#123456"/>`);
    expect(colors(svg)).not.toContain(TILES.charcoal);
  });

  it("is left out when the key chooses none, so the image is transparent", () => {
    const svg = batterySvg({ battery: reading(), found: true }, { ...TILE, background: undefined });

    expect(svg).not.toContain("<rect");
    expect(colors(svg)).toEqual(new Set([WHITE, ACCENTS.leaf, TILE.bolt.idle]));
  });
});

describe("its mouse", () => {
  it("is filled and white by default", () => {
    expect(batterySvg({ battery: reading(), found: true }, TILE)).toContain(
      mouseGlyph(144 * 0.34, { color: WHITE, filled: true }),
    );
  });

  it("takes the color and the style the key chooses", () => {
    const svg = batterySvg(
      { battery: reading(), found: true },
      { ...TILE, mouse: { color: "#123456", filled: false, followsLevel: false } },
    );

    expect(svg).toContain(mouseGlyph(144 * 0.34, { color: "#123456", filled: false }));
    expect(colors(svg)).not.toContain(WHITE);
  });

  it("takes its level's color when it follows it", () => {
    const mouse = { color: WHITE, filled: true, followsLevel: true };

    expect(batterySvg({ battery: reading({ percentage: 20 }), found: true }, { ...TILE, mouse })).toContain(
      mouseGlyph(144 * 0.34, { color: ACCENTS.gold, filled: true }),
    );
  });

  it("is left out when the key chooses none, with the battery and the bolt where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, mouse: undefined });

    expect(colors(without)).toEqual(new Set([TILES.charcoal, ACCENTS.leaf, TILE.bolt.charging]));
    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    expect(placed(without)).toEqual(placed(batterySvg(shown, TILE)).slice(1));
  });
});

describe("its battery", () => {
  it("takes its own color when it doesn't follow its level", () => {
    const battery = { color: "#123456", followsLevel: false };

    const svg = batterySvg({ battery: reading({ percentage: 20 }), found: true }, { ...TILE, battery });

    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.2, color: "#123456" }));
    expect(svg).toContain(percentageGlyph(NUMBER, { percentage: 20, color: ACCENTS.gold }));
  });

  it("is left out when the key chooses not to show it, with the mouse, the bolt and the percentage where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, battery: undefined });

    expect(without).not.toContain(batteryGlyph(144 * 0.34, { charge: 0.95, color: ACCENTS.leaf }));
    expect(without).toContain(percentageGlyph(NUMBER, { percentage: 95, color: ACCENTS.leaf }));
    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    const all = placed(batterySvg(shown, TILE));
    expect(placed(without)).toEqual([all[0], ...all.slice(2)]);
  });
});

describe("its bolt", () => {
  const BOLT = 144 * 0.34;
  const CUSTOM = { charging: "#123456", chargingFollowsLevel: false, idle: "#654321" };

  it.each([
    ["always", true, "#123456"],
    ["always", false, "#654321"],
    ["charging", true, "#123456"],
  ] as const)(
    "shows when it's set to %s and the mouse is charging: %s, in its color for that",
    (show, charging, color) => {
      const svg = batterySvg({ battery: reading({ charging }), found: true }, { ...TILE, bolt: { show, ...CUSTOM } });

      expect(svg).toContain(boltGlyph(BOLT, { color }));
    },
  );

  it.each([
    ["charging", false],
    ["never", true],
    ["never", false],
  ] as const)("is left out when it's set to %s and the mouse is charging: %s", (show, charging) => {
    const svg = batterySvg({ battery: reading({ charging }), found: true }, { ...TILE, bolt: { show, ...CUSTOM } });

    expect(svg).not.toContain("stroke-linejoin");
  });

  it("takes its level's color while charging when it follows it, and its own while not", () => {
    const bolt = { ...CUSTOM, show: "always", chargingFollowsLevel: true } as const;

    expect(
      batterySvg({ battery: reading({ percentage: 10, charging: true }), found: true }, { ...TILE, bolt }),
    ).toContain(boltGlyph(BOLT, { color: ACCENTS.scarlet }));
    expect(
      batterySvg({ battery: reading({ percentage: 10, charging: false }), found: true }, { ...TILE, bolt }),
    ).toContain(boltGlyph(BOLT, { color: "#654321" }));
  });

  it("is dim slate by default while the mouse doesn't charge, for a key that shows it always", () => {
    const svg = batterySvg(
      { battery: reading({ charging: false }), found: true },
      { ...TILE, bolt: { ...TILE.bolt, show: "always" } },
    );

    expect(svg).toContain(boltGlyph(BOLT, { color: TILES.slate }));
  });

  it("is left out with the mouse, the battery and the percentage where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, bolt: { ...TILE.bolt, show: "never" } });

    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    const all = placed(batterySvg(shown, TILE));
    expect(placed(without)).toEqual([...all.slice(0, 2), ...all.slice(3)]);
  });
});

describe("once the mouse isn't found", () => {
  const CELL = 144 * 0.34;
  const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
  // Everything a key can show, in colors of its own, which a key whose mouse isn't found doesn't take.
  const EVERYTHING = {
    ...TILE,
    mouse: { color: "#123456", filled: true, followsLevel: true },
    battery: { color: "#123456", followsLevel: false },
    bolt: { ...TILE.bolt, show: "always", charging: "#123456", idle: "#123456" },
  } as const;

  it("shows the mouse and the last reading's percentage in grey by default, and nothing else", () => {
    const svg = batterySvg({ battery: reading({ percentage: 25, charging: true }), found: false }, EVERYTHING);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(mouseGlyph(CELL, { color: TILES.grey, filled: true }));
    expect(svg).toContain(percentageGlyph(NUMBER, { percentage: 25, color: TILES.grey }));
    const all = placed(batterySvg({ battery: reading(), found: true }, TILE));
    expect(placed(svg)).toEqual([all[0], all.at(-1)]);
  });

  it("shows the mouse and dashes before the first reading", () => {
    const svg = batterySvg({ battery: undefined, found: false }, TILE);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(mouseGlyph(CELL, { color: TILES.grey, filled: true }));
    expect(svg).toContain(percentageGlyph(NUMBER, { color: TILES.grey }));
  });

  it("shows what the key chooses for it, all in its color, whatever the key shows otherwise", () => {
    const notFound = { mouse: { filled: false }, battery: true, bolt: true, color: "#654321" };
    const style = { ...EVERYTHING, mouse: undefined, notFound };

    const svg = batterySvg({ battery: reading({ percentage: 25 }), found: false }, style);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, "#654321"]));
    expect(svg).toContain(mouseGlyph(CELL, { color: "#654321", filled: false }));
    expect(svg).toContain(batteryGlyph(CELL, { charge: 0.25, color: "#654321" }));
    expect(svg).toContain(boltGlyph(CELL, { color: "#654321" }));
    expect(svg).toContain(percentageGlyph(NUMBER, { percentage: 25, color: "#654321" }));
  });

  it("shows an empty battery before the first reading, when the key chooses it", () => {
    const style = { ...TILE, notFound: { ...TILE.notFound, battery: true } };

    expect(batterySvg({ battery: undefined, found: false }, style)).toContain(
      batteryGlyph(CELL, { color: TILES.grey }),
    );
  });

  it.each([
    ["charging", false],
    ["never", true],
  ] as const)(
    "shows the bolt when the key chooses it, even when its section is set to %s and charging is %s",
    (show, charging) => {
      const style = { ...TILE, bolt: { ...TILE.bolt, show }, notFound: { ...TILE.notFound, bolt: true } };

      expect(batterySvg({ battery: reading({ charging }), found: false }, style)).toContain(
        boltGlyph(CELL, { color: TILES.grey }),
      );
    },
  );

  it("leaves out everything but the percentage when the key chooses, even what it shows always", () => {
    const style = { ...EVERYTHING, notFound: { ...TILE.notFound, mouse: undefined } };

    const svg = batterySvg({ battery: reading({ charging: true }), found: false }, style);

    expect(placed(svg)).toEqual([placed(batterySvg({ battery: reading(), found: true }, TILE)).at(-1)]);
  });

  it("leaves out the mouse when the key chooses, with the percentage where it was", () => {
    const style = { ...TILE, notFound: { ...TILE.notFound, mouse: undefined } };

    const svg = batterySvg({ battery: reading(), found: false }, style);

    expect(placed(svg)).toEqual([placed(batterySvg({ battery: reading(), found: true }, TILE)).at(-1)]);
  });
});

describe("styleOf", () => {
  it("draws a key that has chosen nothing on the charcoal tile, with the mouse, the battery and the bolt", () => {
    expect(TILE).toEqual({
      background: TILES.charcoal,
      mouse: { color: WHITE, filled: true, followsLevel: false },
      battery: { color: ACCENTS.leaf, followsLevel: true },
      bolt: { show: "always", charging: "#FF007F", chargingFollowsLevel: false, idle: TILES.slate },
      levels: { high: ACCENTS.leaf, medium: ACCENTS.gold, mediumFrom: 15, mediumTo: 40, low: ACCENTS.scarlet },
      notFound: { mouse: { filled: true }, battery: false, bolt: false, color: TILES.grey },
    });
  });

  it.each<[string, Partial<BatterySettings>, Style["background"]]>([
    ["a color", { background: "#a1b2c3" }, "#a1b2c3"],
    ["no background", { background: "#a1b2c3", noBackground: true }, undefined],
  ])("takes %s", (_case, settings, background) => {
    expect(styleOf({ ...DEFAULTS, ...settings })).toEqual({ ...TILE, background });
  });

  it("takes an outlined mouse, outlined once the mouse isn't found too", () => {
    expect(styleOf({ ...DEFAULTS, mouseStyle: "outlined" })).toEqual({
      ...TILE,
      mouse: { color: WHITE, filled: false, followsLevel: false },
      notFound: { ...TILE.notFound, mouse: { filled: false } },
    });
  });

  it.each<[string, Partial<BatterySettings>, Style["mouse"]]>([
    ["a mouse color", { mouseColor: "#a1b2c3" }, { color: "#a1b2c3", filled: true, followsLevel: false }],
    ["the mouse following the level", { mouseFollowsLevel: true }, { color: WHITE, filled: true, followsLevel: true }],
    ["no mouse", { mouseColor: "#a1b2c3", showMouse: false }, undefined],
  ])("takes %s", (_case, settings, mouse) => {
    expect(styleOf({ ...DEFAULTS, ...settings })).toEqual({ ...TILE, mouse });
  });

  it.each<[string, Partial<BatterySettings>, Style["battery"]]>([
    ["the battery hidden", { showBattery: false, batteryColor: "#a1b2c3" }, undefined],
    [
      "the battery in its own color",
      { batteryFollowsLevel: false, batteryColor: "#a1b2c3" },
      { color: "#a1b2c3", followsLevel: false },
    ],
  ])("takes %s", (_case, settings, battery) => {
    expect(styleOf({ ...DEFAULTS, ...settings })).toEqual({ ...TILE, battery });
  });

  it.each<[string, Partial<BatterySettings>, Style["bolt"]]>([
    ["the bolt never", { showBolt: "never" }, { ...TILE.bolt, show: "never" }],
    ["the bolt while charging", { showBolt: "charging" }, { ...TILE.bolt, show: "charging" }],
    [
      "the bolt's colors",
      { boltColor: "#a1b2c3", boltIdleColor: "#c3b2a1" },
      { ...TILE.bolt, charging: "#a1b2c3", idle: "#c3b2a1" },
    ],
    ["the bolt following the level", { boltFollowsLevel: true }, { ...TILE.bolt, chargingFollowsLevel: true }],
  ])("takes %s", (_case, settings, bolt) => {
    expect(styleOf({ ...DEFAULTS, ...settings })).toEqual({ ...TILE, bolt });
  });

  it("takes the levels' colors and percentages", () => {
    const settings = {
      highColor: "#111111",
      mediumColor: "#222222",
      mediumFrom: 15,
      mediumTo: 80,
      lowColor: "#333333",
    };

    expect(styleOf({ ...DEFAULTS, ...settings })).toEqual({
      ...TILE,
      levels: { high: "#111111", medium: "#222222", mediumFrom: 15, mediumTo: 80, low: "#333333" },
    });
  });

  it.each<[string, Partial<BatterySettings>, Style["notFound"]]>([
    [
      "what to show once the mouse isn't found",
      { notFoundMouse: false, notFoundBattery: true, notFoundBolt: true, notFoundColor: "#a1b2c3" },
      { mouse: undefined, battery: true, bolt: true, color: "#a1b2c3" },
    ],
    ["the mouse not found even when it's hidden", { showMouse: false }, TILE.notFound],
  ])("takes %s", (_case, settings, notFound) => {
    expect(styleOf({ ...DEFAULTS, ...settings }).notFound).toEqual(notFound);
  });
});

describe("batteryImage", () => {
  it("is the SVG as a base64 data URL", () => {
    const shown = { battery: reading(), found: true };

    const image = batteryImage(shown, TILE);

    expect(image.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(Buffer.from(image.split(",")[1] ?? "", "base64").toString()).toBe(batterySvg(shown, TILE));
  });
});
