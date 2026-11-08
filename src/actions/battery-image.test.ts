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
import { batteryImage, batterySvg, DEFAULT_BACKGROUND, DEFAULT_MOUSE } from "./battery-image";

/** A reading of the battery, 95%, full and not charging unless given otherwise, as the mouse was measured. */
function reading(battery: Partial<Battery> = {}): Battery {
  return { percentage: 95, level: "full", charging: false, ...battery };
}

// The default style: the charcoal tile, the filled white mouse, and the battery.
const TILE = { background: DEFAULT_BACKGROUND, mouse: DEFAULT_MOUSE, showBattery: true };

/** The colors an SVG uses, for its fills and strokes. */
function colors(svg: string): Set<string> {
  return new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((match) => match[1] ?? ""));
}

//* Tests

describe("batterySvg", () => {
  it.each([
    ["full", ACCENTS.leaf],
    ["good", ACCENTS.leaf],
    ["low", ACCENTS.gold],
    ["critical", ACCENTS.scarlet],
  ] as const)("colors a %s battery, and its percentage, by its level", (level, color) => {
    const svg = batterySvg({ battery: reading({ level, percentage: 50 }), found: true }, TILE);

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, WHITE, color]));
  });

  it.each([
    [61, ACCENTS.leaf],
    [60, ACCENTS.leaf],
    [59, ACCENTS.gold],
    [30, ACCENTS.gold],
    [29, ACCENTS.scarlet],
  ])("colors a battery at %s%% with a level it doesn't know by its percentage", (percentage, color) => {
    const svg = batterySvg({ battery: reading({ level: undefined, percentage }), found: true }, TILE);

    expect(colors(svg)).toContain(color);
  });

  it("draws the percentage, and the battery filled as far", () => {
    const svg = batterySvg({ battery: reading({ percentage: 42, level: "low" }), found: true }, TILE);

    expect(svg).toContain(percentageGlyph(144, { percentage: 42, color: ACCENTS.gold }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.42, color: ACCENTS.gold }));
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
      { ...TILE, mouse: { color: "#123456", filled: false } },
    );

    expect(svg).toContain(mouseGlyph(144 * 0.34, { color: "#123456", filled: false }));
    expect(colors(svg)).not.toContain(WHITE);
  });

  it("turns grey with the rest of the key when the mouse isn't found, whatever its color", () => {
    const svg = batterySvg(
      { battery: reading(), found: false },
      { ...TILE, mouse: { color: "#123456", filled: false } },
    );

    expect(svg).toContain(mouseGlyph(144 * 0.34, { color: TILES.grey, filled: false }));
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
  it("is left out when the key chooses not to show it, with the mouse, the bolt and the percentage where they were", () => {
    const shown = { battery: reading({ charging: true }), found: true };

    const without = batterySvg(shown, { ...TILE, showBattery: false });

    expect(without).not.toContain(batteryGlyph(144 * 0.34, { charge: 0.95, color: ACCENTS.leaf }));
    expect(without).toContain(percentageGlyph(144, { percentage: 95, color: ACCENTS.leaf }));
    const placed = (svg: string) => [...svg.matchAll(/<g transform="translate\(([^)]+)\)">/g)].map((match) => match[1]);
    const all = placed(batterySvg(shown, TILE));
    expect(placed(without)).toEqual([all[0], ...all.slice(2)]);
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
