# How the firmware works

Notes from reverse-engineering the MCHOSE V9 Pro firmware. None of this was documented anywhere
public; it was worked out from the firmware images and the official OTA tool's JavaScript.

## Chip

C-Media CM2025: a Cortex-M4F BT 5.3 + 2.4G gaming-audio SoC, used in both the headset and the
dongle. Internal flash, no SWD/JTAG broken out, and the datasheet documents no secure-boot or
crypto engine. The code partitions decrypt to a header magic `ACTH`, which is an Actions
Technology header, so the silicon is very likely an Actions part that C-Media rebadges.

## Firmware container ("AOTA")

The OTA tool downloads a plain `.bin`. Layout:

```
0x000  "AOTA" magic
0x004  uint32 LE  whole-image checksum = crc32(image[0x08:0x400])
0x014  uint32 LE  total file size
0x200  directory table, 32-byte entries:
         16 bytes  partition name
          4 bytes  offset
          4 bytes  size
          4 bytes  (zero)
          4 bytes  crc32 of the partition's on-disk bytes
0x400  first partition, then the rest back to back
```

Partitions: `app.bin` (code), `tone.bin` (the voice-prompt bank), `mbrec.bin` (boot), `param.bin`,
and `ota.xml` (a plaintext manifest that also lists each partition's crc32 as
`<checksum>0x........</checksum>`).

## "Encryption"

The partition payloads are not really encrypted. They're XORed with a single fixed 32-byte pad,
repeating, position-aligned. Same pad for every partition, every firmware version, every product.

```
plain[i] = enc[i] ^ PAD[i % 32]
PAD = a74f9dd95066da064987ae89848f3e28d77c3e2ffdc9905313252ae3e0538173
```

It's symmetric, so the same operation re-encrypts. This was found by XORing two firmware versions
against each other: long runs cancelled to zero, which only happens with a fixed reused keystream.
After XOR, every partition decrypts to a readable magic (`ACTH` / `sdfs` / `ACPV`) and `param.bin`'s
entropy collapses, confirming it's plaintext rather than compression.

## Repacking

When you change `tone.bin` you must fix four fields, then the image is valid:

1. the tone partition's crc32 in the directory entry at 0x200,
2. the same value as text in `ota.xml`'s `<checksum>` for tone.bin (keep the same width),
3. `ota.xml`'s own directory crc32 (its bytes changed in step 2),
4. the whole-image checksum at 0x04 = `crc32(image[0x08:0x400])`.

All crc32s are computed over the encrypted (on-disk) bytes. Keep the partition the same size so
nothing shifts.

## The voice bank (tone.bin)

Decrypts to magic `sdfs` at 0x00 and a `reaf` tag at 0x20, then an 18-entry table, then the audio
body at 0x280. The body is a flat sequence of fixed 32-byte frames. Clips are separated by a fixed
"comfort-noise" idle frame (`3927beae...`), and each clip begins with a sync frame
(`3b27627ec383...`). To silence a clip you keep its first frame and overwrite the rest with the idle
frame, which keeps the length and the codec stream valid.

The codec itself is proprietary C-Media and undecodable in practice: the body stays near-maximal
entropy under every transform, and decoding it as TrueSpeech, ADPCM, G.711/G.726, GSM, etc. (with
every byte/bit/nibble reordering) produced only noise. That's why this tool silences clips rather
than replacing them.

## Flash protocol (WebHID)

Matched to the official tool. The headset enumerates as USB HID VID 0x291D / PID 0x385D and is
flashed through the dongle.

- **Enter update:** output report `0x55`, 63-byte payload, `payload[0] = 0x55`,
  `payload[1] = 1` for the headset (`0` for the dongle), rest zero.
- **Ready:** input report `0x55` with `[02 01 00]`.
- **Stream:** the whole `.bin` in 63-byte chunks on output report `0x41` (last chunk zero-padded).
- **Flow control:** input report `0x55` `[60 FF]` = pause, `[60 00]` = resume; honour it.
- **Result:** input report `0x55` `[01 01 00]` = success, `[01 00 00]` = fail.

The host does no crypto; it streams the file as-is and the chip handles everything. Flashing the
headset only works with the headset powered on and in 2.4G range, since the dongle relays the data.
