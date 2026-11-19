# src

The plugin's code, in layers, a folder each. Each folder imports only from the folders below it, so the frontend calls the backend, never the other way round:

1. [`actions/`][actions] (frontend): the plugin's actions, one module each.
2. [`controls/`][controls] (frontend): what the actions are built from, and what the keys display.
3. [`settings/`][settings] (backend): what Stream Deck keeps of the keys, and how the plugin reads it.
4. [`mouse/`][mouse] (backend): the mouse, and how the plugin reaches it through the Bolt receivers.

The frontend is the Deck: what its keys take in and display. The backend is the plugin's mechanics. The settings pages are a frontend of their own, in `com.daczarne.mx3s.sdPlugin/ui/`, which save each key's settings through Stream Deck, and which the plugin reads through `settings/`.

`plugin.ts` starts the plugin, and `logging.ts` holds the logger every module logs through, which any folder imports. The tests sit next to the module they test, and [`test-support/`][test-support] holds the fakes they share. [The architecture document][architecture] describes how the layers fit together, and [the testing guide][testing] how the tests are written.

[actions]: actions/README.md
[architecture]: ../docs/developer_guide/architecture.md
[controls]: controls/README.md
[mouse]: mouse/README.md
[settings]: settings/README.md
[test-support]: test-support/README.md
[testing]: ../docs/developer_guide/testing.md
