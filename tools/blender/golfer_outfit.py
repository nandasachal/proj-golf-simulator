"""The parts of the outfit MakeHuman has no asset for, built on the assembled
character: the pullover's stand collar and quarter zip, the beanie, and the
glove. The figure stands facing -y, z up, its left side +x, in metres."""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import golfer_paint as paint


def measure(body):
    """Girth of the bare body over its height, at chest, waist and hips: the
    length of a tape drawn round the torso. Taken before the clothes go on."""
    group = body.vertex_groups["body"].index
    points = np.array(
        [
            tuple(v.co)
            for v in body.data.vertices
            if any(g.group == group and g.weight > 0.5 for g in v.groups)
        ]
    )
    height = points[:, 2].max() - points[:, 2].min()
    floor = points[:, 2].min()
    result = {}
    # Arms hang away from the body in the rest pose; the cut keeps them out.
    for name, level, reach in (
        ("chest", 0.72, 0.19),
        ("waist", 0.61, 0.22),
        ("hips", 0.52, 0.24),
    ):
        z = floor + level * height
        ring = points[
            (np.abs(points[:, 2] - z) < 0.012) & (np.abs(points[:, 0]) < reach)
        ][:, :2]
        result[name] = round(_tape(ring) / height, 4)
    return result


def _tape(points):
    pts = sorted(map(tuple, points))

    def half(seq):
        hull = []
        for p in seq:
            while len(hull) >= 2 and (
                (hull[-1][0] - hull[-2][0]) * (p[1] - hull[-2][1])
                - (hull[-1][1] - hull[-2][1]) * (p[0] - hull[-2][0])
            ) <= 0:
                hull.pop()
            hull.append(p)
        return hull[:-1]

    hull = half(pts) + half(reversed(pts))
    return sum(
        math.dist(hull[i], hull[(i + 1) % len(hull)]) for i in range(len(hull))
    )


def _weights(obj, index):
    return {
        obj.vertex_groups[g.group].name: g.weight
        for g in obj.data.vertices[index].groups
    }


def _skinned(name, verts, faces, weights, rig, materials, face_materials, uvs=None):
    """A mesh object bound to the rig. `weights` is one {bone: weight} per
    vertex; `uvs` one (u, v) per face corner."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    for mat in materials:
        mesh.materials.append(mat)
    mesh.polygons.foreach_set("material_index", face_materials)
    mesh.polygons.foreach_set("use_smooth", [True] * len(faces))
    if uvs:
        layer = mesh.uv_layers.new(name="UVMap")
        for loop, uv in zip(layer.data, uvs):
            loop.uv = uv
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    rig.users_collection[0].objects.link(obj)
    for index, bones in enumerate(weights):
        for bone, weight in bones.items():
            group = obj.vertex_groups.get(bone) or obj.vertex_groups.new(name=bone)
            group.add([index], weight, "REPLACE")
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    return obj


def _outside(tree, point, out, clearance):
    """Moves a point outward until it stands clear of the body."""
    hit = tree.ray_cast(point + out * 0.3, -out)
    if hit[0] is None:
        return point
    depth = 0.3 - hit[3]
    return point if depth >= clearance else hit[0] + out * clearance


def glove(body, spec):
    """The lead (left) hand becomes a glove: its own material, a touch
    fuller than the hand."""
    mesh = body.data
    hand = next(
        piece
        for piece in paint.islands(mesh)
        if mesh.vertices[next(iter(piece))].co.x > 0.3
        and min(mesh.vertices[i].co.z for i in piece) > 0.5
    )
    mesh.materials.append(paint.material("glove", spec.GLOVE, 0.55))
    slot = len(mesh.materials) - 1
    for poly in mesh.polygons:
        if poly.vertices[0] in hand:
            poly.material_index = slot
    for index in hand:
        vertex = mesh.vertices[index]
        vertex.co = vertex.co + vertex.normal * 0.0012


def collar(suit, body, rig, spec):
    """A stand collar grown from the pullover's neck, open in a notch at the
    front, with the zip running down the chest from it."""
    mesh = suit.data
    top = paint.islands(mesh)[0]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    edges = [
        e
        for e in bm.edges
        if len(e.link_faces) == 1
        and all(v.index in top and v.co.z > 1.44 for v in e.verts)
    ]
    # Walk the neck's edge into an ordered ring.
    nxt = {}
    for e in edges:
        a, b = (v.index for v in e.verts)
        nxt.setdefault(a, []).append(b)
        nxt.setdefault(b, []).append(a)
    ring = [edges[0].verts[0].index]
    while True:
        step = [i for i in nxt[ring[-1]] if i not in ring[-2:]]
        if not step or step[0] == ring[0]:
            break
        ring.append(step[0])
    points = [bm.verts[i].co.copy() for i in ring]
    centre = sum(points, Vector()) / len(points)
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())

    # (height, how far in from the neck's edge) up the outside, over the rim
    # and back down the lining.
    rows = [(-0.006, -0.003), (0.014, 0.004), (0.032, 0.010), (0.04, 0.013),
            (0.036, 0.016), (0.012, 0.012)]
    verts, weights = [], []
    for index, point in zip(ring, points):
        out = Vector((point.x - centre.x, point.y - centre.y, 0)).normalized()
        front = point.y < centre.y
        notch = min(max((abs(point.x) - 0.004) / 0.03, 0), 1) if front else 1
        base = _weights(suit, index)
        for row, (height, inset) in enumerate(rows):
            lift = max(height, 0) * (0.35 + 0.65 * notch) + min(height, 0)
            spot = point - out * inset + Vector((0, 0, lift))
            verts.append(_outside(tree, spot, out, 0.004 if row < 4 else 0.002))
            share = 0.4 * max(height, 0) / 0.04
            blended = {b: w * (1 - share) for b, w in base.items()}
            blended["neck_01"] = blended.get("neck_01", 0) + share
            weights.append(blended)
    n, r = len(ring), len(rows)
    faces, slots = [], []
    for i in range(n):
        j = (i + 1) % n
        for row in range(r - 1):
            faces.append(
                (i * r + row, j * r + row, j * r + row + 1, i * r + row + 1)
            )
            slots.append(0 if row < 3 else 1)
    start = len(verts)

    # The zip: a strip down the centre of the chest from the notch.
    line = sorted(
        (
            v
            for v in bm.verts
            if v.index in top and abs(v.co.x) < 1e-4 and v.co.y < centre.y
        ),
        key=lambda v: -v.co.z,
    )
    top_z = line[0].co.z
    line = [v for v in line if v.co.z > top_z - spec.ZIP_LENGTH]
    for v in line:
        for side in (-1, 1):
            verts.append(v.co + Vector((side * 0.0035, -0.002, 0)))
            weights.append(_weights(suit, v.index))
    for k in range(len(line) - 1):
        a = start + 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
        slots.append(2)
    # The pull, hanging from the top of the zip.
    pull = len(verts)
    head = line[0].co + Vector((0, -0.004, 0.004))
    for dx, dz in ((-0.004, 0), (0.004, 0), (0.004, -0.02), (-0.004, -0.02)):
        verts.append(head + Vector((dx, 0, dz)))
        weights.append(_weights(suit, line[0].index))
    faces.append((pull, pull + 1, pull + 2, pull + 3))
    slots.append(2)
    bm.free()

    materials = [
        paint.material("collar", spec.TOP, 0.85),
        paint.material("collar_lining", spec.TOP_LINING, 0.85),
        paint.material("zip", spec.ZIP, 0.4, metallic=0.7),
    ]
    obj = _skinned("collar", verts, faces, weights, rig, materials, slots)
    for mat in obj.data.materials:
        mat.use_backface_culling = False
    return obj


def beanie(body, rig, spec):
    """A knitted hat fitted over the skull: rays find the head's surface, the
    hat sits a knit's thickness outside it, smoothed so the ears don't show
    through as bumps."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    crown = [v.co for v in body.data.vertices if v.co.z > 1.70]
    centre = Vector(
        (0, (min(c.y for c in crown) + max(c.y for c in crown)) / 2, 1.715)
    )
    around, levels, rings = 56, 44, 12
    elevations = np.linspace(math.radians(-40), math.radians(90), levels)
    raw = np.zeros((around, levels))
    for a in range(around):
        theta = 2 * math.pi * a / around
        for e, elevation in enumerate(elevations):
            # theta 0 is the front (-y), turning toward the left side.
            direction = Vector(
                (
                    math.sin(theta) * math.cos(elevation),
                    -math.cos(theta) * math.cos(elevation),
                    math.sin(elevation),
                )
            )
            hit = tree.ray_cast(centre + direction * 0.5, -direction)
            raw[a, e] = 0.5 - hit[3] if hit[0] is not None else raw[a, e - 1]
    smooth = sum(np.roll(raw, s, axis=0) for s in range(-3, 4)) / 7
    radius = np.maximum(smooth, raw + 0.003) + spec.BEANIE_THICKNESS

    verts, uvs_at = [], []
    for a in range(around):
        theta = 2 * math.pi * a / around
        ahead = math.cos(theta)
        rim = spec.BEANIE_RIM_SIDE + ahead * (
            spec.BEANIE_RIM_FRONT - spec.BEANIE_RIM_SIDE
            if ahead > 0
            else spec.BEANIE_RIM_SIDE - spec.BEANIE_RIM_BACK
        )
        heights = centre.z + radius[a] * np.sin(elevations)
        start = float(np.interp(rim, heights, elevations))
        for ring in range(rings):
            t = ring / rings
            elevation = start + t * (math.pi / 2 - start)
            r = float(np.interp(elevation, elevations, radius[a]))
            if ring == 0:
                # The rim turns in to meet the head.
                r -= spec.BEANIE_THICKNESS - 0.002
            slouch = math.sin(max(elevation, 0)) ** 3
            verts.append(
                centre
                + Vector(
                    (
                        math.sin(theta) * math.cos(elevation) * r,
                        -math.cos(theta) * math.cos(elevation) * r
                        + slouch * spec.BEANIE_SLOUCH * 0.6,
                        math.sin(elevation) * r + slouch * spec.BEANIE_SLOUCH,
                    )
                )
            )
            uvs_at.append((a, t))
    top = len(verts)
    verts.append(
        centre
        + Vector(
            (
                0,
                spec.BEANIE_SLOUCH * 0.6,
                float(radius[:, -1].mean()) + spec.BEANIE_SLOUCH,
            )
        )
    )
    faces, uvs = [], []

    def uv(a, t):
        return (a / around * spec.BEANIE_RIBS, t * 3)

    for a in range(around):
        b = (a + 1) % around
        for ring in range(rings - 1):
            faces.append(
                (a * rings + ring, b * rings + ring,
                 b * rings + ring + 1, a * rings + ring + 1)
            )
            t0, t1 = ring / rings, (ring + 1) / rings
            uvs += [uv(a, t0), uv(a + 1, t0), uv(a + 1, t1), uv(a, t1)]
        last = rings - 1
        faces.append((a * rings + last, b * rings + last, top))
        uvs += [uv(a, last / rings), uv(a + 1, last / rings), uv(a + 0.5, 1)]

    # Knit: ribs running up the hat, each a column of stitches.
    size = 256
    y, x = np.mgrid[0:size, 0:size] / size
    rib = 0.5 + 0.5 * np.cos(2 * math.pi * x * 4)
    stitch = 0.5 + 0.5 * np.cos(
        2 * math.pi * (y * 16 + 0.35 * np.abs(((x * 8) % 1) - 0.5))
    )
    height = rib * (0.8 + 0.2 * stitch)
    shade = 0.62 + 0.38 * height
    diffuse = paint.new_image(
        "beanie_diffuse", np.array(spec.BEANIE)[None, None, :] * shade[..., None]
    )
    normal = paint.new_image(
        "beanie_normal", paint.normal_from_height(height, 14), colour=False
    )
    mat = paint.material("beanie", (1, 1, 1), 0.95, diffuse=diffuse, normal=normal)
    return _skinned(
        "beanie", verts, faces, [{"head": 1.0}] * len(verts), rig, [mat],
        [0] * len(faces), uvs,
    )
