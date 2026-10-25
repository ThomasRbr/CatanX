"""Shared physically based materials for CatanX diorama assets."""

from __future__ import annotations

import bpy

from .palette import PALETTE


def clear_orphaned_materials() -> None:
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)


def make_mat(
    name: str,
    rgba: tuple[float, float, float, float],
    roughness: float = 0.88,
    metallic: float = 0.02,
    coat_weight: float = 0.0,
) -> bpy.types.Material:
    existing = bpy.data.materials.get(name)
    if existing:
        return existing
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat_weight
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.diffuse_color = rgba
    return mat


def mat(key: str, roughness: float = 0.88) -> bpy.types.Material:
    rgba = PALETTE[key]
    return make_mat(f"cx_{key}", rgba, roughness=roughness)


def assign(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
