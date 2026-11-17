"""Shrink the largest textures inside public/models/golfer.glb, in place.

The Blender build (tools/blender) exports normal maps far larger than the
golfer needs at the size he is drawn. Run this after every export:

    python3 tools/model/shrink_textures.py

Needs cwebp and dwebp (brew install webp). Each texture over MIN_BYTES is
decoded, scaled to fit MAX_SIDE for its kind, and re-encoded; one that does not come out
smaller is left alone.
"""

import json
import os
import struct
import subprocess
import sys
import tempfile

PATH = os.path.join(os.path.dirname(__file__), "../../public/models/golfer.glb")
MIN_BYTES = 150_000
# Colour maps keep more detail than normal maps: the face is painted at 4096.
MAX_SIDE = {"normal": 1024, "default": 2048}
QUALITY = {"normal": 82, "default": 85}


def recompress(data, name, folder):
    source = os.path.join(folder, "in.webp")
    decoded = os.path.join(folder, "in.png")
    out = os.path.join(folder, "out.webp")
    with open(source, "wb") as handle:
        handle.write(data)
    subprocess.run(["dwebp", "-quiet", source, "-o", decoded], check=True)
    info = subprocess.run(
        ["webpinfo", source], capture_output=True, text=True, check=True
    ).stdout
    width = int(info.split("Width:")[1].split()[0])
    height = int(info.split("Height:")[1].split()[0])
    kind = "normal" if "normal" in name else "default"
    scale = min(1, MAX_SIDE[kind] / max(width, height))
    quality = QUALITY[kind]
    command = ["cwebp", "-quiet", "-q", str(quality), "-m", "6"]
    if scale < 1:
        command += ["-resize", str(round(width * scale)), str(round(height * scale))]
    subprocess.run(command + [decoded, "-o", out], check=True)
    with open(out, "rb") as handle:
        return handle.read()


def main(path=PATH):
    with open(path, "rb") as handle:
        glb = handle.read()
    json_length = struct.unpack("<I", glb[12:16])[0]
    document = json.loads(glb[20 : 20 + json_length])
    binary_start = 20 + json_length + 8
    binary_length = struct.unpack("<I", glb[20 + json_length : 24 + json_length])[0]
    binary = glb[binary_start : binary_start + binary_length]
    views = document["bufferViews"]

    replaced = {}
    with tempfile.TemporaryDirectory() as folder:
        for image in document.get("images", []):
            view = views[image["bufferView"]]
            if view["byteLength"] < MIN_BYTES:
                continue
            start = view.get("byteOffset", 0)
            old = binary[start : start + view["byteLength"]]
            new = recompress(old, image.get("name", ""), folder)
            if len(new) < len(old):
                replaced[image["bufferView"]] = new
                print(f"{image.get('name')}: {len(old):,} -> {len(new):,} bytes")

    # Lay the buffer out again, every view on a 4-byte boundary.
    out = bytearray()
    for index, view in enumerate(views):
        start = view.get("byteOffset", 0)
        data = replaced.get(index, binary[start : start + view["byteLength"]])
        out += b"\0" * (-len(out) % 4)
        view["byteOffset"] = len(out)
        view["byteLength"] = len(data)
        out += data
    out += b"\0" * (-len(out) % 4)
    document["buffers"][0]["byteLength"] = len(out)

    text = json.dumps(document, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    with open(path, "wb") as handle:
        handle.write(struct.pack("<4sII", b"glTF", 2, total))
        handle.write(struct.pack("<I4s", len(text), b"JSON") + text)
        handle.write(struct.pack("<I4s", len(out), b"BIN\0") + bytes(out))
    print(f"{len(glb):,} -> {total:,} bytes")


if __name__ == "__main__":
    main(*sys.argv[1:])
