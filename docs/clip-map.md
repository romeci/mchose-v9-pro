# Clip map

## V9 Pro, English firmware (confirmed)

There are 18 prompt clips. These two are confirmed by testing on the device:

- **clip 8 = mic on**
- **clip 9 = mic off**

Also identified: "adapter connection" is one of clips 2-4 (it went silent when that group was
muted). Power on, power off and "adapter mode" are other clips and were left untouched. The rest
weren't individually pinned down because they couldn't be triggered on demand, but for silencing
the mic prompts you only need 8 and 9.

`build_firmware.py firmware.bin` prints the full clip list with offsets and rough durations.

## Finding clips on other firmware

The codec can't be decoded, so you can't read the clips offline; you find them on the device by
elimination. It's quick because flashing is reliable and reversible:

1. Silence a group of clips: `build_firmware.py firmware.bin 2 3 4 5 6 8 9`, flash it.
2. Trigger the prompt you care about (press mic mute, connect, power cycle, etc.).
3. If it went silent, the clip is in that group; if not, it's in the rest.
4. Halve the group and repeat until you've got the exact clip(s).

A prompt that toggles (like mic on/off) is two clips. They aren't necessarily a matching pair or
adjacent, so don't assume — bisect.

Different firmware versions can shift the offsets, so the indices above apply to the English V9 Pro
build they were found on. If `build_firmware.py` can't match a clip table to your image it will say
so; in that case the offsets moved and you'll need to map them yourself.
