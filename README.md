# MX Master 3S for Stream Deck

A Stream Deck plugin that switches a Logitech MX Master 3S between its Easy-Switch hosts, the computers paired to the 1, 2 and 3 on the mouse, and shows how much battery it has left, without Logitech's software. It's installed from a file attached to each [release][releases], not from Elgato's Marketplace.

Not an official Logitech or Elgato product.

- [Status](#status)
- [Supported hardware](#supported-hardware)
- [Requirements](#requirements)
- [Installing](#installing)
- [Setting up on a new computer](#setting-up-on-a-new-computer)
- [The Set Host key](#the-set-host-key)
- [The Battery key](#the-battery-key)
- [Working on the plugin](#working-on-the-plugin)
- [Settings pages](#settings-pages)
- [Packaging](#packaging)
- [Icons](#icons)
- [Third-party code](#third-party-code)
- [Credits](#credits)

## Status

The plugin has two actions: [Set Host](#the-set-host-key), a key that sends the mouse to one of its hosts, and [Battery](#the-battery-key), a key that shows how much battery the mouse has left. It talks to the mouse through a Logi Bolt receiver, with no permission and no Logitech software. It does so in-process, over HID++ 2.0, Logitech's protocol, through [`node-hid`][node-hid], the same way [the Litra plugin][streamdeck-litra] controls Logitech lights.

Once a computer sends the mouse to another host, it loses the mouse and can't call it back. A key can send the mouse to a host, but a key that toggles between two hosts can't work. The mouse comes back with its own button, or from the other host.

## Supported hardware

| Mouse        | Connection         | Support                                        |
|--------------|--------------------|------------------------------------------------|
| MX Master 3S | Logi Bolt receiver | Supported, with the Set Host and Battery keys  |
| MX Master 3S | Bluetooth          | Not supported                                  |

The plugin reaches the mouse through a Logi Bolt receiver on each computer, paired with the mouse on that computer's Easy-Switch channel. Over Bluetooth, opening the mouse on macOS needs a permission the plugin doesn't ask for (see [Requirements](#requirements)). Other Logitech mice with Easy-Switch and Bolt support the same HID++ features, but the plugin isn't checked on any of them. If you try one, [an issue][issues] saying how it went helps.

## Requirements

- [Stream Deck][stream-deck] 7.1 or later, on macOS 12 or later, or Windows 10 or later. The plugin is developed on macOS, and each release is checked on macOS and on Windows once it's published.
- An MX Master 3S, and a Logi Bolt receiver on each computer, paired with the mouse on that computer's channel. A receiver bought on its own comes unpaired: `scripts/probes/pair.mjs` pairs it without Logitech's software (see [the probes' README][probes]).
- No permission. Over Bluetooth, the mouse's pointer and its HID++ channel share one device, which macOS only lets an app with Input Monitoring open. The receiver keeps its HID++ channel apart, so the plugin needs none ([#3]).
- No Logitech software: neither Logi Options+ nor G HUB is needed.
- Only to build it from the repository: Node.js at the exact version in `.node-version`, with the npm that ships with it. `devEngines` in `package.json` pins both, and npm refuses any other. With [n][n], `n auto` installs that Node, with its npm, and switches to it. The plugin itself runs on the Node 24 that Stream Deck downloads, so the Node used to build doesn't have to match it.

## Installing

1. Download `com.daczarne.mx3s.streamDeckPlugin` from [the latest release][latest-release].
2. Open it: Stream Deck installs the plugin, and its actions appear under the **MX Master 3S** category.

A newer release installs the same way, over the one installed. To remove the plugin, uninstall it from the **Plugins** tab of Stream Deck's preferences.

If an installed plugin doesn't work, [an issue][issues] with its log helps. The logs are in the plugin's folder, newest in `mx3s.log`:

- On macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.daczarne.mx3s.sdPlugin/logs/`
- On Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\com.daczarne.mx3s.sdPlugin\logs\`

## Setting up on a new computer

1. Install Stream Deck, connect the Deck, and plug in the computer's receiver, paired with the mouse (see [Requirements](#requirements)).
2. Clone the repository, switch to the Node version in `.node-version`, and install the dependencies from the lockfile, without running install scripts:

    ```shell
    git clone https://github.com/daczarne/streamdeck-mx3s.git
    cd streamdeck-mx3s
    n auto
    npm ci --ignore-scripts
    ```

3. Build the plugin. This bundles `src/` into `com.daczarne.mx3s.sdPlugin/bin/`:

    ```shell
    npm run build
    ```

4. Turn on Stream Deck's developer mode, link the plugin folder into Stream Deck, and restart the plugin:

    ```shell
    npx streamdeck dev
    npm run link
    npx streamdeck restart com.daczarne.mx3s
    ```

Developer mode stays on afterwards.

## The Set Host key

The Set Host key sends the mouse to the host it's set to, chosen on its settings page, from 1 to 3, as numbered on the mouse. The key shows the mouse, and its host as its title, such as `Host 2`, until it's given a title of its own. The MX Master 3S icon pack in [`streamdeck-icons`][streamdeck-icons] has images for the hosts' keys, with each host's number on the mouse.

On a press, the key shows a check mark once the mouse is on its way, or already on that host, and an alert when no receiver on this computer reaches the mouse, such as when it's on another host already. The plugin's log says why (see [Working on the plugin](#working-on-the-plugin)).

A key on each computer for each of the other hosts lets the mouse be sent from any of them to any other.

## The Battery key

The Battery key shows how full the mouse's battery is, as a percentage, with the mouse and a battery filled as far across the top. The battery and the percentage take the color of the level the percentage is at: green from 40%, yellow from 15%, and red below that. By default, a bolt shows next to the battery while the mouse is on its cable, charging or charged.

The key reads the battery when it appears, when it's pressed, and every 10 minutes while it's shown. Every read reaches the mouse through the receiver, as Set Host does, and wakes it if it's at rest. When the mouse doesn't answer, such as when it's on another host, the key shows the last reading in grey. Until the plugin has read the battery once, the key shows an empty battery and dashes, in grey. Every Battery key shows the same reading, and the plugin draws the whole key, so it has no title.

On its settings page, each key chooses its background: the palette's charcoal tile until another color is picked, or none, which leaves the key black behind the mouse, the battery and the percentage. Each key also chooses its mouse icon: shown or not, which leaves the battery and the bolt where they are, filled or outlined, and its color, white until another is picked. Each key also chooses whether it shows the battery icon, which takes the color of its level, and when it shows the bolt icon: always, only while the mouse charges, which is the default, or never, with its color while charging, green until another is picked, and, for a bolt shown always, its color while not charging, a dim slate. The page has a section for each of these, with a Reset button at its end that brings the section's settings back to their defaults. A setting that changes nothing while its section's choice is off is greyed out: the background's color with **None** checked, the mouse's style and color while it isn't shown, and the bolt's colors while it never shows, or, while it shows only when charging, its color when not. Its **Battery level** section, at the end, sets the three levels' colors, and the two percentages the medium level is between, in steps of 5% and in either order: the high level starts from the higher one, and the low level is below the lower. The plugin goes by the percentage rather than by the level the mouse reports, since where the mouse puts each of its own levels isn't known, and can't be chosen. A change shows on the key as soon as it's chosen, without reading the battery again. A mouse that isn't found turns grey with the rest of the key, whatever its color.

## Working on the plugin

[The contributing guide][contributing] describes how changes are made, and [the style guide][style-guide] the conventions the linters don't enforce.

Since the plugin is linked, a change takes effect as soon as it's built and the plugin restarts. A change to `manifest.json` takes effect once Stream Deck itself is quit and reopened: restarting the plugin isn't enough. Switching branches switches what the Deck runs, after the next build.

```shell
npm run watch             # rebuild and restart the plugin on every change
npm run build             # build once
npx streamdeck restart com.daczarne.mx3s   # load the new build
npm run typecheck         # type-check the sources, and the build and check scripts
npm run lint              # Biome: lint rules, formatting and import order, without changing anything
npm run format            # Biome: apply the formatting and the import order
npm test                  # run the unit tests
npm run check:ui          # settings pages: no remote resources, CSP on every page, vendored file matches its hash
npm run validate          # check:ui, build and streamdeck validate
npm run icons             # regenerate the icons in imgs/ from scripts/generate-icons.mjs
```

The plugin's log is `com.daczarne.mx3s.sdPlugin/logs/mx3s.log`, which tells each press of a key, each read of the battery, the ones every 10 minutes included, and what came of them. It carries on across restarts, and is rotated once it reaches 1 MB, keeping four older files.

## Settings pages

The settings pages (Property Inspector), in `com.daczarne.mx3s.sdPlugin/ui/`, load nothing remote, and two layers keep it that way:

- **When building.** `npm run check:ui` (also run by `validate`) fails if any `ui/*.html` loads a remote resource, lacks the Content-Security-Policy below or declares a different one, or has an inline script. It also fails if the vendored sdpi-components doesn't match its pinned hash (see [Third-party code](#third-party-code)).
- **When Stream Deck shows them.** Each page declares a Content-Security-Policy in a `<meta>`, so Stream Deck refuses whatever the policy doesn't allow, even if it slipped past the check.

The policy allows only what the pages need:

| Directive                      | Allows                                                                              |
|--------------------------------|-------------------------------------------------------------------------------------|
| `default-src 'none'`           | Nothing that the directives below don't allow.                                      |
| `script-src 'self'`            | Scripts from the plugin folder. No inline scripts and no `eval`.                    |
| `style-src 'unsafe-inline'`    | The `<style>` elements of the pages and the one sdpi-components adds to every page. |
| `img-src data:`                | The icons that sdpi-components draws as `data:` SVGs, such as its check marks.      |
| `connect-src ws://localhost:*` | The WebSocket to Stream Deck, on the port Stream Deck passes to the page.           |
| `base-uri 'none'`              | No `<base>` element, which would change where relative paths point.                 |
| `form-action 'none'`           | No form submissions.                                                                |

Since inline scripts are blocked, a page's own logic goes in a `.js` file in `ui/`. The policy is repeated in each page and in [`scripts/check-ui.mjs`][check-ui], so a change to it updates all of them and the table above.

## Packaging

A release attaches the file this writes:

```shell
npm run pack
```

It runs `check:ui`, builds, and writes `release/com.daczarne.mx3s.streamDeckPlugin`, which holds the plugin folder, without what `com.daczarne.mx3s.sdPlugin/.sdignore` leaves out. The build puts in it only the files of `node-hid` that run on macOS and Windows (`scripts/package-files.mjs` lists them), the plugin's license, and the licenses of the code it ships, in `bin/THIRD_PARTY_LICENSES.txt`, since the minified bundle drops them. An installed plugin can't fall back on the repository's `node_modules` the way a linked one does, so a dependency missing from the package only shows once it's installed, which the checks on every release catch.

The Stream Deck CLI rewrites `manifest.json` as it packs, and leaves it without its final newline: add it back, or restore the file, before committing.

How a release is made, from the version to publishing it, is in [`docs/releases.md`][releases-doc].

## Icons

The plugin's images, its category icon in the Stream Deck app's list of actions, its marketplace icon in its list of plugins, and the actions' icons and key images, are drawn by code, from the glyphs of [`streamdeck-icons`][streamdeck-icons], pinned to a commit. That repository also holds the palette, and the MX Master 3S icon pack, which adds keys for the mouse's hosts to Stream Deck's Icon Library. `scripts/generate-icons.mjs` decides which glyph goes where, and renders each to the PNG sizes Stream Deck needs. They're the pack's mouse, filled: the category icon at the size of the pack's own icon, the marketplace icon on a dark rounded tile, so it also shows on a light page, and the Set Host key's image smaller, centered, to leave room for its title under it. Set Host's icon, in the list of actions, is the mouse outlined. Battery's icon is the pack's battery, empty, and so is its key's image, which the plugin replaces as soon as the key appears: while it runs, the plugin draws the Battery key from each reading, from the same package's glyphs, its palette, and the outlines of its font's figures, which is why the package is bundled into the plugin rather than only used to build it.

To take a change to the glyphs, update the commit the dependency is pinned to, run `npm run icons`, and commit the regenerated images with it. CI regenerates them too, and fails when the committed images aren't what the script draws.

## Third-party code

The settings pages use [sdpi-components][sdpi] (MIT), vendored at `com.daczarne.mx3s.sdPlugin/ui/vendor/sdpi-components.js` instead of loaded from `sdpi-components.dev`, so no remote code runs inside Stream Deck.

- **Version:** `v4.0.1`
- **Source:** [`dist/sdpi-components.js` at tag `v4.0.1`][sdpi-source] (commit `06185f1452`)
- **Pinned hash:** sha256 in [`scripts/check-ui.mjs`][check-ui], checked by `npm run check:ui`

To update it, download `dist/sdpi-components.js` from the new upstream tag (not from npm: the `sdpi-components` package there is unrelated to this project), review the diff, replace the vendored file, and update the version and commit here and the hash in `scripts/check-ui.mjs`.

## Credits

- [Solaar][solaar]: the best open reference for Logitech's HID++ 2.0 features, its change-host setting included, and for pairing Bolt receivers.
- [`node-hid`][node-hid]: HID access from Node.
- [sdpi-components][sdpi]: the settings pages' components.
- [Elgato Stream Deck SDK][sdk].

The plugin is MIT licensed: see [`LICENSE`][license].

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
[check-ui]: scripts/check-ui.mjs
[contributing]: docs/contributing.md
[issues]: https://github.com/daczarne/streamdeck-mx3s/issues
[latest-release]: https://github.com/daczarne/streamdeck-mx3s/releases/latest
[license]: LICENSE
[n]: https://github.com/tj/n
[node-hid]: https://github.com/node-hid/node-hid
[probes]: scripts/probes/README.md
[releases]: https://github.com/daczarne/streamdeck-mx3s/releases
[releases-doc]: docs/releases.md
[sdk]: https://docs.elgato.com/streamdeck
[sdpi]: https://github.com/GeekyEggo/sdpi-components
[sdpi-source]: https://github.com/GeekyEggo/sdpi-components/blob/v4.0.1/dist/sdpi-components.js
[solaar]: https://github.com/pwr-Solaar/Solaar
[stream-deck]: https://www.elgato.com/streamdeck
[streamdeck-icons]: https://github.com/daczarne/streamdeck-icons
[streamdeck-litra]: https://github.com/daczarne/streamdeck-litra
[style-guide]: docs/style_guide.md
