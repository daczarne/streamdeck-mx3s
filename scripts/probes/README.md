# Probes

- [receiver.mjs](#receivermjs)
  - [Running it](#running-it)
  - [Example](#example)
- [switch-host.mjs](#switch-hostmjs)
  - [Running it](#running-it-1)
  - [Example](#example-1)

These scripts talk to the mouse through a Logi Bolt receiver, to find out how the mouse and the receiver behave before the plugin relies on it: they were written for [#3], which found the receiver's HID++ channel opens on macOS with no permission. They aren't part of the plugin or the build, and are run by hand, with the receiver plugged in and the mouse paired with it. Biome checks their code, as it checks the other scripts'.

They share `hidpp.mjs`, which finds and opens the receiver's HID++ channel and sends the requests through it: HID++ 1.0 to read the receiver's registers, and HID++ 2.0 to reach the mouse, by its slot on the receiver. The receiver's pairing information holds each device's serial number, which the probes never print, so their output can be shared as it is.

## receiver.mjs

Reads, through the receiver, everything the plugin needs before switching the host, and nothing else: it never switches the host, so it can be run any time, without losing the mouse. It shows:

- Whether the receiver's HID++ channel opens. On macOS it should, with no Input Monitoring granted: the receiver keeps that channel on a device path of its own, apart from its keyboard and mouse collections.
- How many devices the receiver has paired, and in which slot each one is, with its product ID. A slot on the receiver isn't the mouse's Easy-Switch channel: a mouse on channel 1 can sit in slot 2.
- For each device that answers: its HID++ version, the index of CHANGE_HOST (`0x1814`), which differs from device to device, and its number of hosts and current host.

A device that is paired but connected elsewhere right now, such as the mouse on a channel that uses Bluetooth, doesn't answer.

### Running it

From the repo root:

```shell
n auto
node scripts/probes/receiver.mjs
```

### Example

With the mouse paired with the receiver on its channel 1, and on that channel:

```text
opened the receiver's HID++ channel
paired devices: 1
slot 2: product 0xb034 (MX Master 3S)
  ping: HID++ 4.5
  CHANGE_HOST (0x1814) at feature index 10
  hosts: 3, current: 1
```

A receiver that can't be opened prints `can't open the receiver:` with the reason, such as `cannot open device`, which is what a missing permission looks like.

## switch-host.mjs

Sends the mouse to another Easy-Switch host, as the plugin's keys will: it finds the mouse's slot by its product ID, asks for the index of CHANGE_HOST and the mouse's hosts, checks the host against them, and sends `setCurrentHost`. The mouse leaves at once, so no reply comes, and the script ends there.

### Running it

> [!WARNING]
> The mouse leaves the computer the script runs on. To bring it back, press the mouse's Easy-Switch button until it's on this computer's channel again. Run `receiver.mjs` first, to check the receiver reaches the mouse.

From the repo root, with the host as printed on the mouse, 1 to 3:

```shell
n auto
node scripts/probes/switch-host.mjs 2
```

### Example

Sending the mouse from host 1, through the receiver, to host 2:

```text
the MX Master 3S is in slot 2
hosts: 3, current: 1
sent setCurrentHost(1): 10 02 0a 1a 01 00 00
```

The report is a HID++ short report: `10`, the slot, the index of CHANGE_HOST, `1a` for function 1 (`setCurrentHost`) with the probes' software ID `a`, and the host counted from 0. A host the mouse is already on prints `already on host 1: nothing to do`, and a host it doesn't have, `the host has to be 1 to 3`.

[#3]: https://github.com/daczarne/streamdeck-mx3s/issues/3
