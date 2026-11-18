import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { batteryImage, styleOf } from "../controls/battery-image";
import { logger } from "../logging";
import { type Battery, type BatteryResult, readBattery } from "../mouse/battery";
import { batterySettingsSchema, parseSettings } from "../settings/schemas";
import { FakeDeck } from "../test-support/fake-deck";
import { BatteryAction, REFRESH_MS } from "./battery";

//* Fakes

vi.mock("@elgato/streamdeck", () => import("../test-support/fake-stream-deck"));

// The real logger writes to a logs/ folder.
vi.mock("../logging", () => import("../test-support/fake-logging"));

// The real battery module reaches the mouse through `src/mouse/connection.ts`, which loads node-hid's native binary on
// import and talks to the receivers plugged in.
vi.mock("../mouse/battery", () => ({ readBattery: vi.fn() }));

const BATTERY = "com.daczarne.mx3s.battery";

const FULL: Battery = { percentage: 95, level: "full", charging: false };
const LOW: Battery = { percentage: 20, level: "low", charging: true };

// The style of a key that hasn't chosen one: the charcoal tile, the filled white mouse, the battery, the bolt, and the
// default levels.
const TILE = styleOf(parseSettings({}, batterySettingsSchema, { warn: vi.fn() }));

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
        batteryImage({ battery: FULL, found: true }, { ...TILE, background: "#123456" }),
      );
      expect(bare.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: FULL, found: true }, { ...TILE, background: undefined }),
      );
    });

    it("draws a key whose setting isn't valid with its default, and warns of it", async () => {
      const key = await deck.key(BATTERY, { background: "red" });

      expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: FULL, found: true }, TILE));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringMatching(/^Setting background is "red", not a color/));
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
      const key = await deck.key(BATTERY, { background: "#123456" });
      readsGive({ ok: true, battery: LOW });

      await deck.press(key);

      expect(key.setImage).toHaveBeenLastCalledWith(
        batteryImage({ battery: LOW, found: true }, { ...TILE, background: "#123456" }),
      );
    });
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
