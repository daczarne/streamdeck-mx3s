# Probes

- [Results](#results)
- [receiver.mjs](#receivermjs)
  - [Running it](#running-it)
  - [Example](#example)
- [switch-host.mjs](#switch-hostmjs)
  - [Running it](#running-it-1)
  - [Example](#example-1)
- [pair.mjs](#pairmjs)
  - [Running it](#running-it-2)
  - [Example](#example-2)
  - [After pairing](#after-pairing)
- [battery.mjs](#batterymjs)
  - [Running it](#running-it-3)
  - [Example](#example-3)

These scripts talk to the mouse through Logi Bolt receivers, to find out how the mouse and the receivers behave before the plugin relies on them: most were written for [#3], which found a receiver's HID++ channel opens on macOS with no permission. They aren't part of the plugin or the build, and are run by hand, with the receivers plugged in. Biome and the type check check their code, as they check the other scripts'.

They share `hidpp.mjs`, which finds the HID++ channels of every Bolt receiver plugged in, opens one, and sends the requests through it. That's enough on macOS, where a receiver's channel is a single device path. On Windows, it's two, one per report length, which the probes don't handle and `src/mouse.ts` does. The requests are HID++ 1.0 to read and write the receiver's registers, and HID++ 2.0 to reach the mouse, by its slot on the receiver. A receiver's pairing information holds each device's serial number, which the probes never log, and `pair.mjs` masks the device's address, so their files can be shared as they are.

Each of the mouse's Easy-Switch channels is paired either over Bluetooth or with one Bolt receiver, chosen on the mouse. So each host the mouse switches between has a receiver of its own, paired with the mouse on that host's channel. On a channel, the mouse looks only for the receiver it was paired with there, and pairing a channel again replaces what it held. A channel on the mouse and a slot on a receiver are different numbers: the mouse on its channel 1 can sit in slot 2 of that channel's receiver.

## Results

A probe writes what it finds to a file in `out/`, named after the time the run started (`YYYYMMDD_HHMMSS.txt`, in local time), through `report.mjs`. The terminal shows only the file's path, and what has to be done while the run goes on: the clicks that `pair.mjs` asks for, and when `battery.mjs` starts and stops listening. Each line is written as soon as it's known, so a run that fails partway keeps what it found. A probe given the wrong arguments says so on the terminal, and writes no file.

A file starts with the probe's name, its arguments, and the time the run started, in UTC, a line the examples below leave out. Git ignores the files: they're a run's output, not the repository's. Nothing in a file says which host the mouse was on, or what was done to it during the run, such as plugging in its cable, so add a note at its top after the run.

## receiver.mjs

Reads, through every receiver plugged in, everything the plugin needs before switching the host, and nothing else: it never switches the host, so it can be run any time, without losing the mouse. For each receiver, it shows:

- Whether its HID++ channel opens. On macOS it should, with no Input Monitoring granted: the receiver keeps that channel on a device path of its own, apart from its keyboard and mouse collections.
- How many devices it has paired, and in which slot each one is, with its product ID.
- For each device that answers: its HID++ version, the index of CHANGE_HOST (`0x1814`), which differs from device to device, and its number of hosts and current host.

A device that is paired but not connected through the receiver right now, such as the mouse on another channel, doesn't answer: the receiver answers for it at once, with error `0x04`, connection request failed.

### Running it

From the repo root:

```shell
n auto
node scripts/probes/receiver.mjs
```

### Example

With two receivers plugged in: one paired with the mouse on its channel 1, with the mouse on that channel, and one with nothing paired yet:

```text
DevSrvsID:<path1>: opened the receiver's HID++ channel
paired devices: 1
slot 2: product 0xb034 (MX Master 3S)
  ping: HID++ 4.5
  CHANGE_HOST (0x1814) at feature index 10
  hosts: 3, current: 1
DevSrvsID:<path2>: opened the receiver's HID++ channel
paired devices: 0
```

A receiver that can't be opened logs `can't open the receiver:` with the reason, such as `cannot open device`, which is what a missing permission looks like.

## switch-host.mjs

Sends the mouse to another Easy-Switch host, as the plugin's Set Host key does. It looks through the receivers plugged in for the one the mouse answers through, finds the mouse's slot on it by its product ID, asks for the index of CHANGE_HOST and the mouse's hosts, checks the host against them, and sends `setCurrentHost`. The mouse leaves at once, so no reply comes, and the script ends there.

### Running it

> [!WARNING]
> The mouse leaves the computer the script runs on. To bring it back, press the mouse's Easy-Switch button until it's on this computer's channel again. Run `receiver.mjs` first, to check a receiver reaches the mouse.

From the repo root, with the host as printed on the mouse, 1 to 3:

```shell
n auto
node scripts/probes/switch-host.mjs 2
```

### Example

Sending the mouse from host 1, through its receiver, to host 2:

```text
the MX Master 3S is in slot 2
hosts: 3, current: 1
sent setCurrentHost(1): 10 02 0a 1a 01 00 00
```

The report is a HID++ short report: `10`, the slot, the index of CHANGE_HOST, `1a` for function 1 (`setCurrentHost`) with the probes' software ID `a`, and the host counted from 0. A host the mouse is already on logs `already on host 1: nothing to do`, a host it doesn't have, `the host has to be 1 to 3`, and a mouse no receiver reaches, `no receiver reaches the MX Master 3S right now`.

## pair.mjs

Pairs a receiver with the mouse on one of its channels, without Logitech's software: a receiver bought on its own comes unpaired, and pairing it normally takes Logi Options+ or Logi Web Connect. It pairs only the receiver with nothing paired, and stops without doing anything when it finds none, or more than one, so the receivers already in use stay as they are, whatever port each is in.

It follows Solaar's Bolt pairing, through the receiver's HID++ channel:

1. **Notifications.** A receiver reports what it finds only with its wireless notifications on, and receivers start with every notification flag off. The probe turns the wireless flag on, in register `0x00`, and puts the flags back as they were at the end, whatever happens.
2. **Discovery.** It asks the receiver to look for devices for 30 s (register `0xC0`). A device in pairing mode answers with a discovery notification (`0x4F`): its details first, with its kind, its address and its authentication method, then its name.
3. **Pairing.** It asks the receiver to pair with that device (long register `0xC1`), and the receiver reports that the pairing started (`0x54`).
4. **Passkey.** The receiver sends a passkey (`0x4D`), which a mouse enters as clicks: the passkey's 10 bits, from the highest, right for a 1 and left for a 0, then both buttons together. The receiver reports each click (`0x4E`), so the probe lists the clicks, numbered, and after each one shows the next.
5. **Result.** The receiver reports the pairing's end (`0x54`), with the slot it paired the device in, or an error.

The probe logs every report the receiver sends, with the device's address masked wherever it appears, to the run's file only. Everything else it logs shows on the terminal too, since it says what to do on the mouse.

### Running it

1. Plug the receiver to pair into the computer the probe runs on. It can be paired on any computer and moved afterwards: the pairing is between the receiver and the mouse.
2. Keep the host that used the channel before from taking the mouse back: turn off its Bluetooth, put it to sleep, or unplug its receiver.
3. On the mouse, select the channel to pair, and hold its Easy-Switch button for three seconds, until its light blinks fast.
4. Within the 30 s the light blinks, run, from the repo root:

    ```shell
    n auto
    node scripts/probes/pair.mjs
    ```

5. When the passkey comes, do the clicks on the mouse in the order listed, following the `>>> next:` line, then press both buttons together.

### Example

Pairing a new receiver with the mouse on its channel 3, with the receiver of channel 1 also plugged in:

```text
pairing with the receiver at DevSrvsID:<path2>, which has nothing paired
notification flags 00 00 00, wireless turned on
discovering for 30 s: the device has to be in pairing mode
  11 ff 4f 00 00 00 10 02 34 b0 xx xx xx xx xx xx 01 00 02 ce
found a device: kind 0x2, authentication 0x2
asked the receiver to pair with it
  10 ff 53 02 00 00 00
discovery stopped (0x0)
  10 ff 82 c1 00 00 00
  11 ff 54 00 00 xx xx xx xx xx xx 00 00 00 00 00 00 00 00 00
pairing started
  11 ff 4d 06 30 30 30 33 38 39 xx xx xx xx xx xx 00 00 00 00
passkey 000389: on the mouse, click in this order, then press both buttons together:
    1. LEFT
    2. RIGHT
    3. RIGHT
    4. LEFT
    5. LEFT
    6. LEFT
    7. LEFT
    8. RIGHT
    9. LEFT
    10. RIGHT
>>> next: click 1 of 10: LEFT
  11 ff 4e 00 xx xx xx xx xx xx 00 00 00 00 00 00 00 00 00 00
passkey entry started
  11 ff 4e 01 xx xx xx xx xx xx 00 00 00 00 00 00 00 00 00 00
done: click 1 (LEFT)
>>> next: click 2 of 10: RIGHT
```

and so on for each click, until:

```text
done: click 10 (RIGHT)
>>> next: BOTH buttons together
  11 ff 4e 04 xx xx xx xx xx xx 00 00 00 00 00 00 00 00 00 00
done: both buttons, passkey entered
  11 ff 54 02 00 xx xx xx xx xx xx 01 00 00 00 00 00 00 00 00
pairing finished, in slot 1
paired devices now: 1
notification flags back to 00 00 00
```

The discovery details give the mouse's product ID, `34 b0` (`0xb034`, low byte first), its kind, `02` for a mouse, and its authentication method, `02`, the clicked passkey. The discovery stops once a device is found, and the pairing goes on after it. A pairing that fails logs `pairing failed:` with the receiver's error, and one that doesn't end in time, `the receiver reported no end to the pairing in time`.

### After pairing

Every Bolt receiver has the same product ID, so once paired, two receivers of the same model read the same: one device, the mouse. Label each one with its host. To tell two apart, plug one in, switch the mouse to a channel, and see whether the pointer moves.

## battery.mjs

Reads, through every receiver plugged in, what each paired device can tell of its battery, for [#16]. Like `receiver.mjs`, it only reads: it never switches the host and never changes the receivers' settings, so it can be run any time. For each receiver, it shows how long it took to open, to answer its first request, which only the receiver answers, and to give the pairing information of every slot, to tell the time spent on the receiver from the time spent reaching a device. Then, for each device, it shows:

- Its HID++ version, from a ping, and how long the ping took, then how long a second one took. A first ping much slower than the second suggests it woke the device, or its link to the receiver. A ping that gets no reply within the probes' timeout is sent again, up to 4 times in all, and the time an answer came is counted from the first: a reply to an earlier ping may answer a later one. An error reply, such as the one for a device on another channel, ends the pings at once.
- Its features, by index, from FEATURE_SET (`0x0001`), named when the probe knows them.
- Which of the battery features Solaar knows it has: UNIFIED_BATTERY (`0x1004`), BATTERY_STATUS (`0x1000`) and BATTERY_VOLTAGE (`0x1001`), and what each one answers, as bytes and as the probe reads them.

A device that doesn't answer logs how long it took to fail, and, when the receiver answered with an error, its error code, named.

With `--listen` and a number of seconds, it then logs every report the receivers send for that long, with the time it came at, and reads the battery notifications of the devices whose battery features it found. It doesn't turn on the receivers' notifications, so it hears only what reaches the host with them as they are. The terminal shows when it starts and stops listening.

### Running it

From the repo root:

```shell
n auto
node scripts/probes/battery.mjs
node scripts/probes/battery.mjs --listen 60
```

### Example

With the mouse on its channel 1, through its receiver, after about 5 minutes at rest, listening for 60 s, with the mouse's USB-C cable plugged in at about 30 s and unplugged at about 45 s (the features from 19 on are cut here):

```text
DevSrvsID:<path1>: opened the receiver's HID++ channel, in 1 ms
paired devices: 1, read in 4 ms
pairing information of every slot, read in 18 ms
slot 2: product 0xb034 (MX Master 3S)
  ping: HID++ 4.5, in 573 ms
  ping again: in 15 ms
  features, besides IRoot: 36
    1: 0x0001 FEATURE_SET
    2: 0x0003 DEVICE_FW_VERSION
    3: 0x0005 DEVICE_NAME
    4: 0x1d4b WIRELESS_DEVICE_STATUS
    5: 0x0020
    6: 0x0021
    7: 0x0007
    8: 0x1004 UNIFIED_BATTERY
    9: 0x1b04 REPROG_CONTROLS_V4
    10: 0x1814 CHANGE_HOST
    11: 0x1815 HOSTS_INFO
    12: 0x2250
    13: 0x2201 ADJUSTABLE_DPI
    14: 0x2110 SMART_SHIFT
    15: 0x2121 HIRES_WHEEL
    16: 0x2150
    17: 0x2251
    18: 0x00c3
  0x1004 UNIFIED_BATTERY at feature index 8
    getCapabilities: 0f 03 00 00
      levels: critical, low, good, full
      rechargeable: yes, percentage: yes
    getStatus, in 23 ms: 5f 08 00 00
      95%, level full, discharging, external power 0x00
  no 0x1000 BATTERY_STATUS feature
  no 0x1001 BATTERY_VOLTAGE feature
listening for 60 s
  28.4 s, DevSrvsID:<path1>: 11 02 08 00 5f 08 01 01 00 00 00 00 00 00 00 00 00 00 00 00
    UNIFIED_BATTERY notification: 95%, level full, charging, external power 0x01
  44.0 s, DevSrvsID:<path1>: 11 02 08 00 5f 08 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    UNIFIED_BATTERY notification: 95%, level full, discharging, external power 0x00
done listening
```

The receiver answers in a few milliseconds, so the 573 ms of the first ping were spent reaching the mouse, which the ping woke. A mouse kept moving answered it in about 20 ms. The mouse has UNIFIED_BATTERY only. Its capabilities, `0f 03`, are the levels it reports, one bit each, all four here, and its flags: rechargeable, and with a percentage. Its status, `5f 08 00 00`, is the percentage (`0x5f`, 95), the level (`08`, full), the charging state (`00`, discharging) and the external power (`00`, none). Each time the cable was plugged in or out, the mouse sent a notification on its own: function 0, software ID 0, with the same four bytes as `getStatus`. While charging, the charging state is `01` and the external power `01`. These are measurements of one MX Master 3S, through its receiver, on macOS: another mouse may take a different time to wake.

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
[#16]: https://github.com/daczarne/streamdeck-mx3s/issues/16
