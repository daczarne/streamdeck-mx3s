#!/usr/bin/env node
/**
 * Pairs a device in pairing mode, such as the mouse on one of its Easy-Switch channels, with the Logi Bolt receiver
 * that has nothing paired yet. It refuses to touch a receiver that already has a device, so a receiver in use stays as
 * it is. It prints every notification the receiver sends, with the device's address masked, so a pairing that goes
 * differently from what's expected shows how.
 *
 * The messages follow Solaar's Bolt pairing. The receiver reports what it finds only with its wireless notifications
 * on, so the probe turns them on first, and puts the receiver's flags back as they were at the end. Then it starts a
 * discovery (register `0xC0`), and pairs with the first device found (long register `0xC1`). The receiver answers with
 * notifications: `0x53` for the discovery's status, `0x4F` for a device found, `0x4D` for the passkey, which a mouse
 * confirms as clicks, and `0x54` for the pairing's status.
 */
import {
  hex,
  notificationFlags,
  openReceiver,
  pairedCount,
  receiverPaths,
  setNotificationFlags,
  writeRegister,
} from "./hidpp.mjs";

/** @import { HID as Device } from "node-hid" */

/**
 * A device the discovery found: what pairing it takes.
 *
 * @typedef {{ kind: number, address: number[], authentication: number }} Found
 */

// How long the receiver looks for devices, in seconds, and how long the probe waits beyond it for the pairing.
const DISCOVERY_S = 30;
const PAIRING_WAIT_S = 60;

// The wireless notifications flag, in the middle byte of the notifications register.
const WIRELESS = 0x01;

// The receiver's discovery and pairing registers, its notifications, and the entropy Solaar pairs a mouse with.
const DISCOVERY = 0xc0;
const PAIRING = 0xc1;
const SET_LONG_REGISTER = 0x82;
const DEVICE_DISCOVERY = 0x4f;
const PASSKEY_REQUEST = 0x4d;
const PASSKEY_PRESSED = 0x4e;
// In a device discovery notification, byte 5 says what it holds: the device's details, or its name.
const DEVICE_DETAILS = 0x00;
const DEVICE_NAME = 0x01;
// In a passkey notification, byte 3 says what was pressed: entry started, a click, or both buttons, which ends it.
const ENTRY_STARTED = 0x00;
const CLICK = 0x01;
const ENTRY_DONE = 0x04;
const DISCOVERY_STATUS = 0x53;
const PAIRING_STATUS = 0x54;
const MOUSE_ENTROPY = 10;

/**
 * Opens the one receiver with nothing paired, or none when there isn't exactly one.
 *
 * @returns {{ path: string, device: Device } | undefined}
 */
function emptyReceiver() {
  /** @type {{ path: string, device: Device }[]} */
  const empty = [];
  for (const path of receiverPaths()) {
    const device = openReceiver(path);
    if (pairedCount(device) === 0) {
      empty.push({ path, device });
    } else {
      device.close();
    }
  }
  if (empty.length === 1) {
    return empty[0];
  }
  for (const { device } of empty) {
    device.close();
  }
  console.log(`expected exactly one receiver with nothing paired, found ${empty.length}: nothing done`);
  return undefined;
}

/**
 * A report as printed: in hex, with the device's address masked wherever it appears, since it identifies the device.
 * The pairing, passkey and click notifications all repeat it, each at a place of its own.
 *
 * @param {number[]} report
 * @param {number[] | undefined} address
 * @returns {string}
 */
function shown(report, address) {
  const bytes = report.map((b) => b.toString(16).padStart(2, "0"));
  if (address) {
    for (let i = 0; i + address.length <= report.length; i++) {
      if (address.every((b, j) => report[i + j] === b)) {
        bytes.splice(i, address.length, ...Array(address.length).fill("xx"));
      }
    }
  }
  return bytes.join(" ");
}

/**
 * The clicks that enter a passkey on a mouse, from its bits, as Solaar shows them: right for a 1, left for a 0.
 *
 * @param {string} passkey
 * @returns {string[]}
 */
function clicks(passkey) {
  return Number(passkey)
    .toString(2)
    .padStart(10, "0")
    .split("")
    .map((bit) => (bit === "1" ? "RIGHT" : "LEFT"));
}

/**
 * What to press after `done` of the passkey's clicks: the next click, by its number, or both buttons together.
 *
 * @param {string[]} sequence
 * @param {number} done
 * @returns {string}
 */
function nextPress(sequence, done) {
  return done < sequence.length
    ? `click ${done + 1} of ${sequence.length}: ${sequence[done]}`
    : "BOTH buttons together";
}

/**
 * Asks the receiver to pair with the device found: long register `0xC1`, action 1, slot 0 for the receiver to choose,
 * the device's address and authentication method, and the entropy.
 *
 * @param {Device} device
 * @param {Found} found
 * @returns {void}
 */
function pair(device, found) {
  const report = [0x11, 0xff, SET_LONG_REGISTER, PAIRING, 0x01, 0x00, ...found.address, found.authentication];
  report.push(MOUSE_ENTROPY);
  while (report.length < 20) {
    report.push(0);
  }
  device.write(report);
  console.log("asked the receiver to pair with it");
}

/**
 * Runs the discovery, and the pairing of the first device it finds, printing what the receiver reports.
 *
 * @param {Device} device
 * @returns {void}
 */
function discoverAndPair(device) {
  writeRegister(device, DISCOVERY, [DISCOVERY_S, 0x01]);
  console.log(`discovering for ${DISCOVERY_S} s: the device has to be in pairing mode`);
  /** @type {Found | undefined} */
  let found;
  /** @type {string[]} */
  let sequence = [];
  let done = 0;
  const deadline = Date.now() + (DISCOVERY_S + PAIRING_WAIT_S) * 1000;
  while (Date.now() < deadline) {
    const report = device.readTimeout(1000);
    if (report.length === 0) {
      continue;
    }
    const [sub, address] = [report[2], report[3] ?? 0];
    // The device's details come first, so its address is known before any report that repeats it is printed.
    const details = sub === DEVICE_DISCOVERY && report[5] === DEVICE_DETAILS && !found;
    if (details) {
      found = { kind: report[7] ?? 0, address: report.slice(10, 16), authentication: report[18] ?? 0 };
    }
    console.log(`  ${shown(report, found?.address)}`);
    if (sub === DISCOVERY_STATUS) {
      console.log(address === 0 ? "discovery started" : `discovery stopped (0x${(report[4] ?? 0).toString(16)})`);
      if (address !== 0 && !found) {
        return;
      }
    } else if (sub === DEVICE_DISCOVERY) {
      if (details && found) {
        console.log(
          `found a device: kind 0x${found.kind.toString(16)}, authentication 0x${found.authentication.toString(16)}`,
        );
        pair(device, found);
      } else if (report[5] === DEVICE_NAME) {
        console.log(`its name: "${Buffer.from(report.slice(7, 7 + (report[6] ?? 0))).toString("utf8")}"`);
      }
    } else if (sub === PASSKEY_REQUEST) {
      const passkey = Buffer.from(report.slice(4, 10)).toString("ascii");
      sequence = clicks(passkey);
      done = 0;
      console.log(`passkey ${passkey}: on the mouse, click in this order, then press both buttons together:`);
      sequence.forEach((click, i) => {
        console.log(`    ${i + 1}. ${click}`);
      });
      console.log(`>>> next: ${nextPress(sequence, done)}`);
    } else if (sub === PASSKEY_PRESSED) {
      if (address === CLICK) {
        done += 1;
        console.log(`done: click ${done} (${sequence[done - 1] ?? "?"})`);
        console.log(`>>> next: ${nextPress(sequence, done)}`);
      } else if (address === ENTRY_STARTED) {
        console.log("passkey entry started");
      } else if (address === ENTRY_DONE) {
        console.log("done: both buttons, passkey entered");
      } else {
        console.log(`passkey entry: 0x${address.toString(16)}`);
      }
    } else if (sub === PAIRING_STATUS) {
      if (address === 0) {
        console.log("pairing started");
      } else {
        const error = report[4] ?? 0;
        console.log(
          error === 0 ? `pairing finished, in slot ${report[11]}` : `pairing failed: 0x${error.toString(16)}`,
        );
        return;
      }
    }
  }
  console.log("the receiver reported no end to the pairing in time");
}

const receiver = emptyReceiver();
if (!receiver) {
  process.exit(1);
}
const { path, device } = receiver;
console.log(`pairing with the receiver at ${path}, which has nothing paired`);
const flags = notificationFlags(device);
try {
  setNotificationFlags(device, [flags[0] ?? 0, (flags[1] ?? 0) | WIRELESS, flags[2] ?? 0]);
  console.log(`notification flags ${hex(flags)}, wireless turned on`);
  discoverAndPair(device);
  console.log(`paired devices now: ${pairedCount(device)}`);
} catch (error) {
  console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  try {
    setNotificationFlags(device, flags);
    console.log(`notification flags back to ${hex(flags)}`);
  } finally {
    device.close();
  }
}
