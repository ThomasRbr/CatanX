"""
Generate the H2 premium GLB batch (additional variants + board-critical props).

Extends H1 without replacing it. Writes h2-manifest.json + h2ManifestData.ts.
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


def build_pine_c(name: str) -> bpy.types.Object:
    trunk = primitive_cylinder("trunk", 0.04, 0.2, location=(0, 0, 0.1), vertices=8)
    assign(trunk, mat("trunk"))
    foliage = [
        primitive_cone("f1", 0.16, 0.26, location=(0, 0, 0.3), vertices=9),
        primitive_cone("f2", 0.12, 0.2, location=(0.02, 0.01, 0.46), vertices=8),
        primitive_cone("f3", 0.08, 0.14, location=(-0.01, -0.01, 0.58), vertices=7),
        primitive_ico("f4", 0.045, location=(0.07, -0.03, 0.38), subdivisions=0),
    ]
    assign(foliage[0], mat("foliage_dark"))
    for f in foliage[1:]:
        assign(f, mat("foliage"))
    return join_objects(name, [trunk, *foliage])


def build_oak_b(name: str) -> bpy.types.Object:
    trunk = primitive_cylinder("trunk", 0.055, 0.18, location=(0, 0, 0.09), vertices=9)
    assign(trunk, mat("trunk"))
    canopy = [
        primitive_ico("c1", 0.16, location=(0, 0, 0.3), subdivisions=1, scale=(1.25, 1.05, 0.85)),
        primitive_ico("c2", 0.11, location=(0.1, -0.05, 0.28), subdivisions=0),
        primitive_ico("c3", 0.1, location=(-0.09, 0.06, 0.32), subdivisions=0),
        primitive_ico("c4", 0.08, location=(0.02, 0.08, 0.38), subdivisions=0),
    ]
    for c in canopy:
        assign(c, mat("foliage_oak"))
    return join_objects(name, [trunk, *canopy])


def build_bush_c(name: str) -> bpy.types.Object:
    parts = [
        primitive_ico("b1", 0.09, location=(0, 0, 0.07), subdivisions=0, scale=(1.3, 1.0, 0.7)),
        primitive_ico("b2", 0.07, location=(0.07, 0.02, 0.06), subdivisions=0),
        primitive_ico("b3", 0.06, location=(-0.05, -0.03, 0.06), subdivisions=0),
        primitive_ico("b4", 0.05, location=(0.02, -0.05, 0.08), subdivisions=0),
    ]
    assign(parts[0], mat("scrub"))
    for p in parts[1:]:
        assign(p, mat("scrub_dark"))
    return join_objects(name, parts)


def build_rock_d(name: str) -> bpy.types.Object:
    parts = [
        primitive_ico("r1", 0.13, location=(0, 0, 0.07), subdivisions=0, scale=(1.5, 0.75, 1.1)),
        primitive_cube("r2", 1.0, location=(0.08, 0.03, 0.09), scale=(0.08, 0.06, 0.07)),
        primitive_ico("r3", 0.05, location=(-0.07, -0.04, 0.06), subdivisions=0),
    ]
    assign(parts[0], mat("rock"))
    assign(parts[1], mat("rock_dark"))
    assign(parts[2], mat("rock_light"))
    return join_objects(name, parts)


def build_field_row(name: str) -> bpy.types.Object:
    stalks = []
    for i, x in enumerate((-0.16, -0.1, -0.04, 0.02, 0.08, 0.14)):
        h = 0.14 + (i % 3) * 0.02
        stalk = primitive_cone(
            f"s{i}",
            0.02,
            h,
            location=(x, 0.012 * ((i % 2) * 2 - 1), h * 0.5),
            vertices=5,
        )
        assign(stalk, mat("wheat"))
        stalks.append(stalk)
    soil = primitive_cube("soil", 1.0, location=(0, 0, 0.012), scale=(0.2, 0.06, 0.018))
    assign(soil, mat("sand_dark"))
    return join_objects(name, [soil, *stalks])


def build_city(name: str) -> bpy.types.Object:
    base = primitive_cube("base", 1.0, location=(0, 0, 0.015), scale=(0.18, 0.18, 0.015))
    assign(base, mat("stone"))
    body_a = primitive_cube("ba", 1.0, location=(-0.06, 0, 0.1), scale=(0.14, 0.14, 0.16))
    assign(body_a, mat("plaster"))
    body_b = primitive_cube("bb", 1.0, location=(0.1, 0.02, 0.12), scale=(0.12, 0.12, 0.2))
    assign(body_b, mat("plaster_warm"))
    roof_a = primitive_cone("ra", 0.12, 0.1, location=(-0.06, 0, 0.22), vertices=4)
    rotate_z(roof_a, 45)
    assign(roof_a, mat("roof_slate"))
    roof_b = primitive_cone("rb", 0.1, 0.12, location=(0.1, 0.02, 0.28), vertices=4)
    rotate_z(roof_b, 40)
    assign(roof_b, mat("roof_terracotta"))
    # Keep ≤3 materials: stone + plaster + roof_slate (fold terracotta into slate)
    assign(roof_b, mat("roof_slate"))
    assign(body_b, mat("plaster"))
    return join_objects(name, [base, body_a, body_b, roof_a, roof_b])


def build_dock_b(name: str) -> bpy.types.Object:
    deck = primitive_cube("deck", 1.0, location=(0, 0.1, 0.03), scale=(0.16, 0.34, 0.035))
    assign(deck, mat("dock"))
    post_a = primitive_cylinder("pa", 0.022, 0.14, location=(-0.06, 0.22, 0.05), vertices=6)
    post_b = primitive_cylinder("pb", 0.022, 0.14, location=(0.06, 0.22, 0.05), vertices=6)
    assign(post_a, mat("wood_dark"))
    assign(post_b, mat("wood_dark"))
    crate = primitive_cube("crate", 1.0, location=(-0.04, 0.0, 0.08), scale=(0.05, 0.05, 0.05))
    assign(crate, mat("dock"))
    barrel = primitive_cylinder("barrel", 0.035, 0.07, location=(0.05, 0.02, 0.06), vertices=8)
    assign(barrel, mat("wood_dark"))
    return join_objects(name, [deck, post_a, post_b, crate, barrel])


def build_robber(name: str) -> bpy.types.Object:
    base = primitive_cylinder("base", 0.1, 0.025, location=(0, 0, 0.012), vertices=10)
    assign(base, mat("rock_dark"))
    body = primitive_cylinder("body", 0.07, 0.14, location=(0, 0, 0.1), vertices=6)
    assign(body, mat("rock"))
    head = primitive_ico("head", 0.06, location=(0, 0, 0.2), subdivisions=0)
    assign(head, mat("rock_dark"))
    hood = primitive_cone("hood", 0.07, 0.1, location=(0, 0, 0.28), vertices=5)
    assign(hood, mat("rock"))
    return join_objects(name, [base, body, head, hood])


ASSETS = [
    ("environment/trees/tree_pine_c.glb", build_pine_c, {"name": "tree_pine_c"}, "environment", 80, 800),
    ("environment/trees/tree_oak_b.glb", build_oak_b, {"name": "tree_oak_b"}, "environment", 80, 800),
    ("environment/vegetation/bush_c.glb", build_bush_c, {"name": "bush_c"}, "environment", 40, 400),
    ("environment/rocks/rock_d.glb", build_rock_d, {"name": "rock_d"}, "environment", 20, 400),
    ("environment/vegetation/field_row_a.glb", build_field_row, {"name": "field_row_a"}, "environment", 20, 400),
    ("buildings/house_city_a.glb", build_city, {"name": "house_city_a"}, "buildings", 40, 800),
    ("ports/dock_b.glb", build_dock_b, {"name": "dock_b"}, "ports", 40, 800),
    ("units/robber_a.glb", build_robber, {"name": "robber_a"}, "units", 40, 800),
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
        meta = export_object_glb(obj, path, category=category, budget_max=max_tris)
        assert_glb_exists(path)
        assert_triangle_budget(meta["triangles"], min_tris, max_tris, meta["id"])
        public_url = "/assets/models/" + rel.replace("\\", "/")
        entry = {
            "id": meta["id"],
            "url": public_url,
            "category": category,
            "lod": 0,
            "footprint": 0.2,
            "castsShadow": True,
            "receivesShadow": True,
            "license": meta["license"],
            "author": meta["author"],
            "triangles": meta["triangles"],
            "materials": meta["materials"],
            "source": "tools/blender/generators/generate_h2_batch.py",
        }
        manifest.append(entry)
        print(f"OK {meta['id']} tris={meta['triangles']} -> {public_url}")

    # Legacy aliases introduced / updated in H2
    alias_map = {
        "city": "buildings/house_city_a.glb",
        "robber": "units/robber_a.glb",
    }
    for alias, src_rel in alias_map.items():
        src = out_root / src_rel
        dst = out_root / f"{alias}.glb"
        dst.write_bytes(src.read_bytes())
        meta_src = src.with_suffix(".meta.json")
        if meta_src.exists():
            dst.with_suffix(".meta.json").write_text(meta_src.read_text(encoding="utf-8"), encoding="utf-8")

    manifest_path = out_root / "h2-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ts_manifest = repo_root / "apps/client/src/render3d/assets/h2ManifestData.ts"
    ts_manifest.write_text(
        "/** Auto-synced from public/assets/models/h2-manifest.json (H2 Blender batch). */\n"
        f"export const H2_MANIFEST_DATA = {json.dumps(manifest, indent=2)} as const;\n",
        encoding="utf-8",
    )

    license_path = repo_root / "apps/client/public/assets/licenses/H2_ASSETS.md"
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(
        "\n".join(
            [
                "# CatanX H2 visual assets — provenance",
                "",
                "Original low-poly meshes from `tools/blender/generators/generate_h2_batch.py`.",
                "",
                f"Asset count: {len(manifest)}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"H2 batch complete: {len(manifest)} assets")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
