/**
 * Talks to the MX Master 3S through the Logi Bolt receivers plugged in, over HID++: the only module that uses
 * `node-hid`. HID++ 1.0 reads the receiver's own registers, to find the mouse's slot on it, and HID++ 2.0 reaches the
 * mouse, by that slot, through its CHANGE_HOST feature. `scripts/probes/hidpp.mjs` sends the same requests, by hand.
 * Every request waits for its own reply, and skips the notifications that arrive in between.
 */
import HID, { type HIDAsync } from "node-hid";

import { logger as pluginLogger } from "./logging";

const logger = pluginLogger.createScope("Mouse");

const LOGITECH = 0x046d;
const BOLT_RECEIVER = 0xc548;
const MX_MASTER_3S = 0xb034;

// The receiver's HID++ channel, on a device path of its own, apart from its keyboard and mouse collections, so it opens
// on macOS with no permission (#3).
const HIDPP_USAGE_PAGE = 0xff00;

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

/** The mouse, as reached through a receiver: its slot, and the index of CHANGE_HOST on it. */
type Reached = { device: HIDAsync; slot: number; changeHost: number };

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
  let paths: string[];
  try {
    paths = await receiverPaths();
  } catch (error) {
    logger.error("Can't list the HID devices", error);
    return { ok: false, outcome: "failed" };
  }
  if (paths.length === 0) {
    logger.warn("No Logi Bolt receiver found");
    return { ok: false, outcome: "no-receiver" };
  }
  for (const path of paths) {
    let device: HIDAsync;
    try {
      device = await HID.HIDAsync.open(path);
    } catch (error) {
      logger.warn("Can't open a receiver's HID++ channel", error);
      continue;
    }
    try {
      const mouse = await findMouse(device);
      if (mouse !== undefined) {
        return await switchTo(mouse, host);
      }
    } catch (error) {
      logger.error("A request to the receiver failed", error);
      return { ok: false, outcome: "failed" };
    } finally {
      await close(device);
    }
  }
  logger.warn(`No receiver reaches the MX Master 3S, out of ${paths.length}`);
  return { ok: false, outcome: "unreachable" };
}

/** Closes a receiver's HID++ channel. A failure is only logged: the switch is done by then. */
async function close(device: HIDAsync): Promise<void> {
  try {
    await device.close();
  } catch (error) {
    logger.warn("Can't close a receiver's HID++ channel", error);
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
  await mouse.device.write(featureReport(mouse.slot, mouse.changeHost, 1, [host - 1]));
  logger.info(`Sent the MX Master 3S from host ${current} to host ${host}`);
  return { ok: true, outcome: "switched", from: current };
}

/** The device paths of the HID++ channels of every Bolt receiver plugged in, one per receiver. */
async function receiverPaths(): Promise<string[]> {
  const paths = (await HID.devicesAsync())
    .filter((d) => d.vendorId === LOGITECH && d.productId === BOLT_RECEIVER && d.usagePage === HIDPP_USAGE_PAGE)
    .flatMap((d) => (d.path ? [d.path] : []));
  // A receiver lists its HID++ channel twice, for short and long reports, on the same path.
  return [...new Set(paths)];
}

/**
 * The MX Master 3S on this receiver, if it answers: the first slot paired with one that tells the index of
 * CHANGE_HOST. A mouse paired with the receiver but on another channel doesn't answer, or answers with an error.
 */
async function findMouse(device: HIDAsync): Promise<Reached | undefined> {
  for (let slot = 1; slot <= SLOTS; slot++) {
    if ((await productId(device, slot)) !== MX_MASTER_3S) {
      continue;
    }
    try {
      const changeHost = await featureIndex(device, slot, CHANGE_HOST);
      if (changeHost !== 0) {
        return { device, slot, changeHost };
      }
    } catch {
      // On another channel, or off.
    }
  }
  return undefined;
}

/**
 * The product ID of the device paired in `slot`, from the receiver's pairing information, or undefined when the slot
 * is empty. The information holds the device's serial number too, which the plugin never reads.
 */
async function productId(device: HIDAsync, slot: number): Promise<number | undefined> {
  const register = PAIRING_INFO + slot;
  try {
    const reply = await request(
      device,
      shortReport(RECEIVER, GET_LONG_REGISTER, RECEIVER_INFO, [register]),
      (r) => r[1] === RECEIVER && r[2] === GET_LONG_REGISTER && r[3] === RECEIVER_INFO && r[4] === register,
      (r) => r[1] === RECEIVER && r[2] === ERROR_1_0 && r[3] === GET_LONG_REGISTER && r[4] === RECEIVER_INFO,
    );
    // Low byte first, in bytes 2 and 3 of the information, which starts at byte 5 of the reply.
    return ((reply[7] ?? 0) << 8) + (reply[6] ?? 0);
  } catch {
    // An empty slot answers with an error.
    return undefined;
  }
}

/** The index of feature `id` on the device in `slot`, from IRoot, or 0 when the device doesn't have it. */
async function featureIndex(device: HIDAsync, slot: number, id: number): Promise<number> {
  const reply = await callFeature(device, slot, ROOT, 0, [id >> 8, id & 0xff]);
  return reply[4] ?? 0;
}

/** How many Easy-Switch hosts the mouse has, and which one it's on, counted from 1 as on the mouse. */
async function hostInfo({ device, slot, changeHost }: Reached): Promise<{ count: number; current: number }> {
  const reply = await callFeature(device, slot, changeHost, 0);
  return { count: reply[4] ?? 0, current: (reply[5] ?? 0) + 1 };
}

/** Calls function `fn` of the feature at `index` on the device in `slot`, with `params`, and returns its reply. */
function callFeature(device: HIDAsync, slot: number, index: number, fn: number, params: number[] = []) {
  const report = featureReport(slot, index, fn, params);
  const fnId = report[3];
  return request(
    device,
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
 * Sends a report and waits for the reply `isReply` accepts. It throws on an error reply that `isError` accepts, and
 * when no reply comes in time. Any other report, such as a notification, is skipped.
 */
async function request(
  device: HIDAsync,
  report: number[],
  isReply: (reply: number[]) => boolean,
  isError: (reply: number[]) => boolean,
): Promise<number[]> {
  await device.write(report);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    // A read that times out gives an empty buffer.
    const reply = [...((await device.read(Math.max(1, deadline - Date.now()))) ?? [])];
    if (reply.length === 0) {
      break;
    }
    if (isReply(reply)) {
      return reply;
    }
    if (isError(reply)) {
      throw new Error(`HID++ error ${hex(reply)} for ${hex(report)}`);
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
