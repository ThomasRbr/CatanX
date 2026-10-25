"""Generate denser photoreal-leaning tree GLBs for the CatanX diorama.

Exports spruce / pine / deciduous / beech at LOD0–2 into
apps/client/public/assets/models/realistic/vegetation/
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def pbr(name: str, color: tuple[float, float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    assert bsdf is not None
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    material.diffuse_color = color
    return material


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)


def build_conifer(name: str, *, species: str, lod: int) -> bpy.types.Object:
    bark = pbr(f"{name}_bark", (0.22, 0.14, 0.08, 1), 0.96)
    # Saturated forest greens — the previous beige palette read as dead wood.
    if species == "pine":
        needle = pbr(f"{name}_needle", (0.22, 0.42, 0.18, 1), 0.88)
        layers = 7 if lod == 0 else 5 if lod == 1 else 3
        height = 1.25
        trunk_r = 0.03
        base_radius = 0.26
    elif species == "beech":
        needle = pbr(f"{name}_foliage", (0.30, 0.48, 0.18, 1), 0.86)
        layers = 6 if lod == 0 else 4 if lod == 1 else 3
        height = 1.05
        trunk_r = 0.034
        base_radius = 0.24
    elif species == "deciduous":
        needle = pbr(f"{name}_foliage", (0.34, 0.52, 0.20, 1), 0.85)
        layers = 6 if lod == 0 else 4 if lod == 1 else 3
        height = 1.0
        trunk_r = 0.032
        base_radius = 0.26
    else:  # spruce
        needle = pbr(f"{name}_needle", (0.16, 0.36, 0.14, 1), 0.9)
        layers = 8 if lod == 0 else 6 if lod == 1 else 4
        height = 1.35
        trunk_r = 0.026
        base_radius = 0.22

    parts: list[bpy.types.Object] = []
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12 if lod < 2 else 7,
        radius=trunk_r,
        depth=height * 0.58,
        location=(0, 0, height * 0.24),
    )
    trunk = bpy.context.active_object
    trunk.name = f"{name}_trunk"
    assign(trunk, bark)
    parts.append(trunk)

    for index in range(layers):
        t = index / max(1, layers - 1)
        if species in ("spruce", "pine"):
            radius = base_radius * (1.12 - t * 0.86)
            z = height * (0.26 + t * 0.68)
            depth = height * (0.14 if lod == 0 else 0.12)
            verts = 12 if lod == 0 else 9 if lod == 1 else 6
            bpy.ops.mesh.primitive_cone_add(
                vertices=verts,
                radius1=radius,
                radius2=max(0.01, radius * 0.06),
                depth=depth,
                location=(0, 0, z),
            )
            # Side branch puff for density at LOD0
            if lod == 0 and index % 2 == 0 and index < layers - 1:
                crown = bpy.context.active_object
                crown.name = f"{name}_crown_{index}"
                assign(crown, needle)
                for polygon in crown.data.polygons:
                    polygon.use_smooth = True
                crown.rotation_euler[2] = index * 0.41
                parts.append(crown)
                for side in (-1, 1):
                    bpy.ops.mesh.primitive_cone_add(
                        vertices=8,
                        radius1=radius * 0.42,
                        radius2=0.008,
                        depth=depth * 0.7,
                        location=(side * radius * 0.35, 0, z - depth * 0.08),
                        rotation=(0, side * 0.55, index * 0.2),
                    )
                    branch = bpy.context.active_object
                    branch.name = f"{name}_branch_{index}_{side}"
                    assign(branch, needle)
                    for polygon in branch.data.polygons:
                        polygon.use_smooth = True
                    parts.append(branch)
                continue
        else:
            radius = base_radius * (0.7 + math.sin(t * math.pi) * 0.55)
            z = height * (0.38 + t * 0.5)
            verts = 3 if lod == 0 else 2 if lod == 1 else 1
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=verts, radius=radius, location=(0, 0, z))

        crown = bpy.context.active_object
        crown.name = f"{name}_crown_{index}"
        assign(crown, needle)
        for polygon in crown.data.polygons:
            polygon.use_smooth = True
        crown.rotation_euler[2] = index * 0.41
        if species not in ("spruce", "pine"):
            crown.scale = (1.05 + (index % 2) * 0.15, 0.92 + (index % 3) * 0.1, 0.72 + t * 0.12)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            # Extra canopy blob for volume
            if lod == 0 and index < layers - 1:
                parts.append(crown)
                bpy.ops.mesh.primitive_ico_sphere_add(
                    subdivisions=2,
                    radius=radius * 0.55,
                    location=(math.cos(index) * radius * 0.25, math.sin(index) * radius * 0.25, z + radius * 0.1),
                )
                puff = bpy.context.active_object
                puff.name = f"{name}_puff_{index}"
                assign(puff, needle)
                for polygon in puff.data.polygons:
                    polygon.use_smooth = True
                parts.append(puff)
                continue
        parts.append(crown)

    bpy.ops.object.select_all(action="DESELECT")
    # Keep trunk and foliage as separate meshes so the runtime can instance
    # each material correctly (a joined mesh collapsed to bark beige).
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = name
    for part in parts:
        part.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = root
    # Flatten transforms onto meshes, leave hierarchy for glTF multi-mesh export.
    for part in parts:
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        triangulate = part.modifiers.new("cx_export_triangulation", "TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = root
    min_z = min(
        (part.matrix_world @ Vector(corner)).z
        for part in parts
        for corner in part.bound_box
    )
    for part in parts:
        part.location.z -= min_z
        bpy.ops.object.select_all(action="DESELECT")
        part.select_set(True)
        bpy.context.view_layer.objects.active = part
        bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = root
    return root


def export_glb(obj: bpy.types.Object, path: Path, *, lod: int, species: str) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    # Select root + all children for multi-mesh export.
    def select_hierarchy(root: bpy.types.Object) -> None:
        root.select_set(True)
        for child in root.children:
            select_hierarchy(child)

    select_hierarchy(obj)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_animations=False,
    )
    tris = 0
    for child in obj.children_recursive:
        if child.type == "MESH":
            child.data.calc_loop_triangles()
            tris += len(child.data.loop_triangles)
    meta = {
        "id": obj.name,
        "url": "/assets/models/realistic/vegetation/" + path.name,
        "category": "vegetation",
        "species": species,
        "lod": lod,
        "license": "Original CatanX — generated internal art",
        "triangles": tris,
        "source": "tools/blender/generators/generate_realistic_trees_batch.py",
        "visualTier": "realistic",
    }
    path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []
    for species in ("spruce", "pine", "deciduous", "beech"):
        for lod in (0, 1, 2):
            reset_scene()
            asset_id = f"realistic_{species}_lod{lod}"
            obj = build_conifer(asset_id, species=species, lod=lod)
            path = output / f"{asset_id}.glb"
            meta = export_glb(obj, path, lod=lod, species=species)
            manifest.append(meta)
            print(f"OK {asset_id}: {meta['triangles']} tris -> {path}")
    (output / "realistic-vegetation-manifest.json").write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )
    print(f"Realistic vegetation batch complete: {len(manifest)} assets")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        import traceback

        print(f"ERROR: {exc}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
