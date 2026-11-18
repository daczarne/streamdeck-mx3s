import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { styleOf } from "../src/actions/battery";
import { hostOf } from "../src/actions/set-host";
import { logger } from "../src/logging";
import { at } from "../src/test-support/at";
import { Chrome, type ExceptionDetails, type Page } from "./support/chrome";
import { FakeStreamDeck, type StreamDeckMessage } from "./support/fake-stream-deck";

//* Fakes

// The actions read the settings the pages save, which the tests compare the pages with. The real SDK opens a
// connection to Stream Deck on import, the real logger writes to a logs/ folder, and the mouse's modules load node-hid,
// which the actions don't need to read their settings.
vi.mock("@elgato/streamdeck", () => import("../src/test-support/fake-stream-deck"));
vi.mock("../src/logging", () => import("../src/test-support/fake-logging"));
vi.mock("../src/mouse/battery", () => ({ readBattery: vi.fn() }));
vi.mock("../src/mouse/host", () => ({ switchHost: vi.fn() }));

const pluginDir = path.resolve("com.daczarne.mx3s.sdPlugin");
const manifest = JSON.parse(readFileSync(path.join(pluginDir, "manifest.json"), "utf8")) as {
  Actions: { UUID: string; PropertyInspectorPath: string; Controllers: string[] }[];
};

type Panel = {
  page: string;
  controller: "Keypad";
  /** The settings whose controls the panel shows, by their `setting` attribute, in the page's order. */
  settings: string[];
  /** A setting to change through its control, and the value Stream Deck should receive for it. */
  change: { setting: string; value: string; saved: JsonValue };
  /** How the plugin reads the page's settings, and warns of one it doesn't take. */
  read: (settings: JsonObject) => unknown;
};

// What each settings page shows on each controller its action supports, as listed in manifest.json.
const PANELS: Panel[] = [
  {
    page: "ui/set-host.html",
    controller: "Keypad",
    settings: ["host"],
    change: { setting: "host", value: "2", saved: "2" },
    read: hostOf,
  },
  {
    page: "ui/battery.html",
    controller: "Keypad",
    settings: [
      "background",
      "noBackground",
      "showMouse",
      "mouseStyle",
      "mouseColor",
      "mouseFollowsLevel",
      "showBattery",
      "batteryColor",
      "batteryFollowsLevel",
      "showBolt",
      "boltColor",
      "boltFollowsLevel",
      "boltIdleColor",
      "highColor",
      "mediumColor",
      "mediumFrom",
      "mediumTo",
      "lowColor",
      "notFoundMouse",
      "notFoundBattery",
      "notFoundBolt",
      "notFoundColor",
    ],
    change: { setting: "showBolt", value: "charging", saved: "charging" },
    read: styleOf,
  },
];

const BATTERY = at(PANELS, 1);

// An address on the internet that each kind of resource tries to reach. The policy blocks it before any request is
// sent, so the tests need no network.
const REMOTE = "https://example.com";

/** A color as the plugin holds it, in lower case, so a page's default and the plugin's compare whatever their case. */
function sameCase(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value), (_key, field) =>
    typeof field === "string" && /^#[0-9a-f]{6}$/i.test(field) ? field.toLowerCase() : field,
  );
}

/**
 * Reads settings as the plugin reads what Stream Deck sends: what it takes, with its colors in lower case, and whether
 * it took them as they are, as opposed to replacing one with its default, with a warning.
 */
function read(panel: Panel, settings: JsonObject): { value: unknown; valid: boolean } {
  vi.mocked(logger.warn).mockClear();
  const value = sameCase(panel.read(settings));
  return { value, valid: vi.mocked(logger.warn).mock.calls.length === 0 };
}

let chrome: Chrome;
let streamDeck: FakeStreamDeck;

beforeAll(async () => {
  [chrome, streamDeck] = await Promise.all([Chrome.launch(), FakeStreamDeck.start()]);
  // On a cold machine, such as a CI runner, Chrome's first page is slow, as the Litra plugin's tests measured: about
  // 9 s from launch to the end of the first panel's load, against 100-350 ms for the next ones. Opening one panel here
  // gets it out of the way under the hook's timeout, so no test pays for it within its own.
  const { page } = await openPanel(at(PANELS, 0));
  await page.close();
});

afterAll(async () => {
  await Promise.all([chrome?.close(), streamDeck?.close()]);
});

type OpenedPanel = {
  page: Page;
  uuid: string;
  /** URLs the page requested, from the moment it started loading. */
  requests: string[];
  /** Errors in the console and uncaught exceptions, including the policy's own reports. */
  errors: string[];
};

/**
 * Opens a settings page the way Stream Deck does: loads it from the plugin folder, then calls the page's
 * `connectElgatoStreamDeckSocket` with the fake Stream Deck's port and the action's details, including its saved
 * settings.
 */
async function openPanel({ page: file, controller }: Panel, settings: JsonObject = {}): Promise<OpenedPanel> {
  const page = await chrome.newPage();
  const uuid = randomUUID();
  const requests: string[] = [];
  const errors: string[] = [];
  page.on<{ request: { url: string } }>("Network.requestWillBeSent", ({ request }) => requests.push(request.url));
  page.on<{ entry: { level: string; text: string } }>(
    "Log.entryAdded",
    ({ entry }) => entry.level === "error" && errors.push(entry.text),
  );
  page.on<{ exceptionDetails: ExceptionDetails }>("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    errors.push(exceptionDetails.exception?.description ?? exceptionDetails.text),
  );
  page.on<{ type: string; args: { value?: unknown; description?: string }[] }>(
    "Runtime.consoleAPICalled",
    ({ type, args }) => type === "error" && errors.push(args.map((arg) => arg.value ?? arg.description).join(" ")),
  );
  // Runs before the page's own scripts, so it records every violation of the policy from the start.
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.violations = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
    `,
  });

  await page.goto(pathToFileURL(path.join(pluginDir, file)).href);
  const action = manifest.Actions.find((a) => a.PropertyInspectorPath === file);
  if (action === undefined) throw new Error(`No action in manifest.json uses ${file}`);
  const info = {
    application: { language: "en", platform: "mac", version: "7.6" },
    plugin: { uuid: "com.daczarne.mx3s" },
  };
  const actionInfo = {
    action: action.UUID,
    context: randomUUID().replaceAll("-", ""),
    device: "device",
    payload: { controller, settings },
  };
  await page.evaluate(
    `connectElgatoStreamDeckSocket(${streamDeck.port}, "${uuid}", "registerPropertyInspector", ` +
      `${JSON.stringify(JSON.stringify(info))}, ${JSON.stringify(JSON.stringify(actionInfo))})`,
  );
  await streamDeck.waitFor((m) => m.event === "registerPropertyInspector" && "uuid" in m && m.uuid === uuid);
  return { page, uuid, requests, errors };
}

/** The `setting` of every control the page shows, in the page's order, leaving out those inside a hidden block. */
function visibleSettings(page: Page): Promise<string[]> {
  return page.evaluate(`
    [...document.querySelectorAll("[setting]")]
      .filter((control) => !control.closest("[hidden]"))
      .map((control) => control.getAttribute("setting"))
  `);
}

/** A control as the page declares it: its default, the type of value it saves, and its options, if any. */
type Control = { tag: string; default: string | null; valueType: string | null; options: string[] };

/** Reads the control of a setting from the page. */
function controlOf(page: Page, setting: string): Promise<Control> {
  return page.evaluate(`(() => {
    const control = document.querySelector('[setting="${setting}"]');
    return {
      tag: control.tagName.toLowerCase(),
      default: control.getAttribute("default"),
      valueType: control.getAttribute("value-type"),
      options: [...control.querySelectorAll("option")].map((option) => option.value),
    };
  })()`);
}

/**
 * The value a control saves for one of its options, or for its default when given none: a checkbox is checked by a
 * `default` whatever it says, and unchecked without one, a control with `value-type="number"` saves numbers, and the
 * others their text.
 */
function saved(control: Control, value: string | null = control.default): JsonValue {
  if (control.tag === "sdpi-checkbox") {
    return value !== null;
  }
  if (value === null) {
    throw new Error(`A ${control.tag} without a default`);
  }
  return control.valueType === "number" ? Number(value) : value;
}

/** Sets a setting's control to `value`, as the user would: a checkbox clicked, a radio option picked, or a value. */
function setControl(page: Page, setting: string, value: string | boolean): Promise<void> {
  return page.evaluate(`(async () => {
    const host = document.querySelector('[setting="${setting}"]');
    await host.updateComplete;
    const root = host.shadowRoot;
    if (host.localName === "sdpi-checkbox") {
      const box = root.querySelector('input[type="checkbox"]');
      if (box.checked !== ${JSON.stringify(value)}) box.click();
      return;
    }
    if (host.localName === "sdpi-radio") {
      root.querySelector('input[type="radio"][value=${JSON.stringify(String(value))}]').click();
      return;
    }
    const control = root.querySelector("select, input");
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    control.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  })()`);
}

/** The settings a page last saved, or none before it saved any. */
function lastSaved(uuid: string): Record<string, unknown> | undefined {
  return streamDeck.messages.filter((m: StreamDeckMessage) => m.event === "setSettings" && m.context === uuid).at(-1)
    ?.payload;
}

describe("settings pages", () => {
  it("cover every action and controller in the manifest", () => {
    const declared = new Set(
      manifest.Actions.flatMap((a) => a.Controllers.map((c) => `${a.PropertyInspectorPath} ${c}`)),
    );
    expect(PANELS.map((p) => `${p.page} ${p.controller}`).sort()).toEqual([...declared].sort());
    const pages = readdirSync(path.join(pluginDir, "ui"))
      .filter((f) => f.endsWith(".html"))
      .map((f) => `ui/${f}`);
    expect([...new Set(PANELS.map((p) => p.page))].sort()).toEqual(pages.sort());
  });

  describe.each(PANELS)("$page on $controller", (panel) => {
    it("loads only local files, without errors or policy violations", async () => {
      const { page, requests, errors } = await openPanel(panel);
      expect(errors).toEqual([]);
      expect(await page.evaluate("violations")).toEqual([]);
      expect(requests.filter((url) => !url.startsWith("file://") && !url.startsWith("data:"))).toEqual([]);
      await page.close();
    });

    it("refuses remote scripts, styles, images and connections", async () => {
      const { page } = await openPanel(panel);
      await page.evaluate(`(async () => {
        const add = (tag, attributes) => document.head.append(Object.assign(document.createElement(tag), attributes));
        add("script", { src: "${REMOTE}/script.js" });
        add("link", { rel: "stylesheet", href: "${REMOTE}/style.css" });
        add("img", { src: "${REMOTE}/image.png" });
        new WebSocket("${REMOTE.replace("https", "wss")}");
        await fetch("${REMOTE}").catch(() => {});
        // Violations are reported asynchronously.
        await new Promise((resolve) => setTimeout(resolve, 100));
      })()`);
      const violations = await page.evaluate<{ directive: string }[]>("violations");
      expect(violations.map((v) => v.directive).sort()).toEqual(
        ["connect-src", "connect-src", "img-src", "script-src-elem", "style-src-elem"].sort(),
      );
      await page.close();
    });

    it("refuses inline scripts", async () => {
      const { page } = await openPanel(panel);
      const ran = await page.evaluate(`(async () => {
        window.inlineRan = false;
        document.head.append(Object.assign(document.createElement("script"), { textContent: "inlineRan = true" }));
        await new Promise((resolve) => setTimeout(resolve, 100));
        return inlineRan;
      })()`);
      expect(ran).toBe(false);
      expect(await page.evaluate("violations.map((v) => v.directive)")).toEqual(["script-src-elem"]);
      await page.close();
    });

    it("refuses inline styles, an element's and an attribute's (#33)", async () => {
      const { page } = await openPanel(panel);
      const colors = await page.evaluate<string[]>(`(async () => {
        const styled = Object.assign(document.createElement("p"), { id: "styled" });
        const attributed = document.createElement("p");
        document.body.append(styled, attributed);
        document.head.append(Object.assign(document.createElement("style"), { textContent: "#styled { color: rgb(1, 2, 3); }" }));
        attributed.setAttribute("style", "color: rgb(1, 2, 3)");
        await new Promise((resolve) => setTimeout(resolve, 100));
        return [getComputedStyle(styled).color, getComputedStyle(attributed).color];
      })()`);
      expect(colors).not.toContain("rgb(1, 2, 3)");
      expect((await page.evaluate<string[]>("violations.map((v) => v.directive)")).sort()).toEqual([
        "style-src-attr",
        "style-src-elem",
      ]);
      await page.close();
    });

    it("takes every style from settings.css, but for the one sdpi-components adds (#33)", async () => {
      const { page } = await openPanel(panel);
      const styles = await page.evaluate<{ inline: number; sheets: string[] }>(`({
        inline: document.querySelectorAll("style").length,
        sheets: [...document.styleSheets].map((sheet) => sheet.href?.split("/ui/")[1] ?? "inline"),
      })`);
      expect(styles).toEqual({ inline: 1, sheets: ["settings.css", "inline"] });
      await page.close();
    });

    it(`shows the ${panel.settings.join(", ")} controls only`, async () => {
      const { page } = await openPanel(panel);
      await expect.poll(() => visibleSettings(page)).toEqual(panel.settings);
      await page.close();
    });

    it(`sends a changed ${panel.change.setting} to Stream Deck`, async () => {
      const { page, uuid } = await openPanel(panel);
      const { setting, value, saved: expected } = panel.change;
      await setControl(page, setting, value);
      const message = await streamDeck.waitFor(
        (m) => m.event === "setSettings" && m.context === uuid && m.payload?.[setting] === expected,
      );
      expect(message.payload).toMatchObject({ [setting]: expected });
      await page.close();
    });
  });

  describe.each(PANELS)("what $page on $controller offers", (panel) => {
    it.each(panel.settings)("defaults %s to what the plugin takes when the setting is missing", async (setting) => {
      const { page } = await openPanel(panel);
      const control = await controlOf(page, setting);
      await page.close();

      expect(read(panel, { [setting]: saved(control) })).toEqual({ value: read(panel, {}).value, valid: true });
    });

    it.each(panel.settings)("offers only values of %s that the plugin takes", async (setting) => {
      const { page } = await openPanel(panel);
      const control = await controlOf(page, setting);
      await page.close();

      const offered: JsonValue[] =
        control.tag === "sdpi-checkbox"
          ? [true, false]
          : control.options.length > 0
            ? control.options.map((option) => saved(control, option))
            : [saved(control)];
      for (const value of offered) {
        expect(read(panel, { [setting]: value }), `${setting} set to ${JSON.stringify(value)}`).toMatchObject({
          valid: true,
        });
      }
    });
  });
});

describe("the Battery key's page", () => {
  /** The settings whose controls are greyed out, in the page's order. */
  function disabledSettings(page: Page): Promise<string[]> {
    return page.evaluate(`
      [...document.querySelectorAll("[setting]")]
        .filter((control) => control.disabled)
        .map((control) => control.getAttribute("setting"))
    `);
  }

  it("greys out the battery's color alone at the defaults, since the battery follows its level", async () => {
    const { page } = await openPanel(BATTERY);
    await expect.poll(() => disabledSettings(page)).toEqual(["batteryColor"]);
    await page.close();
  });

  it.each<[string, JsonObject, string[]]>([
    ["no background", { noBackground: true }, ["background", "batteryColor"]],
    ["the mouse hidden", { showMouse: false }, ["mouseStyle", "mouseColor", "mouseFollowsLevel", "batteryColor"]],
    ["the mouse following its level", { mouseFollowsLevel: true }, ["mouseColor", "batteryColor"]],
    ["the battery hidden", { showBattery: false }, ["batteryColor", "batteryFollowsLevel"]],
    ["the battery in a color of its own", { batteryFollowsLevel: false }, []],
    ["the bolt only while charging", { showBolt: "charging" }, ["batteryColor", "boltIdleColor"]],
    ["the bolt never shown", { showBolt: "never" }, ["batteryColor", "boltColor", "boltFollowsLevel", "boltIdleColor"]],
    ["the bolt following its level", { boltFollowsLevel: true }, ["batteryColor", "boltColor"]],
  ])("greys out what the plugin then ignores, with %s", async (_with, settings, disabled) => {
    const { page } = await openPanel(BATTERY, settings);
    await expect.poll(() => disabledSettings(page)).toEqual(disabled);
    await page.close();
  });

  it("greys out a control as soon as the choice it depends on changes", async () => {
    const { page } = await openPanel(BATTERY);
    await setControl(page, "showMouse", false);
    await expect
      .poll(() => disabledSettings(page))
      .toEqual(["mouseStyle", "mouseColor", "mouseFollowsLevel", "batteryColor"]);
    await setControl(page, "showMouse", true);
    await expect.poll(() => disabledSettings(page)).toEqual(["batteryColor"]);
    await page.close();
  });

  it.each<[string, JsonObject, string]>([
    ["the defaults", {}, "from 40%, below 15%"],
    ["medium from 60% to 20%", { mediumFrom: 60, mediumTo: 20 }, "from 60%, below 20%"],
  ])("writes out where the high and the low levels start, with %s", async (_with, settings, bounds) => {
    const { page } = await openPanel(BATTERY, settings);
    const shown = () =>
      page.evaluate(`[document.getElementById("high-from"), document.getElementById("low-below")]
        .map((note) => note.textContent).join(", ")`);
    await expect.poll(shown).toBe(bounds);
    await page.close();
  });

  // Every setting off its default, so a section's Reset shows which settings it brings back, and which it leaves.
  const CHANGED: JsonObject = {
    background: "#123456",
    noBackground: true,
    showMouse: false,
    mouseStyle: "outlined",
    mouseColor: "#123456",
    mouseFollowsLevel: true,
    showBattery: false,
    batteryColor: "#123456",
    batteryFollowsLevel: false,
    showBolt: "never",
    boltColor: "#123456",
    boltFollowsLevel: true,
    boltIdleColor: "#123456",
    highColor: "#123456",
    mediumColor: "#123456",
    mediumFrom: 60,
    mediumTo: 80,
    lowColor: "#123456",
    notFoundMouse: false,
    notFoundBattery: true,
    notFoundBolt: true,
    notFoundColor: "#123456",
  };

  it("changes every setting off its default in CHANGED", () => {
    expect(Object.keys(CHANGED)).toEqual(BATTERY.settings);
  });

  it.each(["Background", "Mouse icon", "Battery icon", "Charging icon", "Battery level", "Mouse not found"])(
    "resets the %s section's settings to their defaults, and leaves the others",
    async (heading) => {
      const { page, uuid } = await openPanel(BATTERY, CHANGED);
      const inSection = await page.evaluate<string[]>(`(async () => {
        const section = [...document.querySelectorAll("section")]
          .find((candidate) => candidate.querySelector(".section-heading").textContent === ${JSON.stringify(heading)});
        // The page reads the saved settings before the reset, as the user sees them.
        await new Promise((resolve) => setTimeout(resolve, 200));
        section.querySelector("sdpi-button.reset").click();
        return [...section.querySelectorAll("[setting]")].map((control) => control.getAttribute("setting"));
      })()`);
      expect(inSection.length).toBeGreaterThan(0);
      const expected: JsonObject = { ...CHANGED };
      for (const setting of inSection) {
        expected[setting] = saved(await controlOf(page, setting));
      }
      await expect.poll(() => lastSaved(uuid)).toEqual(expected);
      await page.close();
    },
  );
});
