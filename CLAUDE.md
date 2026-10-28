# CLAUDE.md

- [Project](#project)
- [Read before changing things](#read-before-changing-things)
- [Where the repository starts](#where-the-repository-starts)
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

The plugin is made and checked on macOS, with a Stream Deck + XL running Stream Deck 7.6, and an MX Master 3S connected directly over Bluetooth. The manifest also lists Windows 10, where the plugin isn't checked, so a change shouldn't assume macOS without saying why. It needs neither Logi Options+ nor G HUB, and is checked without them installed.

The plugin isn't released. Development runs linked from the repo, never installed, so the Deck runs whatever is built from the checked-out branch: a change takes effect on the next build and restart.

## Read before changing things

- `docs/contributing.md`: how work is done here. Changes go through pull requests, features come with their tests, dependencies are pinned, and unused code is removed. This file only adds what is specific to Claude.
- `docs/style_guide.md`: the conventions the linters don't enforce (see [Style](#style)).
- The Litra plugin's `docs/elgato_sdk/`: what the Stream Deck SDK offers and what it doesn't, checked against Stream Deck 7.6, and its `docs/architecture.md`, on why it reaches its lamps through `node-hid` the way it does. Read them before designing how an action behaves on the Deck. What this plugin finds out that is specific to it goes into this repository's `docs/`.

## Where the repository starts

The repository was scaffolded with `streamdeck create`, and the rules below describe where it is going, not every file in it yet. What the template left behind is removed as the plugin takes shape, never copied into new code:

- The Counter action (`src/actions/increment-counter.ts`, its images in `imgs/actions/counter/` and its settings page `ui/increment-counter.html`) is the template's sample, and goes when the first real action arrives. So do the template's comments in `src/plugin.ts`, and its `trace` log level, which logs every message between Stream Deck and the plugin.
- There are no tests yet. The first feature that needs them brings Vitest and the test setup, following the Litra plugin's, along with the tests of `scripts/check-ui.mjs` that the Litra plugin has.

## Layout

- `src/plugin.ts` registers the actions, and `src/actions/` holds them.
- `com.daczarne.mx3s.sdPlugin/` is the plugin folder: `manifest.json`, the settings pages in `ui/` (with the vendored `sdpi-components` in `ui/vendor/`), and the images in `imgs/`. `bin/`, the bundle Rollup writes, and `logs/`, are build and run output, and aren't committed.
- `rollup.config.mjs` bundles `src/` into `bin/plugin.js`.
- `scripts/check-ui.mjs` guards the settings pages (see [Supply chain](#supply-chain)). It's the Litra plugin's, pointed at this plugin folder, and changes to it are made in both.
- `scripts/generate-icons.mjs` renders the plugin's icons from the glyphs of `@daczarne/streamdeck-icons` (`daczarne/streamdeck-icons`), as the Litra plugin's does: so far the category and marketplace icons, the MX Master 3S pack's mouse, filled. The action images in `imgs/` are still the template's. A change to a glyph is made there, then taken here by updating the commit the dependency is pinned to and regenerating the icons.
- `docs/` holds the documents listed in [Read before changing things](#read-before-changing-things).

## Commands

```shell
n auto                    # switch to the Node version in .node-version, and the npm that ships with it
npm ci --ignore-scripts   # install from the lockfile, without install scripts
npm run build             # bundle src/ into the plugin folder
npm run check:ui          # ui/*.html: no remote resources, CSP on every page; vendored file matches its hash
npm run validate          # check:ui, build, streamdeck validate
npm run icons             # regenerate the icons in imgs/ from scripts/generate-icons.mjs
npm run link              # link the plugin folder into Stream Deck
npm run watch             # rebuild and restart the plugin on change
npm run typecheck         # type-check the sources, and the build and check scripts
npm run lint              # Biome: lint rules, formatting and import order, without changing anything
npm run format            # Biome: apply the formatting and the import order
```

## Runtime and toolchain

- The plugin runs on Node 24, set by `Nodejs.Version` in `manifest.json`. Stream Deck downloads that runtime into `~/Library/Application Support/com.elgato.StreamDeck/NodeJS/`, whose `manifest.json` lists the exact version (24.13.1 when this was written). `tsconfig.json` extends `@tsconfig/node24`, and `@types/node` follows that runtime's minor version (24.13), not the Node used to build.
- The Node and the npm used to build are pinned in `devEngines` in `package.json` (24.22.1 and 11.19.1, the npm that ships with it), which makes npm refuse any other, to install or to run a script. Node's version is also in `.node-version`, which `n auto` switches to, with its npm, and which CI reads.
- The repo pins TypeScript 6.0, which no longer loads `@types/*` automatically, hence `"types": ["node"]` in `tsconfig.json`. `.vscode/settings.json` points the editor at the repo's TypeScript, so the editor and the build check types with the same version.
- `tsconfig.json` adds the Litra plugin's stricter checks to `strict`, such as `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. `tsconfig.scripts.json` extends it to check, as JavaScript, `rollup.config.mjs` and the scripts, `generate-icons.mjs` included, which takes the glyphs' types from the declarations `@daczarne/streamdeck-icons` ships. `tsconfig.json` doesn't allow JavaScript: Rollup's TypeScript plugin reads it, and would start processing JavaScript in the build. `npm run typecheck` runs both configs.
- Biome lints and formats the TypeScript and JavaScript, from `biome.json`, with the same version and settings as the Litra plugin. Its config has to stay at the repository root: from anywhere else, its type-aware rules, such as `noFloatingPromises`, report nothing, without a warning.
- `node-hid` ships native binaries, so when it arrives, Rollup keeps it external and the build copies the files of it that run next to the bundle, as the Litra plugin's `rollup.config.mjs` and `scripts/package-files.mjs` do.

## Supply chain

Supply-chain risk is a hard requirement here:

- No remote code. The settings pages load `sdpi-components` from `ui/vendor/`, pinned by hash in `scripts/check-ui.mjs`. The "Third-party code" section of `README.md` describes how to update it. Never install `sdpi-components` from npm: that package belongs to an unrelated maintainer.
- Each settings page declares a Content-Security-Policy, which `scripts/check-ui.mjs` also holds and checks. It allows scripts only from the plugin folder and connections only to Stream Deck's WebSocket on `localhost`, so inline scripts are blocked: page logic goes in a `.js` file in `ui/`. The "Settings pages" section of `README.md` explains each directive. A change to the policy updates every page, the check and that section.
- Install with `--ignore-scripts`, pin versions, and prefer local copies with recorded hashes. Flag any new dependency, remote resource or broad OS permission, and offer a narrower alternative.
- npm packages and GitHub Actions are pinned to exact versions, and `@daczarne/streamdeck-icons` to a commit. Each upgrade is its own change: see the "Dependencies" section of `docs/contributing.md`.
- No macOS permission is asked for on behalf of the Stream Deck app (see [How the mouse is reached](#how-the-mouse-is-reached)).

## How the mouse is reached

A proof of concept, run by hand from Terminal, read the mouse's current host and switched it, over Bluetooth on macOS:

1. Find the HID interface with vendor `0x046d`, product `0xb034` (the MX Master 3S over Bluetooth), usage page `0xff43` and usage `0x0202`, Logitech's HID++ channel.
2. Ask IRoot (feature index `0x00`, function 0, `getFeature`) for the index of feature `0x1814`, CHANGE_HOST. The index differs per device, so it's never hard-coded.
3. CHANGE_HOST function 0, `getHostInfo`, answers the number of hosts and the current one, counted from 0.
4. CHANGE_HOST function 1, `setCurrentHost`, takes a host counted from 0. The mouse leaves at once, so no reply comes.

Messages are HID++ long reports of 20 bytes: `0x11`, the device index, the feature index, `(function << 4) | softwareId`, then the parameters. The device index is `0xff` for a mouse connected directly over Bluetooth or USB. Through a Bolt receiver it would be the receiver's slot, and the product would be the receiver's. Solaar's `change-host` setting is the best open reference for HID++ 2.0 features.

What shapes the design:

- **Input Monitoring.** Over Bluetooth, all of the mouse's HID collections, the pointer and the HID++ channel, share one device path. Opening the HID++ channel opens the whole device, which macOS allows only to an app with Input Monitoring. A plugin's permission is the Stream Deck app's, and granting it there would let every plugin read keystrokes system-wide, which isn't acceptable. Finding a way around it comes before any action that opens the mouse on macOS: [#3] holds the options, and where each one stands.
- **One way from each computer.** Once a computer sends the mouse to another host, it can't call it back. A key sends the mouse to a given host: a toggle can't work. The mouse comes back with its own button, or from the other host.

## Testing on the hardware

- Build, enable developer mode (`npx streamdeck dev`), `npm run link`, then `npx streamdeck restart com.daczarne.mx3s`. The actions appear under the plugin's category. Developer mode stays on. A change to `manifest.json` takes effect only once Stream Deck itself is quit and reopened, so mention it whenever a branch changes the manifest.
- Plugin logs are in `com.daczarne.mx3s.sdPlugin/logs/`. Stream Deck's own log, `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`, records what it refuses from the plugin.
- Switching the host moves the mouse away from the computer running the test. Say so before asking for a check that does it, and how to bring the mouse back.
- A probe that opens the mouse over Bluetooth needs Input Monitoring for the app it runs from, granted only for the probe and revoked afterwards. Never ask for it to be granted to the Stream Deck app.
- Claude can't see the Deck. The user checks what the keys show, and can share a photo of them.

## Workflow

`docs/contributing.md` describes branches, pull requests and tests. On top of it:

- Create branches with `git switch -c`.
- Commit messages explain the why and end with the `Co-Authored-By` trailer for Claude. Commit only when asked.
- `.github/workflows/main.yaml` labels pull requests from `.github/labeler.yaml`, and runs Markdown lint, CSpell, the type check, Biome, a regeneration of the icons that must change nothing, and `npm run validate` on every pull request and on `main`. Locally, `/lint` runs the same checks. The tests join both when they arrive.
- Write the pull request title and description with the `pr-description` skill.
- Draft issues with the `github-issues` skill, and post them only when asked.

## Style

`docs/style_guide.md`, `.editorconfig`, `biome.json`, the Markdown lint configuration and CSpell (with the dictionaries in `.cspell/`) are the authority on style.

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
