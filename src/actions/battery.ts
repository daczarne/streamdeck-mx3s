import {
  action,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { type Battery, readBattery } from "../battery";
import { logger as pluginLogger } from "../logging";
import { batteryImage } from "./battery-image";

const logger = pluginLogger.createScope("Battery key");

/** How often the battery is read again while a Battery key is shown: it drains slowly, and every read wakes the mouse. */
export const REFRESH_MS = 10 * 60 * 1000;

/**
 * The Battery key: shows how full the mouse's battery is, the level the mouse puts that at, and whether it's charging,
 * redrawing its image from each reading. Every key shows the same reading, since there's one mouse. The battery is read
 * when a key appears, when one is pressed, and every {@link REFRESH_MS} while one is shown. A mouse that doesn't answer,
 * such as one on another host, greys the key out, keeping the last reading.
 */
@action({ UUID: "com.daczarne.mx3s.battery" })
export class BatteryAction extends SingletonAction {
  // The keys shown, by id, which every reading redraws.
  private readonly keys = new Map<string, KeyAction<JsonObject>>();
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
    this.keys.set(ev.action.id, ev.action);
    this.timer ??= setInterval(() => this.refresh(), REFRESH_MS);
    await this.show(ev.action);
    await this.refresh();
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
    await Promise.all([...this.keys.values()].map((key) => this.show(key)));
  }

  /** Draws the last reading on a key. A key that can't be drawn on is only logged: it's drawn again on the next read. */
  private async show(key: KeyAction<JsonObject>): Promise<void> {
    try {
      await key.setImage(batteryImage({ battery: this.battery, found: this.found }));
    } catch (error) {
      logger.warn("Can't draw a Battery key", error);
    }
  }
}
