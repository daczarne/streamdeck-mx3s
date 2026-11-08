# Testing a release

- [When to run these checks](#when-to-run-these-checks)
- [Setup](#setup)
- [Checks](#checks)

Development runs linked from the repository, where the plugin also finds the repository's `node_modules`, so the Deck never runs what a release ships. These checks run the package as its users do: downloaded from the release, installed, and used on macOS and on Windows. They cover what nothing else does: that the package holds every file the plugin needs on each system, that it installs and is removed cleanly, and that the installed plugin reaches the mouse through the receiver on each system.

## When to run these checks

- On every release, on macOS and on Windows, once it's published (see [the release process][releases]). What they find broken ships fixed in a patch release.
- After a change to what the package holds, such as `scripts/package-files.mjs`, `rollup.config.mjs`, the plugin folder's `.sdignore` or the `pack` script, or after an upgrade of `node-hid`, on a package made with `npm run pack`. Such a package isn't the workflow's, so check 1 doesn't apply to it.

## Setup

On each computer, Stream Deck is installed, and its Logi Bolt receiver is plugged in and paired with the mouse on that computer's channel (see [the probes' README][probes]). The plugin isn't linked there from a clone: an installed plugin and a linked one share their folder, so installing one replaces the other.

Download `com.daczarne.mx3s.streamDeckPlugin` from the release's page. Then open the plugin's log folder, where the checks read the log:

- On macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.daczarne.mx3s.sdPlugin/logs/`
- On Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\com.daczarne.mx3s.sdPlugin\logs\`

## Checks

1. **The download is the package the workflow built.** Its SHA-256, from `shasum -a 256` on macOS or `Get-FileHash` in PowerShell on Windows, is the one the release's notes give. With the GitHub CLI, `gh attestation verify com.daczarne.mx3s.streamDeckPlugin --repo daczarne/streamdeck-mx3s` passes.
2. **It installs.** Open the file: Stream Deck installs the plugin, and the **MX Master 3S** category lists the Set Host and Battery actions, with their icons. When an older release is installed, the new one replaces it, and the keys already placed keep their hosts.
3. **The installed plugin switches the mouse and reads its battery.** Run checks 1, 2, 3, 5 and 6 of [the Set Host checks][set-host], and checks 1, 3, 4, 5, 9 to 15 of [the Battery checks][battery], on the installed plugin. On macOS, also run check 4 of the Set Host checks: no permission is asked for.
4. **It logs in its own folder.** The log folder holds `mx3s.log`, starting with `Plugin started`, and then the lines of each press: nothing came from the computer that built the package. On Windows, each press's `Opening a receiver's HID++ channel` line names two paths, one with `Col01` and one with `Col02`: a line with one path means the plugin took them for two receivers.
5. **It ships its licenses.** The plugin's `bin/` folder, next to `logs/`, holds `LICENSE` and `THIRD_PARTY_LICENSES.txt`.
6. **It's removed cleanly.** Uninstall the plugin from the **Plugins** tab of Stream Deck's preferences: its actions leave the list, and its folder, logs included, is gone.

[battery]: battery.md
[probes]: ../../scripts/probes/README.md
[releases]: ../releases.md
[set-host]: set_host.md
