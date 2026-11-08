import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Battery, type BatteryResult, readBattery } from "../battery";
import { logger } from "../logging";
import { FakeDeck } from "../test-support/fake-deck";
import { BatteryAction, REFRESH_MS } from "./battery";
import { batteryImage } from "./battery-image";

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
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: FULL, found: true }));
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
      batteryImage({ battery: undefined, found: false }),
      batteryImage({ battery: FULL, found: true }),
    ]);
  });

  it("reads the battery again when pressed", async () => {
    const key = await deck.key(BATTERY);
    readsGive({ ok: true, battery: LOW });

    await deck.press(key);

    expect(readBattery).toHaveBeenCalledTimes(2);
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }));
    expect(logger.info).toHaveBeenCalledWith("Key pressed");
  });

  it("greys out the last reading when the mouse doesn't answer", async () => {
    const key = await deck.key(BATTERY);
    readsGive({ ok: false, outcome: "unreachable" });

    await deck.press(key);

    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: FULL, found: false }));
  });

  it("shows the mouse never found when it hasn't answered yet", async () => {
    readsGive({ ok: false, outcome: "no-receiver" });

    const key = await deck.key(BATTERY);

    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: undefined, found: false }));
  });

  it("shows one reading on every key, and redraws them all", async () => {
    const first = await deck.key(BATTERY);
    const second = await deck.key(BATTERY);
    readsGive({ ok: true, battery: LOW });

    await deck.press(second);

    expect(first.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }));
    expect(second.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }));
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
    expect(key.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }));
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

    expect(working.setImage).toHaveBeenLastCalledWith(batteryImage({ battery: LOW, found: true }));
    expect(logger.warn).toHaveBeenCalledWith("Can't draw a Battery key", expect.any(Error));
  });
});
