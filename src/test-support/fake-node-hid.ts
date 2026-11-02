import type { Device as HidDeviceInfo } from "node-hid";

import type { EmulatedReceiver } from "./emulated-receiver";

/**
 * Stands in for `node-hid` in the tests of `src/mouse.ts`, which mock it with
 * `vi.mock("node-hid", () => import("./test-support/fake-node-hid"))`, so that the plugin talks to emulated receivers
 * instead of the ones plugged into the machine. Only the parts of node-hid's async API the plugin uses are here.
 */

/** A call made on a receiver's handle. */
export type HidCall = "open" | "write" | "read" | "close";

/** A call that went through, with the report written or read, if any. */
export type HidEvent = { receiver: EmulatedReceiver; call: HidCall; report?: number[] };

// The receivers plugged in, in the order node-hid lists them.
let connected: EmulatedReceiver[] = [];
// Every call that went through, on every receiver, in order.
let events: HidEvent[] = [];
// What listing the devices throws, when it's set to fail.
let devicesError: Error | undefined;

/** Makes these the receivers plugged in, replacing the ones before, and forgets every call made so far. */
export function connect(...receivers: EmulatedReceiver[]): void {
  connected = receivers;
  events = [];
  devicesError = undefined;
}

/** Makes listing the devices fail, as it does when the system can't list its HID devices. */
export function failListingDevices(error: Error): void {
  devicesError = error;
}

/** Every call made on a receiver's handle that went through, in the order they were made. */
export function hidEvents(): readonly HidEvent[] {
  return events;
}

/** The HID devices plugged in, as node-hid lists them. */
export async function devicesAsync(): Promise<HidDeviceInfo[]> {
  if (devicesError !== undefined) {
    throw devicesError;
  }
  return connected.flatMap((receiver) => receiver.info);
}

/** A handle on a receiver's HID++ channel, opened by its path, through which reports are written and read. */
export class HIDAsync {
  private closed = false;

  /** A handle on a receiver, with the reports waiting to be read on it. */
  private constructor(
    private readonly receiver: EmulatedReceiver,
    private readonly input: number[][],
  ) {}

  /** Opens the receiver at the path, which has to be plugged in. */
  static async open(path: string): Promise<HIDAsync> {
    const receiver = connected.find((candidate) => candidate.path === path);
    if (receiver === undefined) {
      throw new Error(`cannot open device with path ${path}`);
    }
    const handle = new HIDAsync(receiver, receiver.open());
    events.push({ receiver, call: "open" });
    return handle;
  }

  /** Writes a report to the receiver, and returns how many bytes were written. */
  async write(values: number[] | Buffer): Promise<number> {
    this.ensureOpen();
    const report = Array.from(values);
    events.push({ receiver: this.receiver, call: "write", report });
    this.receiver.receive(report);
    return report.length;
  }

  /** Reads the next report the receiver sent, or an empty buffer when there's none, as on a timeout. No time passes. */
  async read(_timeout?: number): Promise<Buffer> {
    this.ensureOpen();
    const report = this.input.shift() ?? [];
    events.push({ receiver: this.receiver, call: "read", report });
    return Buffer.from(report);
  }

  /** Closes the handle. */
  async close(): Promise<void> {
    this.ensureOpen();
    this.closed = true;
    this.receiver.close(this.input);
    events.push({ receiver: this.receiver, call: "close" });
  }

  /** Fails, like node-hid, when the handle is used after it was closed. */
  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("device has been closed");
    }
  }
}

// The plugin imports node-hid's default export, which is the module as CommonJS exports it.
export default { devicesAsync, HIDAsync };
