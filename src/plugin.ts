import streamDeck from "@elgato/streamdeck";

import { SetHostAction } from "./actions/set-host";
import { logger } from "./logging";

// The SDK's own logger, which only records what the SDK reports itself, in files of its own.
streamDeck.logger.setLevel("info");

// The plugin's log carries on across restarts, so each run is marked where it starts.
logger.info("Plugin started");

streamDeck.actions.registerAction(new SetHostAction());

// Logged here rather than left to the SDK, which logs an unhandled rejection to its own files, not to mx3s.log.
streamDeck.connect().catch((error: unknown) => {
  logger.error("Can't connect to Stream Deck", error);
});
