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
        # A wide ramp per vertex: interpolated across the faces, its halfway
        # line is straight however coarse the mesh is.
        yoke_at[i] = min(
            max((co.z - spec.YOKE_HEIGHT) / 0.08 + 0.5, 0.01),
            max((spec.YOKE_REACH - abs(co.x)) / 0.08 + 0.5, 0.01),
            1,
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
    seam = np.abs(yoke - 0.5) < 0.025
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
    # The face is seen close up: work at twice the asset's resolution and
    # put back the fine detail an enlargement lacks.
    size = 4096
    image.scale(size, size)
    px = paint.pixels(image)
    rgb = px[..., :3]
    # Scale each channel so the texture's typical skin lands on the tone.
    lit = paint.luma(rgb) > 0.25
    for c in range(3):
        typical = np.median(rgb[..., c][lit])
        rgb[..., c] = np.clip(rgb[..., c] * (spec.SKIN_TONE[c] / typical), 0, 1)
    # Lips nearer the skin's own colour than the asset's pink.
    pink = rgb[..., 0] - rgb[..., 1]
    lips = np.clip((pink - np.median(pink[lit]) - 0.05) / 0.04, 0, 1)
    for c in range(3):
        rgb[..., c] *= 1 - 0.3 * lips * (1 - spec.SKIN_TONE[c])
    # Sharpen what is there, then add pores: fine mottling in the colour and
    # the same pattern as relief.
    for c in range(3):
        rgb[..., c] += 0.7 * (rgb[..., c] - paint.blur(rgb[..., c], 2))
    rng = np.random.default_rng(11)
    grain = rng.random((size, size)).astype(np.float32)
    pores = paint.blur(grain, 1) - paint.blur(grain, 4)
    pores /= np.abs(pores).max()
    rgb *= (1 + 0.07 * pores)[..., None]

    hair, strands = _hair(body, spec, size, lips, rng)
    for c in range(3):
        rgb[..., c] = rgb[..., c] * (1 - hair) + spec.HAIR_COLOUR[c] * hair
    np.clip(rgb, 0, 1, out=rgb)

    lum = paint.luma(rgb)
    detail = np.clip((lum - paint.blur(lum, 4)) * 5, -1, 1)
    relief = paint.new_image(
        "skin_normal",
        paint.normal_from_height(0.6 * detail + 0.2 * pores + 0.5 * strands, 1.2),
        colour=False,
    )
    relief.scale(2048, 2048)
    relief.pack()
    paint.store(image, px)
    paint.add_normal(body.data.materials[0], relief, 0.6)
    _principled(body).inputs["Roughness"].default_value = spec.SKIN_ROUGHNESS


def _hair(body, spec, size, lips, rng):
    """Where hair covers the skin, as (cover, strands): a short beard and
    moustache, and cropped hair on the scalp, drawn as fine strokes rather
    than a flat shade."""
    mesh = body.data
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

    beard = [0.0] * len(mesh.vertices)
    scalp = [0.0] * len(mesh.vertices)
    for i, c in co.items():
        ahead = (ear.y - c.y) / (ear.y - nose.y)
        if c.y < ear.y - 0.012:
            # The beard's top edge climbs from under the nose to the ear,
            # and it thins out toward the ear instead of stopping at a line.
            top = nose.z - 0.016 + max(abs(c.x) - 0.04, 0) * 1.0
            beard[i] = (
                ramp(top - c.z, 0.012)
                * ramp(c.z - chin + 0.04, 0.025)
                * (0.45 + 0.55 * ramp(ear.y - 0.012 - c.y, 0.035))
            )
        # The hairline: high over the forehead, down past the temples to the
        # top of the ear, then a fade down the back of the head.
        if ahead > 0.12:
            line = ear.z + 0.012 + max(min(ahead, 1) - 0.35, 0) * 0.16
            scalp[i] = ramp(c.z - line, 0.012)
        elif ahead < -0.1:
            scalp[i] = ramp(c.z - 1.625, 0.05)
        else:
            scalp[i] = ramp(c.z - ear.z - 0.036, 0.01)
    beard = paint.blur(paint.uv_field(body, beard, size), 12)
    scalp = paint.blur(paint.uv_field(body, scalp, size), 10)
    # Strokes: noise drawn out along the way the hair lies.
    grain = rng.random((size, size)).astype(np.float32)
    streaks = grain
    for shift in range(1, 7):
        streaks = streaks + np.roll(grain, shift, axis=0)
    streaks = paint.blur(streaks / 7, 1)
    streaks = np.clip((streaks - streaks.mean()) / (3 * streaks.std()) + 0.5, 0, 1)
    cover = np.maximum(
        scalp * spec.HAIR * (0.75 + 0.25 * streaks),
        beard * (1 - lips) * spec.BEARD * (0.45 + 0.55 * streaks),
    )
    return np.clip(cover, 0, 1), (streaks - 0.5) * np.maximum(beard, scalp)


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
    low = bpy.data.objects["body.low-poly"]
    _principled(low).inputs["Roughness"].default_value = spec.EYE_ROUGHNESS
    skin(human, spec)
    darken("eyebrow", 0.35, 512)
    for image in bpy.data.images:
        if "teeth" in image.name and image.size[0] > 512:
            image.scale(512, 512)
    for image in bpy.data.images:
        if image.size[0] and not image.packed_file:
            image.pack()
