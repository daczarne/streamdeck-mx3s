/**
 * The Battery key's settings page: each section's Reset button, which brings the section's settings back to their
 * defaults, the `default` attribute each control has, or, for a checkbox without one, unchecked. A control saves the
 * value a script gives it, as it saves the user's. The disabled controls have no setting, and are left alone.
 */

/**
 * Gives a control from sdpi-components its default as its value, which saves it. Two controls don't show it on their
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
  control.value = fallback;
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
