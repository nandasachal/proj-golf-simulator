"""The parts of the outfit MakeHuman has no asset for, built on the assembled
character: the pullover's stand collar and quarter zip, the cap, and the
glove. The figure stands facing -y, z up, its left side +x, in metres."""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import golfer_paint as paint


# The height the girths are taken against, and the levels they are taken at,
# are fixed in metres rather than read off the mesh, so that reshaping the
# head (which changes the figure's height) does not move the tape.
MEASURE_HEIGHT = 1.796


def measure(body):
    """Girth of the bare body at chest, waist and hips, as a share of the
    reference height: the length of a tape drawn round the torso. Taken
    before the clothes go on."""
    group = body.vertex_groups["body"].index
    points = np.array(
        [
            tuple(v.co)
            for v in body.data.vertices
            if any(g.group == group and g.weight > 0.5 for g in v.groups)
        ]
    )
    floor = points[:, 2].min()
    result = {}
    # Arms hang away from the body in the rest pose; the cut keeps them out.
    for name, level, reach in (
        ("chest", 0.72, 0.19),
        ("waist", 0.61, 0.22),
        ("hips", 0.52, 0.24),
    ):
        z = floor + level * MEASURE_HEIGHT
        ring = points[
            (np.abs(points[:, 2] - z) < 0.012) & (np.abs(points[:, 0]) < reach)
        ][:, :2]
        result[name] = round(_tape(ring) / MEASURE_HEIGHT, 4)
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


def _tuck(body, neck, centre):
    """Removes the skin of the shoulders and neck base that the pullover
    covers: left in, it shows through the cloth when the shoulders turn."""

    def bearing(co):
        return math.atan2(co.x - centre.x, co.y - centre.y)

    edge = sorted((bearing(p), p.z) for p in neck)
    angles = [a for a, _ in edge]
    heights = [z for _, z in edge]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    covered = {
        v
        for v in bm.verts
        if 1.3 < v.co.z
        < np.interp(bearing(v.co), angles, heights, period=2 * math.pi) - 0.01
    }
    doomed = [f for f in bm.faces if all(v in covered for v in f.verts)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(body.data)
    bm.free()


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
    mesh.materials.append(paint.material("glove", spec.GLOVE, 0.7))
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
    _tuck(body, points, centre)
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


def cap(body, rig, spec):
    """A six-panel golf cap fitted over the skull: rays find the head's
    surface, the crown sits a cloth's thickness outside it, and a curved peak
    runs forward from the front of the rim."""
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    crown = [v.co for v in body.data.vertices if v.co.z > 1.70]
    centre = Vector(
        (0, (min(c.y for c in crown) + max(c.y for c in crown)) / 2, 1.715)
    )
    around, levels, rings = 60, 44, 12
    elevations = np.linspace(math.radians(-40), math.radians(90), levels)
    raw = np.zeros((around, levels))

    def aim(theta, elevation):
        # theta 0 is the front (-y), turning toward the left side.
        return Vector(
            (
                math.sin(theta) * math.cos(elevation),
                -math.cos(theta) * math.cos(elevation),
                math.sin(elevation),
            )
        )

    for a in range(around):
        theta = 2 * math.pi * a / around
        for e, elevation in enumerate(elevations):
            direction = aim(theta, elevation)
            hit = tree.ray_cast(centre + direction * 0.5, -direction)
            raw[a, e] = 0.5 - hit[3] if hit[0] is not None else raw[a, e - 1]
    smooth = sum(np.roll(raw, s, axis=0) for s in range(-4, 5)) / 9
    radius = np.maximum(smooth, raw + 0.002) + spec.CAP_THICKNESS

    def rim_height(theta):
        ahead = math.cos(theta)
        return spec.CAP_RIM_SIDE + abs(ahead) * (
            (spec.CAP_RIM_FRONT if ahead > 0 else spec.CAP_RIM_BACK)
            - spec.CAP_RIM_SIDE
        )

    def rim_elevation(a):
        heights = centre.z + radius[a] * np.sin(elevations)
        return float(np.interp(rim_height(2 * math.pi * a / around), heights, elevations))

    def shell(a, t):
        """A point on the crown: t runs from the rim (0) to the top (1)."""
        theta = 2 * math.pi * a / around
        start = rim_elevation(a)
        elevation = start + t * (math.pi / 2 - start)
        r = float(np.interp(elevation, elevations, radius[a]))
        # The front panels are stiffened and stand a little proud.
        r += spec.CAP_FRONT_RISE * max(math.cos(theta), 0) * math.sin(math.pi * t)
        return centre + aim(theta, elevation) * r + Vector((0, 0, 0.006 * t))

    verts, faces, slots, uvs = [], [], [], []
    for a in range(around):
        for ring in range(rings):
            point = shell(a, ring / rings)
            if ring == 0:
                # The rim turns in to meet the head.
                inward = Vector((centre.x - point.x, centre.y - point.y, 0))
                point = point + inward.normalized() * (spec.CAP_THICKNESS - 0.001)
            verts.append(point)
    top = len(verts)
    verts.append(shell(0, 1))

    def uv(a, t):
        return (a / around, 0.02 + 0.96 * t)

    for a in range(around):
        b = (a + 1) % around
        for ring in range(rings - 1):
            faces.append(
                (a * rings + ring, b * rings + ring,
                 b * rings + ring + 1, a * rings + ring + 1)
            )
            t0, t1 = ring / rings, (ring + 1) / rings
            uvs += [uv(a, t0), uv(a + 1, t0), uv(a + 1, t1), uv(a, t1)]
            slots.append(0)
        last = rings - 1
        faces.append((a * rings + last, b * rings + last, top))
        uvs += [uv(a, last / rings), uv(a + 1, last / rings), uv(a + 0.5, 1)]
        slots.append(0)

    # The button on top.
    button = len(verts)
    peak = verts[top] + Vector((0, 0, 0.0005))
    sides = 10
    for k in range(sides):
        turn = 2 * math.pi * k / sides
        verts.append(peak + Vector((math.cos(turn) * 0.008, math.sin(turn) * 0.008, 0)))
    verts.append(peak + Vector((0, 0, 0.005)))
    for k in range(sides):
        faces.append((button + k, button + (k + 1) % sides, button + sides))
        uvs += [(0.5, 0.5)] * 3
        slots.append(0)

    # The peak: a plate running forward from the front of the rim, curved
    # across and drooping at the sides. Top face, then the underside.
    across, along = 20, 6
    spread = math.radians(spec.CAP_PEAK_SPREAD)
    start = len(verts)
    for under in (0, 1):
        for i in range(across + 1):
            s = 2 * i / across - 1
            theta = s * spread
            a = (theta / (2 * math.pi) * around) % around
            lo = int(math.floor(a)) % around
            hi = (lo + 1) % around
            mix = a - math.floor(a)
            root = shell(lo, 0.03).lerp(shell(hi, 0.03), mix)
            reach = spec.CAP_PEAK_LENGTH * math.cos(s * math.pi / 2 * 0.8)
            for j in range(along + 1):
                d = j / along
                verts.append(
                    root
                    + Vector(
                        (
                            math.sin(theta) * 0.012 * d,
                            -reach * d,
                            -reach * d * 0.2 - 0.018 * s * s * d
                            - 0.004 * d * d - under * 0.003,
                        )
                    )
                )
    row = along + 1
    half = (across + 1) * row
    for under in (0, 1):
        base = start + under * half
        for i in range(across):
            for j in range(along):
                quad = (
                    base + i * row + j, base + (i + 1) * row + j,
                    base + (i + 1) * row + j + 1, base + i * row + j + 1,
                )
                faces.append(quad if under else quad[::-1])
                # The peak takes its cloth from one panel of the crown.
                corners = [
                    (0.02 + 0.12 * (i + di) / across, 0.3 + 0.4 * (j + dj) / along)
                    for di, dj in ((0, 0), (1, 0), (1, 1), (0, 1))
                ]
                uvs += corners if under else corners[::-1]
                slots.append(under)
    # Close the peak's edge.
    edge = [(i, along) for i in range(across + 1)]
    edge = [(0, j) for j in range(along)] + edge + [(across, j) for j in range(along - 1, -1, -1)]
    for (i0, j0), (i1, j1) in zip(edge, edge[1:]):
        a0, a1 = start + i0 * row + j0, start + i1 * row + j1
        faces.append((a0, a1, a1 + half, a0 + half))
        uvs += [(0.05, 0.5)] * 4
        slots.append(1)

    # Cotton twill, with the six panel seams and the stitching round the rim.
    size = 1024
    y, x = np.mgrid[0:size, 0:size] / size
    twill = 0.5 + 0.5 * np.cos(2 * math.pi * (x * 200 + y * 140))
    seam = np.clip(1 - np.abs(((x * 6 + 0.5) % 1) - 0.5) / 0.012, 0, 1)
    band = np.clip(1 - np.abs(y - 0.07) / 0.004, 0, 1)
    groove = np.maximum(seam, band)
    height = twill * 0.25 - groove
    shade = (0.93 + 0.07 * twill) * (1 - 0.3 * groove)
    diffuse = paint.new_image(
        "cap_diffuse", np.array(spec.CAP)[None, None, :] * shade[..., None]
    )
    normal = paint.new_image(
        "cap_normal", paint.normal_from_height(height, 5), colour=False
    )
    cloth = paint.material("cap", (1, 1, 1), 0.9, diffuse=diffuse, normal=normal)
    under = paint.material("cap_under", spec.CAP_UNDER, 0.9)
    under.use_backface_culling = False
    return _skinned(
        "cap", verts, faces, [{"head": 1.0}] * len(verts), rig, [cloth, under],
        slots, uvs,
    )


def refine_head(body, rig):
    """Splits the head off the body mesh and subdivides it once, so the
    profile of the nose, lips, jaw and ears is round close up. Only the head:
    the hands hold up as they are and the triangles are better spent here."""
    head = paint.islands(body.data)[0]
    mesh = body.data.copy()
    for data, keep in ((mesh, True), (body.data, False)):
        bm = bmesh.new()
        bm.from_mesh(data)
        gone = [v for v in bm.verts if (v.index in head) != keep]
        bmesh.ops.delete(bm, geom=gone, context="VERTS")
        bm.to_mesh(data)
        bm.free()
    obj = bpy.data.objects.new("head", mesh)
    rig.users_collection[0].objects.link(obj)
    for group in body.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    obj.modifiers.new("Subdivide", "SUBSURF").levels = 1
    graph = bpy.context.evaluated_depsgraph_get()
    graph.update()
    smooth = bpy.data.meshes.new_from_object(
        obj.evaluated_get(graph), preserve_all_data_layers=True, depsgraph=graph
    )
    obj.modifiers.clear()
    obj.data = smooth
    bpy.data.meshes.remove(mesh)
    obj.parent = rig
    obj.modifiers.new("Armature", "ARMATURE").object = rig
    return obj
