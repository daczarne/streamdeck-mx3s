# controls

The frontend under the actions: what the actions in [`../actions/`][actions] are built from. Its modules import from `../mouse/`, never from `../actions/`.

A control, here, is a key on the Deck, as an action places it. On a settings page, "control" means something else: a field of sdpi-components', such as a checkbox or a color picker.

1. `battery-image.ts`: the Battery key's image, drawn from a reading in the style the key's settings choose.

[actions]: ../actions/README.md
