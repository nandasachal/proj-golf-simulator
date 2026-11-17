"""Texture work on the assembled character before export: the outfit's
colours painted over the MakeHuman clothes, skin, eyes, and textures sized
for the web."""
import bpy
import numpy as np

import golfer_paint as paint


def _shade(lum, radius, gain, low, high):
    """Folds and weave kept from a texture, its broad colour changes dropped."""
    return 1 + np.clip((lum - paint.blur(lum, radius)) * gain, low, high)


def outfit(suit, spec):
    """The suit is a sweater and jeans on one texture. The sweater becomes the
    pullover (plain, with a lighter yoke over the shoulders), the jeans the
    trousers (the denim's fade and colour gone, its seams kept)."""
    image = paint.find(f"{spec.SUIT}_diffuse")
    size = image.size[0]
    px = paint.pixels(image)
    rgb = px[..., :3]
    lum = paint.luma(rgb)
    mesh = suit.data
    top = paint.islands(mesh)[0]
    count = len(mesh.vertices)
    upper = paint.grow(
        paint.uv_field(suit, [float(i in top) for i in range(count)], size), 6
    ) > 0.5
    yoke_at = [0.0] * count
    for i in top:
        co = mesh.vertices[i].co
        yoke_at[i] = min(max((co.z - spec.YOKE_HEIGHT) / 0.006, 0), 1) * min(
            max((spec.YOKE_REACH - abs(co.x)) / 0.006, 0), 1
        )
    yoke = paint.uv_field(suit, yoke_at, size)

    # The sweater's orange piping and chest logo are not cloth: flatten them.
    printed = paint.grow(
        ((rgb[..., 2] - rgb[..., 0] < 0.17) & upper).astype(np.float32), 3
    ) > 0.5
    knit = _shade(lum, 24, 2.0, -0.22, 0.18)
    # The logo's ring is printed in the cloth's own blue: flatten its patch.
    rows = np.arange(size)[:, None] / size
    cols = np.arange(size)[None, :] / size
    logo = (np.abs(cols - 0.56) < 0.11) & (np.abs(rows - 0.83) < 0.11)
    knit = np.where(printed | (logo & upper), 1.0, knit)
    seam = (yoke > 0.42) & (yoke < 0.58)
    knit = np.where(seam, knit * 0.8, knit)
    # The twill is left out: only seams and folds come through.
    denim = _shade(paint.blur(lum, 7), 28, 0.9, -0.22, 0.1)
    for c in range(3):
        cloth = np.where(yoke > 0.5, spec.TOP_YOKE[c], spec.TOP[c]) * knit
        legs = spec.TROUSERS[c] * denim
        rgb[..., c] = np.clip(np.where(upper, cloth, legs), 0, 1)
    paint.store(image, px, 2048)

    normal = paint.find(f"{spec.SUIT}_normal")
    normal.scale(2048, 2048)
    normal.pack()
    _principled(suit).inputs["Roughness"].default_value = 0.88


def shoes(obj, spec):
    image = paint.find(f"{spec.SHOES}_diffuse")
    size = image.size[0]
    px = paint.pixels(image)
    rgb = px[..., :3]
    lum = paint.luma(rgb)
    mesh = obj.data
    pieces = paint.islands(mesh)
    # The two small pieces are the socks.
    ankle = set().union(*pieces[2:])
    socks = paint.grow(
        paint.uv_field(
            obj, [float(i in ankle) for i in range(len(mesh.vertices))], size
        ),
        4,
    ) > 0.5
    blue = rgb[..., 2] > rgb[..., 0] + 0.06
    # The maker's mark on the outside of the shoe goes.
    rows = np.arange(size)[:, None] / size
    cols = np.arange(size)[None, :] / size
    mark = (np.abs(cols - 0.48) < 0.07) & (np.abs(rows - 0.13) < 0.04)
    for c in range(3):
        knit = np.clip(spec.SHOE[c] * (0.55 + lum * 2.4), 0, 1)
        channel = np.where(blue, knit, rgb[..., c])
        channel = np.where(mark, spec.SHOE[c], channel)
        channel = np.where(socks, spec.SOCK[c] * (0.6 + lum * 0.6), channel)
        rgb[..., c] = channel
    paint.store(image, px, 1024)
    _principled(obj).inputs["Roughness"].default_value = 0.75


def eyes(spec):
    image = paint.find("brown_eye")
    px = paint.pixels(image)
    rgb = px[..., :3]
    iris = np.clip((rgb[..., 0] - rgb[..., 2] - 0.12) / 0.1, 0, 1)[..., None]
    lum = paint.luma(rgb)[..., None]
    px[..., :3] = rgb * (1 - iris) + np.array(spec.IRIS) * lum * 3.4 * iris
    paint.store(image, px, 512)


def skin(body, spec):
    image = paint.find(spec.SKIN_IMAGE)
    px = paint.pixels(image)
    rgb = px[..., :3]
    # Scale each channel so the texture's typical skin lands on the tone.
    lit = paint.luma(rgb) > 0.25
    for c in range(3):
        typical = np.median(rgb[..., c][lit])
        rgb[..., c] = np.clip(rgb[..., c] * (spec.SKIN_TONE[c] / typical), 0, 1)
    rgb *= (1 - spec.STUBBLE * _stubble(body, rgb))[..., None]
    # Pores and creases as relief, taken from the fine detail of the texture.
    lum = paint.luma(rgb)
    detail = np.clip((lum - paint.blur(lum, 3)) * 6, -1, 1)
    relief = paint.new_image(
        "skin_normal", paint.normal_from_height(detail, 1.6), colour=False
    )
    relief.scale(1024, 1024)
    relief.pack()
    paint.store(image, px, 2048)
    mat = body.data.materials[0]
    paint.add_normal(mat, relief, 0.8)
    _principled(body).inputs["Roughness"].default_value = spec.SKIN_ROUGHNESS


def _stubble(body, rgb):
    """Where short hair darkens the skin: beard and moustache, running up
    the sideburns into the cropped hair that shows below the hat."""
    mesh = body.data
    size = rgb.shape[0]
    head = paint.islands(mesh)[0]
    co = {i: mesh.vertices[i].co for i in head}
    crown = [c for c in co.values() if c.z > 1.70]
    middle = (min(c.y for c in crown) + max(c.y for c in crown)) / 2
    profile = [c for c in co.values() if abs(c.x) < 0.012 and c.y < middle]
    nose = min(profile, key=lambda c: c.y)
    chin = min(c.z for c in profile if c.y < nose.y + 0.04)
    ear = max((c for c in co.values() if c.z > 1.6), key=lambda c: abs(c.x))

    def ramp(value, width):
        return min(max(value / width, 0), 1)

    field = [0.0] * len(mesh.vertices)
    for i, c in co.items():
        if c.y < ear.y - 0.012:
            # The beard's top edge climbs from under the nose to the ear.
            top = nose.z - 0.016 + max(abs(c.x) - 0.04, 0) * 1.0
            field[i] = ramp(top - c.z, 0.012) * ramp(c.z - chin + 0.04, 0.025)
        elif c.y > ear.y + 0.014:
            field[i] = ramp(c.z - 1.61, 0.02)
        if c.z > ear.z + 0.045:
            field[i] = 1.0
    painted = paint.blur(paint.uv_field(body, field, size), 8)
    # Lips stay clear, and the hair has grain.
    pink = rgb[..., 0] - rgb[..., 1]
    lips = np.clip((pink - np.median(pink[painted > 0.5]) - 0.05) / 0.04, 0, 1)
    grain = np.random.default_rng(7).random((size, size)).astype(np.float32)
    return painted * (1 - lips) * (0.7 + 0.3 * paint.blur(grain, 1) * 2)


def _principled(obj):
    return next(
        n
        for n in obj.data.materials[0].node_tree.nodes
        if n.type == "BSDF_PRINCIPLED"
    )


def darken(fragment, amount, size):
    image = paint.find(fragment)
    px = paint.pixels(image)
    px[..., :3] *= amount
    paint.store(image, px, size)


def run(human, spec):
    outfit(bpy.data.objects[f"body.{spec.SUIT}"], spec)
    shoes(bpy.data.objects[f"body.{spec.SHOES}"], spec)
    eyes(spec)
    skin(human, spec)
    darken("eyebrow", 0.35, 512)
    for image in bpy.data.images:
        if "teeth" in image.name and image.size[0] > 512:
            image.scale(512, 512)
    for image in bpy.data.images:
        if image.size[0] and not image.packed_file:
            image.pack()
    triangles = 0
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.data.calc_loop_triangles()
            triangles += len(obj.data.loop_triangles)
    print("TRIANGLES", triangles)
