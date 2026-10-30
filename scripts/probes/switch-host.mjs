#!/usr/bin/env node
/**
 * Sends the MX Master 3S to another Easy-Switch host, through a Logi Bolt receiver: `node switch-host.mjs 2` sends it
 * to host 2, counted from 1 as on the mouse. It finds the mouse's slot by its product ID, asks for the index of
 * CHANGE_HOST, and checks the host against the ones the mouse has before sending it there. The mouse leaves at once,
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
  sendFeature,
} from "./hidpp.mjs";

/** @import { HID as Device } from "node-hid" */

/**
 * Sends the mouse paired with the receiver to `target`, or says why it can't.
 *
 * @param {Device} device
 * @param {number} target
 * @returns {void}
 */
function switchHost(device, target) {
  const mouse = pairedDevices(device).find(({ productId }) => productId === MX_MASTER_3S);
  if (!mouse) {
    throw new Error("no MX Master 3S paired with the receiver");
  }
  console.log(`the MX Master 3S is in slot ${mouse.slot}`);
  const changeHost = featureIndex(device, mouse.slot, CHANGE_HOST);
  if (changeHost === 0) {
    throw new Error("the mouse has no CHANGE_HOST feature");
  }
  const { count, current } = hostInfo(device, mouse.slot, changeHost);
  console.log(`hosts: ${count}, current: ${current}`);
  if (target < 1 || target > count) {
    throw new Error(`the host has to be 1 to ${count}`);
  }
  if (target === current) {
    console.log(`already on host ${target}: nothing to do`);
    return;
  }
  // setCurrentHost, function 1, takes the host counted from 0.
  const sent = sendFeature(device, mouse.slot, changeHost, 1, [target - 1]);
  console.log(`sent setCurrentHost(${target - 1}): ${hex(sent)}`);
}

const target = Number(process.argv[2]);
if (!Number.isInteger(target)) {
  console.log("usage: node scripts/probes/switch-host.mjs <host>");
  process.exit(1);
}
/** @type {Device} */
let device;
try {
  device = openReceiver();
} catch (error) {
  console.log(`can't open the receiver: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
try {
  switchHost(device, target);
} catch (error) {
  console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  device.close();
}
