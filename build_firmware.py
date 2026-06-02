#!/usr/bin/env python3
# Silence specific voice-prompt clips in MCHOSE V9 Pro (C-Media CM2025 "AOTA") firmware.
#
#   python build_firmware.py firmware.bin                 # list the clips
#   python build_firmware.py firmware.bin 8 9             # silence mic on/off, write *_silenced.bin + *_noop.bin
#
# It never touches the bootloader or code partitions: only the chosen clips in
# tone.bin are overwritten with the bank's own comfort-noise frame, the partition
# CRCs are recomputed, and the rest is byte-for-byte identical to stock.

import os, sys, struct, zlib

PAD  = bytes.fromhex("a74f9dd95066da064987ae89848f3e28d77c3e2ffdc9905313252ae3e0538173")
IDLE = bytes.fromhex("3927beae2bc2b43ac25011b293f79d6a041b00f077f9c274b82331175923e68b")
SYNC = bytes.fromhex("3b27627ec383")
FRAME = 32

# Clip tables for V9 Pro firmware, as (offset, length) into the DECRYPTED tone.bin.
# EN = international/English firmware (mic on = 8, mic off = 9).
# Indices can differ on other firmware versions/products; see docs/clip-map.md.
CLIPS = {
    "EN": [(864,3680),(5120,3680),(9376,4096),(14016,4672),(19232,4640),(24448,4576),
           (29376,3552),(33440,3008),(36736,3968),(41376,3904),(46016,3936),(50112,3008),
           (53408,3872),(57856,3328),(61536,3712),(65792,4480),(70432,4000),(75072,4832)],
    "CN": [(1056,6176),(8960,6176),(16672,3360),(20192,4128),(25056,4288),(31040,2944),
           (34336,3104),(39168,3520),(44192,3040),(47392,3008),(50560,3712),(54624,3520),
           (59840,3712),(65056,2752),(69312,2752),(73376,3872),(77792,4256),(83584,4832)],
}


def xor(buf):
    return bytes(b ^ PAD[i % 32] for i, b in enumerate(buf))


def read_dir(data):
    entries, off = [], 0x200
    while off + 32 <= len(data):
        name = data[off:off + 16]
        if name[0] == 0:
            break
        o, sz, _z, crc = struct.unpack_from("<IIII", data, off + 16)
        if o == 0 and sz == 0:
            break
        entries.append({"name": name.split(b"\x00")[0].decode("latin1"),
                        "off": o, "size": sz, "crc_off": off + 28, "crc": crc})
        off += 32
    return entries


def pick_table(tone_plain):
    for variant, clips in CLIPS.items():
        o = clips[0][0]
        if tone_plain[o:o + len(SYNC)] == SYNC:
            return variant, clips
    return None, None


def silence(tone_plain, clips, targets):
    out = bytearray(tone_plain)
    for idx in targets:
        o, ln = clips[idx]
        if bytes(out[o:o + len(SYNC)]) != SYNC:
            raise SystemExit(f"clip {idx} does not start with a sync frame -- wrong firmware version? "
                             f"run without indices to list, and see docs/clip-map.md")
        for k in range(1, ln // FRAME):          # keep the sync frame, replace the rest with comfort noise
            out[o + k * FRAME:o + (k + 1) * FRAME] = IDLE
    return bytes(out)


def repack(stock, new_tone_enc):
    data = bytearray(stock)
    d = read_dir(stock)
    tone = next(e for e in d if e["name"].lower() == "tone.bin")
    xml  = next(e for e in d if e["name"].lower().endswith("ota.xml"))
    assert len(new_tone_enc) == tone["size"]
    data[tone["off"]:tone["off"] + tone["size"]] = new_tone_enc

    tone_crc = zlib.crc32(new_tone_enc) & 0xFFFFFFFF
    struct.pack_into("<I", data, tone["crc_off"], tone_crc)

    # the tone CRC also appears as text "<checksum>0x........</checksum>" in the plaintext ota.xml
    x = data[xml["off"]:xml["off"] + xml["size"]]
    i = x.find(b"tone.bin"); a = x.find(b"<checksum>", i) + len(b"<checksum>"); b = x.find(b"</checksum>", a)
    new_txt = ("0x%08x" % tone_crc).encode()
    if b - a != len(new_txt):
        raise SystemExit("unexpected checksum field width in ota.xml")
    data[xml["off"] + a:xml["off"] + b] = new_txt

    xml_crc = zlib.crc32(bytes(data[xml["off"]:xml["off"] + xml["size"]])) & 0xFFFFFFFF
    struct.pack_into("<I", data, xml["crc_off"], xml_crc)

    struct.pack_into("<I", data, 0x04, zlib.crc32(bytes(data[0x08:0x400])) & 0xFFFFFFFF)
    return bytes(data)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__ if False else "usage: python build_firmware.py firmware.bin [clip indices...]")
    src = sys.argv[1]
    targets = [int(x) for x in sys.argv[2:]]
    stock = open(src, "rb").read()
    if stock[0:4] != b"AOTA":
        raise SystemExit("not an AOTA firmware image")

    d = read_dir(stock)
    tone = next(e for e in d if e["name"].lower() == "tone.bin")
    tone_plain = xor(stock[tone["off"]:tone["off"] + tone["size"]])
    if tone_plain[0:4] != b"sdfs":
        raise SystemExit("tone.bin did not decrypt to an sdfs bank -- unexpected firmware")

    variant, clips = pick_table(tone_plain)
    if not variant:
        raise SystemExit("could not match a known clip table to this firmware -- it may be a newer "
                         "version or a different product; see docs/clip-map.md to find clips by bisection")
    print(f"matched {variant} clip table ({len(clips)} clips)")

    if not targets:
        for i, (o, ln) in enumerate(clips):
            tag = "  <- mic on"  if (variant == "EN" and i == 8) else \
                  "  <- mic off" if (variant == "EN" and i == 9) else ""
            print(f"  clip {i:2d}  offset 0x{o:05x}  {ln//FRAME:3d} frames  ~{ln/32*0.030:.1f}s{tag}")
        print("\nrun again with clip indices to silence, e.g.:  python build_firmware.py "
              f"{os.path.basename(src)} 8 9")
        return

    base = os.path.splitext(src)[0]
    noop = repack(stock, xor(tone_plain))
    if noop != stock:
        raise SystemExit("internal error: no-op repack is not byte-identical to stock")
    open(base + "_noop.bin", "wb").write(noop)

    out = repack(stock, xor(silence(tone_plain, clips, targets)))
    open(base + "_silenced.bin", "wb").write(out)
    print(f"silenced clips {targets}")
    print(f"  {base}_noop.bin      (== stock, flash this first to validate the path)")
    print(f"  {base}_silenced.bin  (flash this for real)")


if __name__ == "__main__":
    main()
