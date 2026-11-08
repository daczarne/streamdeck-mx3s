/**
 * The Battery key's image, drawn afresh from each reading: the mouse, the battery and a bolt in a row across the
 * top, and the percentage below them, on a background each key chooses, the palette's charcoal tile unless it chooses
 * another, or none. Each key also chooses its mouse: its color, filled or outlined, or none, whether it shows the
 * battery, and in which color, and when it shows the bolt, and in which colors. Leaving one out leaves the others where
 * they are. The percentage takes the color of the level it's at, on a scale of three each key chooses, and so do the
 * mouse, the battery and the bolt while charging, for a key that has them follow it. All of them turn grey once the
 * mouse isn't found, keeping the last reading.
 */
import {
  ACCENTS,
  batteryGlyph,
  boltGlyph,
  mouseGlyph,
  percentageGlyph,
  svgDoc,
  TILES,
  WHITE,
} from "@daczarne/streamdeck-icons";

import type { Battery } from "../battery";

// The side of the image, in pixels: a key's at high density, which Stream Deck scales down for the others.
const SIZE = 144;

// Each glyph in the top row takes a square canvas a third of the key wide, `TOP` below its top edge, centered on a
// third of the key. The percentage's canvas is the key's, moved `NUMBER_DROP` down, so the number sits under the row.
const CELL = 0.34;
const TOP = 0.03;
const CENTERS = [0.17, 0.5, 0.83] as const;
const NUMBER_DROP = 0.17;

// The color of a key whose mouse isn't found.
const NOT_FOUND = TILES.grey;

/** The background a key takes unless it chooses another. */
export const DEFAULT_BACKGROUND = TILES.charcoal;

/** The mouse a key shows unless it chooses another: filled, in the palette's white, whatever the battery's level. */
export const DEFAULT_MOUSE: MouseStyle = { color: WHITE, filled: true, followsLevel: false };

/**
 * The battery a key shows unless it chooses another: in the color of its level, or, for a key that has it take a color
 * of its own, in the palette's green until it picks another.
 */
export const DEFAULT_BATTERY: BatteryStyle = { color: ACCENTS.leaf, followsLevel: true };

/**
 * The bolt a key shows unless it chooses another: while the mouse charges, in the palette's green, and, for a key that
 * shows it always, in its slate, dim on the charcoal tile, while the mouse doesn't charge.
 */
export const DEFAULT_BOLT: BoltStyle = {
  show: "charging",
  charging: ACCENTS.leaf,
  chargingFollowsLevel: false,
  idle: TILES.slate,
};

/**
 * The levels a key colors a battery by unless it chooses others: medium, in the palette's gold, between 15% and 40%,
 * high, in its green, above, and low, in its scarlet, below.
 */
export const DEFAULT_LEVELS: Levels = {
  high: ACCENTS.leaf,
  medium: ACCENTS.gold,
  mediumFrom: 15,
  mediumTo: 40,
  low: ACCENTS.scarlet,
};

/** What the key shows: the last reading, if there was one, and whether the mouse answered the last read. */
export type Shown = { battery: Battery | undefined; found: boolean };

/** How a key draws the mouse: in its color, or in its level's, and filled or outlined. */
export type MouseStyle = { color: string; filled: boolean; followsLevel: boolean };

/** How a key draws the battery: in its color, or in its level's. */
export type BatteryStyle = { color: string; followsLevel: boolean };

/**
 * The levels a key colors a battery by, each in its color: medium between `mediumFrom`% and `mediumTo`%, in either
 * order, high from the higher of the two, and low below the lower. A medium level whose two percentages are the same
 * is never shown.
 */
export type Levels = { high: string; medium: string; mediumFrom: number; mediumTo: number; low: string };

/** When a key shows the bolt: always, only while the mouse charges, or never. */
export type BoltShown = "always" | "charging" | "never";

/**
 * How a key draws the bolt: when it shows it, its color while the mouse charges, or its level's, and its color while
 * it doesn't.
 */
export type BoltStyle = { show: BoltShown; charging: string; chargingFollowsLevel: boolean; idle: string };

/**
 * How a key draws what it shows: its background, a color such as `#2B2E33`, or none, which leaves the image
 * transparent, so the key shows Stream Deck's own black behind it, its mouse, or none, its battery, or none, its
 * bolt, and the levels the percentage, and what follows them, are colored by.
 */
export type Style = {
  background: string | undefined;
  mouse: MouseStyle | undefined;
  battery: BatteryStyle | undefined;
  bolt: BoltStyle;
  levels: Levels;
};

/** The key's image, as a data URL Stream Deck takes for `setImage`. */
export function batteryImage(shown: Shown, style: Style): string {
  return `data:image/svg+xml;base64,${Buffer.from(batterySvg(shown, style)).toString("base64")}`;
}

/** The key's image, as an SVG document. */
export function batterySvg({ battery, found }: Shown, style: Style): string {
  const { background, mouse, bolt, levels } = style;
  const color = found && battery !== undefined ? levelColor(battery, levels) : NOT_FOUND;
  // An element's color: its level's when it follows it, and otherwise its own, both grey once the mouse isn't found.
  const tint = (own: string, followsLevel: boolean) => (followsLevel ? color : found ? own : NOT_FOUND);
  const cell = SIZE * CELL;
  const place = (center: number, glyph: string) =>
    `<g transform="translate(${SIZE * center - cell / 2} ${SIZE * TOP})">${glyph}</g>`;
  const parts = [
    background === undefined ? "" : `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`,
    mouse === undefined
      ? ""
      : place(CENTERS[0], mouseGlyph(cell, { color: tint(mouse.color, mouse.followsLevel), filled: mouse.filled })),
    style.battery === undefined
      ? ""
      : place(CENTERS[1], batteryIcon(battery, tint(style.battery.color, style.battery.followsLevel))),
    boltShows(bolt, battery)
      ? place(
          CENTERS[2],
          boltGlyph(cell, {
            color: battery?.charging === true ? tint(bolt.charging, bolt.chargingFollowsLevel) : tint(bolt.idle, false),
          }),
        )
      : "",
    `<g transform="translate(0 ${SIZE * NUMBER_DROP})">${percentageGlyph(SIZE, battery === undefined ? { color } : { percentage: battery.percentage, color })}</g>`,
  ];
  return svgDoc(SIZE, parts.filter((part) => part !== "").join("\n"));
}

/** Whether a key shows the bolt: always, never, or while the last reading says the mouse is on its cable. */
function boltShows({ show }: BoltStyle, battery: Battery | undefined): boolean {
  return show === "always" || (show === "charging" && battery?.charging === true);
}

/** The battery in the top row, filled as far as the last reading, or empty before the first one, in `color`. */
function batteryIcon(battery: Battery | undefined, color: string): string {
  const cell = SIZE * CELL;
  return batteryGlyph(cell, battery === undefined ? { color } : { charge: battery.percentage / 100, color });
}

/**
 * The color of a battery: the color of the level its percentage is at. The level the mouse reports isn't used, since
 * where it puts each one isn't known, and can't be chosen.
 */
function levelColor({ percentage }: Battery, { high, medium, mediumFrom, mediumTo, low }: Levels): string {
  if (percentage >= Math.max(mediumFrom, mediumTo)) {
    return high;
  }
  return percentage >= Math.min(mediumFrom, mediumTo) ? medium : low;
}
