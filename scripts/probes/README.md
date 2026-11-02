# Probes

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

These scripts talk to the mouse through Logi Bolt receivers, to find out how the mouse and the receivers behave before the plugin relies on them: they were written for [#3], which found a receiver's HID++ channel opens on macOS with no permission. They aren't part of the plugin or the build, and are run by hand, with the receivers plugged in. Biome and the type check check their code, as they check the other scripts'.

They share `hidpp.mjs`, which finds the HID++ channels of every Bolt receiver plugged in, opens one, and sends the requests through it: HID++ 1.0 to read and write the receiver's registers, and HID++ 2.0 to reach the mouse, by its slot on the receiver. A receiver's pairing information holds each device's serial number, which the probes never print, and `pair.mjs` masks the device's address, so their output can be shared as it is.

Each of the mouse's Easy-Switch channels is paired either over Bluetooth or with one Bolt receiver, chosen on the mouse. So each host the mouse switches between has a receiver of its own, paired with the mouse on that host's channel. On a channel, the mouse looks only for the receiver it was paired with there, and pairing a channel again replaces what it held. A channel on the mouse and a slot on a receiver are different numbers: the mouse on its channel 1 can sit in slot 2 of that channel's receiver.

## receiver.mjs

Reads, through every receiver plugged in, everything the plugin needs before switching the host, and nothing else: it never switches the host, so it can be run any time, without losing the mouse. For each receiver, it shows:

- Whether its HID++ channel opens. On macOS it should, with no Input Monitoring granted: the receiver keeps that channel on a device path of its own, apart from its keyboard and mouse collections.
- How many devices it has paired, and in which slot each one is, with its product ID.
- For each device that answers: its HID++ version, the index of CHANGE_HOST (`0x1814`), which differs from device to device, and its number of hosts and current host.

A device that is paired but connected elsewhere right now, such as the mouse on another channel, doesn't answer.

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

A receiver that can't be opened prints `can't open the receiver:` with the reason, such as `cannot open device`, which is what a missing permission looks like.

## switch-host.mjs

Sends the mouse to another Easy-Switch host, as the plugin's keys will. It looks through the receivers plugged in for the one the mouse answers through, finds the mouse's slot on it by its product ID, asks for the index of CHANGE_HOST and the mouse's hosts, checks the host against them, and sends `setCurrentHost`. The mouse leaves at once, so no reply comes, and the script ends there.

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

The report is a HID++ short report: `10`, the slot, the index of CHANGE_HOST, `1a` for function 1 (`setCurrentHost`) with the probes' software ID `a`, and the host counted from 0. A host the mouse is already on prints `already on host 1: nothing to do`, a host it doesn't have, `the host has to be 1 to 3`, and a mouse no receiver reaches, `no receiver reaches the MX Master 3S right now`.

## pair.mjs

Pairs a receiver with the mouse on one of its channels, without Logitech's software: a receiver bought on its own comes unpaired, and pairing it normally takes Logi Options+ or Logi Web Connect. It pairs only the receiver with nothing paired, and stops without doing anything when it finds none, or more than one, so the receivers already in use stay as they are, whatever port each is in.

It follows Solaar's Bolt pairing, through the receiver's HID++ channel:

1. **Notifications.** A receiver reports what it finds only with its wireless notifications on, and receivers start with every notification flag off. The probe turns the wireless flag on, in register `0x00`, and puts the flags back as they were at the end, whatever happens.
2. **Discovery.** It asks the receiver to look for devices for 30 s (register `0xC0`). A device in pairing mode answers with a discovery notification (`0x4F`): its details first, with its kind, its address and its authentication method, then its name.
3. **Pairing.** It asks the receiver to pair with that device (long register `0xC1`), and the receiver reports that the pairing started (`0x54`).
4. **Passkey.** The receiver sends a passkey (`0x4D`), which a mouse enters as clicks: the passkey's 10 bits, from the highest, right for a 1 and left for a 0, then both buttons together. The receiver reports each click (`0x4E`), so the probe lists the clicks, numbered, and after each one prints the next.
5. **Result.** The receiver reports the pairing's end (`0x54`), with the slot it paired the device in, or an error.

The probe prints every report the receiver sends, with the device's address masked wherever it appears.

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

The discovery details give the mouse's product ID, `34 b0` (`0xb034`, low byte first), its kind, `02` for a mouse, and its authentication method, `02`, the clicked passkey. The discovery stops once a device is found, and the pairing goes on after it. A pairing that fails prints `pairing failed:` with the receiver's error, and one that doesn't end in time, `the receiver reported no end to the pairing in time`.

### After pairing

Every Bolt receiver has the same product ID, so once paired, two receivers of the same model read the same: one device, the mouse. Label each one with its host. To tell two apart, plug one in, switch the mouse to a channel, and see whether the pointer moves.

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
