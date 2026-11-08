import {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

import { type Battery, readBattery } from "../battery";
import { logger as pluginLogger } from "../logging";
import {
  type BoltShown,
  type BoltStyle,
  batteryImage,
  DEFAULT_BACKGROUND,
  DEFAULT_BOLT,
  DEFAULT_LEVELS,
  DEFAULT_MOUSE,
  type Levels,
  type MouseStyle,
  type Style,
} from "./battery-image";

const logger = pluginLogger.createScope("Battery key");

/** How often the battery is read again while a Battery key is shown: it drains slowly, and every read wakes the mouse. */
export const REFRESH_MS = 10 * 60 * 1000;

// A color as the settings page's color picker saves it: `#` and six hex digits.
const COLOR = /^#[0-9a-f]{6}$/i;

/** A key shown, and how it draws the reading, from its settings. */
type Shown = { key: KeyAction<JsonObject>; style: Style };

/**
 * The Battery key: shows how full the mouse's battery is, colored by the level that's at, and whether it's charging,
 * redrawing its image from each reading. Every key shows the same reading, since there's one mouse. The battery is read
 * when a key appears, when one is pressed, and every {@link REFRESH_MS} while one is shown. A mouse that doesn't answer,
 * such as one on another host, greys the key out, keeping the last reading. Each key draws it on the background its
 * settings choose, with the mouse, the battery, the bolt and the levels they choose.
 */
@action({ UUID: "com.daczarne.mx3s.battery" })
export class BatteryAction extends SingletonAction {
  // The keys shown, by id, with their styles, which every reading redraws.
  private readonly keys = new Map<string, Shown>();
  // The last reading, and whether the mouse answered the last read.
  private battery: Battery | undefined;
  private found = false;
  // The read under way, which a read asked for meanwhile waits for, rather than starting another.
  private reading: Promise<void> | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  /** Shows the last reading on a key as soon as it appears, then reads the battery again. */
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (!ev.action.isKey()) {
      return;
    }
    const shown = { key: ev.action, style: styleOf(ev.payload.settings) };
    this.keys.set(ev.action.id, shown);
    this.timer ??= setInterval(() => this.refresh(), REFRESH_MS);
    await this.show(shown);
    await this.refresh();
  }

  /** Redraws a key in the style its settings page chose, without reading the battery again. */
  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    const shown = this.keys.get(ev.action.id);
    if (shown === undefined) {
      return;
    }
    shown.style = styleOf(ev.payload.settings);
    await this.show(shown);
  }

  /** Forgets a key that's no longer shown, and stops reading once none is. */
  override onWillDisappear(ev: WillDisappearEvent): void {
    this.keys.delete(ev.action.id);
    if (this.keys.size === 0 && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Reads the battery again. */
  override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    logger.info("Key pressed");
    await this.refresh();
  }

  /** Reads the battery, unless a read is under way, and redraws every key from what it read. It never throws. */
  private refresh(): Promise<void> {
    this.reading ??= this.read().finally(() => {
      this.reading = undefined;
    });
    return this.reading;
  }

  /** {@link refresh}, once no read is under way. */
  private async read(): Promise<void> {
    const result = await readBattery();
    this.found = result.ok;
    if (result.ok) {
      this.battery = result.battery;
    }
    await Promise.all([...this.keys.values()].map((shown) => this.show(shown)));
  }

  /** Draws the last reading on a key. A key that can't be drawn on is only logged: it's drawn again on the next read. */
  private async show({ key, style }: Shown): Promise<void> {
    try {
      await key.setImage(batteryImage({ battery: this.battery, found: this.found }, style));
    } catch (error) {
      logger.warn("Can't draw a Battery key", error);
    }
  }
}

// When a key can show the bolt, as the settings page saves it.
const BOLT_SHOWN: readonly BoltShown[] = ["always", "charging", "never"];

/**
 * The style a key's settings choose: its background, its mouse, whether it shows the battery, which it does unless
 * `showBattery` is unchecked, its bolt, and its levels.
 */
export function styleOf(settings: JsonObject): Style {
  return {
    background: backgroundOf(settings),
    mouse: mouseOf(settings),
    showBattery: settings.showBattery !== false,
    bolt: boltOf(settings),
    levels: levelsOf(settings),
  };
}

/**
 * The levels a key's settings choose: their colors, from `highColor`, `mediumColor` and `lowColor`, and the
 * percentages the medium level is between, from `mediumFrom` and `mediumTo`.
 */
function levelsOf(settings: JsonObject): Levels {
  return {
    high: colorOf(settings, "highColor", DEFAULT_LEVELS.high),
    medium: colorOf(settings, "mediumColor", DEFAULT_LEVELS.medium),
    mediumFrom: percentageOf(settings, "mediumFrom", DEFAULT_LEVELS.mediumFrom),
    mediumTo: percentageOf(settings, "mediumTo", DEFAULT_LEVELS.mediumTo),
    low: colorOf(settings, "lowColor", DEFAULT_LEVELS.low),
  };
}

/**
 * The bolt a key's settings choose: when it shows, from `showBolt`, and its colors while the mouse charges and while it
 * doesn't, from `boltColor` and `boltIdleColor`. A key that has chosen none yet shows it while the mouse charges, and
 * so does one whose choice isn't one, with a warning.
 */
function boltOf(settings: JsonObject): BoltStyle {
  const charging = colorOf(settings, "boltColor", DEFAULT_BOLT.charging);
  const idle = colorOf(settings, "boltIdleColor", DEFAULT_BOLT.idle);
  const value: JsonValue | undefined = settings.showBolt;
  const show = BOLT_SHOWN.find((shown) => shown === value);
  if (show === undefined && value !== undefined) {
    logger.warn(
      `Setting showBolt is ${JSON.stringify(value)}, not one of ${BOLT_SHOWN.join(", ")}: using ${DEFAULT_BOLT.show}`,
    );
  }
  return { show: show ?? DEFAULT_BOLT.show, charging, idle };
}

/**
 * The background a key's settings choose: none when `noBackground` is checked, and otherwise the color `background`
 * holds.
 */
function backgroundOf(settings: JsonObject): string | undefined {
  return settings.noBackground === true ? undefined : colorOf(settings, "background", DEFAULT_BACKGROUND);
}

/**
 * The mouse a key's settings choose: none when `showMouse` is unchecked, and otherwise the color `mouseColor` holds,
 * filled unless `mouseStyle` is `outlined`. A key that has chosen no style yet takes the default, and so does one whose
 * style isn't one, with a warning.
 */
function mouseOf(settings: JsonObject): MouseStyle | undefined {
  if (settings.showMouse === false) {
    return undefined;
  }
  const color = colorOf(settings, "mouseColor", DEFAULT_MOUSE.color);
  const style: JsonValue | undefined = settings.mouseStyle;
  if (style === undefined || style === "filled" || style === "outlined") {
    return { color, filled: style === undefined ? DEFAULT_MOUSE.filled : style === "filled" };
  }
  const fallback = DEFAULT_MOUSE.filled ? "filled" : "outlined";
  logger.warn(`Setting mouseStyle is ${JSON.stringify(style)}, not filled or outlined: using ${fallback}`);
  return { color, filled: DEFAULT_MOUSE.filled };
}

/**
 * The percentage a key's setting `setting` holds, a number from 0 to 100, as the settings page saves it. A key that has
 * none yet takes `fallback`, and so does one whose setting isn't one, with a warning.
 */
function percentageOf(settings: JsonObject, setting: string, fallback: number): number {
  const value: JsonValue | undefined = settings[setting];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "number" && value >= 0 && value <= 100) {
    return value;
  }
  logger.warn(`Setting ${setting} is ${JSON.stringify(value)}, not a percentage: using ${fallback}`);
  return fallback;
}

/**
 * The color a key's setting `setting` holds. A key that has none yet takes `fallback`, and so does one whose setting
 * isn't a color, with a warning.
 */
function colorOf(settings: JsonObject, setting: string, fallback: string): string {
  const value: JsonValue | undefined = settings[setting];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "string" && COLOR.test(value)) {
    return value;
  }
  logger.warn(`Setting ${setting} is ${JSON.stringify(value)}, not a color: using ${fallback}`);
  return fallback;
}
