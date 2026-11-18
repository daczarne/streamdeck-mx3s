# mouse

The backend's bottom layer: the MX Master 3S, reached through the Logi Bolt receivers plugged in. Its modules import nothing from the rest of `src/` but `../logging.ts`.

1. `connection.ts`: the only module that imports `node-hid`. It reaches the mouse over HID++ for one operation at a time, lends the operation the mouse it reached, as a `MouseConnection`, and closes the receivers once it's done.
2. `host.ts`: sends the mouse to a host, through its CHANGE_HOST feature.
3. `battery.ts`: reads the mouse's battery, through its UNIFIED_BATTERY feature.

The plugin keeps nothing of the mouse between operations: each one finds the receiver, the slot and the feature afresh, since the mouse may have left for another host meanwhile. The "How the mouse is reached" section of `CLAUDE.md` describes the requests, and why the plugin reaches the mouse only through receivers.
