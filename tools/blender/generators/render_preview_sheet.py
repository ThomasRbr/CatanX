"""Render an orthographic preview sheet of H1 GLB assets."""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--models", required=True)
    parser.add_argument("--preview", required=True)
    parser.add_argument("--contains", default="")
    parser.add_argument("--output", default="h1_asset_sheet.png")
    return parser.parse_args(argv)


def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def setup_world() -> None:
    world = bpy.data.worlds.new("PreviewWorld")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.72, 0.80, 0.76, 1.0)
    bg.inputs[1].default_value = 1.0


def add_light() -> None:
    light_data = bpy.data.lights.new(name="Sun", type="SUN")
    light_data.energy = 3.2
    light_data.angle = 0.12
    light = bpy.data.objects.new(name="Sun", object_data=light_data)
    bpy.context.collection.objects.link(light)
    light.location = (-6, -5, 10)
    light.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))

    fill = bpy.data.lights.new(name="Fill", type="AREA")
    fill.energy = 55
    fill.size = 8
    fill_obj = bpy.data.objects.new(name="Fill", object_data=fill)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.location = (5, 4, 4)


def import_glb(path: Path) -> list[bpy.types.Object]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    after = [o for o in bpy.data.objects if o not in before]
    return [o for o in after if o.type == "MESH" or o.type == "EMPTY"]


def bounds_of(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def main() -> None:
    args = parse_args()
    models_root = Path(args.models)
    preview_root = Path(args.preview)
    preview_root.mkdir(parents=True, exist_ok=True)

    glbs = sorted(models_root.rglob("*.glb"))
    if args.contains:
        glbs = [path for path in glbs if args.contains.lower() in path.as_posix().lower()]
    unique = []
    seen_names = set()
    for path in glbs:
        if path.parent == models_root and (models_root / "environment").exists():
            continue
        if path.stem in seen_names:
            continue
        seen_names.add(path.stem)
        unique.append(path)

    reset()
    setup_world()
    add_light()

    # Ground plane for shadows / scale reference
    bpy.ops.mesh.primitive_plane_add(size=24, location=(4.0, -2.5, 0))
    ground = bpy.context.active_object
    ground.name = "ground"
    mat = bpy.data.materials.new("ground_mat")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.70, 0.64, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    ground.data.materials.append(mat)

    cols = 6
    spacing = 1.55
    roots = []
    for i, path in enumerate(unique):
        objs = import_glb(path)
        meshes = [o for o in objs if o.type == "MESH"]
        if not meshes:
            continue
        root = meshes[0]
        for o in meshes[1:]:
            o.parent = root
        # Normalize pivot to ground under each asset
        mins, _maxs = bounds_of([root, *meshes[1:]])
        root.location.z -= mins.z
        col = i % cols
        row = i // cols
        root.location.x = col * spacing
        root.location.y = -row * spacing
        roots.append(root)

    # Frame the whole grid
    all_meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.name != "ground"]
    mins, maxs = bounds_of(all_meshes)
    center = (mins + maxs) * 0.5
    span = max(maxs.x - mins.x, maxs.y - mins.y, 1.0)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = span * 1.25
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    # NW game-like orthographic angle aimed at grid center
    cam.location = (center.x + span * 0.55, center.y - span * 0.75, center.z + span * 0.7)
    direction = center - cam.location
    rot_quat = direction.to_track_quat("-Z", "Y")
    cam.rotation_euler = rot_quat.to_euler()

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.filepath = str(preview_root / args.output)
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    bpy.ops.render.render(write_still=True)
    print(f"Preview written: {scene.render.filepath}")
    print(f"Assets on sheet: {len(roots)} center={tuple(center)} span={span:.2f}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
