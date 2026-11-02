/**
 * Talks to the MX Master 3S through the Logi Bolt receivers plugged in, over HID++: the only module that uses
 * `node-hid`. HID++ 1.0 reads the receiver's own registers, to find the mouse's slot on it, and HID++ 2.0 reaches the
 * mouse, by that slot, through its CHANGE_HOST feature. `scripts/probes/hidpp.mjs` sends the same requests, by hand.
 * Every request waits for its own reply, and skips the notifications that arrive in between.
 *
 * On macOS, a receiver's HID++ channel is one device path, which carries both short and long reports. On Windows, it's
 * two, one per report length, each a HID collection of its own: requests, which are short, go through the short one, and
 * replies come on either, so the plugin opens both and reads from both.
 */
import HID, { type HIDAsync } from "node-hid";

import { logger as pluginLogger } from "./logging";

const logger = pluginLogger.createScope("Mouse");

const LOGITECH = 0x046d;
const BOLT_RECEIVER = 0xc548;
const MX_MASTER_3S = 0xb034;

// The receiver's HID++ channel, on a device path of its own, apart from its keyboard and mouse collections, so it opens
// on macOS with no permission (#3). It's listed once per report length: usage 1 for short reports, usage 2 for long.
const HIDPP_USAGE_PAGE = 0xff00;
const SHORT_REPORTS = 0x0001;

// The device index of the receiver itself, the slots a receiver has, and the software ID the plugin's requests carry,
// which their replies echo: any from 1 to 15, and the probes use 0x0a.
const RECEIVER = 0xff;
const SLOTS = 6;
const SOFTWARE_ID = 0x0b;

// HID++ 1.0 sub-IDs, and the receiver's pairing information register, one sub-register per slot.
const GET_LONG_REGISTER = 0x83;
const ERROR_1_0 = 0x8f;
const ERROR_2_0 = 0xff;
const RECEIVER_INFO = 0xb5;
const PAIRING_INFO = 0x50;

// IRoot, the feature every HID++ 2.0 device has at index 0, and CHANGE_HOST, which switches the Easy-Switch host.
const ROOT = 0x00;
const CHANGE_HOST = 0x1814;

// How long a request waits for its reply. A paired device that is on another channel may not answer at all.
const TIMEOUT_MS = 1500;

// How long a read waits on one handle before trying the other, on a channel that has two.
const POLL_MS = 10;

/** The device paths of a receiver's HID++ channel, every one replies come on, the one requests are written to first. */
type ChannelPaths = string[];

/** A receiver's HID++ channel, open: the handle requests are written to, and every handle replies are read from. */
type Channel = { short: HIDAsync; handles: HIDAsync[] };

/** The mouse, as reached through a receiver: its slot, and the index of CHANGE_HOST on it. */
type Reached = { channel: Channel; slot: number; changeHost: number };

/** An error reply from the receiver or a device, as opposed to a request that failed or got no reply. */
class HidppError extends Error {}

/** What sending the mouse to a host came to. Only `ok` says the mouse is now on that host, or on its way. */
export type SwitchResult =
  | { ok: true; outcome: "switched"; from: number }
  | { ok: true; outcome: "already-there" }
  | { ok: false; outcome: "no-receiver" | "unreachable" | "failed" }
  | { ok: false; outcome: "no-such-host"; hosts: number };

// One switch at a time, as presses come, so the requests and replies of two never mix on a receiver's channel.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends the mouse to `host`, counted from 1 as on the mouse, through the receiver it answers through. The mouse leaves
 * at once, so no reply comes. A mouse already on `host` is left alone. It logs what happened, and never throws.
 */
export function switchHost(host: number): Promise<SwitchResult> {
  const result = queue.then(() => switchNow(host));
  queue = result.catch(() => undefined);
  return result;
}

/** {@link switchHost}, once the switch before it has finished. */
async function switchNow(host: number): Promise<SwitchResult> {
  let receivers: ChannelPaths[];
  try {
    receivers = await receiverChannels();
  } catch (error) {
    logger.error("Can't list the HID devices", error);
    return { ok: false, outcome: "failed" };
  }
  if (receivers.length === 0) {
    logger.warn("No Logi Bolt receiver found");
    return { ok: false, outcome: "no-receiver" };
  }
  for (const paths of receivers) {
    logger.info(`Opening a receiver's HID++ channel: ${paths.join(" and ")}`);
    const channel = await open(paths);
    if (channel === undefined) {
      continue;
    }
    try {
      const mouse = await findMouse(channel);
      if (mouse !== undefined) {
        return await switchTo(mouse, host);
      }
    } catch (error) {
      logger.error("A request to the receiver failed", error);
      return { ok: false, outcome: "failed" };
    } finally {
      await closeAll(channel.handles);
    }
  }
  logger.warn(`No receiver reaches the MX Master 3S, out of ${receivers.length}`);
  return { ok: false, outcome: "unreachable" };
}

/** Opens every path of a receiver's HID++ channel, or none of them: a failure is logged, and closes what was opened. */
async function open(paths: ChannelPaths): Promise<Channel | undefined> {
  const handles: HIDAsync[] = [];
  try {
    for (const path of paths) {
      handles.push(await HID.HIDAsync.open(path));
    }
  } catch (error) {
    logger.warn("Can't open a receiver's HID++ channel", error);
    await closeAll(handles);
    return undefined;
  }
  const [short] = handles;
  return short === undefined ? undefined : { short, handles };
}

/** Closes a receiver's handles. A failure is only logged: the switch is done by then. */
async function closeAll(handles: HIDAsync[]): Promise<void> {
  for (const handle of handles) {
    try {
      await handle.close();
    } catch (error) {
      logger.warn("Can't close a receiver's HID++ channel", error);
    }
  }
}

/** Sends the mouse reached to `host`, after checking it against the mouse's hosts. */
async function switchTo(mouse: Reached, host: number): Promise<SwitchResult> {
  const { count, current } = await hostInfo(mouse);
  if (host < 1 || host > count) {
    logger.warn(`The MX Master 3S has ${count} hosts, so it can't go to host ${host}`);
    return { ok: false, outcome: "no-such-host", hosts: count };
  }
  if (host === current) {
    logger.info(`The MX Master 3S is already on host ${host}`);
    return { ok: true, outcome: "already-there" };
  }
  // setCurrentHost, function 1, takes the host counted from 0.
  await mouse.channel.short.write(featureReport(mouse.slot, mouse.changeHost, 1, [host - 1]));
  logger.info(`Sent the MX Master 3S from host ${current} to host ${host}`);
  return { ok: true, outcome: "switched", from: current };
}

/**
 * The HID++ channel of every Bolt receiver plugged in, one per receiver. A receiver lists its channel twice, once per
 * report length: on the same path on macOS, and on two on Windows, which differ only in their collection, such as
 * `&Col01` and `&Col02`, and in the last number of their instance, such as `&0000` and `&0001`.
 */
async function receiverChannels(): Promise<ChannelPaths[]> {
  const receivers = new Map<string, { path: string; usage: number }[]>();
  for (const d of await HID.devicesAsync()) {
    if (d.vendorId !== LOGITECH || d.productId !== BOLT_RECEIVER || d.usagePage !== HIDPP_USAGE_PAGE || !d.path) {
      continue;
    }
    const key = d.path.replace(/&col\d+(#.*&)\d+(#)/i, "$1$2");
    receivers.set(key, [...(receivers.get(key) ?? []), { path: d.path, usage: d.usage ?? 0 }]);
  }
  // The path of short reports first, and each path once, since macOS lists the same one twice.
  return [...receivers.values()].map((collections) => {
    const shortFirst = [...collections].sort(
      (a, b) => Number(b.usage === SHORT_REPORTS) - Number(a.usage === SHORT_REPORTS),
    );
    return [...new Set(shortFirst.map((c) => c.path))];
  });
}

/**
 * The MX Master 3S on this receiver, if it answers: the first slot paired with one that tells the index of
 * CHANGE_HOST. A mouse paired with the receiver but on another channel doesn't answer, or answers with an error.
 */
async function findMouse(channel: Channel): Promise<Reached | undefined> {
  for (let slot = 1; slot <= SLOTS; slot++) {
    if ((await productId(channel, slot)) !== MX_MASTER_3S) {
      continue;
    }
    try {
      const changeHost = await featureIndex(channel, slot, CHANGE_HOST);
      if (changeHost !== 0) {
        return { channel, slot, changeHost };
      }
    } catch {
      // On another channel, or off.
    }
  }
  return undefined;
}

/**
 * The product ID of the device paired in `slot`, from the receiver's pairing information, or undefined when the slot
 * is empty. The information holds the device's serial number too, which the plugin never reads. A request that fails,
 * or gets no reply, throws: the receiver itself always answers.
 */
async function productId(channel: Channel, slot: number): Promise<number | undefined> {
  const register = PAIRING_INFO + slot;
  try {
    const reply = await request(
      channel,
      shortReport(RECEIVER, GET_LONG_REGISTER, RECEIVER_INFO, [register]),
      (r) => r[1] === RECEIVER && r[2] === GET_LONG_REGISTER && r[3] === RECEIVER_INFO && r[4] === register,
      (r) => r[1] === RECEIVER && r[2] === ERROR_1_0 && r[3] === GET_LONG_REGISTER && r[4] === RECEIVER_INFO,
    );
    // Low byte first, in bytes 2 and 3 of the information, which starts at byte 5 of the reply.
    return ((reply[7] ?? 0) << 8) + (reply[6] ?? 0);
  } catch (error) {
    // An empty slot answers with an error.
    if (error instanceof HidppError) {
      return undefined;
    }
    throw error;
  }
}

/** The index of feature `id` on the device in `slot`, from IRoot, or 0 when the device doesn't have it. */
async function featureIndex(channel: Channel, slot: number, id: number): Promise<number> {
  const reply = await callFeature(channel, slot, ROOT, 0, [id >> 8, id & 0xff]);
  return reply[4] ?? 0;
}

/** How many Easy-Switch hosts the mouse has, and which one it's on, counted from 1 as on the mouse. */
async function hostInfo({ channel, slot, changeHost }: Reached): Promise<{ count: number; current: number }> {
  const reply = await callFeature(channel, slot, changeHost, 0);
  return { count: reply[4] ?? 0, current: (reply[5] ?? 0) + 1 };
}

/** Calls function `fn` of the feature at `index` on the device in `slot`, with `params`, and returns its reply. */
function callFeature(channel: Channel, slot: number, index: number, fn: number, params: number[] = []) {
  const report = featureReport(slot, index, fn, params);
  const fnId = report[3];
  return request(
    channel,
    report,
    (r) => r[1] === slot && r[2] === index && r[3] === fnId,
    (r) => r[1] === slot && ((r[2] === ERROR_2_0 && r[3] === index && r[4] === fnId) || r[2] === ERROR_1_0),
  );
}

/** A HID++ 2.0 request: function `fn` of the feature at `index`, with the plugin's software ID. */
function featureReport(slot: number, index: number, fn: number, params: number[]): number[] {
  return shortReport(slot, index, (fn << 4) | SOFTWARE_ID, params);
}

/** A HID++ short report: its ID, the device index, two bytes that say what it asks, and parameters up to 7 bytes. */
function shortReport(deviceIndex: number, first: number, second: number, params: number[]): number[] {
  return [0x10, deviceIndex, first, second, ...params, 0, 0, 0].slice(0, 7);
}

/**
 * Sends a short report and waits for the reply `isReply` accepts, on any of the channel's handles. It throws a
 * {@link HidppError} on an error reply that `isError` accepts, and an `Error` when no reply comes in time. Any other
 * report, such as a notification, is skipped.
 */
async function request(
  channel: Channel,
  report: number[],
  isReply: (reply: number[]) => boolean,
  isError: (reply: number[]) => boolean,
): Promise<number[]> {
  await channel.short.write(report);
  const deadline = Date.now() + TIMEOUT_MS;
  // The time left to wait, counted from the reads that timed out, so that a read that returns at once, as a fake
  // handle's does, still runs it out.
  let waiting = TIMEOUT_MS;
  while (waiting > 0 && Date.now() < deadline) {
    for (const handle of channel.handles) {
      // A single handle waits for the whole time left, and two take turns. A read that times out gives an empty buffer.
      const timeout = channel.handles.length === 1 ? waiting : Math.min(POLL_MS, waiting);
      const reply = [...((await handle.read(Math.max(1, timeout))) ?? [])];
      if (reply.length === 0) {
        waiting -= timeout;
        continue;
      }
      if (isReply(reply)) {
        return reply;
      }
      if (isError(reply)) {
        throw new HidppError(`HID++ error ${hex(reply)} for ${hex(report)}`);
      }
    }
  }
  throw new Error(`No reply to ${hex(report)}`);
}

/** The first 7 bytes of a report, as hex, two digits each: a short report, or the part of a long one that says what. */
function hex(bytes: number[]): string {
  return bytes
    .slice(0, 7)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}
