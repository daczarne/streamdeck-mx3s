#!/usr/bin/env node
/**
 * Sends the MX Master 3S to another Easy-Switch host, through a Logi Bolt receiver: `node switch-host.mjs 2` sends it
 * to host 2, counted from 1 as on the mouse. With several receivers plugged in, it uses the one the mouse answers
 * through. It finds the mouse's slot by its product ID, asks for the index of CHANGE_HOST, and checks the host against
 * the ones the mouse has before sending it there. The mouse leaves at once,
 * so no reply comes.
 */
import {
  CHANGE_HOST,
  featureIndex,
  hex,
  hostInfo,
  MX_MASTER_3S,
  openReceiver,
  pairedDevices,
  receiverPaths,
  sendFeature,
} from "./hidpp.mjs";
import { log, start } from "./report.mjs";

/** @import { HID as Device } from "node-hid" */

/**
 * The MX Master 3S's slot on the receiver, and the index of its CHANGE_HOST, when the mouse is paired with the
 * receiver and answers through it, that is, when it's on the channel paired with this receiver.
 *
 * @param {Device} device
 * @returns {{ slot: number, changeHost: number } | undefined}
 */
function findMouse(device) {
  const mouse = pairedDevices(device).find(({ productId }) => productId === MX_MASTER_3S);
  if (!mouse) {
    return undefined;
  }
  try {
    return { slot: mouse.slot, changeHost: featureIndex(device, mouse.slot, CHANGE_HOST) };
  } catch {
    // Paired, but connected elsewhere right now.
    return undefined;
  }
}

/**
 * Sends the mouse to `target`, through the receiver it's connected through, or says why it can't.
 *
 * @param {Device} device
 * @param {{ slot: number, changeHost: number }} mouse
 * @param {number} target
 * @returns {void}
 */
function switchHost(device, { slot, changeHost }, target) {
  log(`the MX Master 3S is in slot ${slot}`);
  if (changeHost === 0) {
    throw new Error("the mouse has no CHANGE_HOST feature");
  }
  const { count, current } = hostInfo(device, slot, changeHost);
  log(`hosts: ${count}, current: ${current}`);
  if (target < 1 || target > count) {
    throw new Error(`the host has to be 1 to ${count}`);
  }
  if (target === current) {
    log(`already on host ${target}: nothing to do`);
    return;
  }
  // setCurrentHost, function 1, takes the host counted from 0.
  const sent = sendFeature(device, slot, changeHost, 1, [target - 1]);
  log(`sent setCurrentHost(${target - 1}): ${hex(sent)}`);
}

const target = Number(process.argv[2]);
if (!Number.isInteger(target)) {
  console.log("usage: node scripts/probes/switch-host.mjs <host>");
  process.exit(1);
}
start();
let reached = false;
try {
  for (const path of receiverPaths()) {
    const device = openReceiver(path);
    try {
      const mouse = findMouse(device);
      if (mouse) {
        reached = true;
        switchHost(device, mouse, target);
        break;
      }
    } finally {
      device.close();
    }
  }
  if (!reached) {
    log("no receiver reaches the MX Master 3S right now");
    process.exitCode = 1;
  }
} catch (error) {
  log(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
