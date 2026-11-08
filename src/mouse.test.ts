import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logging";
import { callFeature, type Mouse, reachMouse, sendFeature } from "./mouse";
import { CHANGE_HOST, EmulatedReceiver } from "./test-support/emulated-receiver";
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

/** The calls of one kind made on every receiver, in order. */
function calls(call: HidEvent["call"]): EmulatedReceiver[] {
  return hidEvents()
    .filter((event) => event.call === call)
    .map((event) => event.receiver);
}

/** An operation that reads the mouse's hosts: function 0 of CHANGE_HOST, `getHostInfo`, which every mouse here has. */
function readHosts() {
  return reachMouse(CHANGE_HOST, (mouse) => callFeature(mouse, 0));
}

/** The getHostInfo requests among the reports written to a receiver: function 0 of the feature at `changeHost`. */
function hostReads(receiver: EmulatedReceiver, changeHost = 10): number[][] {
  return written(receiver).filter((report) => report[2] === changeHost && report[3] === 0x0b);
}

//* Tests

describe("reachMouse", () => {
  it("reaches the mouse by its slot and the index of the feature", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(2, { changeHost: 12 });
    connect(receiver);

    const reached = await reachMouse(CHANGE_HOST, (mouse) => Promise.resolve({ slot: mouse.slot, index: mouse.index }));

    expect(reached).toEqual({ slot: 2, index: 12 });
  });

  it("asks for the feature's index, rather than taking the one measured", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    await readHosts();

    // IRoot's getFeature, function 0 of feature 0, for 0x1814.
    expect(written(receiver)).toContainEqual([0x10, 1, 0x00, 0x0b, 0x18, 0x14, 0]);
  });

  it("returns what the operation returns", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { hosts: 3, current: 2 });
    connect(receiver);

    const reply = await readHosts();

    // 3 hosts, the current one counted from 0.
    expect(Array.isArray(reply) && reply.slice(0, 6)).toEqual([0x11, 1, 10, 0x0b, 3, 1]);
  });

  it("doesn't reach a mouse without the feature", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { changeHost: 0 });
    connect(receiver);
    const use = vi.fn((_mouse: Mouse) => Promise.resolve());

    const result = await reachMouse(CHANGE_HOST, use);

    expect(result).toEqual({ ok: false, outcome: "unreachable" });
    expect(use).not.toHaveBeenCalled();
  });

  it("skips the other devices paired with the receiver", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1, { productId: KEYBOARD, changeHost: 0 });
    receiver.pair(3);
    connect(receiver);

    await readHosts();

    expect(hostReads(receiver)).toEqual([[0x10, 3, 10, 0x0b, 0, 0, 0]]);
    // Nothing is asked of the keyboard.
    expect(written(receiver).filter((report) => report[1] === 1)).toEqual([]);
  });

  it("skips the notifications that arrive before a reply", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    // A device connection notification.
    receiver.notifyBeforeNextReply([0x10, 0x01, 0x41, 0x0c, 0x02, 0x34, 0xb0]);
    connect(receiver);

    const reply = await readHosts();

    expect(Array.isArray(reply)).toBe(true);
  });

  describe("callFeature and sendFeature", () => {
    it("send a function of the feature the mouse was reached by, with the plugin's software ID", async () => {
      const receiver = new EmulatedReceiver();
      const paired = receiver.pair(2, { changeHost: 12 });
      connect(receiver);

      await reachMouse(CHANGE_HOST, async (mouse) => {
        await callFeature(mouse, 0);
        await sendFeature(mouse, 1, [2]);
      });

      expect(written(receiver).slice(-2)).toEqual([
        [0x10, 2, 12, 0x0b, 0, 0, 0],
        [0x10, 2, 12, 0x1b, 2, 0, 0],
      ]);
      // setCurrentHost, which gets no reply.
      expect(paired.current).toBe(3);
    });
  });

  describe("with several receivers", () => {
    it("goes through the one the mouse answers through", async () => {
      // This computer's receiver, and another host's, whose channel the mouse isn't on.
      const away = new EmulatedReceiver();
      away.pair(1, { connected: false });
      const here = new EmulatedReceiver();
      here.pair(1);
      connect(away, here);

      await readHosts();

      expect(hostReads(away)).toEqual([]);
      expect(hostReads(here)).toHaveLength(1);
    });

    it("goes on to the next receiver when one can't be opened", async () => {
      const failing = new EmulatedReceiver();
      failing.failsToOpen = true;
      const working = new EmulatedReceiver();
      working.pair(1);
      connect(failing, working);

      await readHosts();

      expect(hostReads(working)).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith("Can't open a receiver's HID++ channel", expect.any(Error));
    });

    it("closes every receiver it opened", async () => {
      const away = new EmulatedReceiver();
      away.pair(1, { connected: false });
      const here = new EmulatedReceiver();
      here.pair(1);
      connect(away, here);

      await readHosts();

      expect(calls("close")).toEqual(calls("open"));
      expect(calls("open")).toEqual([away, here]);
    });
  });

  describe("on Windows, where a receiver's HID++ channel is two paths, one per report length", () => {
    it("writes to the path of short reports, and reads the replies that come on either", async () => {
      const receiver = new EmulatedReceiver("windows");
      // Slot 1 is empty: its error comes as a short report, and the mouse's replies as long ones.
      receiver.pair(2);
      connect(receiver);

      const reply = await readHosts();

      expect(Array.isArray(reply)).toBe(true);
      const writtenTo = hidEvents()
        .filter((event) => event.call === "write")
        .map((event) => event.path);
      expect(new Set(writtenTo)).toEqual(new Set([receiver.shortPath]));
    });

    it("opens both paths as one receiver, logs them, and closes both", async () => {
      const receiver = new EmulatedReceiver("windows");
      receiver.pair(1);
      connect(receiver);

      await readHosts();

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

      await readHosts();

      expect(hostReads(away)).toEqual([]);
      expect(hostReads(here)).toHaveLength(1);
    });

    it("closes the path it opened when the other one can't be opened", async () => {
      const receiver = new EmulatedReceiver("windows");
      receiver.pair(1);
      receiver.longFailsToOpen = true;
      connect(receiver);

      const result = await readHosts();

      expect(result).toEqual({ ok: false, outcome: "unreachable" });
      expect(logger.warn).toHaveBeenCalledWith("Can't open a receiver's HID++ channel", expect.any(Error));
      expect(calls("close")).toEqual([receiver]);
    });
  });

  describe("when no receiver reaches the mouse", () => {
    it("reports no receiver when none is plugged in", async () => {
      const result = await readHosts();

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

      const result = await readHosts();

      expect(result).toEqual({ ok: false, outcome: "unreachable" });
      expect(hostReads(receiver)).toEqual([]);
      expect(calls("close")).toEqual([receiver]);
      expect(logger.warn).toHaveBeenCalledWith("No receiver reaches the MX Master 3S, out of 1");
    });

    it("reports the mouse unreachable when the receiver has nothing paired", async () => {
      connect(new EmulatedReceiver());

      expect(await readHosts()).toEqual({ ok: false, outcome: "unreachable" });
    });

    it("reports a failure when the HID devices can't be listed", async () => {
      const error = new Error("can't list");
      failListingDevices(error);

      const result = await readHosts();

      expect(result).toEqual({ ok: false, outcome: "failed" });
      expect(logger.error).toHaveBeenCalledWith("Can't list the HID devices", error);
    });

    it("reports a failure, rather than an empty slot, when the receiver doesn't answer", async () => {
      const receiver = new EmulatedReceiver();
      receiver.pair(1);
      receiver.mute = true;
      connect(receiver);

      const result = await readHosts();

      expect(result).toEqual({ ok: false, outcome: "failed" });
      // The pairing information of slot 1, asked of the receiver.
      expect(logger.error).toHaveBeenCalledWith(
        "A request to the receiver failed",
        expect.objectContaining({ message: "No reply to 10 ff 83 b5 51 00 00" }),
      );
    });

    it("reports a failure when a request of the operation fails, and closes the receiver", async () => {
      const receiver = new EmulatedReceiver();
      receiver.pair(1);
      connect(receiver);

      // Function 5 of CHANGE_HOST, which the mouse doesn't have.
      const result = await reachMouse(CHANGE_HOST, (mouse) => callFeature(mouse, 5));

      expect(result).toEqual({ ok: false, outcome: "failed" });
      expect(logger.error).toHaveBeenCalledWith("A request to the receiver failed", expect.any(Error));
      expect(calls("close")).toEqual([receiver]);
    });
  });

  it("runs an operation only once the one before it has finished, so their requests never mix", async () => {
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    await Promise.all([readHosts(), readHosts()]);

    // Each operation opens the receiver and closes it before the next one opens it.
    const opensAndCloses = hidEvents()
      .map((event) => event.call)
      .filter((call) => call === "open" || call === "close");
    expect(opensAndCloses).toEqual(["open", "close", "open", "close"]);
  });

  it("goes on after an operation that failed", async () => {
    failListingDevices(new Error("can't list"));
    await readHosts();
    const receiver = new EmulatedReceiver();
    receiver.pair(1);
    connect(receiver);

    expect(Array.isArray(await readHosts())).toBe(true);
  });
});
