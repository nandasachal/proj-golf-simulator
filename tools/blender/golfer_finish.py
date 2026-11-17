"""Work on the assembled character before export: golf clothes painted over
the MakeHuman casual suit, skin tone, and textures sized for the web."""
import bpy
import numpy as np


def _pixels(image):
    w, h = image.size
    data = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    # Rows run bottom to top.
    return data.reshape(h, w, 4)


def _store(image, data, size=None):
    image.pixels.foreach_set(data.astype(np.float32).ravel())
    if size and image.size[0] > size:
        image.scale(size, size)
    image.pack()


def _find(fragment):
    for image in bpy.data.images:
        if fragment in image.name:
            return image
    raise SystemExit(f"No image matching {fragment}")


def _luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def golf_clothes(spec):
    """The suit's texture has the T-shirt across the top and jeans below.
    The shirt becomes a plain polo with dark trim, the jeans dark trousers."""
    image = _find("casualsuit04_diffuse")
    px = _pixels(image)
    h, w, _ = px.shape
    rgb = px[..., :3]
    luma = _luma(rgb)
    rows = np.arange(h)[:, None] / h
    cols = np.arange(w)[None, :] / w
    shirt = np.broadcast_to(rows > 0.595, luma.shape)

    # Shirt: keep the weave's light and shade, lose the colour and the logo.
    orange = (rgb[..., 0] > rgb[..., 2] + 0.25) & shirt
    cloth = luma[shirt & ~orange]
    weave = np.clip((luma - np.median(cloth)) * 0.9, -0.12, 0.08)
    collar = shirt & (luma < np.median(cloth) * 0.72) & (rows > 0.9)
    logo = (
        shirt
        & (np.abs(cols - 0.557) < 0.075)
        & (np.abs(rows - 0.83) < 0.075)
    )
    weave = np.where(logo, 0.0, weave)
    trim = orange & ~logo | collar
    for c in range(3):
        channel = spec.POLO[c] + weave
        channel = np.where(trim, spec.TRIM[c] * (0.8 + luma), channel)
        rgb[..., c] = np.where(shirt, np.clip(channel, 0, 1), rgb[..., c])

    # Trousers: the denim's fade flattened out, in the trouser colour.
    legs = ~shirt
    denim = luma[legs]
    shade = 0.75 + np.clip((luma - np.median(denim)) * 0.9, -0.3, 0.35)
    for c in range(3):
        rgb[..., c] = np.where(
            legs, np.clip(spec.TROUSERS[c] * shade, 0, 1), rgb[..., c]
        )
    _store(image, px, 1024)

    normal = _find("casualsuit04_normal")
    normal.scale(1024, 1024)
    normal.pack()


def skin_tone(spec):
    image = _find(spec.SKIN_IMAGE)
    px = _pixels(image)
    rgb = px[..., :3]
    # Scale each channel so the texture's typical skin lands on the tone.
    body = _luma(rgb) > 0.25
    for c in range(3):
        typical = np.median(rgb[..., c][body])
        rgb[..., c] = np.clip(rgb[..., c] * (spec.SKIN_TONE[c] / typical), 0, 1)
    _store(image, px, 2048)


def darken(fragment, amount, size):
    image = _find(fragment)
    px = _pixels(image)
    px[..., :3] *= amount
    _store(image, px, size)


def run(human, spec):
    golf_clothes(spec)
    skin_tone(spec)
    darken("eyebrow", 0.35, 512)
    darken("short01_diffuse", 0.8, 1024)
    for name, size in (("shoes05", 1024), ("teeth", 512), ("eye", 512)):
        for image in bpy.data.images:
            if name in image.name and image.size[0] > size:
                image.scale(size, size)
                image.pack()
    for image in bpy.data.images:
        if image.size[0] and not image.packed_file:
            image.pack()
    triangles = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    print("TRIANGLES", triangles)
