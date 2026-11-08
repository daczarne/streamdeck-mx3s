/**
 * The Battery key's settings page: the palette's tiles, as swatches under the background's color picker. A click on
 * one picks its color, as the picker would, and unchecks None, since a color picked means a background wanted.
 */

const picker = document.querySelector('sdpi-color[setting="background"]');
const none = document.querySelector('sdpi-checkbox[setting="noBackground"]');

for (const swatch of document.querySelectorAll("button.swatch")) {
  swatch.addEventListener("click", () => {
    const color = swatch.getAttribute("data-color")?.toLowerCase();
    if (picker === null || color === undefined) {
      return;
    }
    // Setting the picker's value saves it, as the picker saves the user's. The picker draws it as its input's default,
    // which an input no longer shows once the user has picked a color by hand, so the input is given it too.
    picker.value = color;
    const input = picker.shadowRoot?.querySelector('input[type="color"]');
    if (input instanceof HTMLInputElement) {
      input.value = color;
    }
    if (none !== null) {
      none.value = false;
    }
  });
}
