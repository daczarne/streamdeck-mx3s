# User guide

- [How the plugin reaches the mouse](#how-the-plugin-reaches-the-mouse)
- [Set Host](#set-host)
- [Battery](#battery)
  - [What the key shows](#what-the-key-shows)
  - [When it reads the battery](#when-it-reads-the-battery)
  - [The background and the icons](#the-background-and-the-icons)
  - [Battery level](#battery-level)
  - [Mouse not found](#mouse-not-found)
- [When something doesn't work](#when-something-doesnt-work)

This guide describes how to use the plugin once it's installed (see [the README][installing]): what each key does, and what its settings page changes.

## How the plugin reaches the mouse

The plugin reaches the mouse through the Logi Bolt receiver plugged into the computer it runs on, paired with the mouse on that computer's Easy-Switch channel (see [Requirements][requirements]). While the mouse is on another host, no receiver on this computer reaches it, so the keys can neither send it anywhere nor read its battery.

Once a computer sends the mouse to another host, it loses the mouse and can't call it back. A key sends the mouse to one host, so a key that toggles between two can't work. The mouse comes back with its own button, or from the other host. A Set Host key on each computer for each of the other hosts lets the mouse be sent from any of them to any other.

## Set Host

A Set Host key sends the mouse to the host it's set to, chosen on its settings page, from 1 to 3, as numbered on the mouse. The key shows the mouse, and its host as its title, such as `Host 2`, until it's given a title of its own. The MX Master 3S icon pack in [`streamdeck-icons`][streamdeck-icons] has images for the hosts' keys, with each host's number on the mouse.

On a press, the key shows a check mark once the mouse is on its way, or already on that host, and an alert when it can't send it (see [When something doesn't work](#when-something-doesnt-work)).

## Battery

### What the key shows

A Battery key shows how full the mouse's battery is, as a percentage, with the mouse and a battery filled as far across the top. The percentage, and by default the battery, take the color of the level the percentage is at: green from 40%, yellow from 15%, and red below that. By default, a bolt shows next to the battery, pink while the mouse is on its cable, charging or charged, and a dim slate while it isn't.

Every Battery key shows the same reading, and the plugin draws the whole key, so it has no title.

### When it reads the battery

The key reads the battery when it appears, when it's pressed, and every 10 minutes while it's shown. Every read reaches the mouse through the receiver, as Set Host does, and wakes it if it's at rest. When the mouse doesn't answer, such as when it's on another host, the key shows, by default, the mouse and the last reading's percentage in grey. Until the plugin has read the battery once, it shows the mouse and dashes, in grey, by default too (see [Mouse not found](#mouse-not-found)).

### The background and the icons

The key's settings page has a section for each part of the key, with a Reset button at its end that brings the section's settings back to their defaults. A change shows on the key as soon as it's chosen, without reading the battery again. A setting that changes nothing while its section's choice is off is greyed out.

- **Background**: the palette's charcoal tile until another color is picked, or **None**, which leaves the key black behind the mouse, the battery, the bolt and the percentage. Its color is greyed out while **None** is checked.
- **Mouse icon**: shown or not, which leaves the battery and the bolt where they are, filled or outlined, and its color, white until another is picked, or the color of the battery's level, with **Follow battery level**.
- **Battery icon**: shown or not, and its color: its level's, until **Follow battery level** is unchecked, and then the one picked, green until another is.
- **Charging icon**: when the bolt shows, always, which is the default, only while the mouse charges, or never. Its color while charging is a bright pink until another is picked, or its level's, with **Follow battery level**. A bolt shown always also has a color while not charging, a dim slate, which is greyed out while it shows otherwise.

An icon's settings are greyed out while it isn't shown, the bolt's while it never shows, and so is an icon's color while it follows the level.

### Battery level

The **Battery level** section, after the icons' sections, sets the three levels' colors, and the two percentages the medium level is between, from 0% to 100% in steps of 5%, and in either order: the high level starts from the higher one, and the low level is below the lower.

The plugin goes by the percentage rather than by the level the mouse reports, since where the mouse puts each of its own levels isn't known, and can't be chosen.

### Mouse not found

The **Mouse not found** section, last, chooses what the key shows when the mouse doesn't answer, or before the first reading, whatever it shows otherwise: the mouse, unless **Mouse** is unchecked, filled or outlined as the key's mouse is, the battery and the bolt, once **Battery** and **Charging** are checked, and one color for all of them and the percentage, grey until another is picked.

## When something doesn't work

A Set Host key shows Stream Deck's alert indicator when it can't send the mouse:

- No Logi Bolt receiver is plugged into the computer.
- No receiver plugged in reaches the mouse: the mouse is on another host, it's off, or the receiver isn't paired with it on this computer's channel (see [Requirements][requirements]).
- The key's host is past the mouse's.
- A request to the receiver fails.

A Battery key shows what its [Mouse not found](#mouse-not-found) section chooses whenever its read doesn't reach the mouse: no receiver, none that reaches it, or a request that fails.

If something else doesn't work, [a bug report][bug-report] with the plugin's log helps. The log tells each press of a key, each read of the battery, the receivers each one opens, and what came of it. The logs are in the plugin's folder, newest in `mx3s.log`:

- On macOS: `~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.daczarne.mx3s.sdPlugin/logs/`
- On Windows: `%APPDATA%\Elgato\StreamDeck\Plugins\com.daczarne.mx3s.sdPlugin\logs\`

An error's stack, which some lines carry, shows where the plugin is installed, with your user name on the computer, which you may want to replace before posting.

[bug-report]: https://github.com/daczarne/streamdeck-mx3s/issues/new?template=bug_report.yaml
[installing]: ../../README.md#installing
[requirements]: ../../README.md#requirements
[streamdeck-icons]: https://github.com/daczarne/streamdeck-icons
