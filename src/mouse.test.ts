import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logging";
import { switchHost } from "./mouse";
import { EmulatedReceiver } from "./test-support/emulated-receiver";
import { connect, failListingDevices, type HidEvent, hidEvents } from "./test-support/fake-node-hid";

//* Fakes

// The plugin talks to emulated receivers, never to the ones plugged in.
vi.mock("node-hid", () => import("./test-support/fake-node-hid"));
// The real logger writes to a logs/ folder.
vi.mock("./logging", () => import("./test-support/fake-logging"));

// A keyboard, paired with a receiver beside the mouse: another product, which has no CHANGE_HOST.
const KEYBOARD = 0xb35b;

beforeEach(() => {
  connect();
});

/** The reports written to a receiver, in order. */
function written(receiver: EmulatedReceiver): number[][] {
  return hidEvents()
    .filter((event) => event.receiver === receiver && event.call === "write")
    .map((event) => event.report ?? []);
}

/** The setCurrentHost requests among the reports written: function 1 of the feature at `changeHost`. */
function hostSwitches(receiver: EmulatedReceiver, changeHost = 10): number[][] {
  return written(receiver).filter((report) => report[2] === changeHost && report[3] === 0x1b);
}

/** The calls of one kind made on every receiver, in order. */
function calls(call: HidEvent["call"]): EmulatedReceiver[] {
  return hidEvents()
    .filter((event) => event.call === call)
    .map((event) => event.receiver);
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

  it("asks for CHANGE_HOST's index, rather than taking the one measured", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    await switchHost(2);

    // IRoot's getFeature, function 0 of feature 0, for 0x1814.
    expect(written(receiver)).toContainEqual([0x10, 1, 0x00, 0x0b, 0x18, 0x14, 0]);
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

  it("skips the other devices paired with the receiver", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { productId: KEYBOARD, changeHost: 0 });
    receiver.pair(3);
    connect(receiver);

    const result = await switchHost(2);

    expect(result.ok).toBe(true);
    expect(hostSwitches(receiver)).toEqual([[0x10, 3, 10, 0x1b, 1, 0, 0]]);
    // Nothing is asked of the keyboard.
    expect(written(receiver).filter((report) => report[1] === 1)).toEqual([]);
  });

  it("skips the notifications that arrive before a reply", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    // A device connection notification.
    receiver.notifyBeforeNextReply([0x10, 0x01, 0x41, 0x0c, 0x02, 0x34, 0xb0]);
    connect(receiver);

    const result = await switchHost(2);

    expect(result.ok).toBe(true);
    expect(hostSwitches(receiver)).toHaveLength(1);
  });

  describe("with several receivers", () => {
    it("goes through the one the mouse answers through", async () => {
      // This computer's receiver, and another host's, whose channel the mouse isn't on.
      const away = new EmulatedReceiver();
      away.pair(1, { connected: false });
      const here = new EmulatedReceiver();
      here.pair(1);
      connect(away, here);

      const result = await switchHost(2);

      expect(result.ok).toBe(true);
      expect(hostSwitches(away)).toEqual([]);
      expect(hostSwitches(here)).toHaveLength(1);
    });

    it("goes on to the next receiver when one can't be opened", async () => {
      const failing = new EmulatedReceiver();
      failing.failsToOpen = true;
      const working = new EmulatedReceiver();
      working.pair(1);
      connect(failing, working);

      const result = await switchHost(2);

      expect(result.ok).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith("Can't open a receiver's HID++ channel", expect.any(Error));
    });

    it("closes every receiver it opened", async () => {
      const away = new EmulatedReceiver();
      away.pair(1, { connected: false });
      const here = new EmulatedReceiver();
      here.pair(1);
      connect(away, here);

      await switchHost(2);

      expect(calls("close")).toEqual(calls("open"));
      expect(calls("open")).toEqual([away, here]);
    });
  });

  describe("on Windows, where a receiver's HID++ channel is two paths, one per report length", () => {
    it("writes to the path of short reports, and reads the replies that come on either", async () => {
      const receiver = new EmulatedReceiver("windows");
      // Slot 1 is empty: its error comes as a short report, and the mouse's replies as long ones.
      const mouse = receiver.pair(2);
      connect(receiver);

      const result = await switchHost(3);

      expect(result).toEqual({ ok: true, outcome: "switched", from: 1 });
      expect(mouse.current).toBe(3);
      const writtenTo = hidEvents()
        .filter((event) => event.call === "write")
        .map((event) => event.path);
      expect(new Set(writtenTo)).toEqual(new Set([receiver.shortPath]));
    });

    it("opens both paths as one receiver, logs them, and closes both", async () => {
      const receiver = new EmulatedReceiver("windows");
      receiver.pair(1);
      connect(receiver);

      await switchHost(2);

      expect(logger.info).toHaveBeenCalledWith(
        `Opening a receiver's HID++ channel: ${receiver.shortPath} and ${receiver.longPath}`,
      );
      expect(calls("open")).toEqual([receiver, receiver]);
      expect(calls("close")).toEqual(calls("open"));
    });

    it("tells two receivers apart", async () => {
      const away = new EmulatedReceiver("windows");
      away.pair(1, { connected: false });
      const here = new EmulatedReceiver("windows");
      here.pair(1);
      connect(away, here);

      const result = await switchHost(2);

      expect(result.ok).toBe(true);
      expect(hostSwitches(away)).toEqual([]);
      expect(hostSwitches(here)).toHaveLength(1);
    });

    it("closes the path it opened when the other one can't be opened", async () => {
      const receiver = new EmulatedReceiver("windows");
      receiver.pair(1);
      receiver.longFailsToOpen = true;
      connect(receiver);

      const result = await switchHost(2);

      expect(result).toEqual({ ok: false, outcome: "unreachable" });
      expect(logger.warn).toHaveBeenCalledWith("Can't open a receiver's HID++ channel", expect.any(Error));
      expect(calls("close")).toEqual([receiver]);
    });
  });

  describe("when no receiver reaches the mouse", () => {
    it("reports no receiver when none is plugged in", async () => {
      const result = await switchHost(2);

      expect(result).toEqual({ ok: false, outcome: "no-receiver" });
      expect(logger.warn).toHaveBeenCalledWith("No Logi Bolt receiver found");
    });

    it.each([
      ["answers with an error", "error" as const],
      ["doesn't answer", "silent" as const],
    ])("reports the mouse unreachable when it's on another channel and %s", async (_case, away) => {
      const receiver = new EmulatedReceiver();
      receiver.pair(1, { connected: false, away });
      connect(receiver);

      const result = await switchHost(2);

      expect(result).toEqual({ ok: false, outcome: "unreachable" });
      expect(hostSwitches(receiver)).toEqual([]);
      expect(calls("close")).toEqual([receiver]);
      expect(logger.warn).toHaveBeenCalledWith("No receiver reaches the MX Master 3S, out of 1");
    });

    it("reports the mouse unreachable when the receiver has nothing paired", async () => {
      connect(new EmulatedReceiver());

      expect(await switchHost(2)).toEqual({ ok: false, outcome: "unreachable" });
    });

    it("reports a failure when the HID devices can't be listed", async () => {
      const error = new Error("can't list");
      failListingDevices(error);

      const result = await switchHost(2);

      expect(result).toEqual({ ok: false, outcome: "failed" });
      expect(logger.error).toHaveBeenCalledWith("Can't list the HID devices", error);
    });

    it("reports a failure, rather than an empty slot, when the receiver doesn't answer", async () => {
      const receiver = new EmulatedReceiver();
      receiver.pair(1);
      receiver.mute = true;
      connect(receiver);

      const result = await switchHost(2);

      expect(result).toEqual({ ok: false, outcome: "failed" });
      // The pairing information of slot 1, asked of the receiver.
      expect(logger.error).toHaveBeenCalledWith(
        "A request to the receiver failed",
        expect.objectContaining({ message: "No reply to 10 ff 83 b5 51 00 00" }),
      );
    });
  });

  it("runs a switch only once the one before it has finished, so their requests never mix", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    const results = await Promise.all([switchHost(2), switchHost(3)]);

    expect(results).toEqual([
      { ok: true, outcome: "switched", from: 1 },
      // The mouse left with the first switch.
      { ok: false, outcome: "unreachable" },
    ]);
    // Each switch opens the receiver and closes it before the next one opens it.
    const opensAndCloses = hidEvents()
      .map((event) => event.call)
      .filter((call) => call === "open" || call === "close");
    expect(opensAndCloses).toEqual(["open", "close", "open", "close"]);
  });

  it("goes on switching after a switch that failed", async () => {
    failListingDevices(new Error("can't list"));
    await switchHost(2);
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    expect((await switchHost(2)).ok).toBe(true);
  });
});
