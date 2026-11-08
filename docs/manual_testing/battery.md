# Testing the Battery key

- [When to run these checks](#when-to-run-these-checks)
- [Setup](#setup)
- [Checks](#checks)

The unit tests check against emulated receivers how the plugin reads the battery, through which feature and with which request, and what it makes of each level and charging state. They also check against a fake Stream Deck which image each reading draws on the keys, on the background and with the mouse, the battery and the bolt each key's settings choose, that a press and the 10-minute timer read the battery again, that the timer stops once no key is shown, and that a mouse that doesn't answer greys the last reading out, and against the settings page's HTML that it shows the plugin's default background, mouse, battery and bolt, and heads each section and ends it with a Reset button, and that the controls its script greys out are on the page. The checks below cover what they take for granted: that the mouse answers as the probe measured it, that Stream Deck draws the image the plugin sends, at every key size, that the key follows the mouse as it charges, leaves and comes back, and that the settings page, which no test loads, saves what it shows.

## When to run these checks

- After a change to `src/battery.ts`, `src/mouse.ts`, `src/actions/battery.ts` or `src/actions/battery-image.ts`, to the key's images or to its settings page.
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
4. **The bolt follows the cable.** Plug the mouse's USB-C cable in, and press the key: a bolt shows on its right, green on a key as placed, and the log's last line says `charging`. Unplug the cable, and press the key again: the bolt is gone, and the line says `not charging`.
5. **The key greys out when the mouse is elsewhere.** Send the mouse to another host with its own button, then press the key: it shows the last reading, mouse and all, in grey, and the log ends with `No receiver reaches the MX Master 3S`. Bring the mouse back, and press the key: its colors come back.
6. **The key shows dashes before the first reading.** Unplug this computer's receiver, and restart the plugin: the key shows the mouse and an empty battery in grey, with three dashes, and the log says `No Logi Bolt receiver found`. Plug the receiver back in, and press the key: it shows the reading.
7. **The key reads again every 10 minutes.** Leave the key shown, without pressing it, for a little over 10 minutes: the log has a new `Read the MX Master 3S's battery` line about 10 minutes after the one before.
8. **Every key shows the same reading, and none reads while none is shown.** With two Battery keys shown, press one: both show the new reading, and the log has one `Read` line. Switch to a profile or page with no Battery key for a little over 10 minutes: the log has no `Read` line in that time.
9. **Each key keeps the background it chooses.** On a key's settings page, the background shows the charcoal of the key as placed, with **None** beside it on the same row. Pick another color: the key takes it once the picker closes, and the log has no new `Read` line. Check **None**: the key turns black behind the mouse, the battery and the percentage, whatever the color picked, and back to that color once unchecked. Another Battery key keeps its own background throughout, and both keep theirs through the next press and across a restart of the plugin.
10. **Each key keeps the mouse it chooses.** On a key's settings page, **Mouse icon** shows **Show** checked, with **Filled** chosen beside it, and under them the white of the key as placed, with **Follow battery level** beside it, greyed out. Choose **Outlined**: the mouse turns to its outline. Pick another color: the mouse takes it once the picker closes, and the log has no new `Read` line. Uncheck **Show**: the mouse goes, and the battery, the bolt and the percentage stay where they were. **Follow battery level** can't be checked. Send the mouse to another host and press the key: a mouse given a color turns grey with the rest of the key. Another Battery key keeps its own mouse throughout, and both keep theirs across a restart of the plugin.
11. **Each key keeps the battery it chooses.** On a key's settings page, **Battery icon** shows **Show** checked, and under it a green color picker with **Follow battery level** checked beside it, both greyed out: neither can be changed. Uncheck **Show**: the battery goes, and the mouse, the bolt and the percentage stay where they were, and the log has no new `Read` line. Check it again: the battery comes back, in its level's color. Another Battery key keeps its own battery throughout, and both keep theirs across a restart of the plugin.
12. **Each key keeps the bolt it chooses.** On a key's settings page, **Bolt icon** shows **Charging** chosen, between **Always** and **Never**, on one line, and under it, **Charging** shows the green of the key's bolt, with **Follow battery level** beside it, unchecked and greyed out, and **Not charging** a dim slate, greyed out until **Always** is chosen. With the cable unplugged, choose **Always**: a slate bolt shows on the right. Plug the cable in, and press the key: the bolt turns green. Pick another color under **Charging**: the bolt takes it once the picker closes, without a new `Read` line. Unplug the cable, press the key, and pick another color under **Not charging**: the bolt takes it. Choose **Never**: the bolt goes, whether the cable is plugged in or not, and the mouse, the battery and the percentage stay where they were. Send the mouse to another host and press the key: a bolt that shows turns grey with the rest of the key. Another Battery key keeps its own bolt throughout, and both keep theirs across a restart of the plugin.
13. **Each section resets its own settings.** On a key's settings page, the sections are headed **Background**, **Mouse icon**, **Battery icon** and **Bolt icon**, each with a line under its heading and a **Reset** button at its end, and only **Charging** and **Not charging** have labels on the left. In each section, change every setting that isn't greyed out, such as a color picked by hand, then press its **Reset**: the section's controls show their defaults again, the picker's color included, the key redraws as placed for that section, and the other sections keep what they were given. Reopen the page by selecting another key and this one again: it still shows the defaults.
14. **Settings that change nothing grey out.** On a key's settings page, check **None** under **Background**: the color picker greys out, and comes back once it's unchecked. Uncheck **Show** under **Mouse icon**: **Filled**, **Outlined** and the color picker grey out. Under **Bolt icon**, with **Charging** chosen, **Not charging** is greyed out. Choose **Always**: both colors can be picked. Choose **Never**: both grey out. With a section's choice off, press its **Reset**: its settings come back, no longer greyed out. Leave the mouse hidden and the bolt on **Never**, select another key and this one again: the page opens with them greyed out. The **Follow battery level** checkboxes and the battery's color stay greyed out throughout.

[probes]: ../../scripts/probes/README.md
