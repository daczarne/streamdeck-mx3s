/**
 * The Battery key's image, drawn afresh from each reading: the mouse, the battery and a bolt in a row across the
 * top, and the percentage below them, on a background each key chooses, or none. Each key also chooses its mouse: its
 * color, filled or outlined, or none, whether it shows the battery, and in which color, and when it shows the bolt,
 * and in which colors. Leaving one out leaves the others where they are. The percentage takes the color of the level
 * it's at, on a scale of three each key chooses, and so do the mouse, the battery and the bolt while charging, for a
 * key that has them follow it. Once the mouse isn't found, the key shows what it chooses for that, all in one color it
 * chooses, keeping the last reading. The settings a key chooses them with, and their defaults, are in
 * `../settings/schemas.ts`.
 */
import { batteryGlyph, boltGlyph, mouseGlyph, percentageGlyph, svgDoc } from "@daczarne/streamdeck-icons";

import type { Battery } from "../mouse/battery";
import type { BatterySettings, BoltShown } from "../settings/schemas";

// The side of the image, in pixels: a key's at high density, which Stream Deck scales down for the others.
const SIZE = 144;

// Each glyph in the top row takes a square canvas a third of the key wide, `TOP` below its top edge, centered on a
// third of the key. The percentage's canvas is `NUMBER` of the key's, centered on the key and moved `NUMBER_DROP`
// down, so the number sits under the row, and "100%", the widest, spans about as far as the row does.
const CELL = 0.34;
const TOP = 0.03;
const CENTERS = [0.17, 0.5, 0.83] as const;
const NUMBER = 0.9;
const NUMBER_DROP = 0.17;
const CELL_SIZE = SIZE * CELL;

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

/**
 * How a key draws what its settings choose: no background, mouse or battery when they choose none, the mouse filled or
 * outlined, and each element in its level's color when it follows the level. What the key shows once the mouse isn't
 * found doesn't depend on what it shows while it's found, but its mouse is filled or outlined as the key's mouse is.
 */
export function styleOf(settings: BatterySettings): Style {
  const filled = settings.mouseStyle === "filled";
  return {
    background: settings.noBackground ? undefined : settings.background,
    mouse: settings.showMouse
      ? { color: settings.mouseColor, filled, followsLevel: settings.mouseFollowsLevel }
      : undefined,
    battery: settings.showBattery
      ? { color: settings.batteryColor, followsLevel: settings.batteryFollowsLevel }
      : undefined,
    bolt: {
      show: settings.showBolt,
      charging: settings.boltColor,
      chargingFollowsLevel: settings.boltFollowsLevel,
      idle: settings.boltIdleColor,
    },
    levels: {
      high: settings.highColor,
      medium: settings.mediumColor,
      mediumFrom: settings.mediumFrom,
      mediumTo: settings.mediumTo,
      low: settings.lowColor,
    },
    notFound: {
      mouse: settings.notFoundMouse ? { filled } : undefined,
      battery: settings.notFoundBattery,
      bolt: settings.notFoundBolt,
      color: settings.notFoundColor,
    },
  };
}

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
  const side = SIZE * NUMBER;
  const number = percentageGlyph(side, battery === undefined ? { color } : { percentage: battery.percentage, color });
  return `<g transform="translate(${(SIZE - side) / 2} ${SIZE * NUMBER_DROP + (SIZE - side) / 2})">${number}</g>`;
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
