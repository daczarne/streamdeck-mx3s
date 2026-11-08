import {
  ACCENTS,
  batteryGlyph,
  boltGlyph,
  mouseGlyph,
  percentageGlyph,
  TILES,
  WHITE,
} from "@daczarne/streamdeck-icons";
import { describe, expect, it } from "vitest";

import type { Battery } from "../battery";
import {
  batteryImage,
  batterySvg,
  DEFAULT_BACKGROUND,
  DEFAULT_BATTERY,
  DEFAULT_BOLT,
  DEFAULT_LEVELS,
  DEFAULT_MOUSE,
} from "./battery-image";

/** A reading of the battery, 95%, full and not charging unless given otherwise, as the mouse was measured. */
function reading(battery: Partial<Battery> = {}): Battery {
  return { percentage: 95, level: "full", charging: false, ...battery };
}

// The default style: the charcoal tile, the filled white mouse, the battery, the green bolt while charging, and the
// default levels.
const TILE = {
  background: DEFAULT_BACKGROUND,
  mouse: DEFAULT_MOUSE,
  battery: DEFAULT_BATTERY,
  bolt: DEFAULT_BOLT,
  levels: DEFAULT_LEVELS,
};

/** The colors an SVG uses, for its fills and strokes. */
function colors(svg: string): Set<string> {
  return new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1] ?? ""));
}

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

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, WHITE, color]));
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

    expect(svg).toContain(percentageGlyph(144, { percentage, color }));
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

    expect(svg).toContain(percentageGlyph(144, { percentage: 35, color: ACCENTS.gold }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.35, color: ACCENTS.gold }));
  });

  it("draws a green bolt only while the mouse is charging, whatever its level", () => {
    const bolt = boltGlyph(144 * 0.34, { color: ACCENTS.leaf });

    expect(batterySvg({ battery: reading({ level: "low", charging: true }), found: true }, TILE)).toContain(bolt);
    expect(batterySvg({ battery: reading({ charging: false }), found: true }, TILE)).not.toContain("stroke-linejoin");
  });

  it("greys out the last reading when the mouse isn't found", () => {
    const svg = batterySvg(
      { battery: reading({ percentage: 25, level: "critical", charging: true }), found: false },
      TILE,
    );

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(percentageGlyph(144, { percentage: 25, color: TILES.grey }));
  });

  it("draws an empty battery and dashes in grey when the mouse has never been found", () => {
    const svg = batterySvg({ battery: undefined, found: false }, TILE);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(percentageGlyph(144, { color: TILES.grey }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { color: TILES.grey }));
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
    expect(colors(svg)).toEqual(new Set([WHITE, ACCENTS.leaf]));
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

  it("turns grey with the rest of the key when the mouse isn't found, whatever its color", () => {
    const svg = batterySvg(
      { battery: reading(), found: false },
      { ...TILE, mouse: { color: "#123456", filled: false, followsLevel: false } },
    );

    expect(svg).toContain(mouseGlyph(144 * 0.34, { color: TILES.grey, filled: false }));
  });

  it("takes its level's color when it follows it, and turns grey with the rest of the key", () => {
    const mouse = { ...DEFAULT_MOUSE, followsLevel: true };

    expect(batterySvg({ battery: reading({ percentage: 20 }), found: true }, { ...TILE, mouse })).toContain(
      mouseGlyph(144 * 0.34, { color: ACCENTS.gold, filled: true }),
    );
    expect(batterySvg({ battery: reading({ percentage: 20 }), found: false }, { ...TILE, mouse })).toContain(
      mouseGlyph(144 * 0.34, { color: TILES.grey, filled: true }),
    );
  });

  it("is left out when the key chooses none, with the battery and the bolt where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, mouse: undefined });

    expect(colors(without)).toEqual(new Set([TILES.charcoal, ACCENTS.leaf]));
    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    expect(placed(without)).toEqual(placed(batterySvg(shown, TILE)).slice(1));
  });
});

describe("its battery", () => {
  it("takes its own color when it doesn't follow its level, and turns grey with the rest of the key", () => {
    const battery = { color: "#123456", followsLevel: false };

    const svg = batterySvg({ battery: reading({ percentage: 20 }), found: true }, { ...TILE, battery });

    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.2, color: "#123456" }));
    expect(svg).toContain(percentageGlyph(144, { percentage: 20, color: ACCENTS.gold }));
    expect(batterySvg({ battery: reading({ percentage: 20 }), found: false }, { ...TILE, battery })).toContain(
      batteryGlyph(144 * 0.34, { charge: 0.2, color: TILES.grey }),
    );
  });

  it("is left out when the key chooses not to show it, with the mouse, the bolt and the percentage where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, battery: undefined });

    expect(without).not.toContain(batteryGlyph(144 * 0.34, { charge: 0.95, color: ACCENTS.leaf }));
    expect(without).toContain(percentageGlyph(144, { percentage: 95, color: ACCENTS.leaf }));
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
    expect(
      batterySvg({ battery: reading({ percentage: 10, charging: true }), found: false }, { ...TILE, bolt }),
    ).toContain(boltGlyph(BOLT, { color: TILES.grey }));
  });

  it("shows always, as not charging, before the first reading", () => {
    const svg = batterySvg({ battery: undefined, found: false }, { ...TILE, bolt: { show: "always", ...CUSTOM } });

    expect(svg).toContain(boltGlyph(BOLT, { color: TILES.grey }));
  });

  it("turns grey with the rest of the key when the mouse isn't found, whatever its colors", () => {
    const shown = { battery: reading({ charging: false }), found: false };

    expect(batterySvg(shown, { ...TILE, bolt: { show: "always", ...CUSTOM } })).toContain(
      boltGlyph(BOLT, { color: TILES.grey }),
    );
  });

  it("is dim slate by default while the mouse doesn't charge, for a key that shows it always", () => {
    const svg = batterySvg(
      { battery: reading({ charging: false }), found: true },
      { ...TILE, bolt: { ...DEFAULT_BOLT, show: "always" } },
    );

    expect(svg).toContain(boltGlyph(BOLT, { color: TILES.slate }));
  });

  it("is left out with the mouse, the battery and the percentage where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, bolt: { ...DEFAULT_BOLT, show: "never" } });

    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    const all = placed(batterySvg(shown, TILE));
    expect(placed(without)).toEqual([...all.slice(0, 2), ...all.slice(3)]);
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
