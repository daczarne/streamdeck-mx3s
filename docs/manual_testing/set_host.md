# Testing Set Host

- [When to run these checks](#when-to-run-these-checks)
- [Setup](#setup)
- [Checks](#checks)

The unit tests check against emulated receivers, listed as macOS and as Windows list them, how the plugin finds the mouse, through which receiver and in which slot, asks it for its hosts, and sends it to another, and what it reports and logs when no receiver reaches it. They also check against a fake Stream Deck that a key's title shows its host, and that a press shows a check mark or an alert from what came of it. The checks below cover what they take for granted: that the receivers answer as the probes measured them, that Windows lists a receiver's HID++ channel as the emulation does, that the plugin, as Stream Deck starts it, opens a receiver with no permission, that the mouse goes where it's sent, and that Stream Deck shows what the plugin sets.

## When to run these checks

- After a change to `src/mouse.ts` or `src/actions/set-host.ts`, to the key's images or its settings page.
- After an upgrade of `node-hid`, `@elgato/streamdeck` or `@elgato/utils`.
- After a Stream Deck or macOS update.

## Setup

The mouse is paired with a Logi Bolt receiver on each host it switches between (see [the probes' README][probes]), and is on the channel of the computer the Deck is on, whose receiver is plugged in. Place three Set Host keys on the Deck, and choose host 1, 2 and 3 on their settings pages. Build the branch and restart the plugin:

```shell
npm run build
npx streamdeck restart com.daczarne.mx3s
```

When the branch changes `manifest.json`, quit Stream Deck and open it again instead of restarting the plugin.

The key of another host sends the mouse away from this computer, which can't call it back: bring it back with the mouse's Easy-Switch button, pressed until it's on this computer's channel again. To read the end of the log:

```shell
tail -n 5 com.daczarne.mx3s.sdPlugin/logs/mx3s.log
```

## Checks

1. **The keys show their host.** Each key shows the mouse, white and centered on the key, with its host as the title under it, clear of the mouse: `Host 1`, `Host 2` and `Host 3`. The title shows on a key newly placed even when Stream Deck's default title style for keys hides titles. Choose another host with the radio buttons on a key's settings page: its title follows at once. A key given a title or an image of its own keeps it.
2. **The key of this computer's host leaves the mouse here.** Press the key of the host the mouse is on: it shows a check mark, and the pointer goes on moving. The log ends with `The MX Master 3S is already on host` and its number.
3. **The key of another host sends the mouse there.** Press another host's key: it shows a check mark, and the pointer stops moving here. On that host, the mouse moves the pointer. The log ends with `Sent the MX Master 3S from host`, the host it left and the one it went to. Bring the mouse back.
4. **No permission is asked for.** Through the checks above, macOS asks for none, and Stream Deck isn't listed in **System Settings › Privacy & Security › Input Monitoring**.
5. **A key alerts when the mouse is elsewhere.** Send the mouse to another host with its own button, then press any key: after a moment, it shows an alert, and the mouse stays where it is. The log ends with `No receiver reaches the MX Master 3S`. Bring the mouse back.
6. **A key alerts with no receiver.** Unplug this computer's receiver, and press any key: it shows an alert, and the log ends with `No Logi Bolt receiver found`. Plug the receiver back in, and press the key of the host the mouse is on: it shows a check mark again.
7. **The log carries on across restarts.** Restart the plugin and press a key: `mx3s.log` holds the earlier lines, then `Plugin started` and the new ones.

[probes]: ../../scripts/probes/README.md
