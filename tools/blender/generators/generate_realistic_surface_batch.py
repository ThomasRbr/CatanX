"""Generate CatanX realistic Surface hero assets.

This batch deliberately lives beside the legacy H1-H3 miniature pipeline.  It
uses bevelled, smooth-normal architecture and physically based materials, then
exports three LODs for settlements and cities.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def pbr_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    assert bsdf is not None
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    material.diffuse_color = color
    return material


def apply_tiled_pbr(
    material: bpy.types.Material,
    *,
    albedo_path: Path | None,
    normal_path: Path | None = None,
    roughness_path: Path | None = None,
    scale: float = 2.4,
    tint: tuple[float, float, float, float] = (1.0, 1.0, 1.0, 1.0),
    texture_weight: float = 0.78,
) -> None:
    """Wire photoreal maps (Object space) so atlas bakes keep façade micro-detail."""
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    assert bsdf is not None
    tex_coord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (scale, scale, scale)
    links.new(tex_coord.outputs["Object"], mapping.inputs["Vector"])

    if albedo_path is not None and albedo_path.exists():
        image = bpy.data.images.load(str(albedo_path), check_existing=True)
        image.colorspace_settings.name = "sRGB"
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.interpolation = "Smart"
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        if "ShaderNodeMix" in dir(bpy.types):
            mix = nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.inputs["Factor"].default_value = texture_weight
            mix.inputs["A"].default_value = tint
            links.new(tex.outputs["Color"], mix.inputs["B"])
            links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        else:
            mix = nodes.new("ShaderNodeMixRGB")
            mix.inputs["Fac"].default_value = texture_weight
            mix.inputs["Color1"].default_value = tint
            links.new(tex.outputs["Color"], mix.inputs["Color2"])
            links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])

    if normal_path is not None and normal_path.exists():
        nimg = bpy.data.images.load(str(normal_path), check_existing=True)
        nimg.colorspace_settings.name = "Non-Color"
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = nimg
        ntex.interpolation = "Smart"
        links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 1.65
        links.new(ntex.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    if roughness_path is not None and roughness_path.exists():
        rimg = bpy.data.images.load(str(roughness_path), check_existing=True)
        rimg.colorspace_settings.name = "Non-Color"
        rtex = nodes.new("ShaderNodeTexImage")
        rtex.image = rimg
        rtex.interpolation = "Smart"
        links.new(mapping.outputs["Vector"], rtex.inputs["Vector"])
        # Photoreal roughness maps are often packed; use Color→Roughness directly.
        links.new(rtex.outputs["Color"], bsdf.inputs["Roughness"])


def make_materials(texture_root: Path) -> dict[str, bpy.types.Material]:
    # Lifted authored colours — miniature façades must survive golden-hour contrast.
    materials = {
        "earth": pbr_material("cx_real_earth", (0.42, 0.34, 0.24, 1), roughness=0.98),
        "stone": pbr_material("cx_real_stone", (0.48, 0.46, 0.42, 1), roughness=0.96),
        "stone_light": pbr_material("cx_real_stone_light", (0.62, 0.59, 0.52, 1), roughness=0.94),
        "plaster": pbr_material("cx_real_plaster", (0.72, 0.66, 0.56, 1), roughness=0.93),
        "plaster_warm": pbr_material("cx_real_plaster_warm", (0.62, 0.52, 0.40, 1), roughness=0.94),
        "timber": pbr_material("cx_real_timber", (0.28, 0.18, 0.11, 1), roughness=0.91),
        "timber_light": pbr_material("cx_real_timber_light", (0.40, 0.28, 0.16, 1), roughness=0.9),
        "roof": pbr_material("cx_real_roof", (0.38, 0.40, 0.43, 1), roughness=0.88),
        "roof_alt": pbr_material("cx_real_roof_alt", (0.32, 0.34, 0.36, 1), roughness=0.86),
        "metal": pbr_material("cx_real_metal", (0.22, 0.23, 0.24, 1), roughness=0.54, metallic=0.62),
        "glass": pbr_material(
            "cx_real_window_warm",
            (0.72, 0.38, 0.12, 1),
            roughness=0.28,
            emission=(1.0, 0.35, 0.08, 1),
            emission_strength=2.1,
        ),
        "moss": pbr_material("cx_real_moss", (0.22, 0.30, 0.16, 1), roughness=1.0),
    }
    slate = texture_root / "slate_roof_albedo_v1.jpg"
    if not slate.exists():
        slate = texture_root / "weathered_roof_albedo_v1.jpg"
    apply_tiled_pbr(
        materials["plaster"],
        albedo_path=texture_root / "aged_plaster_albedo_v1.jpg",
        normal_path=texture_root / "aged_plaster_normal_v1.png",
        roughness_path=texture_root / "aged_plaster_roughness_v1.jpg",
        scale=2.1, tint=(0.92, 0.88, 0.80, 1), texture_weight=0.82,
    )
    apply_tiled_pbr(
        materials["plaster_warm"],
        albedo_path=texture_root / "aged_plaster_albedo_v1.jpg",
        normal_path=texture_root / "aged_plaster_normal_v1.png",
        roughness_path=texture_root / "aged_plaster_roughness_v1.jpg",
        scale=2.0, tint=(0.86, 0.74, 0.58, 1), texture_weight=0.8,
    )
    apply_tiled_pbr(
        materials["timber"],
        albedo_path=texture_root / "weathered_timber_albedo_v1.jpg",
        normal_path=texture_root / "weathered_timber_normal_v1.png",
        roughness_path=texture_root / "weathered_timber_roughness_v1.jpg",
        scale=2.4, tint=(0.70, 0.55, 0.40, 1), texture_weight=0.85,
    )
    apply_tiled_pbr(
        materials["timber_light"],
        albedo_path=texture_root / "weathered_timber_albedo_v1.jpg",
        normal_path=texture_root / "weathered_timber_normal_v1.png",
        roughness_path=texture_root / "weathered_timber_roughness_v1.jpg",
        scale=2.2, tint=(0.82, 0.68, 0.50, 1), texture_weight=0.82,
    )
    apply_tiled_pbr(
        materials["roof"],
        albedo_path=slate,
        normal_path=texture_root / "weathered_roof_normal_v1.png",
        roughness_path=texture_root / "weathered_roof_roughness_v1.jpg",
        scale=2.8, tint=(0.55, 0.58, 0.62, 1), texture_weight=0.88,
    )
    apply_tiled_pbr(
        materials["roof_alt"],
        albedo_path=slate,
        normal_path=texture_root / "weathered_roof_normal_v1.png",
        roughness_path=texture_root / "weathered_roof_roughness_v1.jpg",
        scale=2.6, tint=(0.48, 0.50, 0.54, 1), texture_weight=0.88,
    )
    apply_tiled_pbr(
        materials["stone"],
        albedo_path=texture_root / "rubble_stone_albedo_v2.jpg",
        normal_path=texture_root / "rubble_stone_normal_v2.png",
        roughness_path=texture_root / "rubble_stone_roughness_v2.jpg",
        scale=2.8, tint=(0.85, 0.84, 0.80, 1), texture_weight=0.8,
    )
    apply_tiled_pbr(
        materials["stone_light"],
        albedo_path=texture_root / "rubble_stone_albedo_v2.jpg",
        normal_path=texture_root / "rubble_stone_normal_v2.png",
        roughness_path=texture_root / "rubble_stone_roughness_v2.jpg",
        scale=2.5, tint=(0.92, 0.90, 0.84, 1), texture_weight=0.78,
    )
    apply_tiled_pbr(
        materials["earth"],
        albedo_path=texture_root / "village_ground_albedo_1.jpg",
        normal_path=texture_root / "village_ground_normal_1.png",
        roughness_path=texture_root / "village_ground_roughness_1.jpg",
        scale=1.8, tint=(0.75, 0.65, 0.50, 1), texture_weight=0.75,
    )
    return materials


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.append(material)


def cube(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
    segments: int = 2,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    if bevel > 0:
        modifier = obj.modifiers.new("cx_edge_softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    *,
    vertices: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.active_object
    obj.name = name
    assign(obj, material)
    bevel = obj.modifiers.new("cx_rim_softening", "BEVEL")
    bevel.width = min(radius * 0.08, depth * 0.12)
    bevel.segments = 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def beam_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Create a square timber brace between two authored façade points."""
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    obj = cube(
        name,
        (midpoint.x, midpoint.y, midpoint.z),
        (width, width, direction.length),
        material,
        bevel=width * 0.16,
        segments=2,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def ico(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    *,
    subdivisions: int = 2,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def rotated_xy(origin: tuple[float, float], local: tuple[float, float], yaw: float) -> tuple[float, float]:
    x, y = local
    c, s = math.cos(yaw), math.sin(yaw)
    return origin[0] + x * c - y * s, origin[1] + x * s + y * c


def authored_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    *,
    location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.0,
) -> bpy.types.Object:
    """Create authored architecture instead of stacking toy-like primitives."""
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    assign(obj, material)

    # Stable UV islands allow runtime photographic maps to retain their scale
    # on walls, roof slopes and gable ends.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.025)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

    if bevel > 0:
        modifier = obj.modifiers.new("cx_authored_edge_softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def gabled_wall_shell(
    name: str,
    origin: tuple[float, float],
    yaw: float,
    width: float,
    depth: float,
    base_z: float,
    eave_z: float,
    ridge_z: float,
    material: bpy.types.Material,
    bevel: float,
) -> bpy.types.Object:
    hw, hd = width * 0.5, depth * 0.5
    vertices = [
        (-hw, -hd, base_z), (hw, -hd, base_z), (hw, hd, base_z), (-hw, hd, base_z),
        (-hw, -hd, eave_z), (hw, -hd, eave_z), (hw, hd, eave_z), (-hw, hd, eave_z),
        (0.0, -hd, ridge_z), (0.0, hd, ridge_z),
    ]
    faces = [
        (0, 3, 2, 1),
        (0, 4, 7, 3), (1, 2, 6, 5),
        (0, 1, 5, 8, 4), (3, 7, 9, 6, 2),
    ]
    return authored_mesh(
        name,
        vertices,
        faces,
        material,
        location=(origin[0], origin[1], 0.0),
        rotation=(0.0, 0.0, yaw),
        bevel=bevel,
    )


def pitched_roof_shell(
    name: str,
    origin: tuple[float, float],
    yaw: float,
    width: float,
    depth: float,
    eave_z: float,
    ridge_z: float,
    thickness: float,
    material: bpy.types.Material,
    bevel: float,
) -> bpy.types.Object:
    """A continuous watertight roof with actual gables, eaves and fascia."""
    hw, hd = width * 0.5, depth * 0.5
    upper = [
        (-hw, -hd, eave_z), (-hw, hd, eave_z),
        (hw, -hd, eave_z), (hw, hd, eave_z),
        (0.0, -hd, ridge_z), (0.0, hd, ridge_z),
    ]
    lower = [(x, y, z - thickness) for x, y, z in upper]
    vertices = upper + lower
    faces = [
        (0, 1, 5, 4), (4, 5, 3, 2),
        (10, 11, 7, 6), (8, 9, 11, 10),
        (0, 6, 7, 1), (2, 3, 9, 8),
        (0, 4, 2, 8, 10, 6), (1, 7, 11, 9, 3, 5),
    ]
    return authored_mesh(
        name,
        vertices,
        faces,
        material,
        location=(origin[0], origin[1], 0.0),
        rotation=(0.0, 0.0, yaw),
        bevel=bevel,
    )


def add_house(
    parts: list[bpy.types.Object],
    mats: dict[str, bpy.types.Material],
    *,
    origin: tuple[float, float],
    yaw: float,
    scale: float,
    variant: int,
    detail: int,
) -> None:
    # Broad, low rural proportions. The former narrow/tall blocks read as toy
    # towers from the strategic camera even with realistic materials.
    width = (0.22 + (variant % 2) * 0.03) * scale
    depth = (0.19 + ((variant + 1) % 2) * 0.025) * scale
    wall_h = (0.105 + (variant % 3) * 0.011) * scale
    ox, oy = origin

    parts.append(cube(f"foundation_{len(parts)}", (ox, oy, 0.018 * scale), (width * 1.13, depth * 1.13, 0.036 * scale), mats["stone"], rotation=(0, 0, yaw), bevel=0.008 * scale))
    parts.append(cube(f"wall_{len(parts)}", (ox, oy, 0.055 * scale + wall_h * 0.5), (width, depth, wall_h), mats["plaster_warm" if variant % 3 == 2 else "plaster"], rotation=(0, 0, yaw), bevel=0.008 * scale, segments=3))

    roof_z = 0.055 * scale + wall_h + 0.046 * scale
    slope = math.radians(39)
    roof_mat = mats["roof_alt" if variant % 2 else "roof"]
    for side in (-1, 1):
        lx = side * width * 0.255
        x, y = rotated_xy(origin, (lx, 0), yaw)
        parts.append(cube(
            f"roof_{len(parts)}",
            (x, y, roof_z),
            (width * 0.72, depth * 1.27, 0.022 * scale),
            roof_mat,
            rotation=(0, side * slope, yaw),
            bevel=0.004 * scale,
            segments=2,
        ))
    parts.append(cube(
        f"roof_ridge_{len(parts)}",
        (ox, oy, roof_z + 0.039 * scale),
        (0.022 * scale, depth * 1.34, 0.022 * scale),
        mats["timber"],
        rotation=(0, 0, yaw),
        bevel=0.003 * scale,
        segments=2,
    ))

    # Timber frame and a deeply set door make the façade readable at game scale.
    front = rotated_xy(origin, (0, depth * 0.51), yaw)
    for lx in (-width * 0.36, width * 0.36):
        x, y = rotated_xy(origin, (lx, depth * 0.516), yaw)
        parts.append(cube(f"beam_{len(parts)}", (x, y, 0.06 * scale + wall_h * 0.5), (0.012 * scale, 0.012 * scale, wall_h * 0.92), mats["timber"], rotation=(0, 0, yaw), bevel=0.002 * scale))
    parts.append(cube(f"crossbeam_{len(parts)}", (front[0], front[1], 0.07 * scale + wall_h * 0.58), (width * 0.84, 0.012 * scale, 0.012 * scale), mats["timber"], rotation=(0, 0, yaw), bevel=0.002 * scale))
    parts.append(cube(f"door_{len(parts)}", (front[0], front[1] + math.cos(yaw) * 0.006, 0.07 * scale), (0.045 * scale, 0.014 * scale, 0.095 * scale), mats["timber_light"], rotation=(0, 0, yaw), bevel=0.004 * scale))

    if detail >= 1:
        brace_low = 0.066 * scale
        brace_high = 0.066 * scale + wall_h * 0.82
        for side in (-1, 1):
            low = rotated_xy(origin, (side * width * 0.34, depth * 0.528), yaw)
            high = rotated_xy(origin, (side * width * 0.08, depth * 0.532), yaw)
            parts.append(beam_between(
                f"diagonal_brace_{len(parts)}",
                (low[0], low[1], brace_low),
                (high[0], high[1], brace_high),
                0.011 * scale,
                mats["timber"],
            ))
        for lx in (-width * 0.29, width * 0.29):
            x, y = rotated_xy(origin, (lx, depth * 0.523), yaw)
            parts.append(cube(f"window_{len(parts)}", (x, y, 0.09 * scale + wall_h * 0.48), (0.032 * scale, 0.012 * scale, 0.039 * scale), mats["glass"], rotation=(0, 0, yaw), bevel=0.003 * scale))
        cx, cy = rotated_xy(origin, (width * 0.27, -depth * 0.12), yaw)
        parts.append(cube(f"chimney_{len(parts)}", (cx, cy, roof_z + 0.075 * scale), (0.034 * scale, 0.034 * scale, 0.14 * scale), mats["stone"], rotation=(0, 0, yaw), bevel=0.004 * scale))

    if detail >= 2:
        # Tile battens add real parallax without requiring a high-frequency decal.
        for row in range(5):
            ly = -depth * 0.45 + row * depth * 0.23
            for side in (-1, 1):
                lx = side * width * 0.265
                x, y = rotated_xy(origin, (lx, ly), yaw)
                parts.append(cube(
                    f"tile_ridge_{len(parts)}",
                    (x, y, roof_z + 0.008 * scale),
                    (width * 0.58, 0.012 * scale, 0.008 * scale),
                    roof_mat,
                    rotation=(0, side * slope, yaw),
                    bevel=0.0015 * scale,
                    segments=1,
                ))


def add_authored_house(
    parts: list[bpy.types.Object],
    mats: dict[str, bpy.types.Material],
    *,
    origin: tuple[float, float],
    yaw: float,
    scale: float,
    variant: int,
    detail: int,
) -> None:
    """Rural house with continuous roof, gable masonry and believable scale cues."""
    width = (0.23 + (variant % 3) * 0.018) * scale
    depth = (0.19 + ((variant + 1) % 3) * 0.017) * scale
    wall_h = (0.105 + (variant % 4) * 0.009) * scale
    ox, oy = origin
    base_z = 0.035 * scale
    eave_z = base_z + wall_h
    ridge_z = eave_z + width * (0.35 + (variant % 2) * 0.035)
    foundation_h = 0.042 * scale

    parts.append(cube(
        f"foundation_{len(parts)}", (ox, oy, foundation_h * 0.5),
        (width * 1.11, depth * 1.11, foundation_h), mats["stone"],
        rotation=(0, 0, yaw), bevel=0.006 * scale, segments=3,
    ))
    wall_mat = mats["stone_light"] if variant % 5 == 4 else mats[
        "plaster_warm" if variant % 3 == 2 else "plaster"
    ]
    parts.append(gabled_wall_shell(
        f"gable_wall_{len(parts)}", origin, yaw, width, depth, base_z,
        eave_z, ridge_z - 0.012 * scale, wall_mat, 0.0045 * scale,
    ))

    roof_mat = mats["roof_alt" if variant % 2 else "roof"]
    # Tight clusters need smaller eaves so pitched roofs don't weld into each other.
    overhang = 0.028 * scale
    parts.append(pitched_roof_shell(
        f"pitched_roof_{len(parts)}", origin, yaw,
        width + overhang * 2, depth + overhang * 2,
        eave_z + 0.011 * scale, ridge_z + 0.012 * scale,
        0.014 * scale, roof_mat, 0.0025 * scale,
    ))
    # Fascia under the eaves — reads as real carpentry, not a floating slab.
    if detail >= 1:
        for side in (-1.0, 1.0):
            fx, fy = rotated_xy(origin, (side * (width * 0.5 + overhang * 0.35), 0.0), yaw)
            parts.append(cube(
                f"fascia_{len(parts)}", (fx, fy, eave_z + 0.004 * scale),
                (0.012 * scale, depth + overhang * 1.4, 0.018 * scale), mats["timber"],
                rotation=(0, 0, yaw), bevel=0.0015 * scale, segments=1,
            ))
        for side in (-1.0, 1.0):
            fx, fy = rotated_xy(origin, (0.0, side * (depth * 0.5 + overhang * 0.35)), yaw)
            parts.append(cube(
                f"gable_fascia_{len(parts)}", (fx, fy, eave_z + 0.006 * scale),
                (width + overhang * 1.2, 0.012 * scale, 0.016 * scale), mats["timber"],
                rotation=(0, 0, yaw), bevel=0.0015 * scale, segments=1,
            ))

    front = rotated_xy(origin, (0, depth * 0.506), yaw)
    for lx in (-width * 0.36, width * 0.36):
        x, y = rotated_xy(origin, (lx, depth * 0.516), yaw)
        parts.append(cube(
            f"beam_{len(parts)}", (x, y, base_z + wall_h * 0.5),
            (0.010 * scale, 0.010 * scale, wall_h * 0.96), mats["timber"],
            rotation=(0, 0, yaw), bevel=0.0015 * scale,
        ))
    parts.append(cube(
        f"crossbeam_{len(parts)}", (front[0], front[1], base_z + wall_h * 0.62),
        (width * 0.88, 0.010 * scale, 0.010 * scale), mats["timber"],
        rotation=(0, 0, yaw), bevel=0.0015 * scale,
    ))
    door_center = rotated_xy(origin, (0, depth * 0.518), yaw)
    door_h = wall_h * 0.72
    parts.append(cube(
        f"door_{len(parts)}", (door_center[0], door_center[1], base_z + door_h * 0.5),
        (0.044 * scale, 0.014 * scale, door_h), mats["timber_light"],
        rotation=(0, 0, yaw), bevel=0.003 * scale,
    ))

    if detail >= 1:
        for side in (-1, 1):
            low = rotated_xy(origin, (side * width * 0.34, depth * 0.528), yaw)
            high = rotated_xy(origin, (side * width * 0.08, depth * 0.532), yaw)
            parts.append(beam_between(
                f"diagonal_brace_{len(parts)}",
                (low[0], low[1], base_z + wall_h * 0.1),
                (high[0], high[1], base_z + wall_h * 0.88),
                0.010 * scale, mats["timber"],
            ))
        for lx in (-width * 0.29, width * 0.29):
            x, y = rotated_xy(origin, (lx, depth * 0.523), yaw)
            window_z = base_z + wall_h * 0.58
            # Recessed opening: stone reveal + inset glass (not flush sticker).
            reveal_x, reveal_y = rotated_xy(origin, (lx, depth * 0.508), yaw)
            parts.append(cube(
                f"window_reveal_{len(parts)}", (reveal_x, reveal_y, window_z),
                (0.042 * scale, 0.018 * scale, 0.048 * scale), mats["stone_light"],
                rotation=(0, 0, yaw), bevel=0.002 * scale, segments=1,
            ))
            glass_x, glass_y = rotated_xy(origin, (lx, depth * 0.498), yaw)
            parts.append(cube(
                f"window_{len(parts)}", (glass_x, glass_y, window_z),
                (0.028 * scale, 0.008 * scale, 0.034 * scale), mats["glass"],
                rotation=(0, 0, yaw), bevel=0.0015 * scale,
            ))
            if detail >= 2:
                for shutter_side in (-1, 1):
                    sx, sy = rotated_xy(origin, (lx + shutter_side * 0.026 * scale, depth * 0.52), yaw)
                    parts.append(cube(
                        f"shutter_{len(parts)}", (sx, sy, window_z),
                        (0.012 * scale, 0.009 * scale, 0.044 * scale), mats["timber_light"],
                        rotation=(0, 0, yaw), bevel=0.001 * scale, segments=1,
                    ))
        cx, cy = rotated_xy(origin, (width * 0.27, -depth * 0.12), yaw)
        chimney_h = 0.12 * scale
        parts.append(cube(
            f"chimney_{len(parts)}", (cx, cy, ridge_z + chimney_h * 0.14),
            (0.034 * scale, 0.034 * scale, chimney_h), mats["stone"],
            rotation=(0, 0, yaw), bevel=0.003 * scale,
        ))
        parts.append(cube(
            f"chimney_cap_{len(parts)}", (cx, cy, ridge_z + chimney_h * 0.72),
            (0.046 * scale, 0.046 * scale, 0.014 * scale), mats["stone_light"],
            rotation=(0, 0, yaw), bevel=0.002 * scale,
        ))
        if detail >= 2:
            parts.append(cube(
                f"chimney_pot_{len(parts)}", (cx, cy, ridge_z + chimney_h * 0.86),
                (0.018 * scale, 0.018 * scale, 0.022 * scale), mats["metal"],
                rotation=(0, 0, yaw), bevel=0.001 * scale, segments=1,
            ))

    if detail >= 2 and variant % 3 == 1:
        ax, ay = rotated_xy(origin, (-width * 0.58, -depth * 0.08), yaw)
        parts.append(cube(
            f"annex_wall_{len(parts)}", (ax, ay, base_z + wall_h * 0.31),
            (width * 0.34, depth * 0.64, wall_h * 0.58), mats["stone_light"],
            rotation=(0, 0, yaw), bevel=0.004 * scale, segments=2,
        ))
        parts.append(cube(
            f"annex_roof_{len(parts)}", (ax, ay, base_z + wall_h * 0.65),
            (width * 0.42, depth * 0.72, 0.014 * scale), roof_mat,
            rotation=(0, math.radians(-17), yaw), bevel=0.002 * scale, segments=2,
        ))
    if detail >= 2:
        # Gutter strips under eaves — breaks the “floating roof slab” silhouette.
        for side in (-1.0, 1.0):
            gx, gy = rotated_xy(origin, (side * (width * 0.5 + overhang * 0.55), 0.0), yaw)
            parts.append(cube(
                f"gutter_{len(parts)}", (gx, gy, eave_z + 0.001 * scale),
                (0.008 * scale, depth + overhang * 1.5, 0.01 * scale), mats["metal"],
                rotation=(0, 0, yaw), bevel=0.001 * scale, segments=1,
            ))
        # Roof battens — micro relief that survives tiled albedo.
        for index in range(4):
            t = (index + 0.5) / 4
            bx = (t - 0.5) * (width + overhang)
            height_lift = abs(bx) / max(1e-4, width * 0.5 + overhang) * (ridge_z - eave_z)
            bx_w, by_w = rotated_xy(origin, (bx, 0.0), yaw)
            parts.append(cube(
                f"roof_batten_{len(parts)}",
                (bx_w, by_w, eave_z + 0.018 * scale + height_lift * 0.55),
                (0.01 * scale, depth + overhang * 1.55, 0.008 * scale),
                mats["timber"],
                rotation=(0, 0, yaw), bevel=0.001 * scale, segments=1,
            ))
    if detail >= 2 and variant % 2 == 0:
        # Woodpile — lived-in yard clutter for the diorama close-up.
        pile = rotated_xy(origin, (width * 0.62, depth * 0.18), yaw)
        for index in range(3):
            parts.append(cylinder(
                f"woodpile_{len(parts)}_{index}",
                (pile[0] + (index - 1) * 0.018 * scale, pile[1], 0.018 * scale + index * 0.004 * scale),
                0.012 * scale,
                0.055 * scale,
                mats["timber"],
                vertices=8,
            ))
        # Crate stack beside the woodpile.
        crate = rotated_xy(origin, (width * 0.72, depth * 0.02), yaw)
        parts.append(cube(
            f"crate_{len(parts)}", (crate[0], crate[1], 0.022 * scale),
            (0.034 * scale, 0.028 * scale, 0.03 * scale), mats["timber_light"],
            rotation=(0, 0, yaw + 0.2), bevel=0.002 * scale, segments=1,
        ))
        parts.append(cube(
            f"crate_top_{len(parts)}", (crate[0], crate[1], 0.048 * scale),
            (0.028 * scale, 0.024 * scale, 0.022 * scale), mats["timber"],
            rotation=(0, 0, yaw - 0.15), bevel=0.002 * scale, segments=1,
        ))

def add_tower(parts: list[bpy.types.Object], mats: dict[str, bpy.types.Material], *, city: bool, detail: int) -> None:
    height = 0.285 if city else 0.245
    width = 0.14 if city else 0.12
    # Offset off the courtyard so the tower no longer collides with ring houses.
    center = (-0.02, 0.02)
    parts.append(cube(
        "tower_foundation", (center[0], center[1], 0.025),
        (width * 1.2, width * 1.2, 0.05), mats["stone"], bevel=0.009, segments=3,
    ))
    parts.append(cube(
        "tower_body", (center[0], center[1], height * 0.5 + 0.035),
        (width, width, height), mats["stone_light"], bevel=0.009, segments=3,
    ))
    belfry_z = height + 0.045
    parts.append(cube(
        "tower_belfry", (center[0], center[1], belfry_z),
        (width * 1.08, width * 1.08, 0.075), mats["timber"], bevel=0.006, segments=2,
    ))
    if detail >= 1:
        for index, (dx, dy) in enumerate(((0, width * 0.551), (0, -width * 0.551), (width * 0.551, 0), (-width * 0.551, 0))):
            parts.append(cube(
                f"belfry_opening_{index}",
                (center[0] + dx, center[1] + dy, belfry_z),
                (0.043 if dx == 0 else 0.012, 0.043 if dy == 0 else 0.012, 0.044),
                mats["glass"], bevel=0.002,
            ))
    bpy.ops.mesh.primitive_cone_add(
        vertices=4, radius1=width * 0.88, radius2=0.012, depth=0.16,
        location=(center[0], center[1], belfry_z + 0.115), rotation=(0, 0, math.radians(45)),
    )
    roof = bpy.context.active_object
    roof.name = "tower_roof"
    assign(roof, mats["roof_alt"])
    if detail >= 1:
        for side in (-1, 1):
            parts.append(cube(
                f"tower_window_{side}",
                (center[0], center[1] - width * 0.505 * side, height * 0.62),
                (0.036, 0.01, 0.058), mats["glass"], bevel=0.003,
            ))
    parts.append(roof)


def add_boundary(parts: list[bpy.types.Object], mats: dict[str, bpy.types.Material], radius: float, detail: int) -> None:
    count = 24 if detail >= 2 else 14 if detail == 1 else 8
    for index in range(count):
        angle = index / count * math.tau
        wobble = 1 + math.sin(index * 2.17) * 0.055
        parts.append(ico(
            f"boundary_{index}",
            (math.cos(angle) * radius, math.sin(angle) * radius, 0.025),
            (0.035 * wobble, 0.025 * wobble, 0.024 * wobble),
            mats["stone" if index % 3 else "stone_light"],
            subdivisions=1,
        ))


def build_village(name: str, *, city: bool, lod: int, mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    detail = 2 if lod == 0 else 1 if lod == 1 else 0
    parts: list[bpy.types.Object] = []
    # Spaced organic courtyard — roofs must clear each other (capture failure mode).
    # Radial origins ~1.5× prior packing; fewer houses read more photoreal than a welded ring.
    houses = [
        ((-0.34, 0.22), 0.42, 1.00, 0),
        ((0.34, 0.20), -0.58, 0.94, 1),
        ((0.32, -0.28), 0.86, 0.98, 2),
        ((-0.30, -0.30), -0.78, 0.90, 3),
        ((0.06, 0.38), 0.08, 0.82, 4),
        ((-0.06, -0.40), 1.28, 0.78, 5),
    ]
    if city:
        houses = [
            ((-0.40, 0.28), 0.38, 1.02, 0),
            ((0.40, 0.26), -0.50, 0.96, 1),
            ((0.42, -0.30), 0.80, 1.00, 2),
            ((-0.40, -0.32), -0.72, 0.94, 3),
            ((0.05, 0.46), 0.06, 0.86, 4),
            ((0.50, -0.02), 1.18, 0.84, 5),
            ((-0.50, 0.04), -1.12, 0.86, 6),
            ((0.02, -0.48), 0.22, 0.82, 7),
        ]
    if lod == 2:
        houses = houses[: 5 if city else 4]
    elif lod == 1:
        houses = houses[: 7 if city else 5]
    # Roof half-extent ≈ 0.14–0.17; require ~1.08× clearance between centers.
    placed: list[tuple[tuple[float, float], float]] = []
    for origin, yaw, scale, variant in houses:
        roof_half = (0.16 + (variant % 3) * 0.01) * scale
        if any(
            math.hypot(origin[0] - other[0], origin[1] - other[1]) < (roof_half + other_half) * 1.08
            for other, other_half in placed
        ):
            continue
        add_authored_house(parts, mats, origin=origin, yaw=yaw, scale=scale, variant=variant, detail=detail)
        placed.append((origin, roof_half))

    add_tower(parts, mats, city=city, detail=detail)
    if detail >= 1:
        # Packed-earth square — soft, not a hard disc token.
        parts.append(cylinder(
            "village_courtyard",
            (0.04, -0.01, 0.008),
            0.155 if city else 0.115,
            0.014,
            mats["earth"],
            vertices=36,
        ))
        # Path through the square
        parts.append(cube(
            "village_path",
            (0.02, 0.01, 0.01),
            (0.34 if city else 0.26, 0.048, 0.01),
            mats["earth"],
            rotation=(0, 0, 0.4),
            bevel=0.003,
        ))
        # Well
        parts.append(cylinder("well_body", (0.0, 0.0, 0.035), 0.034, 0.06, mats["stone"], vertices=14))
        parts.append(cylinder("well_rim", (0.0, 0.0, 0.07), 0.038, 0.012, mats["timber"], vertices=14))
        # Cart
        parts.append(cube("cart_bed", (-0.08, 0.16, 0.03), (0.09, 0.05, 0.035), mats["timber_light"], rotation=(0, 0, 0.65), bevel=0.004))
        for wi, wz in enumerate((-0.025, 0.025)):
            parts.append(cylinder(f"cart_wheel_{wi}", (-0.09, 0.16 + wz, 0.02), 0.016, 0.008, mats["timber"], vertices=10))
        # Lean-to shed outside the house ring (was colocated with house 2).
        shed_origin = (0.52 if city else 0.44, -0.34)
        parts.append(cube(
            f"shed_body_{len(parts)}",
            (shed_origin[0], shed_origin[1], 0.052),
            (0.14, 0.1, 0.09),
            mats["timber_light"],
            rotation=(0, 0, -0.4),
            bevel=0.005,
            segments=2,
        ))
        parts.append(cube(
            f"shed_roof_{len(parts)}",
            (shed_origin[0], shed_origin[1], 0.11),
            (0.17, 0.13, 0.02),
            mats["roof_alt"],
            rotation=(0, math.radians(-12), -0.4),
            bevel=0.003,
            segments=2,
        ))
        for index, offset in enumerate(((-0.05, -0.08), (0.08, 0.1), (0.12, -0.06))):
            parts.append(cylinder(
                f"barrel_{index}",
                (offset[0], offset[1], 0.025),
                0.017,
                0.048,
                mats["timber_light"],
                vertices=12,
            ))
        # Hitching post + crate near the path — lived-in square.
        parts.append(cube(
            "hitching_post", (-0.14, 0.08, 0.055),
            (0.014, 0.014, 0.1), mats["timber"], bevel=0.002, segments=1,
        ))
        parts.append(cube(
            "square_crate", (0.1, -0.08, 0.024),
            (0.04, 0.032, 0.036), mats["timber_light"],
            rotation=(0, 0, 0.35), bevel=0.003, segments=1,
        ))
        # Partial fence run outside the house footprints (not a full circle).
        fence_count = 7 if city else 5
        for index in range(fence_count):
            t = index / max(1, fence_count - 1)
            angle = t * math.pi * 1.05 - 0.55
            r = (0.58 if city else 0.48) * (0.95 + (index % 2) * 0.04)
            fx, fy = math.cos(angle) * r, math.sin(angle) * r
            parts.append(cube(
                f"fence_post_{index}",
                (fx, fy, 0.035),
                (0.012, 0.012, 0.07),
                mats["timber"],
                bevel=0.002,
            ))
            if index > 0:
                prev_t = (index - 1) / max(1, fence_count - 1)
                prev_a = prev_t * math.pi * 1.05 - 0.55
                prev_r = (0.58 if city else 0.48) * (0.95 + ((index - 1) % 2) * 0.04)
                px, py = math.cos(prev_a) * prev_r, math.sin(prev_a) * prev_r
                mx, my = (fx + px) * 0.5, (fy + py) * 0.5
                length = math.hypot(fx - px, fy - py)
                yaw = math.atan2(fx - px, fy - py)
                parts.append(cube(
                    f"fence_rail_{index}",
                    (mx, my, 0.048),
                    (0.008, length, 0.01),
                    mats["timber"],
                    rotation=(0, 0, yaw),
                    bevel=0.001,
                ))

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    result = bpy.context.active_object
    result.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    triangulate = result.modifiers.new("cx_export_triangulation", "TRIANGULATE")
    triangulate.keep_custom_normals = True
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    # Re-project tiling UVs after join; atlas UV is authored later in prepare_atlas_uvs.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(56), island_margin=0.018)
    bpy.ops.object.mode_set(mode="OBJECT")
    min_z = min((result.matrix_world @ Vector(corner)).z for corner in result.bound_box)
    result.location.z -= min_z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    return result


def prepare_atlas_uvs(obj: bpy.types.Object) -> None:
    """Build UV0=tiling (runtime maps) and UV1=packed atlas (bake targets)."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mesh = obj.data
    # Ensure two UV layers: tiling + bake atlas.
    while len(mesh.uv_layers) < 2:
        mesh.uv_layers.new(name=f"UVMap_{len(mesh.uv_layers)}")
    mesh.uv_layers[0].name = "tiling"
    mesh.uv_layers[1].name = "bake"
    mesh.uv_layers["tiling"].active = True
    mesh.uv_layers["tiling"].active_render = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Stable façade tiling for photoreal maps at runtime.
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    # Packed atlas on second channel for AO/albedo/normal/roughness bakes.
    mesh.uv_layers["bake"].active = True
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01)
    bpy.ops.uv.pack_islands(margin=0.01)
    mesh.uv_layers["bake"].active = True
    bpy.ops.object.mode_set(mode="OBJECT")


def _attach_bake_target(obj: bpy.types.Object, image: bpy.types.Image) -> None:
    # Bake into the packed atlas UV (second channel).
    if obj.data.uv_layers.get("bake"):
        obj.data.uv_layers["bake"].active = True
    for material in obj.data.materials:
        if material is None or material.node_tree is None:
            continue
        nodes = material.node_tree.nodes
        for node in nodes:
            node.select = False
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        tex.select = True
        nodes.active = tex


def bake_ambient_occlusion(obj: bpy.types.Object, path: Path, *, size: int = 1024) -> Path | None:
    """Bake a unique AO atlas into the joined settlement UV for runtime cavity."""
    if not obj.data.polygons:
        return None
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.cycles.use_denoising = False
    image = bpy.data.images.new(name=f"{obj.name}_ao", width=size, height=size, alpha=False, float_buffer=False)
    # White fill: Cleared black atlases multiply Three.js façades into a void.
    image.generated_color = (1, 1, 1, 1)
    image.pixels = [1.0] * (size * size * 4)

    _attach_bake_target(obj, image)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(
        type="AO",
        margin=8,
        use_clear=False,
        cage_extrusion=0.03,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def bake_albedo_atlas(obj: bpy.types.Object, path: Path, *, size: int = 1024) -> Path | None:
    """Bake unique DIFFUSE colour (tiled photoreal × tint) into the atlas UV."""
    if not obj.data.polygons:
        return None
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 32
    bpy.context.scene.cycles.use_denoising = False
    image = bpy.data.images.new(name=f"{obj.name}_albedo", width=size, height=size, alpha=False, float_buffer=False)
    image.generated_color = (0.72, 0.68, 0.60, 1)
    image.pixels = [0.72, 0.68, 0.60, 1.0] * (size * size)

    _attach_bake_target(obj, image)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.bake(
            type="DIFFUSE",
            pass_filter={"COLOR"},
            margin=8,
            use_clear=False,
            cage_extrusion=0.03,
        )
    except TypeError:
        # Older bpy bake signature without pass_filter kwargs shape.
        bpy.context.scene.render.bake.use_pass_direct = False
        bpy.context.scene.render.bake.use_pass_indirect = False
        bpy.context.scene.render.bake.use_pass_color = True
        bpy.ops.object.bake(type="DIFFUSE", margin=8, use_clear=False, cage_extrusion=0.03)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def bake_normal_atlas(obj: bpy.types.Object, path: Path, *, size: int = 1024) -> Path | None:
    """Bake tangent-space normals from photoreal maps into the shared atlas UV."""
    if not obj.data.polygons:
        return None
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 24
    bpy.context.scene.cycles.use_denoising = False
    image = bpy.data.images.new(name=f"{obj.name}_normal", width=size, height=size, alpha=False, float_buffer=False)
    # Flat normal fill (0.5, 0.5, 1.0) — unused texels must not invert lighting.
    image.generated_color = (0.5, 0.5, 1.0, 1)
    image.pixels = [0.5, 0.5, 1.0, 1.0] * (size * size)
    image.colorspace_settings.name = "Non-Color"

    _attach_bake_target(obj, image)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(
        type="NORMAL",
        normal_space="TANGENT",
        margin=8,
        use_clear=False,
        cage_extrusion=0.03,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def bake_roughness_atlas(obj: bpy.types.Object, path: Path, *, size: int = 1024) -> Path | None:
    """Bake roughness into the shared atlas UV for wet/dry façade variation."""
    if not obj.data.polygons:
        return None
    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 16
    bpy.context.scene.cycles.use_denoising = False
    image = bpy.data.images.new(name=f"{obj.name}_roughness", width=size, height=size, alpha=False, float_buffer=False)
    image.generated_color = (0.9, 0.9, 0.9, 1)
    image.pixels = [0.9, 0.9, 0.9, 1.0] * (size * size)
    image.colorspace_settings.name = "Non-Color"

    _attach_bake_target(obj, image)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.bake(
        type="ROUGHNESS",
        margin=8,
        use_clear=False,
        cage_extrusion=0.03,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def export_glb(obj: bpy.types.Object, path: Path, *, lod: int, category: str) -> dict[str, object]:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
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
        export_tangents=True,
        export_animations=False,
    )
    meta = {
        "id": obj.name,
        "url": "/assets/models/realistic/" + path.name,
        "category": category,
        "lod": lod,
        "footprint": 0.46 if "city" in obj.name else 0.36,
        "castsShadow": True,
        "receivesShadow": True,
        "license": "Original CatanX — generated internal art",
        "author": "CatanX realistic Blender pipeline",
        "triangles": triangle_count(obj),
        "materials": len(obj.data.materials),
        "source": "tools/blender/generators/generate_realistic_surface_batch.py",
        "visualTier": "realistic",
    }
    path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, object]] = []

    for city in (False, True):
        family = "city" if city else "settlement"
        for lod in (0, 1, 2):
            reset_scene()
            texture_root = repo_root / "apps/client/public/assets/textures/buildings/photoreal"
            mats = make_materials(texture_root)
            asset_id = f"realistic_{family}_lod{lod}"
            obj = build_village(asset_id, city=city, lod=lod, mats=mats)
            path = output / f"{asset_id}.glb"
            # Unique atlases for LOD0/1 — cavity + façade albedo/normal/roughness.
            if lod <= 1:
                prepare_atlas_uvs(obj)
                size = 2048 if lod == 0 else 1024
                ao_path = output / f"{asset_id}_ao.png"
                albedo_path = output / f"{asset_id}_albedo.png"
                normal_path = output / f"{asset_id}_normal.png"
                roughness_path = output / f"{asset_id}_roughness.png"
                try:
                    bake_ambient_occlusion(obj, ao_path, size=size)
                    print(f"OK {asset_id} AO -> {ao_path}")
                except Exception as bake_exc:  # noqa: BLE001
                    print(f"WARN {asset_id} AO bake skipped: {bake_exc}")
                try:
                    bake_albedo_atlas(obj, albedo_path, size=size)
                    print(f"OK {asset_id} albedo -> {albedo_path}")
                except Exception as bake_exc:  # noqa: BLE001
                    print(f"WARN {asset_id} albedo bake skipped: {bake_exc}")
                try:
                    bake_normal_atlas(obj, normal_path, size=size)
                    print(f"OK {asset_id} normal -> {normal_path}")
                except Exception as bake_exc:  # noqa: BLE001
                    print(f"WARN {asset_id} normal bake skipped: {bake_exc}")
                try:
                    bake_roughness_atlas(obj, roughness_path, size=size)
                    print(f"OK {asset_id} roughness -> {roughness_path}")
                except Exception as bake_exc:  # noqa: BLE001
                    print(f"WARN {asset_id} roughness bake skipped: {bake_exc}")
            meta = export_glb(obj, path, lod=lod, category="buildings")
            if lod <= 1:
                meta["aoAtlas"] = f"/assets/models/realistic/{asset_id}_ao.png"
                meta["albedoAtlas"] = f"/assets/models/realistic/{asset_id}_albedo.png"
                meta["normalAtlas"] = f"/assets/models/realistic/{asset_id}_normal.png"
                meta["roughnessAtlas"] = f"/assets/models/realistic/{asset_id}_roughness.png"
            manifest.append(meta)
            print(f"OK {asset_id}: {meta['triangles']} tris -> {path}")

    manifest_path = output / "realistic-surface-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    license_path = repo_root / "apps/client/public/assets/licenses/REALISTIC_SURFACE_ASSETS.md"
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(
        "# CatanX realistic Surface assets\n\n"
        "Original procedural meshes and PBR materials generated by the CatanX art pipeline.\n"
        "This family includes settlement/city LODs, weathered roofs and the dirt-road material set.\n"
        "No third-party or Catan assets are embedded.\n",
        encoding="utf-8",
    )
    print(f"Realistic Surface batch complete: {len(manifest)} assets")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        import traceback

        print(f"ERROR: {exc}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
