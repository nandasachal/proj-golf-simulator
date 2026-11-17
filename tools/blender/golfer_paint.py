"""Image and UV helpers shared by the outfit and finish steps."""
import bpy
import numpy as np


def pixels(image):
    w, h = image.size
    data = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(data)
    # Rows run bottom to top, the same way UVs do.
    return data.reshape(h, w, 4)


def store(image, data, size=None):
    image.pixels.foreach_set(data.astype(np.float32).ravel())
    if size and image.size[0] > size:
        image.scale(size, size)
    image.pack()


def find(fragment):
    for image in bpy.data.images:
        if fragment in image.name:
            return image
    raise SystemExit(f"No image matching {fragment}")


def new_image(name, rgb, colour=True):
    """An image from an (h, w, 3) array of 0-1 values."""
    h, w, _ = rgb.shape
    image = bpy.data.images.new(name, w, h, alpha=False)
    if not colour:
        image.colorspace_settings.name = "Non-Color"
    data = np.ones((h, w, 4), dtype=np.float32)
    data[..., :3] = rgb
    store(image, data)
    return image


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def blur(field, radius):
    """Box blur, edges clamped."""
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (radius + 1, radius)
        total = np.cumsum(np.pad(field, pad, mode="edge"), axis=axis)
        n = field.shape[axis]
        upper = np.take(total, np.arange(2 * radius + 1, 2 * radius + 1 + n), axis)
        lower = np.take(total, np.arange(0, n), axis)
        field = (upper - lower) / (2 * radius + 1)
    return field


def grow(field, steps):
    """Spreads a field outward so it covers the texture's seams."""
    for _ in range(steps):
        spread = field.copy()
        spread[1:] = np.maximum(spread[1:], field[:-1])
        spread[:-1] = np.maximum(spread[:-1], field[1:])
        spread[:, 1:] = np.maximum(spread[:, 1:], field[:, :-1])
        spread[:, :-1] = np.maximum(spread[:, :-1], field[:, 1:])
        field = spread
    return field


def uv_field(obj, values, size):
    """Paints a value per vertex into the object's UV layout: an (h, w) field,
    interpolated across each face, zero where nothing was painted."""
    mesh = obj.data
    uv = mesh.uv_layers.active.data
    out = np.zeros((size, size), dtype=np.float32)
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        vals = [values[mesh.loops[i].vertex_index] for i in loops]
        if max(vals) <= 0:
            continue
        pts = [(uv[i].uv.x * size, uv[i].uv.y * size) for i in loops]
        for k in range(1, len(loops) - 1):
            (ax, ay), (bx, by), (cx, cy) = pts[0], pts[k], pts[k + 1]
            area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
            if abs(area) < 1e-9:
                continue
            x0 = max(int(min(ax, bx, cx)) - 1, 0)
            x1 = min(int(max(ax, bx, cx)) + 2, size)
            y0 = max(int(min(ay, by, cy)) - 1, 0)
            y1 = min(int(max(ay, by, cy)) + 2, size)
            if x0 >= x1 or y0 >= y1:
                continue
            xs, ys = np.meshgrid(
                np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5
            )
            wb = ((xs - ax) * (cy - ay) - (cx - ax) * (ys - ay)) / area
            wc = ((bx - ax) * (ys - ay) - (xs - ax) * (by - ay)) / area
            wa = 1 - wb - wc
            inside = (wa >= -0.02) & (wb >= -0.02) & (wc >= -0.02)
            value = wa * vals[0] + wb * vals[k] + wc * vals[k + 1]
            patch = out[y0:y1, x0:x1]
            patch[inside] = np.maximum(patch[inside], value[inside])
    return out


def islands(mesh):
    """Connected pieces of a mesh, largest first, as sets of vertex indices."""
    links = [[] for _ in mesh.vertices]
    for a, b in (e.vertices for e in mesh.edges):
        links[a].append(b)
        links[b].append(a)
    seen = set()
    found = []
    for start in range(len(links)):
        if start in seen:
            continue
        piece = {start}
        stack = [start]
        while stack:
            for other in links[stack.pop()]:
                if other not in piece:
                    piece.add(other)
                    stack.append(other)
        seen |= piece
        found.append(piece)
    return sorted(found, key=len, reverse=True)


def material(name, colour, roughness, metallic=0.0, diffuse=None, normal=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    # Colours are given as sRGB; the shader wants linear.
    linear = [((c + 0.055) / 1.055) ** 2.4 for c in colour]
    bsdf.inputs["Base Color"].default_value = (*linear, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if diffuse:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = diffuse
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if normal:
        add_normal(mat, normal)
    return mat


def add_normal(mat, image, strength=1.0):
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    image.colorspace_settings.name = "Non-Color"
    bump = nodes.new("ShaderNodeNormalMap")
    bump.inputs["Strength"].default_value = strength
    links.new(tex.outputs["Color"], bump.inputs["Color"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def normal_from_height(height, strength):
    """A tangent-space normal map (h, w, 3) from a height field that tiles."""
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * strength
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * strength
    length = np.sqrt(dx * dx + dy * dy + 1)
    return np.stack(
        [0.5 - 0.5 * dx / length, 0.5 - 0.5 * dy / length, 0.5 + 0.5 / length],
        axis=-1,
    )
