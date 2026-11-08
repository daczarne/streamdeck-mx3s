import { beforeEach, describe, expect, it, vi } from "vitest";

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

/** The setCurrentHost requests written to a receiver, in order: function 1 of the feature at `changeHost`. */
function hostSwitches(receiver: EmulatedReceiver, changeHost = 10): number[][] {
  return hidEvents()
    .filter((event) => event.receiver === receiver && event.call === "write")
    .map((event) => event.report ?? [])
    .filter((report) => report[2] === changeHost && report[3] === 0x1b);
}

//* Tests

describe("switchHost", () => {
  it("sends the mouse to the host, counted from 0, through its slot and CHANGE_HOST's index", async () => {
    const receiver = new EmulatedReceiver();
    const mouse = receiver.pair(2, { changeHost: 12 });
    connect(receiver);

    const result = await switchHost(3);

    expect(result).toEqual({ ok: true, outcome: "switched", from: 1 });
    expect(hostSwitches(receiver, 12)).toEqual([[0x10, 2, 12, 0x1b, 2, 0, 0]]);
    expect(mouse.current).toBe(3);
    expect(logger.info).toHaveBeenCalledWith("Sent the MX Master 3S from host 1 to host 3");
  });

  it("leaves a mouse already on the host alone", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { current: 2 });
    connect(receiver);

    const result = await switchHost(2);

    expect(result).toEqual({ ok: true, outcome: "already-there" });
    expect(hostSwitches(receiver)).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith("The MX Master 3S is already on host 2");
  });

  it("refuses a host the mouse doesn't have", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { hosts: 2 });
    connect(receiver);

    const result = await switchHost(3);

    expect(result).toEqual({ ok: false, outcome: "no-such-host", hosts: 2 });
    expect(hostSwitches(receiver)).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("The MX Master 3S has 2 hosts, so it can't go to host 3");
  });

  it("reports the mouse unreachable when no receiver reaches it", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { connected: false });
    connect(receiver);

    const result = await switchHost(2);

    expect(result).toEqual({ ok: false, outcome: "unreachable" });
    expect(hostSwitches(receiver)).toEqual([]);
  });

  it("reports the mouse unreachable on a switch after the one that sent it away", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    const results = await Promise.all([switchHost(2), switchHost(3)]);

    expect(results).toEqual([
      { ok: true, outcome: "switched", from: 1 },
      { ok: false, outcome: "unreachable" },
    ]);
  });
});
