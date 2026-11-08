import type { JsonObject } from "@elgato/utils";

import { createFakeKey, type FakeKey } from "./fake-stream-deck";

type Handler = (ev: never) => void | Promise<void>;

/** An action, as the Deck sees it: the id it's registered under, which the fake SDK and the real one both give it. */
type DeckAction = { readonly manifestId?: string | undefined };

/** The handlers an action can have for the events the fake Deck sends. */
type EventName = "onWillAppear" | "onWillDisappear" | "onDidReceiveSettings" | "onKeyDown";

/**
 * The Deck for the action's tests: it places keys for some actions, and sends each one's events to the action it
 * belongs to, by its `manifestId`, as Stream Deck would. Each interaction waits for what it set off to finish.
 */
export class FakeDeck {
  // The settings each key has saved, by its id.
  private readonly settings = new Map<string, JsonObject>();
  private readonly actions: readonly DeckAction[];

  /** A Deck for these actions. */
  constructor(actions: readonly DeckAction[]) {
    this.actions = actions;
  }

  /** Places a key for an action, with its settings, as when a profile is shown. */
  async key(manifestId: string, settings: JsonObject = {}): Promise<FakeKey> {
    const key = createFakeKey(manifestId);
    this.settings.set(key.id, settings);
    await this.send(key, "onWillAppear", {});
    return key;
  }

  /** Takes a key off the Deck, as when the profile shown changes or the key is deleted. */
  remove(key: FakeKey): Promise<void> {
    return this.send(key, "onWillDisappear", {});
  }

  /** Presses a key. */
  press(key: FakeKey): Promise<void> {
    return this.send(key, "onKeyDown", {});
  }

  /** Saves new settings for a key, as its settings page does. */
  changeSettings(key: FakeKey, settings: JsonObject): Promise<void> {
    this.settings.set(key.id, settings);
    return this.send(key, "onDidReceiveSettings", {});
  }

  /**
   * Sends an event to the action the key belongs to, with the settings it has saved, as Stream Deck routes it, and
   * waits for what it set off. An action without a handler for it ignores it.
   */
  private async send(key: FakeKey, event: EventName, payload: object): Promise<void> {
    const target = this.actions.find((candidate) => candidate.manifestId === key.manifestId);
    if (target === undefined) {
      throw new Error(`No action registered as ${key.manifestId}`);
    }
    const handler = (target as DeckAction & Partial<Record<EventName, Handler>>)[event];
    const ev = { action: key, payload: { settings: this.settings.get(key.id) ?? {}, ...payload } } as never;
    await handler?.call(target, ev);
  }
}
