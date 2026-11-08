/**
 * The Battery key's image, drawn afresh from each reading: the mouse, the battery and a bolt in a row across the
 * top, and the percentage below them, on a background each key chooses, the palette's charcoal tile unless it chooses
 * another, or none. Each key also chooses its mouse: its color, filled or outlined, or none, whether it shows the
 * battery, and when it shows the bolt, and in which colors. Leaving one out leaves the others where they are. Its colors follow the level the mouse
 * puts its charge at, and turn grey once the mouse isn't found, keeping the last reading.
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

import type { Battery, Level } from "../battery";

// The side of the image, in pixels: a key's at high density, which Stream Deck scales down for the others.
const SIZE = 144;

// Each glyph in the top row takes a square canvas a third of the key wide, `TOP` below its top edge, centered on a
// third of the key. The percentage's canvas is the key's, moved `NUMBER_DROP` down, so the number sits under the row.
const CELL = 0.34;
const TOP = 0.03;
const CENTERS = [0.17, 0.5, 0.83] as const;
const NUMBER_DROP = 0.17;

// The colors of each level, and of a key whose mouse isn't found.
const LEVEL_COLORS: Record<Level, string> = {
  full: ACCENTS.leaf,
  good: ACCENTS.leaf,
  low: ACCENTS.gold,
  critical: ACCENTS.scarlet,
};
const NOT_FOUND = TILES.grey;

// The percentages under which a battery counts as low, and as critical, when the mouse reports a level the plugin
// doesn't know.
const LOW_BELOW = 60;
const CRITICAL_BELOW = 30;

/** The background a key takes unless it chooses another. */
export const DEFAULT_BACKGROUND = TILES.charcoal;

/** The mouse a key shows unless it chooses another: filled, in the palette's white. */
export const DEFAULT_MOUSE: MouseStyle = { color: WHITE, filled: true };

/**
 * The bolt a key shows unless it chooses another: while the mouse charges, in the palette's green, and, for a key that
 * shows it always, in its slate, dim on the charcoal tile, while the mouse doesn't charge.
 */
export const DEFAULT_BOLT: BoltStyle = { show: "charging", charging: ACCENTS.leaf, idle: TILES.slate };

/** What the key shows: the last reading, if there was one, and whether the mouse answered the last read. */
export type Shown = { battery: Battery | undefined; found: boolean };

/** How a key draws the mouse: in which color, and filled or outlined. */
export type MouseStyle = { color: string; filled: boolean };

/** When a key shows the bolt: always, only while the mouse charges, or never. */
export type BoltShown = "always" | "charging" | "never";

/** How a key draws the bolt: when it shows it, and its colors while the mouse charges and while it doesn't. */
export type BoltStyle = { show: BoltShown; charging: string; idle: string };

/**
 * How a key draws what it shows: its background, a color such as `#2B2E33`, or none, which leaves the image
 * transparent, so the key shows Stream Deck's own black behind it, its mouse, or none, whether it shows the battery,
 * which always takes the color of its level, and its bolt.
 */
export type Style = {
  background: string | undefined;
  mouse: MouseStyle | undefined;
  showBattery: boolean;
  bolt: BoltStyle;
};

/** The key's image, as a data URL Stream Deck takes for `setImage`. */
export function batteryImage(shown: Shown, style: Style): string {
  return `data:image/svg+xml;base64,${Buffer.from(batterySvg(shown, style)).toString("base64")}`;
}

/** The key's image, as an SVG document. */
export function batterySvg({ battery, found }: Shown, { background, mouse, showBattery, bolt }: Style): string {
  const color = found && battery !== undefined ? levelColor(battery) : NOT_FOUND;
  const cell = SIZE * CELL;
  const place = (center: number, glyph: string) =>
    `<g transform="translate(${SIZE * center - cell / 2} ${SIZE * TOP})">${glyph}</g>`;
  const parts = [
    background === undefined ? "" : `<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>`,
    mouse === undefined
      ? ""
      : place(CENTERS[0], mouseGlyph(cell, { color: found ? mouse.color : NOT_FOUND, filled: mouse.filled })),
    showBattery
      ? place(
          CENTERS[1],
          batteryGlyph(cell, battery === undefined ? { color } : { charge: battery.percentage / 100, color }),
        )
      : "",
    boltShows(bolt, battery) ? place(CENTERS[2], boltGlyph(cell, { color: boltColor(bolt, battery, found) })) : "",
    `<g transform="translate(0 ${SIZE * NUMBER_DROP})">${percentageGlyph(SIZE, battery === undefined ? { color } : { percentage: battery.percentage, color })}</g>`,
  ];
  return svgDoc(SIZE, parts.filter((part) => part !== "").join("\n"));
}

/** Whether a key shows the bolt: always, never, or while the last reading says the mouse is on its cable. */
function boltShows({ show }: BoltStyle, battery: Battery | undefined): boolean {
  return show === "always" || (show === "charging" && battery?.charging === true);
}

/** The bolt's color: grey once the mouse isn't found, and otherwise its color while charging, or while not. */
function boltColor({ charging, idle }: BoltStyle, battery: Battery | undefined, found: boolean): string {
  if (!found) {
    return NOT_FOUND;
  }
  return battery?.charging === true ? charging : idle;
}

/** The color of a battery: its level's, or, for a level the plugin doesn't know, its percentage's. */
function levelColor({ level, percentage }: Battery): string {
  if (level !== undefined) {
    return LEVEL_COLORS[level];
  }
  if (percentage < CRITICAL_BELOW) {
    return ACCENTS.scarlet;
  }
  return percentage < LOW_BELOW ? ACCENTS.gold : ACCENTS.leaf;
}
