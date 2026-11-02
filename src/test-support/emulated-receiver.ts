import type { Device as HidDeviceInfo } from "node-hid";

/**
 * A Logi Bolt receiver, and the devices paired with it, as the probes in `scripts/probes/` measured them: it answers the
 * HID++ requests the plugin sends, through its HID++ channel, and passes on to a paired device the ones addressed to its
 * slot. Only the registers and features the plugin uses are here.
 *
 * On macOS, its HID++ channel is one path, which carries reports of both lengths. On Windows, it's two, one per report
 * length, as Windows lists a HID device's collections: each takes only the reports of its length, and gets only those.
 */

const LOGITECH = 0x046d;
const BOLT_RECEIVER = 0xc548;
export const MX_MASTER_3S = 0xb034;
export const CHANGE_HOST = 0x1814;

const SHORT = 0x10;
const LONG = 0x11;
const RECEIVER = 0xff;
const GET_LONG_REGISTER = 0x83;
const ERROR_1_0 = 0x8f;
const ERROR_2_0 = 0xff;
const RECEIVER_INFO = 0xb5;
const PAIRING_INFO = 0x50;

// HID++ 1.0 error codes: an invalid value, such as an empty slot's sub-register, and a device that isn't connected.
const INVALID_VALUE = 0x02;
const UNKNOWN_DEVICE = 0x08;
// HID++ 2.0 error code for a function the feature doesn't have.
const INVALID_FUNCTION = 0x07;

// The receiver's HID++ channel, and its keyboard collection, which the plugin leaves alone.
const HIDPP_USAGE_PAGE = 0xff00;
const GENERIC_DESKTOP = 0x01;

/** What a paired device does with a request while it isn't connected to the receiver, as on another channel. */
export type Away = "error" | "silent";

/** The system the receiver is plugged into, which decides how its HID++ channel is listed. */
export type System = "macos" | "windows";

/** Which reports a handle on the HID++ channel carries: both lengths on macOS, one on Windows. */
type Carries = "both" | "short" | "long";

/** A handle opened on the HID++ channel: what it carries, and the reports waiting to be read on it. */
export type ReceiverHandle = { carries: Carries; input: number[][] };

/** A device paired with the receiver: the mouse, or another one. */
export type PairedDevice = {
  productId: number;
  // Whether it's connected to this receiver, rather than on another channel or off.
  connected: boolean;
  away: Away;
  // CHANGE_HOST's index on the device, or 0 for a device without it.
  changeHost: number;
  hosts: number;
  // The host it's on, counted from 1 as on the mouse.
  current: number;
};

// Each receiver gets its own paths, as node-hid lists them.
let nextReceiver = 1;

/** A Logi Bolt receiver plugged in, with its paired devices by slot. */
export class EmulatedReceiver {
  private readonly number = nextReceiver++;
  private readonly slots = new Map<number, PairedDevice>();
  // The handles open on the HID++ channel: a receiver sends every report to each one that carries it.
  private readonly handles = new Set<ReceiverHandle>();
  // Notifications sent before the reply to the next request, as when a device connects meanwhile.
  private readonly pendingNotifications: number[][] = [];
  failsToOpen = false;
  // On Windows, only the path of long reports fails to open.
  longFailsToOpen = false;
  // A receiver that answers nothing, not even its own registers.
  mute = false;

  /** A receiver plugged into `system`. */
  constructor(readonly system: System = "macos") {}

  /**
   * The paths of the HID++ channel, as node-hid lists them: one on macOS, and one per report length on Windows, short
   * reports first, which differ only in their collection and in the last number of their instance.
   */
  get paths(): string[] {
    if (this.system === "macos") {
      return [`DevSrvsID:${4294967296 + this.number}`];
    }
    const instance = `#7&${(0x1c2a4b30 + this.number).toString(16)}&0&`;
    const guid = "#{4d1e55b2-f16f-11cf-88cb-001111000030}";
    return [1, 2].map((col) => `\\\\?\\HID#VID_046D&PID_C548&MI_02&Col0${col}${instance}000${col - 1}${guid}`);
  }

  /** The path of short reports, the one requests are written to. */
  get shortPath(): string {
    return this.paths[0] ?? "";
  }

  /** The path of long reports, which is the path of short ones on macOS. */
  get longPath(): string {
    return this.paths.at(-1) ?? "";
  }

  /**
   * Pairs a device in `slot`: by default the mouse, connected, on host 1 of 3, with CHANGE_HOST at index 10, as the
   * MX Master 3S measured.
   */
  pair(slot: number, device: Partial<PairedDevice> = {}): PairedDevice {
    const paired: PairedDevice = {
      productId: MX_MASTER_3S,
      connected: true,
      away: "error",
      changeHost: 10,
      hosts: 3,
      current: 1,
      ...device,
    };
    this.slots.set(slot, paired);
    return paired;
  }

  /** Sends a notification ahead of the reply to the next request. */
  notifyBeforeNextReply(report: number[]): void {
    this.pendingNotifications.push(report);
  }

  /**
   * The HID devices the receiver shows, as node-hid lists them: its HID++ channel twice, with usage 1 for short reports
   * and 2 for long ones, on the same path on macOS and on two on Windows, and its keyboard on another.
   */
  get info(): HidDeviceInfo[] {
    const base = { vendorId: LOGITECH, productId: BOLT_RECEIVER, release: 0x0101, interface: 2 };
    return [
      { ...base, path: this.shortPath, usagePage: HIDPP_USAGE_PAGE, usage: 1 },
      { ...base, path: this.longPath, usagePage: HIDPP_USAGE_PAGE, usage: 2 },
      { ...base, path: `${this.shortPath}-keyboard`, usagePage: GENERIC_DESKTOP, usage: 6, interface: 0 },
    ];
  }

  /** Opens a handle on one of the HID++ channel's paths. */
  open(path: string): ReceiverHandle {
    if (this.failsToOpen || (this.longFailsToOpen && path === this.longPath)) {
      throw new Error("cannot open device");
    }
    const carries: Carries = this.system === "macos" ? "both" : path === this.shortPath ? "short" : "long";
    const handle = { carries, input: [] };
    this.handles.add(handle);
    return handle;
  }

  /** Closes a handle, whose reports go unread. */
  close(handle: ReceiverHandle): void {
    this.handles.delete(handle);
  }

  /**
   * Takes a report written through a handle, and sends its reply, if any, to every open handle that carries it. On
   * Windows, a handle refuses a report of the other length, as Windows does, with the error node-hid gives.
   */
  receive(report: number[], through: ReceiverHandle): void {
    if (through.carries !== "both" && report.length !== (through.carries === "short" ? 7 : 20)) {
      throw new Error("Cannot write to hid device");
    }
    const reply = this.mute ? undefined : this.reply(report);
    if (reply === undefined) {
      return;
    }
    const sent = [...this.pendingNotifications.splice(0), reply];
    for (const handle of this.handles) {
      const carried = sent.filter(
        (r) => handle.carries === "both" || (r[0] === SHORT) === (handle.carries === "short"),
      );
      handle.input.push(...carried.map((r) => [...r]));
    }
  }

  /** The reply to a report, or undefined for one that gets none. */
  private reply(report: number[]): number[] | undefined {
    const [, index = 0, first = 0, second = 0, ...params] = report;
    if (index === RECEIVER) {
      return this.registerReply(first, second, params[0] ?? 0);
    }
    const device = this.slots.get(index);
    if (device === undefined) {
      return short(index, ERROR_1_0, first, second, UNKNOWN_DEVICE);
    }
    if (!device.connected) {
      return device.away === "error" ? short(index, ERROR_1_0, first, second, UNKNOWN_DEVICE) : undefined;
    }
    return featureReply(device, index, first, second, params);
  }

  /** The receiver's reply to a request for one of its own registers: only the pairing information is here. */
  private registerReply(sub: number, register: number, subRegister: number): number[] {
    const slot = subRegister - PAIRING_INFO;
    const device = this.slots.get(slot);
    if (sub !== GET_LONG_REGISTER || register !== RECEIVER_INFO || device === undefined) {
      return short(RECEIVER, ERROR_1_0, sub, register, INVALID_VALUE);
    }
    // The product ID, low byte first, then a serial number, which the plugin never reads.
    const { productId } = device;
    return long(RECEIVER, sub, register, [subRegister, 0x02, productId & 0xff, productId >> 8, 0xde, 0xad, 0xbe, 0xef]);
  }
}

/** A connected device's reply to a HID++ 2.0 request: IRoot's getFeature, or CHANGE_HOST's two functions. */
function featureReply(device: PairedDevice, slot: number, index: number, fnId: number, params: number[]) {
  const fn = fnId >> 4;
  if (index === 0 && fn === 0) {
    const id = ((params[0] ?? 0) << 8) + (params[1] ?? 0);
    return long(slot, index, fnId, [id === CHANGE_HOST ? device.changeHost : 0]);
  }
  if (index !== 0 && index === device.changeHost && fn === 0) {
    return long(slot, index, fnId, [device.hosts, device.current - 1]);
  }
  if (index !== 0 && index === device.changeHost && fn === 1) {
    const host = (params[0] ?? 0) + 1;
    // The mouse leaves at once, so no reply comes. A host it doesn't have is ignored.
    if (host <= device.hosts) {
      device.current = host;
      device.connected = false;
    }
    return undefined;
  }
  return long(slot, ERROR_2_0, index, [fnId, INVALID_FUNCTION]);
}

/** A HID++ short report: 7 bytes. */
function short(index: number, first: number, second: number, ...params: number[]): number[] {
  return [SHORT, index, first, second, ...params, 0, 0, 0].slice(0, 7);
}

/** A HID++ long report: 20 bytes. */
function long(index: number, first: number, second: number, params: number[]): number[] {
  return [LONG, index, first, second, ...params, ...Array<number>(16).fill(0)].slice(0, 20);
}
