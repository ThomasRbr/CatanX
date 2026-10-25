"""
Generate the H3 classic biome GLB batch (density kit + coast + landmarks).

Extends H1+H2. Writes h3-manifest.json + h3ManifestData.ts.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import bpy

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
    rotate_z,
)
from lib.materials import assign, clear_orphaned_materials, mat  # noqa: E402
from lib.validation import assert_glb_exists, assert_triangle_budget  # noqa: E402


def parse_args() -> argparse.Namespace:
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--preview", required=True)
    return parser.parse_args(argv)


def build_dead_tree(name: str) -> bpy.types.Object:
    trunk = primitive_cylinder("trunk", 0.035, 0.28, location=(0, 0, 0.14), vertices=7)
    assign(trunk, mat("trunk"))
    branch_a = primitive_cylinder("ba", 0.018, 0.14, location=(0.06, 0.02, 0.26), vertices=5)
    branch_b = primitive_cylinder("bb", 0.015, 0.11, location=(-0.05, -0.02, 0.22), vertices=5)
    assign(branch_a, mat("wood_dark"))
    assign(branch_b, mat("wood_dark"))
    return join_objects(name, [trunk, branch_a, branch_b])


def build_tree_group(name: str) -> bpy.types.Object:
    """Precomposed trio — one instance reads as a small grove (≤3 materials)."""
    parts = []
    specs = [
        (0.0, 0.0, 0.9, True),
        (0.14, -0.08, 0.7, False),
        (-0.12, 0.1, 0.75, False),
    ]
    for i, (x, y, s, pine) in enumerate(specs):
        trunk = primitive_cylinder(f"t{i}", 0.03 * s, 0.16 * s, location=(x, y, 0.08 * s), vertices=6)
        assign(trunk, mat("trunk"))
        parts.append(trunk)
        if pine:
            for j, (r, h, z) in enumerate(((0.12, 0.18, 0.22), (0.09, 0.14, 0.34), (0.06, 0.1, 0.44))):
                cone = primitive_cone(f"p{i}_{j}", r * s, h * s, location=(x, y, z * s), vertices=7)
                # Fold dark foliage into main foliage to stay ≤3 materials (trunk/foliage/oak).
                assign(cone, mat("foliage"))
                parts.append(cone)
        else:
            canopy = primitive_ico(f"c{i}", 0.11 * s, location=(x, y, 0.26 * s), subdivisions=0)
            assign(canopy, mat("foliage"))
            parts.append(canopy)
    return join_objects(name, parts)


def build_flower_bush(name: str) -> bpy.types.Object:
    base = primitive_ico("base", 0.08, location=(0, 0, 0.06), subdivisions=0, scale=(1.2, 1.0, 0.7))
    assign(base, mat("scrub"))
    petals = [
        primitive_ico("f1", 0.025, location=(0.05, 0.02, 0.1), subdivisions=0),
        primitive_ico("f2", 0.022, location=(-0.04, -0.02, 0.09), subdivisions=0),
        primitive_ico("f3", 0.02, location=(0.01, -0.05, 0.11), subdivisions=0),
    ]
    for p in petals:
        assign(p, mat("wheat"))
    return join_objects(name, [base, *petals])


def build_rock_e(name: str) -> bpy.types.Object:
    parts = [
        primitive_ico("r1", 0.11, location=(0, 0, 0.06), subdivisions=0, scale=(1.4, 0.9, 1.0)),
        primitive_ico("r2", 0.06, location=(0.09, -0.04, 0.05), subdivisions=0),
        primitive_cube("r3", 1.0, location=(-0.06, 0.05, 0.07), scale=(0.06, 0.05, 0.05)),
    ]
    assign(parts[0], mat("rock"))
    assign(parts[1], mat("rock_light"))
    assign(parts[2], mat("rock_dark"))
    return join_objects(name, parts)


def build_rock_f(name: str) -> bpy.types.Object:
    parts = [
        primitive_ico("r1", 0.09, location=(0, 0, 0.05), subdivisions=0, scale=(1.1, 1.3, 0.9)),
        primitive_ico("r2", 0.07, location=(-0.08, 0.03, 0.06), subdivisions=0),
        primitive_ico("r3", 0.045, location=(0.07, 0.05, 0.04), subdivisions=0),
    ]
    for p in parts:
        assign(p, mat("rock_dark" if p.name.endswith("2") else "rock"))
    return join_objects(name, parts)


def build_hill(name: str) -> bpy.types.Object:
    base = primitive_cone("base", 0.26, 0.2, location=(0, 0, 0.1), vertices=8)
    assign(base, mat("sand_dark"))
    shoulder = primitive_cone("sh", 0.14, 0.12, location=(0.08, -0.04, 0.14), vertices=6)
    assign(shoulder, mat("rock"))
    tip = primitive_ico("tip", 0.05, location=(-0.04, 0.03, 0.2), subdivisions=0)
    assign(tip, mat("rock_light"))
    return join_objects(name, [base, shoulder, tip])


def build_dune_b(name: str) -> bpy.types.Object:
    # Crescent / secondary ridge for variation.
    a = primitive_ico("a", 0.24, location=(0, 0, 0.09), subdivisions=0, scale=(2.1, 1.0, 0.75))
    assign(a, mat("sand"))
    b = primitive_ico("b", 0.14, location=(0.16, 0.06, 0.1), subdivisions=0, scale=(1.5, 0.9, 0.6))
    assign(b, mat("sand_dark"))
    c = primitive_ico("c", 0.1, location=(-0.14, -0.05, 0.07), subdivisions=0, scale=(1.3, 0.85, 0.5))
    assign(c, mat("sand"))
    return join_objects(name, [a, b, c])


def build_field_row_b(name: str) -> bpy.types.Object:
    stalks = []
    for i, x in enumerate((-0.18, -0.1, -0.02, 0.06, 0.14)):
        h = 0.12 + (i % 2) * 0.03
        stalk = primitive_cone(f"s{i}", 0.02, h, location=(x, 0.015 * (i % 3 - 1), h * 0.5), vertices=5)
        assign(stalk, mat("wheat"))
        stalks.append(stalk)
    soil = primitive_cube("soil", 1.0, location=(0, 0, 0.01), scale=(0.22, 0.055, 0.016))
    assign(soil, mat("sand_dark"))
    return join_objects(name, [soil, *stalks])


def build_beach_strip(name: str) -> bpy.types.Object:
    sand = primitive_cube("sand", 1.0, location=(0, 0, 0.012), scale=(0.42, 0.14, 0.02))
    assign(sand, mat("sand"))
    lip = primitive_cube("lip", 1.0, location=(0, 0.08, 0.012), scale=(0.4, 0.05, 0.014))
    assign(lip, mat("sand_dark"))
    grit = primitive_ico("grit", 0.03, location=(0.12, -0.02, 0.03), subdivisions=0)
    assign(grit, mat("sand"))
    return join_objects(name, [sand, lip, grit])


def build_foam_patch(name: str) -> bpy.types.Object:
    foam = primitive_ico("foam", 0.1, location=(0, 0, 0.02), subdivisions=0, scale=(1.9, 0.75, 0.4))
    assign(foam, mat("foam"))
    speck = primitive_ico("s", 0.04, location=(0.08, 0.03, 0.025), subdivisions=0)
    assign(speck, mat("foam"))
    return join_objects(name, [foam, speck])


def build_mine_entrance(name: str) -> bpy.types.Object:
    frame = primitive_cube("frame", 1.0, location=(0, 0, 0.1), scale=(0.12, 0.08, 0.14))
    assign(frame, mat("rock_dark"))
    void = primitive_cube("void", 1.0, location=(0, 0.02, 0.1), scale=(0.07, 0.04, 0.1))
    assign(void, mat("rock"))
    rubble = primitive_ico("r", 0.04, location=(0.1, -0.04, 0.03), subdivisions=0)
    assign(rubble, mat("rock_light"))
    return join_objects(name, [frame, void, rubble])


def build_camp_log(name: str) -> bpy.types.Object:
    log_a = primitive_cylinder("la", 0.035, 0.22, location=(0, 0, 0.035), vertices=8)
    assign(log_a, mat("trunk"))
    log_b = primitive_cylinder("lb", 0.03, 0.18, location=(0.02, 0.06, 0.05), vertices=7)
    assign(log_b, mat("wood_dark"))
    axe = primitive_cube("axe", 1.0, location=(-0.08, 0.0, 0.08), scale=(0.02, 0.02, 0.1))
    assign(axe, mat("stone"))
    return join_objects(name, [log_a, log_b, axe])


ASSETS = [
    ("environment/trees/tree_dead_a.glb", build_dead_tree, {"name": "tree_dead_a"}, "environment", 40, 600),
    ("environment/trees/tree_group_a.glb", build_tree_group, {"name": "tree_group_a"}, "environment", 120, 1200),
    ("environment/vegetation/bush_flower_a.glb", build_flower_bush, {"name": "bush_flower_a"}, "environment", 40, 400),
    ("environment/rocks/rock_e.glb", build_rock_e, {"name": "rock_e"}, "environment", 20, 400),
    ("environment/rocks/rock_f.glb", build_rock_f, {"name": "rock_f"}, "environment", 20, 400),
    ("environment/mountains/hill_a.glb", build_hill, {"name": "hill_a"}, "environment", 40, 600),
    ("environment/vegetation/dune_b.glb", build_dune_b, {"name": "dune_b"}, "environment", 20, 400),
    ("environment/vegetation/field_row_b.glb", build_field_row_b, {"name": "field_row_b"}, "environment", 20, 400),
    ("environment/coast/beach_strip_a.glb", build_beach_strip, {"name": "beach_strip_a"}, "environment", 20, 300),
    ("environment/coast/foam_patch_a.glb", build_foam_patch, {"name": "foam_patch_a"}, "environment", 20, 300),
    ("props/mine_entrance_a.glb", build_mine_entrance, {"name": "mine_entrance_a"}, "props", 40, 500),
    ("props/camp_log_a.glb", build_camp_log, {"name": "camp_log_a"}, "props", 40, 500),
]


def main() -> None:
    args = parse_args()
    out_root = Path(args.output)
    repo_root = Path(args.repo_root)
    out_root.mkdir(parents=True, exist_ok=True)

    manifest = []
    for rel, builder, kwargs, category, min_tris, max_tris in ASSETS:
        reset_scene()
        clear_orphaned_materials()
        obj = builder(**kwargs)
        path = out_root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        meta = export_object_glb(obj, path, category=category, budget_max=max_tris)
        assert_glb_exists(path)
        assert_triangle_budget(meta["triangles"], min_tris, max_tris, meta["id"])
        public_url = "/assets/models/" + rel.replace("\\", "/")
        entry = {
            "id": meta["id"],
            "url": public_url,
            "category": category,
            "lod": 0,
            "footprint": 0.22,
            "castsShadow": True,
            "receivesShadow": True,
            "license": meta["license"],
            "author": meta["author"],
            "triangles": meta["triangles"],
            "materials": meta["materials"],
            "source": "tools/blender/generators/generate_h3_batch.py",
        }
        manifest.append(entry)
        print(f"OK {meta['id']} tris={meta['triangles']} -> {public_url}")

    manifest_path = out_root / "h3-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ts_manifest = repo_root / "apps/client/src/render3d/assets/h3ManifestData.ts"
    ts_manifest.write_text(
        "/** Auto-synced from public/assets/models/h3-manifest.json (H3 Blender batch). */\n"
        f"export const H3_MANIFEST_DATA = {json.dumps(manifest, indent=2)} as const;\n",
        encoding="utf-8",
    )

    license_path = repo_root / "apps/client/public/assets/licenses/H3_ASSETS.md"
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(
        "\n".join(
            [
                "# CatanX H3 visual assets — provenance",
                "",
                "Original low-poly meshes from `tools/blender/generators/generate_h3_batch.py`.",
                "",
                f"Asset count: {len(manifest)}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"H3 batch complete: {len(manifest)} assets")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
