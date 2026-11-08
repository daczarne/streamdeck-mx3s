/**
 * The Battery key's image, drawn afresh from each reading: the mouse, the battery and a bolt in a row across the
 * top, and the percentage below them, on a background each key chooses, the palette's charcoal tile unless it chooses
 * another, or none. Each key also chooses its mouse: its color, filled or outlined, or none, whether it shows the
 * battery, and in which color, and when it shows the bolt, and in which colors. Leaving one out leaves the others where
 * they are. The percentage takes the color of the level it's at, on a scale of three each key chooses, and so do the
 * mouse, the battery and the bolt while charging, for a key that has them follow it. Once the mouse isn't found, the
 * key shows what it chooses for that, all in one color, grey unless it chooses another, keeping the last reading.
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
const CELL_SIZE = SIZE * CELL;

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

/**
 * What a key shows once the mouse isn't found, unless it chooses otherwise: the mouse, filled, and the percentage, in
 * the palette's grey.
 */
export const DEFAULT_NOT_FOUND: NotFoundStyle = {
  mouse: { filled: true },
  battery: false,
  bolt: false,
  color: TILES.grey,
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
 * What a key shows once the mouse isn't found, whatever it shows while it is: the mouse, filled or outlined, or none,
 * the battery or not, and the bolt or not. They and the percentage all take one color.
 */
export type NotFoundStyle = { mouse: { filled: boolean } | undefined; battery: boolean; bolt: boolean; color: string };

/**
 * How a key draws what it shows: its background, a color such as `#2B2E33`, or none, which leaves the image
 * transparent, so the key shows Stream Deck's own black behind it, its mouse, or none, its battery, or none, its
 * bolt, the levels the percentage, and what follows them, are colored by, and what it shows once the mouse isn't
 * found.
 */
export type Style = {
  background: string | undefined;
  mouse: MouseStyle | undefined;
  battery: BatteryStyle | undefined;
  bolt: BoltStyle;
  levels: Levels;
  notFound: NotFoundStyle;
};

/** The key's image, as a data URL Stream Deck takes for `setImage`. */
export function batteryImage(shown: Shown, style: Style): string {
  return `data:image/svg+xml;base64,${Buffer.from(batterySvg(shown, style)).toString("base64")}`;
}

/** The key's image, as an SVG document. */
export function batterySvg({ battery, found }: Shown, style: Style): string {
  if (!found || battery === undefined) {
    return notFoundSvg(battery, style);
  }
  const { background, mouse, bolt, levels } = style;
  const color = levelColor(battery, levels);
  // An element's color: its level's when it follows it, and otherwise its own.
  const tint = (own: string, followsLevel: boolean) => (followsLevel ? color : own);
  const parts = [
    backgroundRect(background),
    mouse === undefined
      ? ""
      : place(
          CENTERS[0],
          mouseGlyph(CELL_SIZE, { color: tint(mouse.color, mouse.followsLevel), filled: mouse.filled }),
        ),
    style.battery === undefined
      ? ""
      : place(CENTERS[1], batteryIcon(battery, tint(style.battery.color, style.battery.followsLevel))),
    boltShows(bolt, battery)
      ? place(
          CENTERS[2],
          boltGlyph(CELL_SIZE, {
            color: battery.charging ? tint(bolt.charging, bolt.chargingFollowsLevel) : bolt.idle,
          }),
        )
      : "",
    percentage(battery, color),
  ];
  return svgDoc(SIZE, parts.filter((part) => part !== "").join("\n"));
}

/**
 * The key's image once the mouse isn't found, or before the first reading: what the key chooses to show then, from
 * the last reading, if there was one, all in its color for that.
 */
function notFoundSvg(battery: Battery | undefined, { background, notFound }: Style): string {
  const { color } = notFound;
  const parts = [
    backgroundRect(background),
    notFound.mouse === undefined
      ? ""
      : place(CENTERS[0], mouseGlyph(CELL_SIZE, { color, filled: notFound.mouse.filled })),
    notFound.battery ? place(CENTERS[1], batteryIcon(battery, color)) : "",
    notFound.bolt ? place(CENTERS[2], boltGlyph(CELL_SIZE, { color })) : "",
    percentage(battery, color),
  ];
  return svgDoc(SIZE, parts.filter((part) => part !== "").join("\n"));
}

/** The key's background, filling it, or nothing for none. */
function backgroundRect(background: string | undefined): string {
  return background === undefined ? "" : `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`;
}

/** A glyph of the top row, placed on its third of the key. */
function place(center: number, glyph: string): string {
  return `<g transform="translate(${SIZE * center - CELL_SIZE / 2} ${SIZE * TOP})">${glyph}</g>`;
}

/** The percentage under the top row, in `color`, or dashes before the first reading. */
function percentage(battery: Battery | undefined, color: string): string {
  const number = percentageGlyph(SIZE, battery === undefined ? { color } : { percentage: battery.percentage, color });
  return `<g transform="translate(0 ${SIZE * NUMBER_DROP})">${number}</g>`;
}

/** Whether a key shows the bolt: always, never, or while the last reading says the mouse is on its cable. */
function boltShows({ show }: BoltStyle, battery: Battery | undefined): boolean {
  return show === "always" || (show === "charging" && battery?.charging === true);
}

/** The battery in the top row, filled as far as the last reading, or empty before the first one, in `color`. */
function batteryIcon(battery: Battery | undefined, color: string): string {
  return batteryGlyph(CELL_SIZE, battery === undefined ? { color } : { charge: battery.percentage / 100, color });
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
