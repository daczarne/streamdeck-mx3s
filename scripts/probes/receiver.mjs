#!/usr/bin/env node
/**
 * Reads, through every Logi Bolt receiver plugged in, everything the plugin needs to know before switching the host:
 * that the receiver's HID++ channel opens, the devices it has paired, and for each one its HID++ version, the index of
 * CHANGE_HOST, and its hosts. It only reads: it never switches the host.
 */
import {
  CHANGE_HOST,
  featureIndex,
  hostInfo,
  MX_MASTER_3S,
  openReceiver,
  pairedCount,
  pairedDevices,
  ping,
  receiverPaths,
} from "./hidpp.mjs";
import { log, start } from "./report.mjs";

/** @import { HID as Device } from "node-hid" */

/**
 * Logs what one paired device answers through the receiver.
 *
 * @param {Device} device
 * @param {{ slot: number, productId: number }} paired
 * @returns {void}
 */
function probeDevice(device, { slot, productId }) {
  const name = productId === MX_MASTER_3S ? " (MX Master 3S)" : "";
  log(`slot ${slot}: product 0x${productId.toString(16).padStart(4, "0")}${name}`);
  try {
    log(`  ping: HID++ ${ping(device, slot)}`);
    const changeHost = featureIndex(device, slot, CHANGE_HOST);
    if (changeHost === 0) {
      log("  no CHANGE_HOST feature");
      return;
    }
    log(`  CHANGE_HOST (0x1814) at feature index ${changeHost}`);
    const { count, current } = hostInfo(device, slot, changeHost);
    log(`  hosts: ${count}, current: ${current}`);
  } catch (error) {
    // A device that isn't connected through this receiver right now, such as a mouse on another channel, doesn't
    // answer.
    log(`  no answer: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Logs what one receiver has paired, and what each of its devices answers.
 *
 * @param {string} path
 * @returns {void}
 */
function probeReceiver(path) {
  /** @type {Device} */
  let device;
  try {
    device = openReceiver(path);
  } catch (error) {
    log(`${path}: can't open the receiver: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  log(`${path}: opened the receiver's HID++ channel`);
  try {
    log(`paired devices: ${pairedCount(device)}`);
    for (const paired of pairedDevices(device)) {
      probeDevice(device, paired);
    }
  } catch (error) {
    log(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    device.close();
  }
}

start();
try {
  for (const path of receiverPaths()) {
    probeReceiver(path);
  }
} catch (error) {
  log(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
