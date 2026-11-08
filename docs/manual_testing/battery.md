# Testing the Battery key

- [When to run these checks](#when-to-run-these-checks)
- [Setup](#setup)
- [Checks](#checks)

The unit tests check against emulated receivers how the plugin reads the battery, through which feature and with which request, and what it makes of each level and charging state. They also check against a fake Stream Deck which image each reading draws on the keys, that a press and the 10-minute timer read the battery again, that the timer stops once no key is shown, and that a mouse that doesn't answer greys the last reading out. The checks below cover what they take for granted: that the mouse answers as the probe measured it, that Stream Deck draws the image the plugin sends, at every key size, and that the key follows the mouse as it charges, leaves and comes back.

## When to run these checks

- After a change to `src/battery.ts`, `src/mouse.ts`, `src/actions/battery.ts` or `src/actions/battery-image.ts`, or to the key's images.
- After an update of `@daczarne/streamdeck-icons`, whose glyphs, palette and figures the key is drawn from.
- After an upgrade of `node-hid`, `@elgato/streamdeck` or `@elgato/utils`.
- After a Stream Deck or macOS update.

## Setup

The mouse is paired with a Logi Bolt receiver on each host it switches between (see [the probes' README][probes]), and is on the channel of the computer the Deck is on, whose receiver is plugged in. Place a Battery key on the Deck, and another on a Deck with smaller keys, if there's one. Build the branch, quit Stream Deck and open it again when the branch changes `manifest.json`, and otherwise restart the plugin:

```shell
npm run build
npx streamdeck restart com.daczarne.mx3s
```

To read the end of the log:

```shell
tail -n 5 com.daczarne.mx3s.sdPlugin/logs/mx3s.log
```

## Checks

1. **The key shows the battery.** As soon as it's placed, the key shows the mouse in white, the battery filled about as far as the percentage, and the percentage under them, centered, with no title. The battery and the percentage are green when the log's last `Read the MX Master 3S's battery` line says `full` or `good`, yellow for `low`, and red for `critical`, and the percentage is the log's.
2. **It reads on every key size.** On the smallest key placed, the percentage reads at a glance, and the mouse, the battery and the bolt stay apart. A percentage of 100, when the mouse is full, fits the key.
3. **A press reads the battery again.** Press the key: the log ends with `Key pressed`, then a new `Read the MX Master 3S's battery` line, and the key shows that reading.
4. **The bolt follows the cable.** Plug the mouse's USB-C cable in, and press the key: a green bolt shows on its right, and the log's last line says `charging`. Unplug the cable, and press the key again: the bolt is gone, and the line says `not charging`.
5. **The key greys out when the mouse is elsewhere.** Send the mouse to another host with its own button, then press the key: it shows the last reading, mouse and all, in grey, and the log ends with `No receiver reaches the MX Master 3S`. Bring the mouse back, and press the key: its colors come back.
6. **The key shows dashes before the first reading.** Unplug this computer's receiver, and restart the plugin: the key shows the mouse and an empty battery in grey, with three dashes, and the log says `No Logi Bolt receiver found`. Plug the receiver back in, and press the key: it shows the reading.
7. **The key reads again every 10 minutes.** Leave the key shown, without pressing it, for a little over 10 minutes: the log has a new `Read the MX Master 3S's battery` line about 10 minutes after the one before.
8. **Every key shows the same reading, and none reads while none is shown.** With two Battery keys shown, press one: both show the new reading, and the log has one `Read` line. Switch to a profile or page with no Battery key for a little over 10 minutes: the log has no `Read` line in that time.

[probes]: ../../scripts/probes/README.md
