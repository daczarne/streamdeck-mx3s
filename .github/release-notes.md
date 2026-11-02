# v@VERSION@

## Installing

Download `com.daczarne.mx3s.streamDeckPlugin` below and open it: Stream Deck installs the plugin, and its actions appear under the **MX Master 3S** category. It needs Stream Deck 7.1 or later, on macOS 12 or later or Windows 10 or later, and a Logi Bolt receiver on each computer, paired with the mouse on that computer's Easy-Switch channel. A newer release installs the same way, over the one installed, and the README's Installing section says how to remove it.

## Before installing

- The plugin is developed on macOS, with an MX Master 3S connected through Bolt receivers, and each release is installed from this page and checked on macOS and on Windows once it's published. What those checks find broken is fixed in a patch release.
- It reaches the mouse only through a Bolt receiver: a mouse connected over Bluetooth isn't supported. Other Logitech mice with Easy-Switch and Bolt may work, but the plugin isn't checked on any of them.
- If something doesn't work, an issue with the plugin's log helps. The logs are in the plugin's folder, newest in `mx3s.log`:
  - On macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.daczarne.mx3s.sdPlugin/logs/`
  - On Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\com.daczarne.mx3s.sdPlugin\logs\`

## Verifying the download

The file's SHA-256 is `@SHA256@`. To compare it with your download's:

- On macOS: `shasum -a 256 com.daczarne.mx3s.streamDeckPlugin`
- On Windows, in PowerShell: `Get-FileHash com.daczarne.mx3s.streamDeckPlugin`

The file was built by this repository's workflow, from the commit this release points to, which an attestation records. With the [GitHub CLI][gh], check it with:

```shell
gh attestation verify com.daczarne.mx3s.streamDeckPlugin --repo daczarne/streamdeck-mx3s
```

[gh]: https://cli.github.com
