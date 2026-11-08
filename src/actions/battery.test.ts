import { readFileSync } from "node:fs";

import { TILES } from "@daczarne/streamdeck-icons";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Battery, type BatteryResult, readBattery } from "../battery";
import { logger } from "../logging";
import { FakeDeck } from "../test-support/fake-deck";
import { BatteryAction, REFRESH_MS, styleOf } from "./battery";
import { batteryImage, DEFAULT_BACKGROUND } from "./battery-image";

//* Fakes

vi.mock("@elgato/streamdeck", () => import("../test-support/fake-stream-deck"));

// The real logger writes to a logs/ folder.
vi.mock("../logging", () => import("../test-support/fake-logging"));

// The real battery module reaches the mouse through `src/mouse.ts`, which loads node-hid's native binary on import and
// talks to the receivers plugged in.
vi.mock("../battery", () => ({ readBattery: vi.fn() }));

const BATTERY = "com.daczarne.mx3s.battery";

const FULL: Battery = { percentage: 95, level: "full", charging: false };
const LOW: Battery = { percentage: 20, level: "low", charging: true };

// The style of a key that hasn't chosen one: the charcoal tile.
const TILE = { background: DEFAULT_BACKGROUND };

let deck: FakeDeck;

beforeEach(() => {
  vi.useFakeTimers();
  deck = new FakeDeck([new BatteryAction()]);
  vi.mocked(readBattery).mockResolvedValue({ ok: true, battery: FULL });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Makes the reads answer with `result` from now on. */
function readsGive(result: BatteryResult): void {
  vi.mocked(readBattery).mockResolvedValue(result);
}

//* Tests

describe("BatteryAction", () => {
  it("shows the reading on a key as it appears", async () => {
    const key = await deck.key(BATTERY);

    expect(readBattery).toHaveBeenCalledOnce();
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: FULL, found: true }, TILE));
  });

  it("shows a key that appears before the first reading as never found, until it comes", async () => {
    let answer: (result: BatteryResult) => void = () => {};
    vi.mocked(readBattery).mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );

    const appearing = deck.key(BATTERY);
    await vi.waitFor(() => expect(readBattery).toHaveBeenCalledOnce());
    answer({ ok: true, battery: FULL });
    const key = await appearing;

    expect(key.setImage.mock.calls.map(([image]) => image)).toEqual([
      batteryImage({ battery: undefined, found: false }, TILE),
      batteryImage({ battery: FULL, found: true }, TILE),
    ]);
  });

  it("reads the battery again when pressed", async () => {
    const key = await deck.key(BATTERY);
    readsGive({ ok: true, battery: LOW });

    await deck.press(key);

    expect(readBattery).toHaveBeenCalledTimes(2);
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }, TILE));
    expect(logger.info).toHaveBeenCalledWith("Key pressed");
  });

  it("greys out the last reading when the mouse doesn't answer", async () => {
    const key = await deck.key(BATTERY);
    readsGive({ ok: false, outcome: "unreachable" });

    await deck.press(key);

    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: FULL, found: false }, TILE));
  });

  it("shows the mouse never found when it hasn't answered yet", async () => {
    readsGive({ ok: false, outcome: "no-receiver" });

    const key = await deck.key(BATTERY);

    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: undefined, found: false }, TILE));
  });

  it("shows one reading on every key, and redraws them all", async () => {
    const first = await deck.key(BATTERY);
    const second = await deck.key(BATTERY);
    readsGive({ ok: true, battery: LOW });

    await deck.press(second);

    expect(first.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }, TILE));
    expect(second.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }, TILE));
  });

  it("reads once for presses that come while a read is under way", async () => {
    const key = await deck.key(BATTERY);
    vi.mocked(readBattery).mockClear();

    await Promise.all([deck.press(key), deck.press(key), deck.press(key)]);

    expect(readBattery).toHaveBeenCalledOnce();
  });

  it(`reads the battery every ${REFRESH_MS / 60_000} minutes while a key is shown`, async () => {
    const key = await deck.key(BATTERY);
    readsGive({ ok: true, battery: LOW });

    await vi.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(readBattery).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    expect(readBattery).toHaveBeenCalledTimes(2);
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }, TILE));
  });

  it("keeps one timer for every key, and stops it once none is shown", async () => {
    const first = await deck.key(BATTERY);
    const second = await deck.key(BATTERY);
    vi.mocked(readBattery).mockClear();

    await deck.remove(first);
    await vi.advanceTimersByTimeAsync(REFRESH_MS);
    expect(readBattery).toHaveBeenCalledOnce();

    await deck.remove(second);
    await vi.advanceTimersByTimeAsync(3 * REFRESH_MS);
    expect(readBattery).toHaveBeenCalledOnce();
  });

  it("goes on drawing the other keys when one can't be drawn on", async () => {
    const failing = await deck.key(BATTERY);
    const working = await deck.key(BATTERY);
    failing.setImage.mockRejectedValue(new Error("gone"));
    readsGive({ ok: true, battery: LOW });

    await deck.press(working);

    expect(working.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }, TILE));
    expect(logger.warn).toHaveBeenCalledWith("Can't draw a Battery key", expect.any(Error));
  });

  describe("its background", () => {
    it("draws a key on the background its settings choose, or none", async () => {
      const colored = await deck.key(BATTERY, { background: "#123456" });
      const bare = await deck.key(BATTERY, { background: "#123456", noBackground: true });

      expect(colored.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: "#123456" }),
      );
      expect(bare.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: undefined }),
      );
    });

    it("redraws only the key whose settings change, without reading the battery again", async () => {
      const changed = await deck.key(BATTERY);
      const other = await deck.key(BATTERY);
      vi.mocked(readBattery).mockClear();
      other.setImage.mockClear();

      await deck.changeSettings(changed, { noBackground: true });

      expect(changed.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: undefined }),
      );
      expect(other.setImage).not.toHaveBeenCalled();
      expect(readBattery).not.toHaveBeenCalled();
    });

    it("keeps each key's background through the readings that follow", async () => {
      const key = await deck.key(BATTERY, { background: "#123456" });
      readsGive({ ok: true, battery: LOW });

      await deck.press(key);

      expect(key.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: LOW, found: true }, { background: "#123456" }),
      );
    });
  });
});

describe("styleOf", () => {
  it.each([
    ["nothing chosen yet", {}, DEFAULT_BACKGROUND],
    ["a color", { background: "#a1B2c3" }, "#a1B2c3"],
    ["no background", { background: "#a1b2c3", noBackground: true }, undefined],
    ["no background unchecked", { background: "#a1b2c3", noBackground: false }, "#a1b2c3"],
  ])("takes %s", (_case, settings, background) => {
    expect(styleOf(settings)).toEqual({ background });
  });

  it("takes the default the settings page shows for a key that hasn't chosen yet", () => {
    const page = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.html", "utf8");

    const shown = /<sdpi-color setting="background" default="(#[0-9A-Fa-f]{6})">/.exec(page)?.[1];

    expect(shown?.toUpperCase()).toBe(DEFAULT_BACKGROUND.toUpperCase());
  });

  it.each([["red"], ["#12345"], ["#1234567"], [42]])("takes the default, with a warning, for %s", (value) => {
    expect(styleOf({ background: value })).toEqual({ background: DEFAULT_BACKGROUND });
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting background is ${JSON.stringify(value)}, not a color: using ${DEFAULT_BACKGROUND}`,
    );
  });
});

describe("the settings page", () => {
  const page = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.html", "utf8");
  const swatches = [
    ...page.matchAll(
      /<button type="button" class="swatch" data-color="([^"]+)" title="([^"]+)" style="background-color: ([^"]+)">/g,
    ),
  ].map(([, color, name, shown]) => ({ color, name, shown }));

  /** A color's hue, from 0 to 360, its saturation and its lightness, from 0 to 1. */
  function hsl(hex: string): { hue: number; saturation: number; lightness: number } {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
    const [lightness, range] = [(max + min) / 2, max - min];
    const saturation = range === 0 ? 0 : range / (1 - Math.abs(2 * lightness - 1));
    const sector =
      range === 0 ? 0 : max === r ? ((g - b) / range + 6) % 6 : max === g ? (b - r) / range + 2 : (r - g) / range + 4;
    return { hue: sector * 60, saturation, lightness };
  }

  it("offers every one of the palette's tiles as a swatch, showing the color it picks", () => {
    expect(swatches.map(({ name, color }) => [name, color]).toSorted()).toEqual(Object.entries(TILES).toSorted());
    for (const { color, shown } of swatches) {
      expect(shown).toBe(color);
    }
  });

  it("orders them by hue, then the neutrals, which have none to speak of, from dark to light", () => {
    // Below this saturation, a tile reads as grey rather than as a hue.
    const NEUTRAL = 0.12;
    const tiles = Object.entries(TILES).map(([name, color]) => ({ name, ...hsl(color) }));
    const hued = tiles.filter((tile) => tile.saturation >= NEUTRAL).toSorted((a, b) => a.hue - b.hue);
    const neutral = tiles.filter((tile) => tile.saturation < NEUTRAL).toSorted((a, b) => a.lightness - b.lightness);

    expect(swatches.map(({ name }) => name)).toEqual([...hued, ...neutral].map(({ name }) => name));
  });
});
