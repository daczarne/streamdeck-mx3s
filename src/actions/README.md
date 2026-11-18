# actions

The frontend's top layer: the plugin's actions, one module each, named after it. Each holds its action's class, which `@action` registers under the UUID the manifest gives it, and what's specific to that action, such as the host a Set Host key's settings choose, or how often the Battery key reads the battery. What the keys display is drawn in [`../controls/`][controls].

There are 2, in the order the manifest lists them: `set-host.ts` (Set Host) and `battery.ts` (Battery). `../plugin.ts` registers both.

[controls]: ../controls/README.md
