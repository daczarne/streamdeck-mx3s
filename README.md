# MX Master 3S for Stream Deck

A Stream Deck plugin that switches a Logitech MX Master 3S between its Easy-Switch hosts, the computers paired to the 1, 2 and 3 on the mouse, without Logitech's software. It isn't released yet: it runs linked from a clone of this repository.

Not an official Logitech or Elgato product.

- [Status](#status)
- [Supported hardware](#supported-hardware)
- [Requirements](#requirements)
- [Setting up on a new computer](#setting-up-on-a-new-computer)
- [Working on the plugin](#working-on-the-plugin)
- [Settings pages](#settings-pages)
- [Third-party code](#third-party-code)
- [Credits](#credits)

## Status

The plugin is at its start, and has no actions yet: the Counter action it shows is the sample from Elgato's template. The first action will be a key that sends the mouse to a given host.

The plugin will talk to the mouse in-process over HID++ 2.0, Logitech's protocol, through [`node-hid`][node-hid], the same way [the Litra plugin][streamdeck-litra] controls Logitech lights. A proof of concept, run by hand, has read the mouse's current host and switched it. What stands in the way on macOS is a permission (see [Requirements](#requirements)).

Once a computer sends the mouse to another host, it loses the mouse and can't call it back. A key can send the mouse to a host, but a key that toggles between two hosts can't work. The mouse comes back with its own button, or from the other host.

## Supported hardware

| Mouse        | Connection         | Switching hosts                        |
|--------------|--------------------|----------------------------------------|
| MX Master 3S | Bluetooth, direct  | Checked by hand, not yet in the plugin |
| MX Master 3S | Logi Bolt receiver | Not checked                            |

The plugin is made and checked on an MX Master 3S connected directly over Bluetooth. Other Logitech mice with Easy-Switch support the same HID++ feature, but the plugin isn't checked on any of them. If you try one, [an issue][issues] saying how it went helps.

## Requirements

- [Stream Deck][stream-deck] 7.1 or later, on macOS 12 or later, or Windows 10 or later. The plugin is made and checked on macOS, and isn't checked on Windows.
- An MX Master 3S, connected to the computer.
- On macOS, over Bluetooth, opening the mouse needs the Input Monitoring permission. Its pointer and its HID++ channel share one device, and macOS only lets an app with that permission open it. For a plugin, the permission would be the Stream Deck app's, and would let every plugin it runs read keystrokes system-wide, so the plugin won't ask for it. A way around it, such as a Bolt receiver or a small helper that holds the permission alone, is still to be found.
- No Logitech software: neither Logi Options+ nor G HUB is needed.
- Only to build it from the repository: Node.js and npm, at the exact Node version in `.node-version`. With [n][n], `n auto` installs and switches to it. The plugin itself runs on the Node 24 that Stream Deck downloads, so the Node used to build doesn't have to match it.

## Setting up on a new computer

1. Install Stream Deck, connect the Deck, and pair the mouse.
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

## Working on the plugin

[The contributing guide][contributing] describes how changes are made, and [the style guide][style-guide] the conventions the linters don't enforce.

Since the plugin is linked, a change takes effect as soon as it's built and the plugin restarts. A change to `manifest.json` takes effect once Stream Deck itself is quit and reopened: restarting the plugin isn't enough. Switching branches switches what the Deck runs, after the next build.

```shell
npm run watch             # rebuild and restart the plugin on every change
npm run build             # build once
npx streamdeck restart com.daczarne.mx3s   # load the new build
npm run typecheck         # type-check the sources
npm run lint              # Biome: lint rules, formatting and import order, without changing anything
npm run format            # Biome: apply the formatting and the import order
npm run check:ui          # settings pages: no remote resources, CSP on every page, vendored file matches its hash
npm run validate          # check:ui, build and streamdeck validate
```

The plugin's logs are in `com.daczarne.mx3s.sdPlugin/logs/`.

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

## Third-party code

The settings pages use [sdpi-components][sdpi] (MIT), vendored at `com.daczarne.mx3s.sdPlugin/ui/vendor/sdpi-components.js` instead of loaded from `sdpi-components.dev`, so no remote code runs inside Stream Deck.

- **Version:** `v4.0.1`
- **Source:** [`dist/sdpi-components.js` at tag `v4.0.1`][sdpi-source] (commit `06185f1452`)
- **Pinned hash:** sha256 in [`scripts/check-ui.mjs`][check-ui], checked by `npm run check:ui`

To update it, download `dist/sdpi-components.js` from the new upstream tag (not from npm: the `sdpi-components` package there is unrelated to this project), review the diff, replace the vendored file, and update the version and commit here and the hash in `scripts/check-ui.mjs`.

## Credits

- [Solaar][solaar]: the best open reference for Logitech's HID++ 2.0 features, its change-host setting included.
- [`node-hid`][node-hid]: HID access from Node.
- [sdpi-components][sdpi]: the settings pages' components.
- [Elgato Stream Deck SDK][sdk].

The plugin is MIT licensed: see [`LICENSE`][license].

[check-ui]: scripts/check-ui.mjs
[contributing]: docs/contributing.md
[issues]: https://github.com/daczarne/streamdeck-mx3s/issues
[license]: LICENSE
[n]: https://github.com/tj/n
[node-hid]: https://github.com/node-hid/node-hid
[sdk]: https://docs.elgato.com/streamdeck
[sdpi]: https://github.com/GeekyEggo/sdpi-components
[sdpi-source]: https://github.com/GeekyEggo/sdpi-components/blob/v4.0.1/dist/sdpi-components.js
[solaar]: https://github.com/pwr-Solaar/Solaar
[stream-deck]: https://www.elgato.com/streamdeck
[streamdeck-litra]: https://github.com/daczarne/streamdeck-litra
[style-guide]: docs/style_guide.md
