import { ACCENTS, batteryGlyph, boltGlyph, percentageGlyph, TILES, WHITE } from "@daczarne/streamdeck-icons";
import { describe, expect, it } from "vitest";

import type { Battery } from "../battery";
import { batteryImage, batterySvg } from "./battery-image";

/** A reading of the battery, 95%, full and not charging unless given otherwise, as the mouse was measured. */
function reading(battery: Partial<Battery> = {}): Battery {
  return { percentage: 95, level: "full", charging: false, ...battery };
}

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
    const svg = batterySvg({ battery: reading({ level, percentage: 50 }), found: true });

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, WHITE, color]));
  });

  it.each([
    [61, ACCENTS.leaf],
    [60, ACCENTS.leaf],
    [59, ACCENTS.gold],
    [30, ACCENTS.gold],
    [29, ACCENTS.scarlet],
  ])("colors a battery at %s%% with a level it doesn't know by its percentage", (percentage, color) => {
    const svg = batterySvg({ battery: reading({ level: undefined, percentage }), found: true });

    expect(colors(svg)).toContain(color);
  });

  it("draws the percentage, and the battery filled as far", () => {
    const svg = batterySvg({ battery: reading({ percentage: 42, level: "low" }), found: true });

    expect(svg).toContain(percentageGlyph(144, { percentage: 42, color: ACCENTS.gold }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { charge: 0.42, color: ACCENTS.gold }));
  });

  it("draws a green bolt only while the mouse is charging, whatever its level", () => {
    const bolt = boltGlyph(144 * 0.34, { color: ACCENTS.leaf });

    expect(batterySvg({ battery: reading({ level: "low", charging: true }), found: true })).toContain(bolt);
    expect(batterySvg({ battery: reading({ charging: false }), found: true })).not.toContain("stroke-linejoin");
  });

  it("greys out the last reading when the mouse isn't found", () => {
    const svg = batterySvg({ battery: reading({ percentage: 25, level: "critical", charging: true }), found: false });

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(percentageGlyph(144, { percentage: 25, color: TILES.grey }));
  });

  it("draws an empty battery and dashes in grey when the mouse has never been found", () => {
    const svg = batterySvg({ battery: undefined, found: false });

    expect(colors(svg)).toEqual(new Set([TILES.charcoal, TILES.grey]));
    expect(svg).toContain(percentageGlyph(144, { color: TILES.grey }));
    expect(svg).toContain(batteryGlyph(144 * 0.34, { color: TILES.grey }));
  });
});

describe("batteryImage", () => {
  it("is the SVG as a base64 data URL", () => {
    const shown = { battery: reading(), found: true };

    const image = batteryImage(shown);

    expect(image.startsWith("data:image/svg+xml;base64,")).toBe(true);
    expect(Buffer.from(image.split(",")[1] ?? "", "base64").toString()).toBe(batterySvg(shown));
  });
});
