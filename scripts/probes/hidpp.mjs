/**
 * What the probes share: finding and opening the HID++ channels of the Logi Bolt receivers plugged in, and the HID++
 * requests they send through them. HID++ 1.0 reads and writes the receiver's own registers, and HID++ 2.0 reaches a
 * paired device, by its slot on the receiver, through its features. Every request waits for its own reply, and skips
 * the notifications that arrive in between.
 */
import HID from "node-hid";

/** @import { HID as Device } from "node-hid" */

export const LOGITECH = 0x046d;
export const BOLT_RECEIVER = 0xc548;
export const MX_MASTER_3S = 0xb034;

// The receiver's HID++ channel, on a device path of its own, apart from its keyboard and mouse collections.
const HIDPP_USAGE_PAGE = 0xff00;

// The device index of the receiver itself, the slots a receiver has, and the software ID the probes' requests carry,
// which their replies echo.
const RECEIVER = 0xff;
const SLOTS = 6;
const SOFTWARE_ID = 0x0a;

// HID++ 1.0 sub-IDs, and the registers the probes use: the receiver's notification flags, its connection state, and
// its pairing information, one sub-register per slot.
const SET_REGISTER = 0x80;
const GET_REGISTER = 0x81;
const GET_LONG_REGISTER = 0x83;
const NOTIFICATIONS = 0x00;
const ERROR_1_0 = 0x8f;
const ERROR_2_0 = 0xff;
const CONNECTION_STATE = 0x02;
const RECEIVER_INFO = 0xb5;
const PAIRING_INFO = 0x50;

// IRoot, the feature every HID++ 2.0 device has at index 0, and CHANGE_HOST, which switches the Easy-Switch host.
const ROOT = 0x00;
export const CHANGE_HOST = 0x1814;

const TIMEOUT_MS = 1500;

/**
 * Bytes as hex, two digits each, separated by spaces.
 *
 * @param {Iterable<number>} bytes
 * @returns {string}
 */
export function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * The device paths of the HID++ channels of every Bolt receiver plugged in, one per receiver. It throws when there's
 * none.
 *
 * @returns {string[]}
 */
export function receiverPaths() {
  const paths = HID.devices()
    .filter((d) => d.vendorId === LOGITECH && d.productId === BOLT_RECEIVER && d.usagePage === HIDPP_USAGE_PAGE)
    .flatMap((d) => (d.path ? [d.path] : []));
  if (paths.length === 0) {
    throw new Error("no Logi Bolt receiver found");
  }
  // A receiver lists its HID++ channel twice, for short and long reports, on the same path.
  return [...new Set(paths)];
}

/**
 * Opens a receiver's HID++ channel, by its path from {@link receiverPaths}. It throws when it can't be opened, which is
 * what a missing permission would look like.
 *
 * @param {string} path
 * @returns {Device}
 */
export function openReceiver(path) {
  return new HID.HID(path);
}

/**
 * Sends a short report and waits for the reply `isReply` accepts. It throws on an error reply that `isError` accepts,
 * and when no reply comes in time. Any other report, such as a notification, is skipped.
 *
 * @param {Device} device
 * @param {number[]} report
 * @param {(reply: number[]) => boolean} isReply
 * @param {(reply: number[]) => boolean} isError
 * @returns {number[]}
 */
function request(device, report, isReply, isError) {
  device.write(report);
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const reply = device.readTimeout(Math.max(1, deadline - Date.now()));
    if (reply.length === 0) {
      break;
    }
    if (isReply(reply)) {
      return reply;
    }
    if (isError(reply)) {
      throw new Error(`HID++ error ${hex(reply.slice(0, 7))} for ${hex(report)}`);
    }
  }
  throw new Error(`no reply to ${hex(report)}`);
}

/**
 * Reads a register of the receiver, short or long, with `params` as its first parameters, such as a sub-register.
 *
 * @param {Device} device
 * @param {number} sub {@link GET_REGISTER} or {@link GET_LONG_REGISTER}
 * @param {number} register
 * @param {number[]} [params]
 * @returns {number[]}
 */
function readRegister(device, sub, register, params = []) {
  const report = [0x10, RECEIVER, sub, register, ...params, 0, 0, 0].slice(0, 7);
  return request(
    device,
    report,
    (r) => r[1] === RECEIVER && r[2] === sub && r[3] === register && (params[0] === undefined || r[4] === params[0]),
    (r) => r[1] === RECEIVER && r[2] === ERROR_1_0 && r[3] === sub && r[4] === register,
  );
}

/**
 * Writes a short register of the receiver, with up to three bytes of parameters.
 *
 * @param {Device} device
 * @param {number} register
 * @param {number[]} params
 * @returns {void}
 */
export function writeRegister(device, register, params) {
  request(
    device,
    [0x10, RECEIVER, SET_REGISTER, register, ...params, 0, 0, 0].slice(0, 7),
    (r) => r[1] === RECEIVER && r[2] === SET_REGISTER && r[3] === register,
    (r) => r[1] === RECEIVER && r[2] === ERROR_1_0 && r[3] === SET_REGISTER && r[4] === register,
  );
}

/**
 * The receiver's notification flags, as the three bytes of its notifications register. Which notifications it sends,
 * such as those about the devices it finds and pairs, depends on them.
 *
 * @param {Device} device
 * @returns {number[]}
 */
export function notificationFlags(device) {
  return readRegister(device, GET_REGISTER, NOTIFICATIONS).slice(4, 7);
}

/**
 * Sets the receiver's notification flags, as the three bytes {@link notificationFlags} reads.
 *
 * @param {Device} device
 * @param {number[]} flags
 * @returns {void}
 */
export function setNotificationFlags(device, flags) {
  writeRegister(device, NOTIFICATIONS, flags);
}

/**
 * Calls function `fn` of the feature at `index` on the device in `slot`, with `params`, and returns its reply.
 *
 * @param {Device} device
 * @param {number} slot
 * @param {number} index
 * @param {number} fn
 * @param {number[]} [params]
 * @returns {number[]}
 */
function callFeature(device, slot, index, fn, params = []) {
  const fnId = (fn << 4) | SOFTWARE_ID;
  return request(
    device,
    [0x10, slot, index, fnId, ...params, 0, 0, 0].slice(0, 7),
    (r) => r[1] === slot && r[2] === index && r[3] === fnId,
    (r) => r[1] === slot && ((r[2] === ERROR_2_0 && r[3] === index && r[4] === fnId) || r[2] === ERROR_1_0),
  );
}

/**
 * Sends function `fn` of the feature at `index` to the device in `slot`, without waiting for a reply, for a request
 * that has none, such as `setCurrentHost`.
 *
 * @param {Device} device
 * @param {number} slot
 * @param {number} index
 * @param {number} fn
 * @param {number[]} params
 * @returns {number[]} the report sent
 */
export function sendFeature(device, slot, index, fn, params) {
  const report = [0x10, slot, index, (fn << 4) | SOFTWARE_ID, ...params, 0, 0, 0].slice(0, 7);
  device.write(report);
  return report;
}

/**
 * How many devices the receiver has paired, from its connection state register.
 *
 * @param {Device} device
 * @returns {number}
 */
export function pairedCount(device) {
  return /** @type {number} */ (readRegister(device, GET_REGISTER, CONNECTION_STATE)[5]);
}

/**
 * The receiver's paired devices, by slot, with each one's product ID, from its pairing information register. It holds
 * the device's serial number too, which the probes never print.
 *
 * @param {Device} device
 * @returns {{ slot: number, productId: number }[]}
 */
export function pairedDevices(device) {
  /** @type {{ slot: number, productId: number }[]} */
  const devices = [];
  for (let slot = 1; slot <= SLOTS; slot++) {
    try {
      const info = readRegister(device, GET_LONG_REGISTER, RECEIVER_INFO, [PAIRING_INFO + slot]);
      // The product ID, low byte first, in bytes 2 and 3 of the information, which starts at byte 5 of the reply.
      devices.push({ slot, productId: ((info[7] ?? 0) << 8) + (info[6] ?? 0) });
    } catch {
      // An empty slot answers with an error.
    }
  }
  return devices;
}

/**
 * Pings the device in `slot`, and returns the HID++ version it answers with, such as `"4.5"`.
 *
 * @param {Device} device
 * @param {number} slot
 * @returns {string}
 */
export function ping(device, slot) {
  const reply = callFeature(device, slot, ROOT, 1, [0, 0, 0xaa]);
  return `${reply[4]}.${reply[5]}`;
}

/**
 * The index of feature `id` on the device in `slot`, from IRoot, or 0 when the device doesn't have it. It differs from
 * device to device, so it's always asked for.
 *
 * @param {Device} device
 * @param {number} slot
 * @param {number} id
 * @returns {number}
 */
export function featureIndex(device, slot, id) {
  return /** @type {number} */ (callFeature(device, slot, ROOT, 0, [id >> 8, id & 0xff])[4]);
}

/**
 * How many Easy-Switch hosts the device in `slot` has, and which one it's on, counted from 1 as on the mouse.
 *
 * @param {Device} device
 * @param {number} slot
 * @param {number} changeHost the index of CHANGE_HOST
 * @returns {{ count: number, current: number }}
 */
export function hostInfo(device, slot, changeHost) {
  const reply = callFeature(device, slot, changeHost, 0);
  return { count: reply[4] ?? 0, current: (reply[5] ?? 0) + 1 };
}
