/**
 * Sends the MX Master 3S to one of its Easy-Switch hosts, through its CHANGE_HOST feature, on the mouse reached by
 * `mouse.ts`. Once a computer sends the mouse to another host, it can't call it back: the mouse comes back with its own
 * button, or from the other host.
 */
import { logger as pluginLogger } from "./logging";
import { callFeature, type Mouse, reachMouse, sendFeature, type Unreached } from "./mouse";

const logger = pluginLogger.createScope("Host");

// CHANGE_HOST, the feature that tells and switches the Easy-Switch host.
const CHANGE_HOST = 0x1814;

/** What sending the mouse to a host came to. Only `ok` says the mouse is now on that host, or on its way. */
export type SwitchResult =
  | { ok: true; outcome: "switched"; from: number }
  | { ok: true; outcome: "already-there" }
  | { ok: false; outcome: "no-such-host"; hosts: number }
  | Unreached;

/**
 * Sends the mouse to `host`, counted from 1 as on the mouse, through the receiver it answers through. The mouse leaves
 * at once, so no reply comes. A mouse already on `host` is left alone. It logs what happened, and never throws.
 */
export function switchHost(host: number): Promise<SwitchResult> {
  return reachMouse(CHANGE_HOST, (mouse) => switchTo(mouse, host));
}

/** Sends the mouse reached to `host`, after checking it against the mouse's hosts. */
async function switchTo(mouse: Mouse, host: number): Promise<SwitchResult> {
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
  await sendFeature(mouse, 1, [host - 1]);
  logger.info(`Sent the MX Master 3S from host ${current} to host ${host}`);
  return { ok: true, outcome: "switched", from: current };
}

/** How many Easy-Switch hosts the mouse has, and which one it's on, counted from 1 as on the mouse: `getHostInfo`. */
async function hostInfo(mouse: Mouse): Promise<{ count: number; current: number }> {
  const reply = await callFeature(mouse, 0);
  return { count: reply[4] ?? 0, current: (reply[5] ?? 0) + 1 };
}
