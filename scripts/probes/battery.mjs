#!/usr/bin/env node
/**
 * Reads, through every Logi Bolt receiver plugged in, what each paired device can tell of its battery: the features it
 * has, which battery features among them, and what each of those answers, with how long the device took to answer, to
 * tell a device that wakes from one that's awake. With `--listen <seconds>`, it then logs every report the receivers
 * send for that long, such as the battery notifications a device sends on its own. It only reads: it never switches
 * the host, and never changes the receivers' settings.
 */
import {
  callFeature,
  featureIndex,
  HidppError,
  hex,
  MX_MASTER_3S,
  openReceiver,
  pairedCount,
  pairedDevices,
  ping,
  receiverPaths,
} from "./hidpp.mjs";
import { log, start, tell } from "./report.mjs";

/** @import { HID as Device } from "node-hid" */

// FEATURE_SET lists a device's features, and the battery features Solaar knows report its battery.
const FEATURE_SET = 0x0001;
const BATTERY_STATUS = 0x1000;
const BATTERY_VOLTAGE = 0x1001;
const UNIFIED_BATTERY = 0x1004;
const BATTERY_FEATURES = [UNIFIED_BATTERY, BATTERY_STATUS, BATTERY_VOLTAGE];

// How many times a ping is sent to a device that doesn't reply, each waiting the probes' timeout, so that a device at
// rest has longer than one timeout to answer.
const PING_TRIES = 4;

// The names of the features the probes deal with, or that a mouse like the MX Master 3S is known to have.
const FEATURE_NAMES = new Map([
  [0x0000, "ROOT"],
  [FEATURE_SET, "FEATURE_SET"],
  [0x0003, "DEVICE_FW_VERSION"],
  [0x0005, "DEVICE_NAME"],
  [BATTERY_STATUS, "BATTERY_STATUS"],
  [BATTERY_VOLTAGE, "BATTERY_VOLTAGE"],
  [UNIFIED_BATTERY, "UNIFIED_BATTERY"],
  [0x1814, "CHANGE_HOST"],
  [0x1815, "HOSTS_INFO"],
  [0x1b04, "REPROG_CONTROLS_V4"],
  [0x1d4b, "WIRELESS_DEVICE_STATUS"],
  [0x1f20, "ADC_MEASUREMENT"],
  [0x2110, "SMART_SHIFT"],
  [0x2121, "HIRES_WHEEL"],
  [0x2201, "ADJUSTABLE_DPI"],
]);

// The error codes of an HID++ 1.0 error reply, from the receiver, and of an HID++ 2.0 one, from the device, as Solaar
// names them.
const ERROR_1_0 = 0x8f;
const ERROR_2_0 = 0xff;
const ERRORS_1_0 = new Map([
  [0x01, "invalid sub-ID"],
  [0x02, "invalid address"],
  [0x03, "invalid value"],
  [0x04, "connection request failed"],
  [0x05, "too many devices"],
  [0x06, "already exists"],
  [0x07, "busy"],
  [0x08, "unknown device"],
  [0x09, "resource error"],
  [0x0a, "request unavailable"],
  [0x0b, "invalid parameter value"],
  [0x0c, "wrong PIN code"],
]);
const ERRORS_2_0 = new Map([
  [0x01, "unknown"],
  [0x02, "invalid argument"],
  [0x03, "out of range"],
  [0x04, "hardware error"],
  [0x05, "internal error"],
  [0x06, "invalid feature index"],
  [0x07, "invalid function"],
  [0x08, "busy"],
  [0x09, "unsupported"],
]);

// UNIFIED_BATTERY's levels, one bit each, and its charging states, as Solaar reads them.
const LEVELS = [
  [0x01, "critical"],
  [0x02, "low"],
  [0x04, "good"],
  [0x08, "full"],
];
const UNIFIED_CHARGING = new Map([
  [0x00, "discharging"],
  [0x01, "charging"],
  [0x02, "charged"],
  [0x03, "charging slowly"],
  [0x04, "invalid battery"],
  [0x05, "thermal error"],
]);

// BATTERY_STATUS's charging states, as Solaar reads them.
const STATUS_CHARGING = new Map([
  [0x00, "discharging"],
  [0x01, "charging"],
  [0x02, "almost charged"],
  [0x03, "charged"],
  [0x04, "charging slowly"],
  [0x05, "invalid battery"],
  [0x06, "thermal error"],
]);

/**
 * A byte as `0x` and two hex digits.
 *
 * @param {number | undefined} byte
 * @returns {string}
 */
function byteHex(byte) {
  return `0x${(byte ?? 0).toString(16).padStart(2, "0")}`;
}

/**
 * A feature's ID as `0x` and four hex digits, followed by its name when the probe knows it.
 *
 * @param {number} id
 * @returns {string}
 */
function featureName(id) {
  const name = FEATURE_NAMES.get(id);
  return `0x${id.toString(16).padStart(4, "0")}${name ? ` ${name}` : ""}`;
}

/**
 * What went wrong with a request, with the error code of an error reply named.
 *
 * @param {unknown} error
 * @returns {string}
 */
function describeError(error) {
  if (error instanceof HidppError) {
    const { reply } = error;
    const code = reply[5];
    const names = reply[2] === ERROR_1_0 ? ERRORS_1_0 : reply[2] === ERROR_2_0 ? ERRORS_2_0 : new Map();
    const kind = reply[2] === ERROR_1_0 ? "receiver error" : "device error";
    return `${kind} ${byteHex(code)} (${names.get(code ?? 0) ?? "not known"}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Calls `fn`, and returns what it returned, or what it threw, with how long it took, in ms.
 *
 * @template T
 * @param {() => T} fn
 * @returns {{ ms: number } & ({ value: T } | { error: unknown })}
 */
function timed(fn) {
  const start = performance.now();
  try {
    const value = fn();
    return { ms: Math.round(performance.now() - start), value };
  } catch (error) {
    return { ms: Math.round(performance.now() - start), error };
  }
}

/**
 * The names of the levels set in a bitmask of UNIFIED_BATTERY's levels.
 *
 * @param {number | undefined} bits
 * @returns {string}
 */
function levelNames(bits) {
  const names = LEVELS.filter(([bit]) => ((bits ?? 0) & /** @type {number} */ (bit)) !== 0).map(([, name]) => name);
  return names.length > 0 ? names.join(", ") : "none";
}

/**
 * What a UNIFIED_BATTERY status says, from its parameters at byte 4 on, the same in the reply to `getStatus` and in the
 * notification the device sends when its battery changes.
 *
 * @param {number[]} report
 * @returns {string}
 */
function describeUnified(report) {
  const charging = UNIFIED_CHARGING.get(report[6] ?? 0) ?? `charging state ${byteHex(report[6])}`;
  return `${report[4]}%, level ${levelNames(report[5])}, ${charging}, external power ${byteHex(report[7])}`;
}

/**
 * What a BATTERY_STATUS status says, from its parameters at byte 4 on, the same in the reply to its function 0 and in
 * the notification the device sends when its battery changes.
 *
 * @param {number[]} report
 * @returns {string}
 */
function describeStatus(report) {
  const charging = STATUS_CHARGING.get(report[6] ?? 0) ?? `charging state ${byteHex(report[6])}`;
  return `${report[4]}%, next level ${report[5]}%, ${charging}`;
}

/**
 * What a BATTERY_VOLTAGE reading says, from its parameters at byte 4 on.
 *
 * @param {number[]} report
 * @returns {string}
 */
function describeVoltage(report) {
  return `${((report[4] ?? 0) << 8) | (report[5] ?? 0)} mV, flags ${byteHex(report[6])}`;
}

/**
 * Logs the features of the device in `slot`, from FEATURE_SET, by index. A failure is logged, and stops only the
 * list.
 *
 * @param {Device} device
 * @param {number} slot
 * @returns {void}
 */
function logFeatures(device, slot) {
  try {
    const featureSet = featureIndex(device, slot, FEATURE_SET);
    if (featureSet === 0) {
      log("  no FEATURE_SET feature: can't list the features");
      return;
    }
    // The count leaves out IRoot, at index 0.
    const count = callFeature(device, slot, featureSet, 0)[4] ?? 0;
    log(`  features, besides IRoot: ${count}`);
    for (let index = 1; index <= count; index++) {
      const reply = callFeature(device, slot, featureSet, 1, [index]);
      const flags = reply[6] ?? 0;
      const shownFlags = flags === 0 ? "" : `, flags ${byteHex(flags)}`;
      log(`    ${index}: ${featureName(((reply[4] ?? 0) << 8) | (reply[5] ?? 0))}${shownFlags}`);
    }
  } catch (error) {
    log(`  can't list the features: ${describeError(error)}`);
  }
}

/**
 * Logs what the battery feature `id`, at `index`, answers on the device in `slot`.
 *
 * @param {Device} device
 * @param {number} slot
 * @param {number} id
 * @param {number} index
 * @returns {void}
 */
function logBattery(device, slot, id, index) {
  log(`  ${featureName(id)} at feature index ${index}`);
  try {
    if (id === UNIFIED_BATTERY) {
      const capabilities = callFeature(device, slot, index, 0);
      const flags = capabilities[5] ?? 0;
      log(`    getCapabilities: ${hex(capabilities.slice(4, 8))}`);
      log(`      levels: ${levelNames(capabilities[4])}`);
      log(`      rechargeable: ${flags & 0x01 ? "yes" : "no"}, percentage: ${flags & 0x02 ? "yes" : "no"}`);
      const status = timed(() => callFeature(device, slot, index, 1));
      if ("error" in status) {
        throw status.error;
      }
      log(`    getStatus, in ${status.ms} ms: ${hex(status.value.slice(4, 8))}`);
      log(`      ${describeUnified(status.value)}`);
    } else if (id === BATTERY_STATUS) {
      const status = callFeature(device, slot, index, 0);
      log(`    getBatteryLevelStatus: ${hex(status.slice(4, 7))}`);
      log(`      ${describeStatus(status)}`);
    } else {
      const voltage = callFeature(device, slot, index, 0);
      log(`    getBatteryInfo: ${hex(voltage.slice(4, 7))}`);
      log(`      ${describeVoltage(voltage)}`);
    }
  } catch (error) {
    log(`    no answer: ${describeError(error)}`);
  }
}

/**
 * Logs what one paired device answers through the receiver about its battery, and returns the battery features it
 * has, by index, so that their notifications can be read.
 *
 * @param {Device} device
 * @param {{ slot: number, productId: number }} paired
 * @returns {Map<number, number>}
 */
function probeDevice(device, { slot, productId }) {
  /** @type {Map<number, number>} */
  const battery = new Map();
  const name = productId === MX_MASTER_3S ? " (MX Master 3S)" : "";
  log(`slot ${slot}: product 0x${productId.toString(16).padStart(4, "0")}${name}`);
  // How long the first ping takes against the second tells whether the first had to wake the device. A ping that gets
  // no reply is sent again, up to PING_TRIES times, to tell a device that answers late from one that never does. An
  // error reply, such as the receiver's for a device on another channel, is final.
  const asked = performance.now();
  let first = timed(() => ping(device, slot));
  let tries = 1;
  while ("error" in first && !(first.error instanceof HidppError) && tries < PING_TRIES) {
    log(`  ping ${tries}: no reply, after ${first.ms} ms`);
    first = timed(() => ping(device, slot));
    tries += 1;
  }
  const sinceAsked = Math.round(performance.now() - asked);
  if ("error" in first) {
    // A device that isn't connected through this receiver right now, such as a mouse asleep or on another channel,
    // doesn't answer, or answers with an error.
    const after = tries > 1 ? `, ${tries} pings in ${sinceAsked} ms` : "";
    log(`  no answer to the ping, after ${first.ms} ms${after}: ${describeError(first.error)}`);
    return battery;
  }
  // A late reply to an earlier ping would answer a later one, so the time since the first ask is what counts.
  const late = tries > 1 ? `, on ping ${tries}, ${sinceAsked} ms after the first` : "";
  log(`  ping: HID++ ${first.value}, in ${first.ms} ms${late}`);
  const second = timed(() => ping(device, slot));
  log(`  ping again: ${"error" in second ? describeError(second.error) : `in ${second.ms} ms`}`);
  logFeatures(device, slot);
  for (const id of BATTERY_FEATURES) {
    try {
      const index = featureIndex(device, slot, id);
      if (index === 0) {
        log(`  no ${featureName(id)} feature`);
        continue;
      }
      battery.set(index, id);
      logBattery(device, slot, id, index);
    } catch (error) {
      log(`  can't ask for ${featureName(id)}: ${describeError(error)}`);
    }
  }
  return battery;
}

/**
 * A receiver the probe opened, with the battery features of each device that answered, by slot, then by index.
 *
 * @typedef {{ path: string, device: Device, battery: Map<number, Map<number, number>> }} Opened
 */

/**
 * Opens one receiver, and logs what it has paired, and what each of its devices tells of its battery. It times opening
 * the receiver, its first request, which only the receiver answers, and the reads of its pairing information, to tell
 * the time a run spends on the receiver from the time it spends reaching a device. It returns the receiver opened,
 * which the caller closes, or nothing when it can't be opened.
 *
 * @param {string} path
 * @returns {Opened | undefined}
 */
function probeReceiver(path) {
  const open = timed(() => openReceiver(path));
  if ("error" in open) {
    log(`${path}: can't open the receiver, after ${open.ms} ms: ${describeError(open.error)}`);
    process.exitCode = 1;
    return undefined;
  }
  const device = open.value;
  log(`${path}: opened the receiver's HID++ channel, in ${open.ms} ms`);
  /** @type {Opened} */
  const opened = { path, device, battery: new Map() };
  try {
    const count = timed(() => pairedCount(device));
    if ("error" in count) {
      throw count.error;
    }
    log(`paired devices: ${count.value}, read in ${count.ms} ms`);
    const paired = timed(() => pairedDevices(device));
    if ("error" in paired) {
      throw paired.error;
    }
    log(`pairing information of every slot, read in ${paired.ms} ms`);
    for (const each of paired.value) {
      opened.battery.set(each.slot, probeDevice(device, each));
    }
  } catch (error) {
    log(`error: ${describeError(error)}`);
    process.exitCode = 1;
  }
  return opened;
}

/**
 * What a report is, when it's a battery notification from a device whose battery features the probe found, or
 * nothing.
 *
 * @param {Opened} opened
 * @param {number[]} report
 * @returns {string | undefined}
 */
function describeNotification(opened, report) {
  // A notification carries function 0 and software ID 0, where a reply carries the software ID of its request.
  if (report[3] !== 0x00) {
    return undefined;
  }
  const id = opened.battery.get(report[1] ?? 0)?.get(report[2] ?? 0);
  if (id === UNIFIED_BATTERY) {
    return `UNIFIED_BATTERY notification: ${describeUnified(report)}`;
  }
  if (id === BATTERY_STATUS) {
    return `BATTERY_STATUS notification: ${describeStatus(report)}`;
  }
  if (id === BATTERY_VOLTAGE) {
    return `BATTERY_VOLTAGE notification: ${describeVoltage(report)}`;
  }
  return undefined;
}

/**
 * Logs every report the receivers send for `seconds`, the time it came at, and what it is when it's a battery
 * notification. It doesn't turn on the receivers' notifications: it hears what reaches the host with them as they are.
 *
 * @param {Opened[]} receivers
 * @param {number} seconds
 * @returns {void}
 */
function listen(receivers, seconds) {
  tell(`listening for ${seconds} s`);
  const start = Date.now();
  const deadline = start + seconds * 1000;
  while (Date.now() < deadline) {
    for (const opened of receivers) {
      const report = opened.device.readTimeout(50);
      if (report.length === 0) {
        continue;
      }
      const at = ((Date.now() - start) / 1000).toFixed(1);
      const what = describeNotification(opened, report);
      log(`  ${at} s, ${opened.path}: ${hex(report)}${what ? `\n    ${what}` : ""}`);
    }
  }
  tell("done listening");
}

/**
 * How many seconds to listen for, from the command line: 0 without `--listen`, and nothing when the arguments are
 * anything else.
 *
 * @param {string[]} args
 * @returns {number | undefined}
 */
function listenSeconds(args) {
  if (args.length === 0) {
    return 0;
  }
  const seconds = Number(args[1]);
  if (args.length !== 2 || args[0] !== "--listen" || !Number.isInteger(seconds) || seconds < 1) {
    return undefined;
  }
  return seconds;
}

const seconds = listenSeconds(process.argv.slice(2));
if (seconds === undefined) {
  console.log("usage: node scripts/probes/battery.mjs [--listen <seconds>]");
  process.exit(1);
}
start();
/** @type {Opened[]} */
const receivers = [];
try {
  for (const path of receiverPaths()) {
    const opened = probeReceiver(path);
    if (opened) {
      receivers.push(opened);
    }
  }
  if (seconds > 0) {
    listen(receivers, seconds);
  }
} catch (error) {
  log(describeError(error));
  process.exitCode = 1;
} finally {
  for (const { device } of receivers) {
    device.close();
  }
}
