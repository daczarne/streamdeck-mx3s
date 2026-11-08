# CLAUDE.md

- [Project](#project)
- [Read before changing things](#read-before-changing-things)
- [Layout](#layout)
- [Commands](#commands)
- [Runtime and toolchain](#runtime-and-toolchain)
- [Supply chain](#supply-chain)
- [How the mouse is reached](#how-the-mouse-is-reached)
- [Testing on the hardware](#testing-on-the-hardware)
- [Workflow](#workflow)
- [Style](#style)

## Project

A Stream Deck plugin that switches a Logitech MX Master 3S between its Easy-Switch hosts (the 1, 2 and 3 on the mouse) by talking HID++ 2.0 to it directly, without Logi Options+ or G HUB. It follows the Litra plugin (`daczarne/streamdeck-litra`), which controls Logitech lights the same way, over `node-hid` and Logitech's vendor HID interface, and takes its structure, tooling and conventions from it.

The plugin is made and checked on macOS, with a Stream Deck + XL running Stream Deck 7.6, and an MX Master 3S connected through a Logi Bolt receiver on each host. The manifest also lists Windows 10, where only releases are checked, as installed plugins, so a change shouldn't assume macOS without saying why. It needs neither Logi Options+ nor G HUB, and is checked without them installed.

Its two actions are keys: Set Host sends the mouse to the host it's set to, and Battery shows how much battery the mouse has left, and whether it's charging. Releases are installed from a file attached to each GitHub release, and each one is checked as an installed plugin on macOS and on Windows once it's published, with a patch release for what the checks find broken. Development runs linked from the repo, never installed, so the Deck runs whatever is built from the checked-out branch: a change takes effect on the next build and restart.

## Read before changing things

- `docs/contributing.md`: how work is done here. Changes go through pull requests, features come with their tests, dependencies are pinned, and unused code is removed. This file only adds what is specific to Claude.
- `docs/style_guide.md`: the conventions the linters don't enforce (see [Style](#style)).
- `docs/releases.md`: how a release is made, from the branch that raises the version to the published release, and where the version is written.
- `docs/manual_testing/`: the checks that only the Deck and the mouse can prove, one document per area. Before asking for a check on the Deck, point to the matching document. When a feature needs new manual checks, add them there.
- The Litra plugin's `docs/elgato_sdk/`: what the Stream Deck SDK offers and what it doesn't, checked against Stream Deck 7.6, and its `docs/architecture.md`, on why it reaches its lamps through `node-hid` the way it does. Read them before designing how an action behaves on the Deck. What this plugin finds out that is specific to it goes into this repository's `docs/`.

## Layout

- `src/plugin.ts` registers the actions, and `src/actions/` holds them: Set Host (`set-host.ts`), which reads its host from the key's settings, shows it in the key's title, and on a press shows a check mark or an alert from what came of the switch, and Battery (`battery.ts`), which reads the battery when a key appears, when one is pressed, and every 10 minutes while one is shown, one read at a time, and draws every key from the one reading, on the background and with the mouse its settings choose (`styleOf`), from its settings page, `ui/battery.html`, redrawing a key whose settings change without reading again. `battery-image.ts` draws the key's image from a reading, as an SVG the key takes as a data URL: the mouse, the battery and, while it charges, a bolt across the top, and the percentage below, on the key's background (the palette's charcoal tile, another color, or none), with its mouse (white or another color, filled or outlined, or none), colored by the level the mouse reports, and grey, with the last reading, once the mouse doesn't answer.
- `src/mouse.ts` is the only module that talks to `node-hid`. It reaches the mouse through the receivers plugged in, as described in [How the mouse is reached](#how-the-mouse-is-reached), for an operation on one of the mouse's features (`reachMouse`), one operation at a time, so the requests of two never mix on a channel. Each operation opens the receivers afresh, and closes them before it returns. It finds the mouse's slot and the index of the feature, and lends the operation the mouse it reached, whose feature the operation calls through `callFeature` and `sendFeature`, without seeing a channel. It logs why the mouse couldn't be reached, or a request that failed, and returns that rather than throwing.
- `src/host.ts` sends the mouse to a host, through CHANGE_HOST, as an operation of `src/mouse.ts`. It logs what came of the switch, and returns it rather than throwing.
- `src/battery.ts` reads the mouse's battery, through UNIFIED_BATTERY, as another operation of `src/mouse.ts`, so a read and a switch take turns in one queue: the percentage, the level the mouse puts it at (full, good, low or critical), and whether the mouse is on its cable, charging or charged. It logs what it read, and returns it rather than throwing.
- `src/logging.ts` holds the logger every module logs through, instead of `streamDeck.logger`, and the Litra plugin's file target, which writes it to `logs/mx3s.log`, carried on across restarts and rotated by size.
- Unit tests sit next to the file they test (`mouse.test.ts`), and run with Vitest. They need no receiver and create no `logs/` folder. `mouse.test.ts` runs `src/mouse.ts`, with operations of its own, and `host.test.ts` and `battery.test.ts` run `src/host.ts` and `src/battery.ts` through it, against emulated receivers (`src/test-support/emulated-receiver.ts`), which answer as the probes measured them, and list their HID++ channel as macOS does or as Windows does, through a fake `node-hid` (`fake-node-hid.ts`). The actions' tests replace `src/host.ts` or `src/battery.ts`, `@elgato/streamdeck` and `src/logging.ts` with `vi.mock`, and drive the actions through `src/test-support/fake-deck.ts`, which sends each event to the action it belongs to, as Stream Deck does. The Battery key's tests run its timer on Vitest's fake timers.
- `com.daczarne.mx3s.sdPlugin/` is the plugin folder: `manifest.json`, the settings pages in `ui/` (with the vendored `sdpi-components` in `ui/vendor/`), and the images in `imgs/`. Its `.sdignore` lists what `npm run pack` leaves out of the package, besides the CLI's own defaults. `bin/` (the bundle, with its licenses), `node_modules/` (the native runtime) and `logs/` are build and run output, and aren't committed.
- `rollup.config.mjs` bundles `src/` into `bin/plugin.js`. `scripts/package-files.mjs`, the Litra plugin's, decides what the build puts in the plugin folder besides the bundle: the files of `node-hid` that run, and the licenses of everything the plugin ships. Changes to it are made in both.
- `scripts/check-ui.mjs` guards the settings pages (see [Supply chain](#supply-chain)). It's the Litra plugin's, pointed at this plugin folder, and changes to it are made in both. The scripts' tests sit next to them (`check-ui.test.ts`), and run each script with Node, as CI does, in a temporary folder that holds the files it checks (`src/test-support/script-folder.ts`).
- `scripts/generate-icons.mjs` renders the plugin's icons from the glyphs of `@daczarne/streamdeck-icons` (`daczarne/streamdeck-icons`), as the Litra plugin's does: the MX Master 3S pack's mouse, filled for the category and marketplace icons and the key, centered on the key and small enough to leave room for its title, and outlined for Set Host's icon, and the battery, empty, for Battery's icon and its key's image until the plugin draws its own. The pack's host numbers are drawn from a font the package doesn't ship, so the Set Host key's title names its host instead. The Battery key is drawn while the plugin runs, from the package's glyphs, palette and figures, so the package is a runtime dependency, bundled into the plugin, as in the Litra plugin. A change to a glyph is made there, then taken here by updating the commit the dependency is pinned to and regenerating the icons.
- `scripts/probes/` holds scripts that talk to the mouse through Bolt receivers, run by hand: reading what the plugin needs, switching the host, pairing a receiver without Logitech's software, and reading the battery. Its README describes how to run them and read their output. They share `hidpp.mjs`, whose requests `src/mouse.ts` sends too, asynchronously, and write what they find to a file in `scripts/probes/out/`, one per run, which git ignores (`report.mjs`).
- `docs/` holds the documents listed in [Read before changing things](#read-before-changing-things).

## Commands

```shell
n auto                    # switch to the Node version in .node-version, and the npm that ships with it
npm ci --ignore-scripts   # install from the lockfile, without install scripts
npm run build             # bundle src/ into the plugin folder
npm run check:ui          # ui/*.html: no remote resources, CSP on every page; vendored file matches its hash
npm run validate          # check:ui, build, streamdeck validate
npm run pack              # check:ui, build, write release/com.daczarne.mx3s.streamDeckPlugin
npm run icons             # regenerate the icons in imgs/ from scripts/generate-icons.mjs
npm run link              # link the plugin folder into Stream Deck
npm run watch             # rebuild and restart the plugin on change
npm run typecheck         # type-check the sources, and the build and check scripts
npm run lint              # Biome: lint rules, formatting and import order, without changing anything
npm run format            # Biome: apply the formatting and the import order
npm test                  # run the unit tests
```

## Runtime and toolchain

- The plugin runs on Node 24, set by `Nodejs.Version` in `manifest.json`. Stream Deck downloads that runtime into `~/Library/Application Support/com.elgato.StreamDeck/NodeJS/`, whose `manifest.json` lists the exact version (24.22.1 when this was written). A plugin keeps the runtime it started with, so a new one reaches it only on its next restart. `tsconfig.json` extends `@tsconfig/node24`, and `@types/node` is the newest version whose minor doesn't go past that runtime's (24.19 for 24.22), since its minor versions don't follow Node's one for one, and it follows the runtime, not the Node used to build.
- The Node and the npm used to build are pinned in `devEngines` in `package.json` (24.22.1 and 11.19.1, the npm that ships with it), which makes npm refuse any other, to install or to run a script. Node's version is also in `.node-version`, which `n auto` switches to, with its npm, and which CI reads.
- The repo pins TypeScript 6.0, which no longer loads `@types/*` automatically, hence `"types": ["node"]` in `tsconfig.json`. `.vscode/settings.json` points the editor at the repo's TypeScript, so the editor and the build check types with the same version.
- `tsconfig.json` adds the Litra plugin's stricter checks to `strict`, such as `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. `tsconfig.scripts.json` extends it to check, as JavaScript, `rollup.config.mjs`, the Vitest config and the scripts, `generate-icons.mjs` included, which takes the glyphs' types from the declarations `@daczarne/streamdeck-icons` ships, and with them the scripts' tests, which import the scripts they test. `tsconfig.json` doesn't allow JavaScript: Rollup's TypeScript plugin reads it, and would start processing JavaScript in the build. `npm run typecheck` runs both configs.
- Biome lints and formats the TypeScript and JavaScript, from `biome.json`, with the same version and settings as the Litra plugin. Its config has to stay at the repository root: from anywhere else, its type-aware rules, such as `noFloatingPromises`, report nothing, without a warning.
- `node-hid` ships native binaries, so Rollup keeps it external and `copyNativeRuntime` in `rollup.config.mjs` copies the files of it and of `pkg-prebuilds` that run on macOS and Windows into the plugin folder, from the list in `scripts/package-files.mjs`. The build stops when a listed file is missing. A linked plugin also finds the repo's top-level `node_modules`, so a package left off the list breaks only an installed plugin, which the checks on every release catch.

## Supply chain

Supply-chain risk is a hard requirement here:

- No remote code. The settings pages load `sdpi-components` from `ui/vendor/`, pinned by hash in `scripts/check-ui.mjs`. The "Third-party code" section of `README.md` describes how to update it. Never install `sdpi-components` from npm: that package belongs to an unrelated maintainer.
- Each settings page declares a Content-Security-Policy, which `scripts/check-ui.mjs` also holds and checks. It allows scripts only from the plugin folder and connections only to Stream Deck's WebSocket on `localhost`, so inline scripts are blocked: page logic goes in a `.js` file in `ui/`. The "Settings pages" section of `README.md` explains each directive. A change to the policy updates every page, the check and that section.
- Install with `--ignore-scripts`, pin versions, and prefer local copies with recorded hashes. Flag any new dependency, remote resource or broad OS permission, and offer a narrower alternative.
- Node and npm are pinned in `devEngines`, npm at the version that ships with that Node, so neither is installed on its own. npm packages and GitHub Actions are pinned to exact versions, and `@daczarne/streamdeck-icons` to a commit. Each upgrade is its own change: see the "Dependencies" section of `docs/contributing.md`.
- No macOS permission is asked for on behalf of the Stream Deck app (see [How the mouse is reached](#how-the-mouse-is-reached)).

## How the mouse is reached

The mouse is reached through a Logi Bolt receiver, one per host, paired with the mouse on that host's Easy-Switch channel. Probes run by hand read the mouse's current host, switched it, and read its battery this way on macOS, with no permission:

1. Find the HID++ channel of each Bolt receiver plugged in: vendor `0x046d`, product `0xc548`, usage page `0xff00`, listed once per report length, with usage 1 for short reports and 2 for long ones. On macOS, both are the same device path. On Windows, they're two, which differ only in their collection (`&Col01`, `&Col02`) and in the last number of their instance: requests are written to the short one, and replies come on either, so both are opened and read. Read each receiver's pairing information (register `0xB5`, sub-register `0x50` + slot) for the slot that holds the mouse, product `0xb034`. The slot is the device index of every request to the mouse.
2. Ask IRoot (feature index `0x00`, function 0, `getFeature`) for the index of feature `0x1814`, CHANGE_HOST. The index differs per device, so it's never hard-coded.
3. CHANGE_HOST function 0, `getHostInfo`, answers the number of hosts and the current one, counted from 0.
4. CHANGE_HOST function 1, `setCurrentHost`, takes a host counted from 0. The mouse leaves at once, so no reply comes.
5. The battery is read the same way, through feature `0x1004`, UNIFIED_BATTERY, whose index IRoot gives too: its function 1, `getStatus`, answers the percentage, the level as one bit (`0x08` full, `0x04` good, `0x02` low, `0x01` critical), the charging state (`0x00` discharging and `0x01` charging, as measured, then `0x02` charged and `0x03` charging slowly, as Solaar reads them) and whether the mouse is on external power. The mouse also sends the same four bytes on its own when its cable is plugged in or out, which the plugin doesn't listen for.

Requests are HID++ short reports of 7 bytes: `0x10`, the device index, the feature index, `(function << 4) | softwareId`, then the parameters. A mouse connected over Bluetooth or USB would take `0xff` as its device index, on usage page `0xff43`. A receiver also pairs a new device through its HID++ channel, without Logitech's software: `scripts/probes/README.md` describes how. Solaar is the best open reference for HID++ 2.0 features and for Bolt pairing.

What shapes the design:

- **Input Monitoring.** Over Bluetooth, all of the mouse's HID collections, the pointer and the HID++ channel, share one device path, and opening it needs Input Monitoring, which a plugin would hold as the Stream Deck app's, for every plugin it runs. A Bolt receiver keeps its HID++ channel on a device path of its own, which opens with no permission. So the plugin reaches the mouse only through receivers, and asks for no permission ([#3]).
- **Reaching the mouse takes time.** The receiver answers in a few milliseconds, but the first request to a mouse at rest takes up to about 1.2 s, measured with `scripts/probes/battery.mjs`, since the request has to wake it: every request after it takes about 20 ms. A mouse that the receiver doesn't reach, such as one on another host, gets the receiver's error `0x04` at once, rather than no reply.
- **One way from each computer.** Once a computer sends the mouse to another host, it can't call it back. A key sends the mouse to a given host: a toggle can't work. The mouse comes back with its own button, or from the other host.

## Testing on the hardware

- Build, enable developer mode (`npx streamdeck dev`), `npm run link`, then `npx streamdeck restart com.daczarne.mx3s`. The actions appear under the plugin's category. Developer mode stays on. A change to `manifest.json` takes effect only once Stream Deck itself is quit and reopened, so mention it whenever a branch changes the manifest.
- Plugin logs are in `com.daczarne.mx3s.sdPlugin/logs/`, newest in `mx3s.log`, which tells each press, each read of the battery, the paths of the receivers each one opens, and what came of it. The SDK's own `com.daczarne.mx3s.<n>.log` files there hold what the SDK reports itself, such as an uncaught exception. Stream Deck's own log, `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`, records what it refuses from the plugin.
- Switching the host moves the mouse away from the computer running the test. Say so before asking for a check that does it, and how to bring the mouse back.
- The probes in `scripts/probes/` reach the mouse through Bolt receivers, and need no permission. Never ask for Input Monitoring, for a probe or for the Stream Deck app.
- Claude can't see the Deck. The user checks what the keys show, and can share a photo of them.

## Workflow

`docs/contributing.md` describes branches, pull requests and tests. On top of it:

- Create branches with `git switch -c`.
- Commit messages explain the why and end with the `Co-Authored-By` trailer for Claude. Commit only when asked.
- `.github/workflows/main.yaml` labels pull requests from `.github/labeler.yaml`, and runs Markdown lint, CSpell, the type check, Biome, a regeneration of the icons that must change nothing, the unit tests and `npm run validate` on every pull request and on `main`. On `main`, once every check has passed, its last job drafts a release when the version is new (see `docs/releases.md`). Locally, the same checks run in two parts: `/lint` runs the linters (everything but the tests), `/test` runs the tests, and `/ci` runs both.
- Write the pull request title and description with the `pr-description` skill.
- Draft issues with the `github-issues` skill, and post them only when asked.

## Style

`docs/style_guide.md`, `.editorconfig`, `biome.json`, the Markdown lint configuration and CSpell (with the dictionaries in `.cspell/`) are the authority on style.

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
