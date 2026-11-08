import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Battery, type BatteryResult, readBattery } from "../battery";
import { logger } from "../logging";
import { FakeDeck } from "../test-support/fake-deck";
import { BatteryAction, REFRESH_MS, styleOf } from "./battery";
import {
  batteryImage,
  DEFAULT_BACKGROUND,
  DEFAULT_BATTERY,
  DEFAULT_BOLT,
  DEFAULT_LEVELS,
  DEFAULT_MOUSE,
  DEFAULT_NOT_FOUND,
} from "./battery-image";

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

// The style of a key that hasn't chosen one: the charcoal tile, the filled white mouse, the battery, the green bolt
// while charging, and the default levels.
const TILE = {
  background: DEFAULT_BACKGROUND,
  mouse: DEFAULT_MOUSE,
  battery: DEFAULT_BATTERY,
  bolt: DEFAULT_BOLT,
  levels: DEFAULT_LEVELS,
  notFound: DEFAULT_NOT_FOUND,
};

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
      const colored = await deck.key(BATTERY, { ...TILE, background: "#123456" });
      const bare = await deck.key(BATTERY, { background: "#123456", noBackground: true });

      expect(colored.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { ...TILE, background: "#123456" }),
      );
      expect(bare.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { ...TILE, background: undefined }),
      );
    });

    it("redraws only the key whose settings change, without reading the battery again", async () => {
      const changed = await deck.key(BATTERY);
      const other = await deck.key(BATTERY);
      vi.mocked(readBattery).mockClear();
      other.setImage.mockClear();

      await deck.changeSettings(changed, { noBackground: true });

      expect(changed.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { ...TILE, background: undefined }),
      );
      expect(other.setImage).not.toHaveBeenCalled();
      expect(readBattery).not.toHaveBeenCalled();
    });

    it("keeps each key's background through the readings that follow", async () => {
      const key = await deck.key(BATTERY, { ...TILE, background: "#123456" });
      readsGive({ ok: true, battery: LOW });

      await deck.press(key);

      expect(key.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: LOW, found: true }, { ...TILE, background: "#123456" }),
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
    expect(styleOf(settings)).toEqual({ ...TILE, background });
  });

  it("takes an outlined mouse, outlined once the mouse isn't found too", () => {
    expect(styleOf({ mouseStyle: "outlined" })).toEqual({
      ...TILE,
      mouse: { ...DEFAULT_MOUSE, filled: false },
      notFound: { ...DEFAULT_NOT_FOUND, mouse: { filled: false } },
    });
  });

  it.each([
    ["nothing chosen for the mouse not found", {}, DEFAULT_NOT_FOUND],
    [
      "what to show once the mouse isn't found",
      { notFoundMouse: false, notFoundBattery: true, notFoundBolt: true, notFoundColor: "#a1b2c3" },
      { mouse: undefined, battery: true, bolt: true, color: "#a1b2c3" },
    ],
    ["the mouse not found even when it's hidden", { showMouse: false }, DEFAULT_NOT_FOUND],
  ])("takes %s", (_case, settings, notFound) => {
    expect(styleOf(settings).notFound).toEqual(notFound);
  });

  it.each([
    ["a mouse color", { mouseColor: "#a1b2c3" }, { ...DEFAULT_MOUSE, color: "#a1b2c3" }],
    ["a filled mouse", { mouseStyle: "filled" }, { ...DEFAULT_MOUSE, filled: true }],
    ["the mouse following the level", { mouseFollowsLevel: true }, { ...DEFAULT_MOUSE, followsLevel: true }],
    ["the mouse in its own color", { mouseFollowsLevel: false }, DEFAULT_MOUSE],
    ["no mouse", { mouseColor: "#a1b2c3", showMouse: false }, undefined],
    ["the mouse shown", { showMouse: true }, DEFAULT_MOUSE],
  ])("takes %s", (_case, settings, mouse) => {
    expect(styleOf(settings)).toEqual({ ...TILE, mouse });
  });

  it.each([
    ["the battery hidden", { showBattery: false, batteryColor: "#a1b2c3" }, undefined],
    ["the battery shown", { showBattery: true }, DEFAULT_BATTERY],
    ["nothing chosen for the battery", {}, DEFAULT_BATTERY],
    [
      "the battery in its own color",
      { batteryFollowsLevel: false, batteryColor: "#a1b2c3" },
      { color: "#a1b2c3", followsLevel: false },
    ],
    ["the battery following the level", { batteryFollowsLevel: true }, DEFAULT_BATTERY],
  ])("takes %s", (_case, settings, battery) => {
    expect(styleOf(settings)).toEqual({ ...TILE, battery });
  });

  it.each([
    ["the bolt always", { showBolt: "always" }, { ...DEFAULT_BOLT, show: "always" }],
    ["the bolt never", { showBolt: "never" }, { ...DEFAULT_BOLT, show: "never" }],
    ["the bolt while charging", { showBolt: "charging" }, { ...DEFAULT_BOLT, show: "charging" }],
    [
      "the bolt's colors",
      { boltColor: "#a1b2c3", boltIdleColor: "#c3b2a1" },
      { ...DEFAULT_BOLT, charging: "#a1b2c3", idle: "#c3b2a1" },
    ],
    ["the bolt following the level", { boltFollowsLevel: true }, { ...DEFAULT_BOLT, chargingFollowsLevel: true }],
  ])("takes %s", (_case, settings, bolt) => {
    expect(styleOf(settings)).toEqual({ ...TILE, bolt });
  });

  it("takes the levels' colors and percentages", () => {
    const settings = {
      highColor: "#111111",
      mediumColor: "#222222",
      mediumFrom: 15,
      mediumTo: 80,
      lowColor: "#333333",
    };

    expect(styleOf(settings)).toEqual({
      ...TILE,
      levels: { high: "#111111", medium: "#222222", mediumFrom: 15, mediumTo: 80, low: "#333333" },
    });
  });

  it.each([["60"], [-5], [101], [null]])(
    "takes the default levels, with a warning, for a percentage of %s",
    (value) => {
      expect(styleOf({ mediumFrom: value, mediumTo: value })).toEqual(TILE);
      expect(logger.warn).toHaveBeenCalledWith(
        `Setting mediumTo is ${JSON.stringify(value)}, not a percentage: using ${DEFAULT_LEVELS.mediumTo}`,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Setting mediumFrom is ${JSON.stringify(value)}, not a percentage: using ${DEFAULT_LEVELS.mediumFrom}`,
      );
    },
  );

  it("takes the default bolt, with a warning, for settings that aren't one", () => {
    expect(styleOf({ showBolt: "sometimes", boltColor: 3, boltIdleColor: "grey" })).toEqual(TILE);
    expect(logger.warn).toHaveBeenCalledWith(
      'Setting showBolt is "sometimes", not one of always, charging, never: using always',
    );
    expect(logger.warn).toHaveBeenCalledWith(`Setting boltColor is 3, not a color: using ${DEFAULT_BOLT.charging}`);
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting boltIdleColor is "grey", not a color: using ${DEFAULT_BOLT.idle}`,
    );
  });

  it.each([
    ["mouseFollowsLevel"],
    ["batteryFollowsLevel"],
    ["boltFollowsLevel"],
    ["notFoundMouse"],
    ["notFoundBattery"],
    ["notFoundBolt"],
  ])("takes the default, with a warning, for a %s that isn't true or false", (setting) => {
    expect(styleOf({ [setting]: "yes" })).toEqual(TILE);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^Setting ${setting} is "yes", not true or false: using (true|false)$`)),
    );
  });

  it("takes the default mouse color and style, with a warning, for a setting that isn't one", () => {
    expect(styleOf({ mouseColor: "white", mouseStyle: "dotted" })).toEqual(TILE);
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
    expect(page).toContain('<sdpi-checkbox setting="showBattery" default="true" label="Show">');
    expect(/<sdpi-radio setting="showBolt" default="([a-z]+)"/.exec(page)?.[1]).toBe(DEFAULT_BOLT.show);
    expect(color("boltColor")).toBe(DEFAULT_BOLT.charging.toUpperCase());
    expect(color("boltIdleColor")).toBe(DEFAULT_BOLT.idle.toUpperCase());
    expect(color("batteryColor")).toBe(DEFAULT_BATTERY.color.toUpperCase());
    // Each Follow battery level checkbox starts checked when its element follows the level by default.
    const follows = (setting: string, followsLevel: boolean) =>
      `<sdpi-checkbox setting="${setting}" ${followsLevel ? 'default="true" ' : ""}label="Follow battery level">`;
    expect(page).toContain(follows("mouseFollowsLevel", DEFAULT_MOUSE.followsLevel));
    expect(page).toContain(follows("batteryFollowsLevel", DEFAULT_BATTERY.followsLevel));
    expect(page).toContain(follows("boltFollowsLevel", DEFAULT_BOLT.chargingFollowsLevel));
    expect(color("notFoundColor")).toBe(DEFAULT_NOT_FOUND.color.toUpperCase());
    const shows = (setting: string, label: string, shown: boolean) =>
      `<sdpi-checkbox setting="${setting}" ${shown ? 'default="true" ' : ""}label="${label}">`;
    expect(page).toContain(shows("notFoundMouse", "Mouse", DEFAULT_NOT_FOUND.mouse !== undefined));
    expect(page).toContain(shows("notFoundBattery", "Battery", DEFAULT_NOT_FOUND.battery));
    expect(page).toContain(shows("notFoundBolt", "Charging", DEFAULT_NOT_FOUND.bolt));
    expect(color("highColor")).toBe(DEFAULT_LEVELS.high.toUpperCase());
    expect(color("mediumColor")).toBe(DEFAULT_LEVELS.medium.toUpperCase());
    expect(color("lowColor")).toBe(DEFAULT_LEVELS.low.toUpperCase());
    const from = (setting: string) =>
      Number(new RegExp(`<sdpi-select setting="${setting}" default="(\\d+)" value-type="number">`).exec(page)?.[1]);
    expect(from("mediumFrom")).toBe(DEFAULT_LEVELS.mediumFrom);
    expect(from("mediumTo")).toBe(DEFAULT_LEVELS.mediumTo);
    expect(page).toContain(`<span class="note" id="high-from">from ${DEFAULT_LEVELS.mediumTo}%</span>`);
    expect(page).toContain(`<span class="note" id="low-below">below ${DEFAULT_LEVELS.mediumFrom}%</span>`);
  });

  it.each([["red"], ["#12345"], ["#1234567"], [42]])("takes the default, with a warning, for %s", (value) => {
    expect(styleOf({ background: value })).toEqual(TILE);
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting background is ${JSON.stringify(value)}, not a color: using ${DEFAULT_BACKGROUND}`,
    );
  });
});

describe("the settings page", () => {
  const page = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.html", "utf8");
  const sections = [...page.matchAll(/<section>([\s\S]*?)<\/section>/g)].map(([, body]) => body ?? "");

  it("heads each section, the key's elements in the order they go, then the levels and the mouse not found", () => {
    const headings = sections.map((body) => /<h2 class="section-heading">([^<]+)<\/h2>/.exec(body)?.[1]);

    expect(headings).toEqual([
      "Background",
      "Mouse icon",
      "Battery icon",
      "Charging icon",
      "Battery level",
      "Mouse not found",
    ]);
  });

  it("greys out only controls the page has, following switches it has", () => {
    const script = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.js", "utf8");
    const dependents = [...script.matchAll(/'(sdpi-[a-z]+)\[setting="([A-Za-z]+)"\]'/g)];
    const switches = /const SWITCHES = \[([^\]]+)\]/.exec(script)?.[1]?.match(/[A-Za-z]+/g) ?? [];

    expect(dependents.length).toBeGreaterThan(0);
    for (const [, element, setting] of dependents) {
      expect(page).toContain(`<${element} setting="${setting}"`);
    }
    expect(switches).toEqual([
      "noBackground",
      "showMouse",
      "mouseFollowsLevel",
      "showBattery",
      "batteryFollowsLevel",
      "showBolt",
      "boltFollowsLevel",
    ]);
    for (const setting of switches) {
      expect(page).toContain(`setting="${setting}"`);
    }
  });

  it("offers the medium level's percentages from 100% down to 0%, in steps of 5%", () => {
    const steps = Array.from({ length: 21 }, (_, step) => 100 - step * 5);

    for (const setting of ["mediumFrom", "mediumTo"]) {
      const select =
        new RegExp(`<sdpi-select setting="${setting}"[^>]*>([\\s\\S]*?)</sdpi-select>`).exec(page)?.[1] ?? "";
      const options = [...select.matchAll(/<option value="(\d+)">(\d+)%<\/option>/g)];

      expect(options.map(([, value]) => Number(value))).toEqual(steps);
      expect(options.every(([, value, shown]) => value === shown)).toBe(true);
    }
  });

  it("ends each section with a Reset button, after every setting it resets", () => {
    for (const body of sections) {
      expect(body.match(/<sdpi-button class="reset">Reset<\/sdpi-button>/g)).toHaveLength(1);
      expect(body.lastIndexOf("setting=")).toBeLessThan(body.indexOf('class="reset"'));
    }
  });
});
