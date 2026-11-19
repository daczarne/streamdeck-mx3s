# Testing the settings pages

- [When to run these checks](#when-to-run-these-checks)
- [Setup](#setup)
- [Opening a page in DevTools](#opening-a-page-in-devtools)
- [Checks](#checks)
- [Afterwards](#afterwards)

`npm run check:ui` checks that every settings page declares the plugin's Content-Security-Policy, links the pages' stylesheet, `ui/settings.css`, and has no inline script or style ([#33]). The browser tests (`npm run test:browser`) load every page under that policy on every pull request, in a headless Chrome, and check that it refuses anything remote and any inline script or style, and that each page takes its styles from the stylesheet. They run in Chrome, not in Stream Deck, whose own Chromium is older, so the checks below cover what only Stream Deck can prove: that it enforces the policy, that it allows the one `<style>` element sdpi-components adds to every page, by the hash of its text, and that the pages take their styles from the stylesheet.

## When to run these checks

- After a change to the pages' policy, to `ui/settings.css`, or to the vendored sdpi-components.
- After a Stream Deck update.

## Setup

Place a Set Host key and a Battery key on the Deck. Build the branch and restart the plugin:

```shell
npm run build
npx streamdeck restart com.daczarne.mx3s
```

## Opening a page in DevTools

A page that hits its policy shows nothing wrong on the panel, apart from missing or unstyled controls. The reason only shows in the page's console, in DevTools.

1. Open the debugging port, which developer mode alone doesn't, then quit and reopen Stream Deck:

    ```shell
    defaults write com.elgato.StreamDeck html_remote_debugging_enabled -bool YES
    ```

2. In Stream Deck, select the key to test, so its page exists.
3. In Chrome, open `chrome://inspect/#devices`, click **Configure…** next to **Discover network targets**, and add `localhost:23654`.
4. Under **Remote Target**, click **inspect** under the page's title, such as "MX Master 3S Battery".

Selecting another key replaces the page, so each key needs its own click on **inspect**.

> [!WARNING]
> Don't use the links on `http://localhost:23654/`. They open a DevTools frontend served from `chrome-devtools-frontend.appspot.com`, which is remote code driving the debugging port. The DevTools behind `chrome://inspect` ship with Chrome.

## Checks

1. **Stream Deck enforces the policy.** On the Set Host key's page, then on the Battery key's:
    - The console shows no red errors after the page loads. A Chromium that doesn't understand a directive of the policy says so there.
    - The panel's background is sdpi-components' dark grey: its own style applies, which the policy allows by its hash.
    - Pasting `document.body.setAttribute("style", "background: red")` into the console leaves the panel grey, and logs a red `Refused to apply inline style because it violates the following Content Security Policy directive`.
    - Pasting `fetch("https://example.com")` into the console logs a red `Refused to connect to ... because it violates the following Content Security Policy directive: "connect-src ws://localhost:*"`. Nothing goes out on the network, so this is safe with Wi-Fi on.
    - In the Elements panel, `<head>` holds `<link rel="stylesheet" href="settings.css">`, and one `<style>` element, sdpi-components'.
2. **The Battery page takes its styles from the stylesheet.** Its settings sit in rows, such as a color picker beside the controls that go with it, under section headings with a line under each, as checks 9, 13 and 15 of [the Battery checks][battery] describe.

## Afterwards

Close the debugging port, then quit and reopen Stream Deck:

```shell
defaults delete com.elgato.StreamDeck html_remote_debugging_enabled
```

Remove `localhost:23654` from the targets in `chrome://inspect` too.

> [!WARNING]
> The port has no authentication: while it's open, any process on the computer can connect to it and run code in the pages.

[#33]: https://github.com/daczarne/streamdeck-mx3s/issues/33
[battery]: battery.md
