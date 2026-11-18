import { readFileSync } from "node:fs";
import { ACCENTS, TILES, WHITE } from "@daczarne/streamdeck-icons";
import type { JsonValue } from "@elgato/utils";
import { describe, expect, it, vi } from "vitest";

import { batterySettingsSchema, parseSettings, setHostSettingsSchema } from "./schemas";

//* Fakes

const logger = { warn: vi.fn() };

//* Tests

describe("parseSettings", () => {
  it("gives Set Host's default for a key that has chosen no host, without a warning", () => {
    expect(parseSettings({}, setHostSettingsSchema, logger)).toEqual({ host: 1 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("gives Battery's defaults for the settings that are missing, without a warning", () => {
    expect(parseSettings({}, batterySettingsSchema, logger)).toEqual({
      background: TILES.charcoal,
      noBackground: false,
      showMouse: true,
      mouseStyle: "filled",
      mouseColor: WHITE,
      mouseFollowsLevel: false,
      showBattery: true,
      batteryColor: ACCENTS.leaf,
      batteryFollowsLevel: true,
      showBolt: "always",
      boltColor: "#FF007F",
      boltFollowsLevel: false,
      boltIdleColor: TILES.slate,
      highColor: ACCENTS.leaf,
      mediumColor: ACCENTS.gold,
      mediumFrom: 15,
      mediumTo: 40,
      lowColor: ACCENTS.scarlet,
      notFoundMouse: true,
      notFoundBattery: false,
      notFoundBolt: false,
      notFoundColor: TILES.grey,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    ["a number", 2],
    ["text that is a number, as the page's radio buttons save it", "2"],
  ])("takes a host given as %s", (_case, host) => {
    expect(parseSettings({ host }, setHostSettingsSchema, logger)).toEqual({ host: 2 });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each<[string, JsonValue]>([
    ["a host past the mouse's", "4"],
    ["host 0", 0],
    ["a host between two", 2.5],
    ["no host", ""],
    ["something else", true],
  ])("takes host 1, with a warning, for %s", (_case, host) => {
    expect(parseSettings({ host }, setHostSettingsSchema, logger)).toEqual({ host: 1 });
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      `Setting host is ${JSON.stringify(host)}, not a whole number from 1 to 3: using 1`,
    );
  });

  it("keeps a color as written, in either case", () => {
    expect(parseSettings({ background: "#a1B2c3" }, batterySettingsSchema, logger)).toMatchObject({
      background: "#a1B2c3",
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each<[JsonValue]>([["red"], ["#12345"], ["#1234567"], [42]])(
    "takes the default color, with a warning, for %s",
    (value) => {
      expect(parseSettings({ background: value }, batterySettingsSchema, logger)).toMatchObject({
        background: TILES.charcoal,
      });
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        `Setting background is ${JSON.stringify(value)}, not a color as #rrggbb: using "${TILES.charcoal}"`,
      );
    },
  );

  it("keeps the medium level's percentages at either end", () => {
    expect(parseSettings({ mediumFrom: 0, mediumTo: 100 }, batterySettingsSchema, logger)).toMatchObject({
      mediumFrom: 0,
      mediumTo: 100,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each<[JsonValue]>([[-5], [101], [null]])("takes the default percentages, with a warning, for %s", (value) => {
    expect(parseSettings({ mediumFrom: value, mediumTo: value }, batterySettingsSchema, logger)).toMatchObject({
      mediumFrom: 15,
      mediumTo: 40,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting mediumFrom is ${JSON.stringify(value)}, not a number from 0 to 100: using 15`,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      `Setting mediumTo is ${JSON.stringify(value)}, not a number from 0 to 100: using 40`,
    );
  });

  it.each([
    ["noBackground"],
    ["showMouse"],
    ["mouseFollowsLevel"],
    ["showBattery"],
    ["batteryFollowsLevel"],
    ["boltFollowsLevel"],
    ["notFoundMouse"],
    ["notFoundBattery"],
    ["notFoundBolt"],
  ])("takes the default, with a warning, for a %s that isn't true or false", (setting) => {
    expect(parseSettings({ [setting]: "yes" }, batterySettingsSchema, logger)).toEqual(
      parseSettings({}, batterySettingsSchema, logger),
    );
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(new RegExp(`^Setting ${setting} is "yes", not true or false: using (true|false)$`)),
    );
  });

  it("takes the defaults, with a warning, for a choice the page doesn't offer", () => {
    expect(parseSettings({ mouseStyle: "dotted", showBolt: "sometimes" }, batterySettingsSchema, logger)).toMatchObject(
      { mouseStyle: "filled", showBolt: "always" },
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Setting mouseStyle is "dotted", not one of filled, outlined: using "filled"',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Setting showBolt is "sometimes", not one of always, charging, never: using "always"',
    );
  });
});

describe("the Battery page", () => {
  it("shows the defaults the plugin takes for a key that hasn't chosen yet", () => {
    const page = readFileSync("com.daczarne.mx3s.sdPlugin/ui/battery.html", "utf8");
    const defaults = parseSettings({}, batterySettingsSchema, logger);
    const color = (setting: string) =>
      new RegExp(`<sdpi-color setting="${setting}" default="(#[0-9A-Fa-f]{6})">`).exec(page)?.[1]?.toUpperCase();
    const radio = (setting: string) =>
      new RegExp(`<sdpi-radio setting="${setting}" default="([a-z]+)"`).exec(page)?.[1];
    // A checkbox's default checks it whatever it says, so a checkbox checked by default is one with a default.
    const checkbox = (setting: string, label: string, checked: boolean) =>
      `<sdpi-checkbox setting="${setting}" ${checked ? 'default="true" ' : ""}label="${label}">`;
    const percentage = (setting: string) =>
      Number(new RegExp(`<sdpi-select setting="${setting}" default="(\\d+)" value-type="number">`).exec(page)?.[1]);

    for (const setting of [
      "background",
      "mouseColor",
      "batteryColor",
      "boltColor",
      "boltIdleColor",
      "highColor",
      "mediumColor",
      "lowColor",
      "notFoundColor",
    ] as const) {
      expect(color(setting), setting).toBe(defaults[setting].toUpperCase());
    }
    expect(radio("mouseStyle")).toBe(defaults.mouseStyle);
    expect(radio("showBolt")).toBe(defaults.showBolt);
    expect(page).toContain(checkbox("showMouse", "Show", defaults.showMouse));
    expect(page).toContain(checkbox("showBattery", "Show", defaults.showBattery));
    expect(page).toContain(checkbox("mouseFollowsLevel", "Follow battery level", defaults.mouseFollowsLevel));
    expect(page).toContain(checkbox("batteryFollowsLevel", "Follow battery level", defaults.batteryFollowsLevel));
    expect(page).toContain(checkbox("boltFollowsLevel", "Follow battery level", defaults.boltFollowsLevel));
    expect(page).toContain(checkbox("notFoundMouse", "Mouse", defaults.notFoundMouse));
    expect(page).toContain(checkbox("notFoundBattery", "Battery", defaults.notFoundBattery));
    expect(page).toContain(checkbox("notFoundBolt", "Charging", defaults.notFoundBolt));
    expect(percentage("mediumFrom")).toBe(defaults.mediumFrom);
    expect(percentage("mediumTo")).toBe(defaults.mediumTo);
    expect(page).toContain(`<span class="note" id="high-from">from ${defaults.mediumTo}%</span>`);
    expect(page).toContain(`<span class="note" id="low-below">below ${defaults.mediumFrom}%</span>`);
  });
});
