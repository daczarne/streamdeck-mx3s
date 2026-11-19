# Testing

- [What runs where](#what-runs-where)
- [What a test stands on](#what-a-test-stands-on)
  - [Fakes](#fakes)
  - [Emulated receivers](#emulated-receivers)
- [Each layer's tests](#each-layers-tests)
  - [The mouse](#the-mouse)
  - [The settings and the image](#the-settings-and-the-image)
  - [The actions](#the-actions)
  - [The plugin, the logger and the scripts](#the-plugin-the-logger-and-the-scripts)
- [The browser tests](#the-browser-tests)
- [Writing a test](#writing-a-test)

This document describes how the plugin's tests are written: what each kind covers, what stands in for Stream Deck, `node-hid` and the mouse, and how a test is laid out. What a change has to bring with it is in "Features ship with tests" in [the contributing guide][contributing], and how the parts the tests cover fit together in [the architecture document][architecture].

## What runs where

- `npm test` runs the unit tests with Vitest, from `vitest.config.mjs`: every `*.test.ts` in `src/` and `scripts/`, next to the file it tests. They need nothing installed and nothing plugged in, and create no `logs/` folder.
- `npm run test:browser` runs the browser tests, in `browser-tests/`, from `vitest.browser.config.mjs`, apart from the unit tests, since they need Chrome (see [The browser tests](#the-browser-tests)).
- What only the Deck and the mouse can prove is checked by hand, following [the manual checks][manual-testing], one document per area. Each one starts by saying what the automated tests already cover, so its checks cover only what they take for granted.

CI runs both suites on every pull request, the browser tests in a job of their own.

The unit tests' config sets `mockReset`, so every mock starts each test afresh, with no calls recorded and no implementation left from the test before. A test gives a mock what it should answer in a `beforeEach` or in the test itself.

## What a test stands on

A unit test covers one module, with what it builds on replaced, so the test needs no Stream Deck, no receiver and no mouse, and nothing it does reaches them. What stands in for the real thing is named for what it stands in for (see "Features ship with tests" in [the contributing guide][contributing]): a fake for software, and an emulated device for hardware. What several tests share is in `src/test-support/`, and what one test needs alone, in that test.

A test replaces a module with `vi.mock`, at the top of its file, pointing it at the fake:

```ts
vi.mock("@elgato/streamdeck", () => import("../test-support/fake-stream-deck"));
vi.mock("../logging", () => import("../test-support/fake-logging"));
```

### Fakes

- `fake-stream-deck.ts` stands in for `@elgato/streamdeck`, which opens a connection to Stream Deck and creates a `logs/` folder on import. It gives the actions the SDK's base class and decorator, which sets the action's id from the manifest, as the SDK's does, fake keys, which record what the plugin tells them to show, and an entry point that connects to nothing and, like the SDK, refuses an action whose id `manifest.json` doesn't list.
- `fake-deck.ts` holds `FakeDeck`, which stands in for Stream Deck sending a key's events: it places keys for the actions it's given, sends each event to the action the key belongs to, by its id in the manifest, with the settings the key has saved, and waits for what the event sets off.
- `fake-logging.ts` stands in for `src/logging.ts`, which writes to a `logs/` folder. Every scope logs to the same mocks, so a test checks what was logged without knowing which scope logged it.
- `fake-node-hid.ts` stands in for `node-hid`, which loads its native binary on import and would reach the receivers plugged into the computer. It lists and opens the emulated receivers a test plugs in with `connect`, records every call made on them, which `hidEvents` returns, and can fail to list the devices (`failListingDevices`).

### Emulated receivers

`emulated-receiver.ts` holds `EmulatedReceiver`, a Logi Bolt receiver and the devices paired with it, as the probes in `scripts/probes/` measured them. It answers the HID++ requests the plugin sends, on its HID++ channel, and passes the ones addressed to a slot on to the device paired there. Only the registers and features the plugin uses are emulated, with the replies and the errors the probes saw.

- A receiver is plugged into macOS, by default, or Windows, and lists its HID++ channel as that system does: one path that carries reports of both lengths, or two, one per length, each carrying only its own.
- `pair` pairs a device in a slot: by default the mouse, connected, on host 1 of 3, at 95%, full and not charging, as the MX Master 3S measured. A test changes what it needs, such as a device that isn't connected, which answers with an error, as on another host, or not at all.
- A receiver can fail to open, answer nothing, or send a notification before the next reply, as when a device connects meanwhile.
- The mouse leaves the receiver once it's sent to another host, as it does, so a test sees what the plugin does next.

A test that runs the code that talks to the mouse runs it against emulated receivers, so it checks what the plugin writes and what it makes of each reply, as it would against the real ones. Anything the receivers do that the emulation doesn't is measured with a probe first, then added to it.

## Each layer's tests

### The mouse

`connection.test.ts`, `host.test.ts` and `battery.test.ts` run the real modules, with `node-hid` replaced by the fake and the receivers emulated. `connection.test.ts` runs `reachMouse` with operations of its own, and checks how it finds the mouse, through which receiver and in which slot, on macOS and on Windows, what it does when no receiver reaches the mouse, and that operations run one at a time and close what they open. `host.test.ts` and `battery.test.ts` check the requests each feature sends, from the reports written to the receiver, and what each reply comes to, returned and logged.

### The settings and the image

`schemas.test.ts` checks each setting's default, the values it takes, and the warning for a value it doesn't, and reads the Battery page's HTML to check that its defaults are the plugin's. `battery-image.test.ts` checks the SVG a reading and a style draw: the colors it holds, and the glyphs it places, drawn by `@daczarne/streamdeck-icons` as the test expects them.

### The actions

An action's test replaces the SDK, the logger and the mouse module it calls, such as `readBattery`, with a mock whose answer each test sets, and drives the action through a `FakeDeck`: it places keys, presses them and changes their settings, and checks what each key was told to show. The image a Battery key is set to is compared with the one `batteryImage` draws for the reading and the style expected, so the action's tests check which reading and style it draws, and the image's tests how they're drawn.

The Battery key's 10-minute timer runs on Vitest's fake timers, which a test moves forward with `vi.advanceTimersByTimeAsync`, so it checks a read every 10 minutes without waiting for one.

### The plugin, the logger and the scripts

- `plugin.test.ts` starts `plugin.ts` afresh for every test, after `vi.resetModules()`, as Stream Deck starts the plugin, and checks that it registers every action the manifest lists, and logs a failure to connect.
- `logging.test.ts` runs `RotatingFileTarget` in a temporary folder, and checks how it writes and rotates the files.
- The scripts' tests run each script with Node, as CI does, in a temporary folder that holds the files it checks (`script-folder.ts`), and check its exit code and output.

## The browser tests

The browser tests load each settings page from the plugin folder in a headless Chrome, which `browser-tests/support/chrome.ts` drives over a pipe rather than a debugging port, so nothing else on the computer can connect to it. `browser-tests/support/fake-stream-deck.ts` stands in for Stream Deck's WebSocket: it records what a page sends, and sends a page its settings.

They check each page under its Content-Security-Policy, which refuses anything remote and any inline script or style, the controls each page shows, that each control's default and values are ones the plugin takes, by reading them against the schemas in `src/settings/schemas.ts`, which warn of a value they don't take, the settings a page sends, and the Battery page's script: what it greys out, its Reset buttons and the levels it writes out. Chrome is found at `CHROME_PATH`, or where macOS or Linux usually install it.

## Writing a test

- A test file has a `//* Fakes` section, with its mocks and the helpers that set them up, and a `//* Tests` section, with a `describe` for each function or class it tests. Fixtures that several tests share can go in a section of their own.
- A test's name says what the code does, as a sentence a reader understands without the code, such as "reports the mouse unreachable when no receiver reaches it".
- Each test sets up what it needs, and checks the outcome a user or the next module sees: what a key shows, what was written to a receiver, what was returned and logged. It doesn't check how the code got there.
- An element of an array is read with `at` from `src/test-support/at.ts`, which fails the test when it's missing, rather than with `!`.
- Helpers have doc comments, like every function (see [the style guide][style-guide]).

[architecture]: architecture.md
[contributing]: ../contributing.md
[manual-testing]: manual_testing/
[style-guide]: style_guide.md
