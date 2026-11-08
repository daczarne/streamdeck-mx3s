import { beforeEach, describe, expect, it, vi } from "vitest";

import { readBattery } from "./battery";
import { switchHost } from "./host";
import { logger } from "./logging";
import { EmulatedReceiver } from "./test-support/emulated-receiver";
import { connect, hidEvents } from "./test-support/fake-node-hid";

//* Fakes

// The mouse module talks to emulated receivers, never to the ones plugged in.
vi.mock("node-hid", () => import("./test-support/fake-node-hid"));
// The real logger writes to a logs/ folder.
vi.mock("./logging", () => import("./test-support/fake-logging"));

beforeEach(() => {
  connect();
});

/** The reports written to a receiver, in order. */
function written(receiver: EmulatedReceiver): number[][] {
  return hidEvents()
    .filter((event) => event.receiver === receiver && event.call === "write")
    .map((event) => event.report ?? []);
}

/** A receiver with the mouse paired in slot 1, its battery as given, and plugged in. */
function mouseWithBattery(battery: Partial<{ percentage: number; level: number; charging: number }>): void {
  const receiver = new EmulatedReceiver();
  receiver.pair(1, { battery: { percentage: 95, level: 0x08, charging: 0x00, external: 0x00, ...battery } });
  connect(receiver);
}

//* Tests

describe("readBattery", () => {
  it("reads the percentage, the level and whether the mouse is charging", async () => {
    mouseWithBattery({ percentage: 95, level: 0x08, charging: 0x00 });

    const result = await readBattery();

    expect(result).toEqual({ ok: true, battery: { percentage: 95, level: "full", charging: false } });
    expect(logger.info).toHaveBeenCalledWith("Read the MX Master 3S's battery: 95%, full, not charging");
  });

  it("asks for UNIFIED_BATTERY's index, rather than taking the one measured, and calls getStatus on it", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(2, { unifiedBattery: 5 });
    connect(receiver);

    await readBattery();

    expect(written(receiver)).toEqual(
      expect.arrayContaining([
        // IRoot's getFeature, function 0 of feature 0, for 0x1004.
        [0x10, 2, 0x00, 0x0b, 0x10, 0x04, 0],
        // getStatus, function 1 of the feature at index 5.
        [0x10, 2, 5, 0x1b, 0, 0, 0],
      ]),
    );
  });

  it.each([
    [0x08, "full"],
    [0x04, "good"],
    [0x02, "low"],
    [0x01, "critical"],
  ])("reads level bit 0x%s as %s", async (level, name) => {
    mouseWithBattery({ level });

    const result = await readBattery();

    expect(result.ok && result.battery.level).toBe(name);
  });

  it("reads no level from a bit it doesn't know, and logs the bit", async () => {
    mouseWithBattery({ percentage: 40, level: 0x00 });

    const result = await readBattery();

    expect(result).toEqual({ ok: true, battery: { percentage: 40, level: undefined, charging: false } });
    expect(logger.info).toHaveBeenCalledWith("Read the MX Master 3S's battery: 40%, level 0x0, not charging");
  });

  it.each([
    [0x00, "discharging", false],
    [0x01, "charging", true],
    [0x02, "charged, on its cable", true],
    [0x03, "charging slowly", true],
    [0x04, "with an invalid battery", false],
    [0x05, "with a thermal error", false],
  ])("reads charging state 0x%s, %s, as charging: %s", async (charging, _state, expected) => {
    mouseWithBattery({ charging });

    const result = await readBattery();

    expect(result.ok && result.battery.charging).toBe(expected);
  });

  it("reports the mouse unreachable when it has no UNIFIED_BATTERY", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { unifiedBattery: 0 });
    connect(receiver);

    expect(await readBattery()).toEqual({ ok: false, outcome: "unreachable" });
  });

  it("reports the mouse unreachable when it's on another host", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { connected: false });
    connect(receiver);

    expect(await readBattery()).toEqual({ ok: false, outcome: "unreachable" });
  });

  it("reports no receiver when none is plugged in", async () => {
    expect(await readBattery()).toEqual({ ok: false, outcome: "no-receiver" });
  });

  it("takes turns with a host switch, so their requests never mix", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    const [read, switched] = await Promise.all([readBattery(), switchHost(2)]);

    expect(read.ok).toBe(true);
    expect(switched).toEqual({ ok: true, outcome: "switched", from: 1 });
    const opensAndCloses = hidEvents()
      .map((event) => event.call)
      .filter((call) => call === "open" || call === "close");
    expect(opensAndCloses).toEqual(["open", "close", "open", "close"]);
  });
});
