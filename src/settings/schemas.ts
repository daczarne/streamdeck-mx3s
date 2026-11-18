import { ACCENTS, TILES, WHITE } from "@daczarne/streamdeck-icons";
import type { JsonObject, JsonValue } from "@elgato/utils";
import type { Logger } from "@elgato/utils/logging";

/**
 * A setting an action reads: the value it takes when the setting is missing or invalid, what a valid value is, and how
 * to read one. `parse` returns undefined for a value that isn't valid.
 */
type Setting<T> = {
  default: T;
  expected: string;
  parse: (value: JsonValue) => T | undefined;
};

type Schema = Record<string, Setting<unknown>>;

/** Settings as {@link parseSettings} reads them against their schema: each one valid, or its default. */
export type Parsed<S extends Schema> = { [Name in keyof S]: S[Name] extends Setting<infer T> ? T : never };

/**
 * A number, or text that is one, since the settings pages' radio buttons save their value as text. Anything else is
 * refused, where `Number()` would turn an empty text, `null` or `false` into 0, and `true` into 1.
 */
function toNumber(value: JsonValue): number | undefined {
  const number =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

/** A setting that takes any number from `min` to `max`, both included. */
function numberFrom(min: number, max: number, fallback: number): Setting<number> {
  return {
    default: fallback,
    expected: `a number from ${min} to ${max}`,
    parse: (value) => {
      const number = toNumber(value);
      return number !== undefined && number >= min && number <= max ? number : undefined;
    },
  };
}

/** A setting that takes a whole number from `min` to `max`, both included. */
function wholeNumberFrom(min: number, max: number, fallback: number): Setting<number> {
  const inRange = numberFrom(min, max, fallback);
  return {
    ...inRange,
    expected: `a whole number from ${min} to ${max}`,
    parse: (value) => {
      const number = inRange.parse(value);
      return number !== undefined && Number.isInteger(number) ? number : undefined;
    },
  };
}

/** A setting that takes one of a list of texts, as written. */
function oneOf<T extends string>(allowed: readonly T[], fallback: T): Setting<T> {
  return {
    default: fallback,
    expected: `one of ${allowed.join(", ")}`,
    parse: (value) => allowed.find((option) => option === value),
  };
}

/** A setting that is on or off, as a checkbox saves it. */
function flag(fallback: boolean): Setting<boolean> {
  return {
    default: fallback,
    expected: "true or false",
    parse: (value) => (typeof value === "boolean" ? value : undefined),
  };
}

/** A setting that takes a color as `#rrggbb`, as a color picker saves it. */
function hexColor(fallback: string): Setting<string> {
  return {
    default: fallback,
    expected: "a color as #rrggbb",
    parse: (value) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined),
  };
}

//* The actions' settings

// The valid values are the ones each settings page offers, and the defaults match the pages' own, which are what a new
// key saves. The browser tests check both against the pages.

// The Easy-Switch host a key sends the mouse to, by the numbers on the mouse: host 1 until another is chosen.
export const setHostSettingsSchema = {
  host: wholeNumberFrom(1, 3, 1),
};

/** How a key can draw the mouse. */
const MOUSE_STYLES = ["filled", "outlined"] as const;

/** When a key can show the bolt: always, only while the mouse charges, or never. */
const BOLT_SHOWN = ["always", "charging", "never"] as const;

/** When a key shows the bolt. */
export type BoltShown = (typeof BOLT_SHOWN)[number];

// The bolt's color while the mouse charges, unless a key picks another: a bright pink, which no level takes.
const CHARGING = "#FF007F";

// Each group of settings is a section of the Battery page, in its order.
export const batterySettingsSchema = {
  // The background: the palette's charcoal tile, or none, which leaves the image transparent.
  background: hexColor(TILES.charcoal),
  noBackground: flag(false),
  // The mouse: shown, filled, in the palette's white, whatever the battery's level.
  showMouse: flag(true),
  mouseStyle: oneOf(MOUSE_STYLES, "filled"),
  mouseColor: hexColor(WHITE),
  mouseFollowsLevel: flag(false),
  // The battery: shown, in the color of its level, or, for a key that has it take a color of its own, in the palette's
  // green until it picks another.
  showBattery: flag(true),
  batteryColor: hexColor(ACCENTS.leaf),
  batteryFollowsLevel: flag(true),
  // The bolt: always shown, in the bright pink while the mouse charges, and in the palette's slate, dim on the charcoal
  // tile, while it doesn't.
  showBolt: oneOf(BOLT_SHOWN, "always"),
  boltColor: hexColor(CHARGING),
  boltFollowsLevel: flag(false),
  boltIdleColor: hexColor(TILES.slate),
  // The levels the percentage is colored by: medium, in the palette's gold, between 15% and 40%, high, in its green,
  // above, and low, in its scarlet, below.
  highColor: hexColor(ACCENTS.leaf),
  mediumColor: hexColor(ACCENTS.gold),
  mediumFrom: numberFrom(0, 100, 15),
  mediumTo: numberFrom(0, 100, 40),
  lowColor: hexColor(ACCENTS.scarlet),
  // What the key shows once the mouse isn't found: the mouse and the percentage, in the palette's grey.
  notFoundMouse: flag(true),
  notFoundBattery: flag(false),
  notFoundBolt: flag(false),
  notFoundColor: hexColor(TILES.grey),
};

/** A Battery key's settings, as {@link parseSettings} reads them. */
export type BatterySettings = Parsed<typeof batterySettingsSchema>;

/**
 * Reads settings against their schema: each one that is missing takes its default, and each one that isn't valid takes
 * its default with a warning, so a hand-edited or outdated setting never breaks an action.
 */
export function parseSettings<S extends Schema>(
  settings: JsonObject,
  schema: S,
  logger: Pick<Logger, "warn">,
): Parsed<S> {
  const parsed: Record<string, unknown> = {};
  for (const [name, setting] of Object.entries(schema)) {
    const value = settings[name];
    const valid = value === undefined ? undefined : setting.parse(value);
    if (value !== undefined && valid === undefined) {
      const fallback = JSON.stringify(setting.default);
      logger.warn(`Setting ${name} is ${JSON.stringify(value)}, not ${setting.expected}: using ${fallback}`);
    }
    parsed[name] = valid ?? setting.default;
  }
  return parsed as Parsed<S>;
}
