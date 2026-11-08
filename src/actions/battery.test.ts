import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Battery, type BatteryResult, readBattery } from "../battery";
import { logger } from "../logging";
import { FakeDeck } from "../test-support/fake-deck";
import { BatteryAction, REFRESH_MS, styleOf } from "./battery";
import { batteryImage, DEFAULT_BACKGROUND, DEFAULT_MOUSE } from "./battery-image";

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

// The style of a key that hasn't chosen one: the charcoal tile, and the filled white mouse.
const TILE = { background: DEFAULT_BACKGROUND, mouse: DEFAULT_MOUSE };

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
      const colored = await deck.key(BATTERY, { background: "#123456", mouse: DEFAULT_MOUSE });
      const bare = await deck.key(BATTERY, { background: "#123456", noBackground: true });

      expect(colored.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: "#123456", mouse: DEFAULT_MOUSE }),
      );
      expect(bare.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: undefined, mouse: DEFAULT_MOUSE }),
      );
    });

    it("redraws only the key whose settings change, without reading the battery again", async () => {
      const changed = await deck.key(BATTERY);
      const other = await deck.key(BATTERY);
      vi.mocked(readBattery).mockClear();
      other.setImage.mockClear();

      await deck.changeSettings(changed, { noBackground: true });

      expect(changed.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { background: undefined, mouse: DEFAULT_MOUSE }),
      );
      expect(other.setImage).not.toHaveBeenCalled();
      expect(readBattery).not.toHaveBeenCalled();
    });

    it("keeps each key's background through the readings that follow", async () => {
      const key = await deck.key(BATTERY, { background: "#123456", mouse: DEFAULT_MOUSE });
      readsGive({ ok: true, battery: LOW });

      await deck.press(key);

      expect(key.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: LOW, found: true }, { background: "#123456", mouse: DEFAULT_MOUSE }),
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
    expect(styleOf(settings)).toEqual({ background, mouse: DEFAULT_MOUSE });
  });

  it.each([
    ["a mouse color", { mouseColor: "#a1b2c3" }, { color: "#a1b2c3", filled: true }],
    ["an outlined mouse", { mouseStyle: "outlined" }, { color: DEFAULT_MOUSE.color, filled: false }],
    ["a filled mouse", { mouseStyle: "filled" }, { color: DEFAULT_MOUSE.color, filled: true }],
    ["no mouse", { mouseColor: "#a1b2c3", showMouse: false }, undefined],
    ["the mouse shown", { showMouse: true }, DEFAULT_MOUSE],
  ])("takes %s", (_case, settings, mouse) => {
    expect(styleOf(settings)).toEqual({ background: DEFAULT_BACKGROUND, mouse });
  });

  it("takes the default mouse color and style, with a warning, for a setting that isn't one", () => {
    expect(styleOf({ mouseColor: "white", mouseStyle: "dotted" })).toEqual({
      background: DEFAULT_BACKGROUND,
      mouse: DEFAULT_MOUSE,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting mouseColor is "white", not a color: using ${DEFAULT_MOUSE.color}`,
    );
    expect(logger.warn).toHaveBeenCalledWith('Setting mouseStyle is "dotted", not filled or outlined: using filled');
  });

  it("takes the defaults the settings page shows for a key that hasn't chosen yet", () => {
    const page = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.html", "utf8");
    const color = (setting: string) =>
      new RegExp(`<sdpi-color setting="${setting}" default="(#[0-9A-Fa-f]{6})">`).exec(page)?.[1]?.toUpperCase();

    expect(color("background")).toBe(DEFAULT_BACKGROUND.toUpperCase());
    expect(color("mouseColor")).toBe(DEFAULT_MOUSE.color.toUpperCase());
    expect(/<sdpi-radio setting="mouseStyle" default="([a-z]+)"/.exec(page)?.[1]).toBe(
      DEFAULT_MOUSE.filled ? "filled" : "outlined",
    );
    // A checkbox's default checks it whatever it says, so the mouse shown by default is a checkbox with one.
    expect(page).toContain('<sdpi-checkbox setting="showMouse" default="true" label="Show">');
  });

  it.each([["red"], ["#12345"], ["#1234567"], [42]])("takes the default, with a warning, for %s", (value) => {
    expect(styleOf({ background: value })).toEqual({ background: DEFAULT_BACKGROUND, mouse: DEFAULT_MOUSE });
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting background is ${JSON.stringify(value)}, not a color: using ${DEFAULT_BACKGROUND}`,
    );
  });
});
