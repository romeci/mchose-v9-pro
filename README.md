# Be Quiet, MCHOSE

Silence the voice prompts on the MCHOSE V9 Pro (and its C-Media CM2025 siblings).

The MCHOSE V9 Pro wireless headset speaks a voice prompt every time you toggle the mic mute,
and it hard-mutes whatever you're listening to for a second or two while it talks. On Chinese
firmware it's in Chinese; on the international firmware it's in English. There is no setting to
turn it off, and the official app can't either.

This repo lets you silence specific prompts (the mic on/off ones, by default) by patching the
firmware and flashing it back over the 2.4G dongle, entirely from the browser. Everything except
the prompts you choose stays exactly as it was, including the low-battery warning.

The headset uses an undocumented C-Media CM2025 chip and an "AOTA" firmware format that nobody
had reverse-engineered before. The format, the (trivial) encryption, and the flash protocol are
written up in [DECRYPTION.md](DECRYPTION.md) if you want the details.

## What this can and can't do

- **Silence a prompt:** yes. The chosen clip plays comfort-noise (near silence) instead of speech.
- **Replace a prompt with your own voice:** no. The audio uses a proprietary C-Media codec that
  has no public encoder, so you can swap the language only by flashing MCHOSE's own English
  firmware, not by inserting your own clip.
- The ~1.5s audio-mute when a prompt fires is firmware behaviour and isn't removed here; you just
  get a short silent gap instead of a voice.

This has been done and confirmed on a real V9 Pro. The chip accepts repacked images (no signature
check), and re-flashing the stock firmware fully reverses everything.

## Requirements

- Windows, with Chrome or Edge (the flasher uses WebHID, which Firefox doesn't support).
- Python 3.
- The headset's 2.4G USB dongle. Bluetooth cannot be used for flashing.

## Steps

1. **Get your stock firmware.** Open the MCHOSE OTA config and download the headset image you want
   as your base. The English headset firmware is the `headset` entry with `type` `1`:
   - config: `https://cdn.mchose.com.cn/OTA/PC/prod/otaFile/otaConfig_prod.json`
   - file:   `https://cdn.mchose.com.cn/OTA/PC/prod/otaFile/V9Pro/headset/<fileName>.bin`

   Keep this file. It's your recovery image. (Firmware is MCHOSE's; it isn't redistributed here.)

2. **See the clips:**

   ```
   python build_firmware.py firmware.bin
   ```

   On English V9 Pro firmware, clip 8 is mic-on and clip 9 is mic-off.

3. **Build the patched image:**

   ```
   python build_firmware.py firmware.bin 8 9
   ```

   This writes `firmware_noop.bin` (byte-identical to stock, for testing the flash path) and
   `firmware_silenced.bin` (the real one). Only the chosen clips and their CRCs change.

4. **Flash.** Plug in the dongle, power the headset on near the PC, and open `flasher.html` in
   Chrome/Edge. Connect, flash `firmware_noop.bin` first to prove the path works on your unit, then
   flash `firmware_silenced.bin`. Keep the browser tab in the foreground for the whole flash; a
   background tab gets throttled and the headset aborts after about 10 seconds.

5. **Test.** Press the mic button. The prompt should be gone; everything else still speaks.

## Recovery

Flash your stock `.bin` again with the same tool, or run MCHOSE's official OTA. A failed/partial
flash is discarded by the headset and it boots back to stock, so a clean re-flash recovers it.

## Other V9-series headsets

The X9, V9 Turbo, G9 Pro and S9 Pro use the same chip and format, so the method works, but the clip
indices might be different. Run the list command on their firmware and find the mic clips by
bisection (silence a group, flash, test which prompts went quiet, narrow down). See
[docs/clip-map.md](docs/clip-map.md).

## Warning

You're modifying firmware on your own hardware at your own risk. It worked cleanly here and is
reversible, but nobody can promise your unit or a future firmware revision behaves identically.
Always keep your stock image, flash the no-op first, and don't interrupt a flash.

## License

[MIT](LICENSE).
