"""Generate original premium Cities & Knights tabletop pieces as GLB assets."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
LIB_DIR = SCRIPT_DIR.parent / "lib"
if str(LIB_DIR.parent) not in sys.path:
    sys.path.insert(0, str(LIB_DIR.parent))

from lib.export_glb import export_object_glb  # noqa: E402
from lib.geometry import (  # noqa: E402
    join_objects,
    primitive_cone,
    primitive_cube,
    primitive_cylinder,
    primitive_ico,
    reset_scene,
)
from lib.materials import assign, clear_orphaned_materials, make_mat  # noqa: E402
from lib.validation import assert_glb_exists, assert_triangle_budget  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview", required=False)
    return parser.parse_args(argv)


def premium_materials() -> dict[str, bpy.types.Material]:
    ivory = make_mat("ck_ceramic_ivory", (0.72, 0.75, 0.78, 1.0), roughness=0.34)
    graphite = make_mat("ck_graphite", (0.055, 0.075, 0.105, 1.0), roughness=0.3)
    gold = make_mat("ck_brushed_gold", (0.82, 0.55, 0.16, 1.0), roughness=0.28)
    stone = make_mat("ck_stone", (0.38, 0.42, 0.46, 1.0), roughness=0.78)
    stone_light = make_mat("ck_stone_light", (0.56, 0.59, 0.61, 1.0), roughness=0.72)
    leather = make_mat("ck_leather", (0.18, 0.095, 0.055, 1.0), roughness=0.66)
    coral = make_mat("ck_barbarian_coral", (0.88, 0.12, 0.075, 1.0), roughness=0.42)
    for material, metallic in ((ivory, 0.06), (graphite, 0.28), (gold, 0.72), (stone, 0.04), (stone_light, 0.03), (leather, 0.02), (coral, 0.08)):
        node = material.node_tree.nodes.get("Principled BSDF")
        if node and "Metallic" in node.inputs:
            node.inputs["Metallic"].default_value = metallic
    return {"ivory": ivory, "graphite": graphite, "gold": gold, "stone": stone, "stone_light": stone_light, "leather": leather, "coral": coral}


def cylinder_between(name: str, a: tuple[float, float, float], b: tuple[float, float, float], radius: float, vertices: int = 8):
    start = Vector(a)
    end = Vector(b)
    direction = end - start
    obj = primitive_cylinder(name, radius, direction.length, location=(start + end) * 0.5, vertices=vertices)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def flattened_cylinder(name: str, radius: float, depth: float, location, rotation=(math.pi / 2, 0, 0), vertices: int = 12):
    obj = primitive_cylinder(name, radius, depth, location=location, vertices=vertices)
    obj.rotation_euler = rotation
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def apply_rotation(obj: bpy.types.Object, rotation: tuple[float, float, float]) -> bpy.types.Object:
    obj.rotation_euler = rotation
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def build_knight(name: str, rank: int) -> bpy.types.Object:
    m = premium_materials()
    parts = []

    base = primitive_cylinder("plinth", 0.125 + rank * 0.008, 0.035, location=(0, 0, 0.018), vertices=16)
    assign(base, m["graphite"])
    rim = primitive_cylinder("plinth_rim", 0.11 + rank * 0.008, 0.018, location=(0, 0, 0.043), vertices=16)
    assign(rim, m["gold"])
    parts.extend([base, rim])

    leg_x = 0.035 + rank * 0.003
    for side in (-1, 1):
        leg = primitive_cylinder(f"leg_{side}", 0.026, 0.13, location=(side * leg_x, 0, 0.105), vertices=7)
        assign(leg, m["graphite"])
        boot = primitive_cube(f"boot_{side}", 1, location=(side * leg_x, -0.018, 0.055), scale=(0.034, 0.05, 0.025))
        assign(boot, m["leather"])
        parts.extend([leg, boot])

    torso = primitive_cone("torso", 0.078 + rank * 0.008, 0.18 + rank * 0.012, location=(0, 0, 0.225), vertices=8, radius2=0.058 + rank * 0.006)
    assign(torso, m["ivory"])
    belt = primitive_cylinder("belt", 0.071 + rank * 0.007, 0.025, location=(0, 0, 0.18), vertices=10)
    assign(belt, m["gold"])
    parts.extend([torso, belt])

    shoulder_width = 0.09 + rank * 0.012
    for side in (-1, 1):
        shoulder = primitive_ico(f"shoulder_{side}", 0.047 + rank * 0.003, location=(side * shoulder_width, 0, 0.295), subdivisions=1, scale=(1.2, 0.8, 0.72))
        assign(shoulder, m["graphite"] if rank > 1 else m["ivory"])
        arm = cylinder_between(f"arm_{side}", (side * shoulder_width, 0, 0.275), (side * (shoulder_width + 0.012), -0.005, 0.19), 0.024, 7)
        assign(arm, m["ivory"])
        parts.extend([shoulder, arm])

    if rank >= 2:
        for side in (-1, 1):
            spike = primitive_cone(
                f"shoulder_spike_{side}",
                0.022 + rank * 0.003,
                0.07 + rank * 0.012,
                location=(side * (shoulder_width + 0.012), 0, 0.352 + rank * 0.004),
                vertices=6,
            )
            assign(spike, m["gold"] if rank == 3 else m["graphite"])
            parts.append(spike)

    neck = primitive_cylinder("neck", 0.028, 0.045, location=(0, 0, 0.345 + rank * 0.008), vertices=8)
    head = primitive_ico("head", 0.052, location=(0, 0, 0.395 + rank * 0.01), subdivisions=1, scale=(0.88, 0.82, 1.05))
    assign(neck, m["graphite"])
    assign(head, m["ivory"])
    parts.extend([neck, head])

    helmet = primitive_cone("helmet", 0.064 + rank * 0.004, 0.09, location=(0, 0, 0.445 + rank * 0.012), vertices=8, radius2=0.025)
    assign(helmet, m["graphite"])
    visor = primitive_cube("visor", 1, location=(0, -0.052, 0.407 + rank * 0.01), scale=(0.048, 0.012, 0.018))
    assign(visor, m["gold"])
    parts.extend([helmet, visor])

    crest_height = 0.07 + rank * 0.025
    crest = primitive_cube("crest", 1, location=(0, 0.012, 0.49 + rank * 0.018), scale=(0.014 + rank * 0.003, 0.045, crest_height * 0.5))
    assign(crest, m["gold"] if rank == 3 else m["ivory"])
    parts.append(crest)

    shield_radius = 0.07 + rank * 0.009
    shield = flattened_cylinder("shield", shield_radius, 0.018, location=(-0.105 - rank * 0.01, -0.035, 0.235), vertices=12)
    assign(shield, m["graphite"])
    shield_boss = primitive_ico("shield_boss", 0.025, location=(-0.105 - rank * 0.01, -0.057, 0.235), subdivisions=1)
    assign(shield_boss, m["gold"])
    parts.extend([shield, shield_boss])
    for mark_index in range(rank):
        mark = primitive_cube(
            f"shield_rank_{mark_index}",
            1,
            location=(-0.105 - rank * 0.01 + (mark_index - (rank - 1) * 0.5) * 0.025, -0.058, 0.2),
            scale=(0.006, 0.006, 0.025),
        )
        assign(mark, m["gold"])
        parts.append(mark)

    if rank == 1:
        weapon = cylinder_between("spear", (0.11, 0.01, 0.08), (0.15, 0.01, 0.52), 0.009, 7)
        tip = primitive_cone("spear_tip", 0.025, 0.075, location=(0.157, 0.01, 0.555), vertices=6)
    elif rank == 2:
        weapon = cylinder_between("halberd", (0.12, 0.01, 0.07), (0.17, 0.01, 0.56), 0.011, 8)
        tip = primitive_cone("halberd_tip", 0.035, 0.1, location=(0.178, 0.01, 0.605), vertices=6)
        blade = primitive_cube("halberd_blade", 1, location=(0.145, 0.008, 0.57), scale=(0.055, 0.012, 0.04))
        assign(blade, m["ivory"])
        parts.append(blade)
    else:
        weapon = cylinder_between("great_sword", (0.105, -0.005, 0.11), (0.15, -0.005, 0.52), 0.014, 8)
        tip = primitive_cone("sword_tip", 0.032, 0.1, location=(0.156, -0.005, 0.565), vertices=4)
        guard = primitive_cube("guard", 1, location=(0.115, -0.005, 0.17), scale=(0.072, 0.018, 0.012))
        cape = primitive_cube("cape", 1, location=(0, 0.06, 0.245), scale=(0.135, 0.018, 0.17))
        cape.rotation_euler[0] = math.radians(-8)
        assign(guard, m["gold"])
        assign(cape, m["graphite"])
        parts.extend([guard, cape])
    assign(weapon, m["ivory"] if rank == 3 else m["leather"])
    assign(tip, m["gold"])
    parts.extend([weapon, tip])

    return join_objects(name, parts)


def build_wall_segment(name: str) -> bpy.types.Object:
    m = premium_materials()
    parts = []
    body = primitive_cube("wall_body", 1, location=(0, 0, 0.07), scale=(0.15, 0.032, 0.075))
    assign(body, m["stone"])
    parts.append(body)
    for i, x in enumerate((-0.12, -0.04, 0.04, 0.12)):
        merlon = primitive_cube(f"merlon_{i}", 1, location=(x, 0, 0.145), scale=(0.024, 0.038, 0.03))
        assign(merlon, m["stone_light"])
        parts.append(merlon)
    trim = primitive_cube("gold_trim", 1, location=(0, -0.035, 0.105), scale=(0.13, 0.006, 0.009))
    assign(trim, m["gold"])
    parts.append(trim)
    return join_objects(name, parts)


def build_wall_gate(name: str) -> bpy.types.Object:
    m = premium_materials()
    parts = []
    for side in (-1, 1):
        pier = primitive_cube(f"pier_{side}", 1, location=(side * 0.112, 0, 0.075), scale=(0.04, 0.04, 0.085))
        cap = primitive_cone(f"cap_{side}", 0.055, 0.055, location=(side * 0.112, 0, 0.185), vertices=6)
        assign(pier, m["stone"])
        assign(cap, m["stone_light"])
        parts.extend([pier, cap])
    lintel = primitive_cube("lintel", 1, location=(0, 0, 0.145), scale=(0.08, 0.035, 0.025))
    door = primitive_cube("door", 1, location=(0, 0.008, 0.055), scale=(0.065, 0.028, 0.07))
    crest = primitive_ico("crest", 0.028, location=(0, -0.04, 0.15), subdivisions=1)
    assign(lintel, m["stone_light"])
    assign(door, m["leather"])
    assign(crest, m["gold"])
    parts.extend([lintel, door, crest])
    return join_objects(name, parts)


def build_wall_tower(name: str) -> bpy.types.Object:
    m = premium_materials()
    parts = []
    body = primitive_cylinder("tower", 0.055, 0.15, location=(0, 0, 0.075), vertices=10)
    rim = primitive_cylinder("rim", 0.064, 0.025, location=(0, 0, 0.145), vertices=10)
    assign(body, m["stone"])
    assign(rim, m["stone_light"])
    parts.extend([body, rim])
    for i in range(5):
        angle = i * math.tau / 5
        merlon = primitive_cube(
            f"merlon_{i}",
            1,
            location=(math.cos(angle) * 0.047, math.sin(angle) * 0.047, 0.178),
            scale=(0.018, 0.018, 0.028),
        )
        assign(merlon, m["stone_light"])
        parts.append(merlon)
    band = primitive_cylinder("band", 0.058, 0.014, location=(0, 0, 0.095), vertices=10)
    assign(band, m["gold"])
    parts.append(band)
    return join_objects(name, parts)


def build_barbarian_ship(name: str) -> bpy.types.Object:
    """Collector-style longship, readable from the live board camera."""
    m = premium_materials()
    parts = []

    hull = primitive_cube("hull", 1, location=(0, 0, 0.075), scale=(0.19, 0.072, 0.055))
    prow = primitive_cone("prow", 0.077, 0.17, location=(0.225, 0, 0.075), vertices=8)
    stern = primitive_cone("stern", 0.077, 0.13, location=(-0.205, 0, 0.075), vertices=8)
    apply_rotation(prow, (0, math.pi / 2, 0))
    apply_rotation(stern, (0, -math.pi / 2, 0))
    assign(hull, m["graphite"])
    assign(prow, m["graphite"])
    assign(stern, m["graphite"])
    parts.extend([hull, prow, stern])

    deck = primitive_cube("deck", 1, location=(-0.01, 0, 0.13), scale=(0.14, 0.058, 0.022))
    keel = primitive_cube("gold_keel", 1, location=(0, 0, 0.035), scale=(0.17, 0.076, 0.012))
    assign(deck, m["leather"])
    assign(keel, m["gold"])
    parts.extend([deck, keel])

    mast = primitive_cylinder("mast", 0.012, 0.36, location=(0, 0, 0.315), vertices=10)
    sail = primitive_cone("sail", 0.15, 0.018, location=(0.015, 0, 0.34), vertices=3)
    apply_rotation(sail, (math.pi / 2, 0, math.pi / 2))
    flag = primitive_cube("flag", 1, location=(0.055, 0, 0.505), scale=(0.065, 0.008, 0.024))
    assign(mast, m["gold"])
    assign(sail, m["coral"])
    assign(flag, m["coral"])
    parts.extend([mast, sail, flag])

    for side in (-1, 1):
        for index, x in enumerate((-0.11, 0.0, 0.11)):
            shield = flattened_cylinder(
                f"shield_{side}_{index}",
                0.038,
                0.012,
                location=(x, side * 0.078, 0.105),
                vertices=12,
            )
            assign(shield, m["coral"] if index % 2 == 0 else m["gold"])
            parts.append(shield)

    return join_objects(name, parts)


ASSETS = [
    ("pieces/cities-knights/ck_knight_basic.glb", lambda name: build_knight(name, 1), "ck_knight_basic", 180, 1400),
    ("pieces/cities-knights/ck_knight_strong.glb", lambda name: build_knight(name, 2), "ck_knight_strong", 200, 1600),
    ("pieces/cities-knights/ck_knight_mighty.glb", lambda name: build_knight(name, 3), "ck_knight_mighty", 220, 1800),
    ("pieces/cities-knights/ck_wall_segment.glb", build_wall_segment, "ck_wall_segment", 40, 500),
    ("pieces/cities-knights/ck_wall_gate.glb", build_wall_gate, "ck_wall_gate", 50, 700),
    ("pieces/cities-knights/ck_wall_tower.glb", build_wall_tower, "ck_wall_tower", 80, 900),
    ("pieces/cities-knights/ck_barbarian_ship.glb", build_barbarian_ship, "ck_barbarian_ship", 180, 1200),
]


def main() -> None:
    args = parse_args()
    out_root = Path(args.output)
    manifest = []
    for relative, builder, name, min_tris, max_tris in ASSETS:
        reset_scene()
        clear_orphaned_materials()
        obj = builder(name)
        path = out_root / relative
        meta = export_object_glb(obj, path, category="game_piece", budget_max=max_tris)
        assert_glb_exists(path)
        assert_triangle_budget(meta["triangles"], min_tris, max_tris, name)
        entry = {
            "id": name,
            "url": "/assets/models/" + relative.replace("\\", "/"),
            "category": "game_piece",
            "lod": 0,
            "footprint": 0.18 if "knight" in name else 0.34,
            "castsShadow": True,
            "receivesShadow": True,
            "license": meta["license"],
            "author": meta["author"],
            "triangles": meta["triangles"],
            "materials": meta["materials"],
            "source": "tools/blender/generators/generate_ck_pieces.py",
        }
        manifest.append(entry)
        print(f"OK {name} tris={meta['triangles']} -> {entry['url']}")

    (out_root / "ck-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {out_root / 'ck-manifest.json'} ({len(manifest)} assets)")


if __name__ == "__main__":
    main()
