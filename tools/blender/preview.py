"""Renders review stills of golfer.blend.

    blender -b tools/blender/golfer.blend -P tools/blender/preview.py -- <out dir>
"""
import math
import os
import sys

import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.55, 0.6, 0.66, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.7
scene.world = world
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(35))
scene.collection.objects.link(sun)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam

# name: (camera position, look-at, focal length); the figure faces -y, z up.
VIEWS = {
    "front": ((0, -4.2, 1.0), (0, 0, 0.92), 50),
    "side": ((4.2, 0, 1.0), (0, 0, 0.92), 50),
    "back": ((0, 4.2, 1.0), (0, 0, 0.92), 50),
    "face": ((0.12, -0.75, 1.68), (0, 0, 1.66), 60),
    "face_side": ((0.75, -0.2, 1.68), (0, 0, 1.66), 60),
    "hand": ((0.75, -0.55, 0.95), (0.42, 0, 0.9), 60),
}
only = os.environ.get("VIEWS")
for name, (position, target, lens) in VIEWS.items():
    if only and name not in only.split(","):
        continue
    cam.location = position
    cam.data.lens = lens
    direction = Vector(target) - Vector(position)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out, name + ".png")
    bpy.ops.render.render(write_still=True)
