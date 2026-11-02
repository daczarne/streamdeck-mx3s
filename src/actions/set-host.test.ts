import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "../logging";
import { switchHost } from "../mouse";
import { FakeDeck } from "../test-support/fake-deck";
import { SetHostAction } from "./set-host";

//* Fakes

vi.mock("@elgato/streamdeck", () => import("../test-support/fake-stream-deck"));

// The real logger writes to a logs/ folder.
vi.mock("../logging", () => import("../test-support/fake-logging"));

// The real mouse module loads node-hid's native binary on import and talks to the receivers plugged in.
vi.mock("../mouse", () => ({ switchHost: vi.fn() }));

const SET_HOST = "com.daczarne.mx3s.set-host";

let deck: FakeDeck;

beforeEach(() => {
  deck = new FakeDeck([new SetHostAction()]);
});

//* Tests

describe("SetHostAction", () => {
  describe("its title", () => {
    it("shows the key's host", async () => {
      const key = await deck.key(SET_HOST, { host: "2" });

      expect(key.setTitle).toHaveBeenCalledExactlyOnceWith("Host 2");
    });

    it("shows host 1 on a key that has none yet, as the settings page offers it", async () => {
      const key = await deck.key(SET_HOST);

      expect(key.setTitle).toHaveBeenCalledExactlyOnceWith("Host 1");
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("follows the host chosen on the settings page", async () => {
      const key = await deck.key(SET_HOST, { host: "1" });

      await deck.changeSettings(key, { host: "3" });

      expect(key.setTitle).toHaveBeenLastCalledWith("Host 3");
    });
  });

  describe("on a key press", () => {
    it.each([
      ["text, as the settings page saves it", "3", 3],
      ["a number", 2, 2],
    ])("sends the mouse to the key's host, given as %s", async (_case, host, expected) => {
      const key = await deck.key(SET_HOST, { host });
      vi.mocked(switchHost).mockResolvedValue({ ok: true, outcome: "switched", from: 1 });

      await deck.press(key);

      expect(switchHost).toHaveBeenCalledExactlyOnceWith(expected);
      expect(logger.info).toHaveBeenCalledWith(`Key pressed: host ${expected}`);
    });

    it.each([
      ["switched", { ok: true, outcome: "switched", from: 1 } as const],
      ["was already there", { ok: true, outcome: "already-there" } as const],
    ])("shows a check mark when the mouse %s", async (_case, result) => {
      const key = await deck.key(SET_HOST, { host: "2" });
      vi.mocked(switchHost).mockResolvedValue(result);

      await deck.press(key);

      expect(key.showOk).toHaveBeenCalledOnce();
      expect(key.showAlert).not.toHaveBeenCalled();
    });

    it.each([
      ["no receiver is plugged in", { ok: false, outcome: "no-receiver" } as const],
      ["no receiver reaches the mouse", { ok: false, outcome: "unreachable" } as const],
      ["the mouse doesn't have the host", { ok: false, outcome: "no-such-host", hosts: 2 } as const],
      ["a request failed", { ok: false, outcome: "failed" } as const],
    ])("shows an alert when %s", async (_case, result) => {
      const key = await deck.key(SET_HOST, { host: "3" });
      vi.mocked(switchHost).mockResolvedValue(result);

      await deck.press(key);

      expect(key.showAlert).toHaveBeenCalledOnce();
      expect(key.showOk).not.toHaveBeenCalled();
    });

    it.each([
      ["a host past the mouse's", "4"],
      ["no host", ""],
      ["something else", true],
    ])("sends the mouse to host 1, with a warning, when the setting is %s", async (_case, host) => {
      const key = await deck.key(SET_HOST, { host });
      vi.mocked(switchHost).mockResolvedValue({ ok: true, outcome: "switched", from: 2 });

      await deck.press(key);

      expect(switchHost).toHaveBeenCalledExactlyOnceWith(1);
      expect(logger.warn).toHaveBeenCalledWith(`Setting host is ${JSON.stringify(host)}, not one of 1, 2, 3: using 1`);
    });
  });
});
