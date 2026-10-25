"""GLB export helpers for CatanX premium assets."""

from __future__ import annotations

import json
from pathlib import Path

import bpy

from .geometry import apply_flat_shading, count_triangles, set_origin_to_ground


def export_object_glb(
    obj: bpy.types.Object,
    output_path: Path,
    *,
    license_name: str = "Original CatanX — internal art (generated)",
    author: str = "CatanX Blender pipeline",
    category: str = "environment",
    budget_max: int = 800,
) -> dict:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    apply_flat_shading(obj)
    set_origin_to_ground(obj)

    tris = count_triangles(obj)
    if tris > budget_max:
        raise RuntimeError(f"{obj.name}: {tris} tris exceeds budget {budget_max}")

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_texcoords=False,
        export_normals=True,
        export_tangents=False,
        export_animations=False,
    )

    meta = {
        "id": obj.name,
        "file": str(output_path).replace("\\", "/"),
        "triangles": tris,
        "materials": len(obj.data.materials),
        "license": license_name,
        "author": author,
        "category": category,
        "budgetMax": budget_max,
    }
    meta_path = output_path.with_suffix(".meta.json")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta
