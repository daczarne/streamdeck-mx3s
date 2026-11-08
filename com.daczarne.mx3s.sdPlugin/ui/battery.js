/**
 * The Battery key's settings page: each section's Reset button, which brings the section's settings back to their
 * defaults, the `default` attribute each control has, or, for a checkbox without one, unchecked, the controls that say
 * nothing while a section's switch is off, such as the mouse's color while it isn't shown, greyed out, and the
 * percentages the high level starts from and the low level is below, the higher and the lower of the two the medium
 * level is between. A control saves the value a script gives it, as it saves the user's, and reports every change of
 * its value, the saved settings the page reads included, with `valuechange`.
 */

/**
 * The controls that only say something under a choice of the section they're in, by selector, with that choice, such
 * as a color picker while its element doesn't follow the battery's level. The plugin ignores their settings when it
 * isn't made, so they're greyed out then.
 *
 * @type {[string, () => boolean][]}
 */
const DEPENDENT = [
  ['sdpi-color[setting="background"]', () => !checked("noBackground")],
  ['sdpi-radio[setting="mouseStyle"]', () => checked("showMouse")],
  ['sdpi-checkbox[setting="mouseFollowsLevel"]', () => checked("showMouse")],
  ['sdpi-color[setting="mouseColor"]', () => checked("showMouse") && !checked("mouseFollowsLevel")],
  ['sdpi-checkbox[setting="batteryFollowsLevel"]', () => checked("showBattery")],
  ['sdpi-color[setting="batteryColor"]', () => checked("showBattery") && !checked("batteryFollowsLevel")],
  ['sdpi-checkbox[setting="boltFollowsLevel"]', () => chosen("showBolt") !== "never"],
  ['sdpi-color[setting="boltColor"]', () => chosen("showBolt") !== "never" && !checked("boltFollowsLevel")],
  ['sdpi-color[setting="boltIdleColor"]', () => chosen("showBolt") === "always"],
];

// The switches the dependent controls follow.
const SWITCHES = [
  "noBackground",
  "showMouse",
  "mouseFollowsLevel",
  "showBattery",
  "batteryFollowsLevel",
  "showBolt",
  "boltFollowsLevel",
];

/**
 * The control with the setting `setting`.
 *
 * @param {string} setting
 * @returns {(Element & { value?: unknown }) | null}
 */
function control(setting) {
  return document.querySelector(`[setting="${setting}"]`);
}

/**
 * Whether the checkbox with the setting `setting` is checked: its value, or, before it has one, its default, which
 * checks it whatever it says.
 *
 * @param {string} setting
 * @returns {boolean}
 */
function checked(setting) {
  const box = control(setting);
  return typeof box?.value === "boolean" ? box.value : box?.getAttribute("default") !== null;
}

/**
 * The option chosen on the radio with the setting `setting`: its value, or, before it has one, its default.
 *
 * @param {string} setting
 * @returns {unknown}
 */
function chosen(setting) {
  const radio = control(setting);
  return radio?.value ?? radio?.getAttribute("default");
}

/**
 * Greys out the dependent controls whose choice isn't made, and brings back the others.
 *
 * @returns {void}
 */
function greyOut() {
  for (const [selector, applies] of DEPENDENT) {
    const dependent = /** @type {(Element & { disabled?: boolean }) | null} */ (document.querySelector(selector));
    if (dependent !== null) {
      dependent.disabled = !applies();
    }
  }
}

/**
 * Writes out the percentages the high level starts from and the low level is below: the higher and the lower of the
 * two the medium level is between, or, before they have one, their defaults.
 *
 * @returns {void}
 */
function showBounds() {
  const bounds = [Number(chosen("mediumFrom")), Number(chosen("mediumTo"))];
  const from = document.getElementById("high-from");
  const below = document.getElementById("low-below");
  if (from !== null) {
    from.textContent = `from ${Math.max(...bounds)}%`;
  }
  if (below !== null) {
    below.textContent = `below ${Math.min(...bounds)}%`;
  }
}

/**
 * Gives a control from sdpi-components its default as its value, which saves it. A control that saves numbers, with
 * `value-type="number"`, is given its default as one, as it would turn the user's choice into one. Two controls don't show it on their
 * own, so their inputs are given it too. A color picker draws its color as its input's `defaultValue`, which an input
 * the user already changed no longer shows. A radio draws its default option as checked whatever its value, so once
 * the user has picked another, which unchecks the default's input, it never draws that input checked again.
 *
 * @param {Element & { value?: unknown }} control a control with a `setting`
 * @returns {void}
 */
function resetControl(control) {
  const fallback = control.getAttribute("default");
  if (control.localName === "sdpi-checkbox") {
    // A checkbox's default is text, which checks it whatever it says.
    control.value = fallback !== null;
    return;
  }
  if (fallback === null) {
    return;
  }
  control.value = control.getAttribute("value-type") === "number" ? Number(fallback) : fallback;
  if (control.localName === "sdpi-color") {
    const input = control.shadowRoot?.querySelector('input[type="color"]');
    if (input instanceof HTMLInputElement) {
      input.value = fallback.toLowerCase();
    }
  }
  if (control.localName === "sdpi-radio") {
    for (const input of control.shadowRoot?.querySelectorAll('input[type="radio"]') ?? []) {
      if (input instanceof HTMLInputElement) {
        input.checked = input.value === fallback;
      }
    }
  }
}

for (const section of document.querySelectorAll("section")) {
  section.querySelector("sdpi-button.reset")?.addEventListener("click", () => {
    for (const control of section.querySelectorAll("[setting]")) {
      resetControl(control);
    }
  });
}

for (const setting of SWITCHES) {
  control(setting)?.addEventListener("valuechange", greyOut);
}
greyOut();

for (const setting of ["mediumFrom", "mediumTo"]) {
  control(setting)?.addEventListener("valuechange", showBounds);
}
showBounds();
