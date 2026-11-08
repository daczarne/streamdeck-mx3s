import {
  action,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  SingletonAction,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";

import { switchHost } from "../host";
import { logger as pluginLogger } from "../logging";

const logger = pluginLogger.createScope("Set Host");

/** The Easy-Switch hosts, by the numbers on the mouse, and the one a key sends the mouse to until another is chosen. */
const HOSTS = [1, 2, 3];
const DEFAULT_HOST = 1;

/**
 * The Set Host key: sends the mouse to the host it's set to, and shows that host in its title. A key can only send the
 * mouse away, never call it back, since a computer the mouse has left no longer reaches it.
 */
@action({ UUID: "com.daczarne.mx3s.set-host" })
export class SetHostAction extends SingletonAction {
  /** Shows the key's host as soon as it is placed or shown. */
  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if (ev.action.isKey()) {
      await showHost(ev.action, ev.payload.settings);
    }
  }

  /** Shows the host chosen on the settings page. */
  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    if (ev.action.isKey()) {
      await showHost(ev.action, ev.payload.settings);
    }
  }

  /** Sends the mouse to the key's host: a check mark when it's there or on its way, an alert when it can't be. */
  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const host = hostOf(ev.payload.settings);
    logger.info(`Key pressed: host ${host}`);
    const result = await switchHost(host);
    await (result.ok ? ev.action.showOk() : ev.action.showAlert());
  }
}

/** Shows a key's host in its title, which a title of the user's own replaces. */
async function showHost(key: KeyAction<JsonObject>, settings: JsonObject): Promise<void> {
  await key.setTitle(`Host ${hostOf(settings)}`);
}

/**
 * The host a key's settings choose: a number, or text that is one, since the settings page's radio buttons save their
 * value as text. A key that has none yet takes the default, and so does one whose setting isn't a host, with a warning.
 */
export function hostOf(settings: JsonObject): number {
  const value: JsonValue | undefined = settings.host;
  if (value === undefined) {
    return DEFAULT_HOST;
  }
  const host =
    typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (HOSTS.includes(host)) {
    return host;
  }
  logger.warn(`Setting host is ${JSON.stringify(value)}, not one of ${HOSTS.join(", ")}: using ${DEFAULT_HOST}`);
  return DEFAULT_HOST;
}
