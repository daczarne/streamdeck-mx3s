import fs from "node:fs";
import path from "node:path";

import { vi } from "vitest";

/**
 * Stands in for `@elgato/streamdeck` in the action's tests, which mock it with
 * `vi.mock("@elgato/streamdeck", () => import("../test-support/fake-stream-deck"))`. The real SDK opens a connection to
 * Stream Deck and creates a logs/ folder on import.
 */

// Action ids are unique per plugin, so every fake key gets its own.
let nextId = 1;

/**
 * A key an action is placed on, as the plugin sees it: it records what the plugin tells it to show. It belongs to the
 * action whose id in the manifest it's given, as on the Deck.
 */
export function createFakeKey(manifestId: string) {
  return {
    id: `FAKE${String(nextId++).padStart(4, "0")}`,
    manifestId,
    isKey: (): boolean => true,
    setTitle: vi.fn(async (_title?: string): Promise<void> => {}),
    showAlert: vi.fn(async (): Promise<void> => {}),
    showOk: vi.fn(async (): Promise<void> => {}),
  };
}

export type FakeKey = ReturnType<typeof createFakeKey>;

/** The SDK's decorator for an action class, which gives the class the action's id in the manifest, as the SDK's does. */
export function action(definition: { UUID: string }) {
  return <T extends { prototype: object }>(target: T): T => {
    Object.defineProperty(target.prototype, "manifestId", { value: definition.UUID });
    return target;
  };
}

/** The SDK's base class for an action. */
export class SingletonAction {
  /** The action's id in the manifest, which the decorator sets. */
  declare readonly manifestId: string | undefined;
}

// The actions the manifest lists, against which the SDK checks every action registered.
const MANIFEST_UUIDS = (
  JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, "../../com.daczarne.mx3s.sdPlugin/manifest.json"), "utf8"),
  ) as { Actions: { UUID: string }[] }
).Actions.map(({ UUID }) => UUID);

/**
 * The SDK's entry point, as plugin.ts uses it: it connects to nothing. Like the SDK, it refuses an action whose id the
 * manifest doesn't list, which Stream Deck would never send events to.
 */
export default {
  logger: { setLevel: (_level: string): void => {} },
  actions: {
    registerAction: (registering: SingletonAction): void => {
      if (registering.manifestId === undefined || !MANIFEST_UUIDS.includes(registering.manifestId)) {
        throw new Error(`The action's manifestId was not found within the manifest: ${registering.manifestId}`);
      }
    },
  },
  connect: async (): Promise<void> => {},
};
