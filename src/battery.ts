/**
 * Reads the MX Master 3S's battery, through its UNIFIED_BATTERY feature, on the mouse reached by `mouse.ts`: how full
 * it is, the level the mouse puts that at, and whether it's charging. The mouse answers only while it's on this
 * computer's channel, and a request wakes it when it's at rest.
 */
import { logger as pluginLogger } from "./logging";
import { callFeature, type Mouse, reachMouse, type Unreached } from "./mouse";

const logger = pluginLogger.createScope("Battery");

// UNIFIED_BATTERY, the feature that tells the battery's charge, its level, and whether it's charging.
const UNIFIED_BATTERY = 0x1004;

// getStatus, its function 1.
const GET_STATUS = 1;

/** The levels the mouse puts its charge at, from the bit getStatus sets for each. */
const LEVELS = [
  [0x08, "full"],
  [0x04, "good"],
  [0x02, "low"],
  [0x01, "critical"],
] as const;

/** A level the mouse puts its charge at. */
export type Level = (typeof LEVELS)[number][1];

// The charging states getStatus reports that mean the mouse is on its cable: charging, as measured, then charged and
// charging slowly, as Solaar reads them.
const ON_CABLE = new Set([0x01, 0x02, 0x03]);

/**
 * The battery, as the mouse reports it: how full it is, from 0 to 100, the level it puts that at, when it reports one
 * the plugin knows, and whether it's on its cable, charging or charged.
 */
export type Battery = { percentage: number; level: Level | undefined; charging: boolean };

/** What reading the battery came to. */
export type BatteryResult = { ok: true; battery: Battery } | Unreached;

/**
 * Reads the battery through the receiver the mouse answers through, in the same queue as every other operation on the
 * mouse. It logs what it read, and never throws.
 */
export function readBattery(): Promise<BatteryResult> {
  return reachMouse(UNIFIED_BATTERY, readStatus);
}

/** Asks the mouse reached for its battery's status: getStatus, which answers its percentage, level and charging. */
async function readStatus(mouse: Mouse): Promise<BatteryResult> {
  const reply = await callFeature(mouse, GET_STATUS);
  const [percentage = 0, levelBit = 0, charging = 0] = reply.slice(4, 7);
  const level = LEVELS.find(([bit]) => bit === levelBit)?.[1];
  const battery: Battery = { percentage, level, charging: ON_CABLE.has(charging) };
  logger.info(
    `Read the MX Master 3S's battery: ${percentage}%, ${level ?? `level 0x${levelBit.toString(16)}`}, ${battery.charging ? "charging" : "not charging"}`,
  );
  return { ok: true, battery };
}
