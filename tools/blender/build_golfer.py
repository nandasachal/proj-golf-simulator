"""Builds the golfer character with MPFB (MakeHuman) and exports it.

    blender -b -P tools/blender/build_golfer.py

Needs the MPFB extension and the MakeHuman system asset pack (both CC0 for
assets); see tools/blender/README.md. Writes tools/blender/golfer.blend (the
working file) and public/models/golfer.glb (what the simulator loads).
"""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
REPO = os.path.dirname(os.path.dirname(HERE))
BLEND = os.path.join(HERE, "golfer.blend")
GLB = os.path.join(REPO, "public", "models", "golfer.glb")

from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.assetservice import AssetService
from bl_ext.blender_org.mpfb.services.exportservice import ExportService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService

import golfer_spec as spec

bpy.ops.wm.read_factory_settings(use_empty=True)

DATA = LocationService.get_user_data()


def asset(kind, name, ext="mhclo"):
    path = os.path.join(DATA, kind, name, f"{name}.{ext}")
    if not os.path.exists(path):
        raise SystemExit(f"Missing MakeHuman asset: {path}")
    return path


human = HumanService.create_human(
    mask_helpers=True,
    detailed_helpers=True,
    extra_vertex_groups=True,
    feet_on_ground=True,
    scale=0.1,
    macro_detail_dict=spec.MACROS,
)
human.name = "body"
for target, weight in spec.TARGETS.items():
    path = TargetService.target_full_path(target)
    if not path:
        raise SystemExit(f"Unknown target: {target}")
    TargetService.load_target(human, path, weight=weight, name=target)

# The rig and the clothes are fitted to the mesh as it stands, so the shape
# has to be final before either goes on.
TargetService.bake_targets(human)

import golfer_outfit

with open(os.path.join(HERE, "golfer_measure.json"), "w") as out:
    json.dump(golfer_outfit.measure(human), out, indent=2)
    out.write("\n")

HumanService.set_character_skin(
    asset("skins", spec.SKIN, "mhmat"), human, skin_type="GAMEENGINE"
)
HumanService.add_builtin_rig(human, "game_engine", import_weights=True)
for kind, name, asset_type in spec.ASSETS:
    HumanService.add_mhclo_asset(
        asset(kind, name),
        human,
        asset_type=asset_type,
        subdiv_levels=0,
        material_type="GAMEENGINE",
    )

ExportService.bake_modifiers_remove_helpers(
    human, bake_masks=True, bake_subdiv=False, remove_helpers=True
)

rig = human.parent
suit = bpy.data.objects[f"body.{spec.SUIT}"]
golfer_outfit.glove(human, spec)
golfer_outfit.collar(suit, human, rig, spec)
golfer_outfit.cap(human, rig, spec)

import golfer_finish

golfer_finish.run(human, spec)
golfer_outfit.refine_head(human, rig)
triangles = 0
for obj in bpy.data.objects:
    if obj.type == "MESH":
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
print("TRIANGLES", triangles)

bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
os.makedirs(os.path.dirname(GLB), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format="GLB",
    export_yup=True,
    export_apply=False,
    export_animations=False,
    export_skins=True,
    export_morph=False,
    export_image_format="WEBP",
    export_image_quality=85,
    export_tangents=False,
)
print("GLB bytes", os.path.getsize(GLB))
