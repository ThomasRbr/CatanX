"""
Generate the H1 premium GLB batch for CatanX (20+ original low-poly models).

Usage (via generate-all.ps1):
  blender --background --factory-startup --python generate_h1_batch.py -- --repo-root ... --output ... --preview ...
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


def build_pine(name: str, *, tall: bool = False) -> bpy.types.Object:
    h = 1.15 if tall else 1.0
    trunk = primitive_cylinder("trunk", 0.045, 0.22 * h, location=(0, 0, 0.11 * h), vertices=10)
    assign(trunk, mat("trunk"))
    foliage = [
        primitive_cone("f1", 0.2, 0.3 * h, location=(0, 0, 0.32 * h), vertices=10),
        primitive_cone("f2", 0.17, 0.26 * h, location=(0.02, -0.01, 0.46 * h), vertices=10),
        primitive_cone("f3", 0.13, 0.22 * h, location=(-0.015, 0.015, 0.58 * h), vertices=9),
        primitive_cone("f4", 0.09, 0.16 * h, location=(0.01, 0.0, 0.7 * h), vertices=8),
        primitive_ico("f5", 0.055, location=(0.08, 0.04, 0.4 * h), subdivisions=1, scale=(1.0, 0.8, 0.7)),
        primitive_ico("f6", 0.05, location=(-0.07, -0.03, 0.5 * h), subdivisions=1, scale=(0.9, 1.0, 0.65)),
        primitive_ico("f7", 0.04, location=(0.0, 0.08, 0.55 * h), subdivisions=0, scale=(1.0, 0.85, 0.6)),
    ]
    assign(foliage[0], mat("foliage_dark"))
    assign(foliage[1], mat("foliage"))
    assign(foliage[2], mat("foliage"))
    assign(foliage[3], mat("foliage"))
    assign(foliage[4], mat("foliage_dark"))
    assign(foliage[5], mat("foliage"))
    assign(foliage[6], mat("foliage_dark"))
    return join_objects(name, [trunk, *foliage])


def build_oak(name: str) -> bpy.types.Object:
    trunk = primitive_cylinder("trunk", 0.05, 0.22, location=(0, 0, 0.11), vertices=10)
    assign(trunk, mat("trunk"))
    canopy = [
        primitive_ico("c1", 0.18, location=(0, 0, 0.34), subdivisions=1, scale=(1.15, 1.0, 0.9)),
        primitive_ico("c2", 0.14, location=(0.08, 0.04, 0.3), subdivisions=1, scale=(1.0, 0.9, 0.85)),
        primitive_ico("c3", 0.12, location=(-0.07, -0.03, 0.32), subdivisions=0, scale=(1.05, 1.0, 0.8)),
        primitive_ico("c4", 0.1, location=(0.02, -0.08, 0.28), subdivisions=0, scale=(1.0, 1.0, 0.75)),
        primitive_ico("c5", 0.08, location=(-0.04, 0.07, 0.38), subdivisions=0, scale=(1.1, 0.9, 0.7)),
    ]
    for c in canopy:
        assign(c, mat("foliage_oak"))
    return join_objects(name, [trunk, *canopy])


def build_birch(name: str) -> bpy.types.Object:
    trunk = primitive_cylinder("trunk", 0.035, 0.3, location=(0, 0, 0.15), vertices=10)
    assign(trunk, mat("trunk_birch"))
    canopy = [
        primitive_ico("c1", 0.12, location=(0, 0, 0.36), subdivisions=1, scale=(1.2, 1.0, 0.75)),
        primitive_ico("c2", 0.09, location=(0.05, -0.02, 0.42), subdivisions=1, scale=(1.0, 0.9, 0.7)),
        primitive_ico("c3", 0.08, location=(-0.05, 0.03, 0.4), subdivisions=0, scale=(1.05, 0.95, 0.65)),
        primitive_ico("c4", 0.07, location=(0.02, 0.05, 0.48), subdivisions=0, scale=(0.95, 1.0, 0.6)),
        primitive_ico("c5", 0.06, location=(-0.03, -0.05, 0.45), subdivisions=0, scale=(1.0, 0.9, 0.55)),
    ]
    for c in canopy:
        assign(c, mat("foliage_light"))
    return join_objects(name, [trunk, *canopy])


def build_bush(name: str, *, wide: bool = False) -> bpy.types.Object:
    s = 1.15 if wide else 1.0
    parts = [
        primitive_ico("b1", 0.1 * s, location=(0, 0, 0.08), subdivisions=0, scale=(1.2, 1.0, 0.75)),
        primitive_ico("b2", 0.08 * s, location=(0.06, 0.03, 0.07), subdivisions=0, scale=(1.0, 0.9, 0.7)),
        primitive_ico("b3", 0.07 * s, location=(-0.05, -0.02, 0.07), subdivisions=0, scale=(1.05, 1.0, 0.65)),
    ]
    assign(parts[0], mat("scrub"))
    assign(parts[1], mat("scrub_dark"))
    assign(parts[2], mat("scrub"))
    return join_objects(name, parts)


def build_rock(name: str, *, variant: int = 0) -> bpy.types.Object:
    if variant == 0:
        parts = [
            primitive_ico("r1", 0.12, location=(0, 0, 0.07), subdivisions=0, scale=(1.2, 0.85, 1.0)),
            primitive_ico("r2", 0.07, location=(0.07, 0.02, 0.08), subdivisions=0, scale=(1.0, 0.8, 0.9)),
        ]
    elif variant == 1:
        parts = [
            primitive_cube("r1", 0.16, location=(0, 0, 0.07), scale=(1.2, 0.8, 0.9)),
            primitive_ico("r2", 0.06, location=(-0.05, 0.04, 0.1), subdivisions=0),
        ]
    else:
        parts = [
            primitive_ico("r1", 0.1, location=(0, 0, 0.06), subdivisions=0, scale=(1.4, 0.7, 1.1)),
            primitive_ico("r2", 0.05, location=(0.06, -0.03, 0.08), subdivisions=0),
            primitive_ico("r3", 0.045, location=(-0.05, 0.02, 0.05), subdivisions=0),
        ]
    assign(parts[0], mat("rock"))
    for p in parts[1:]:
        assign(p, mat("rock_dark"))
    return join_objects(name, parts)


def build_mountain(name: str) -> bpy.types.Object:
    base = primitive_cone("base", 0.28, 0.42, location=(0, 0, 0.21), vertices=7)
    assign(base, mat("peak"))
    tip = primitive_cone("tip", 0.12, 0.18, location=(0.02, -0.01, 0.48), vertices=5)
    assign(tip, mat("snow"))
    shoulder = primitive_cone("shoulder", 0.16, 0.22, location=(-0.1, 0.05, 0.22), vertices=6)
    assign(shoulder, mat("peak"))
    rubble = [
        primitive_ico("r1", 0.06, location=(0.12, -0.08, 0.05), subdivisions=0, scale=(1.2, 0.8, 0.7)),
        primitive_ico("r2", 0.05, location=(-0.14, 0.1, 0.04), subdivisions=0, scale=(1.0, 0.9, 0.65)),
        primitive_ico("r3", 0.045, location=(0.05, 0.12, 0.06), subdivisions=0),
    ]
    for r in rubble:
        assign(r, mat("rock"))
    # Materials: peak + snow + rock (≤3)
    return join_objects(name, [base, tip, shoulder, *rubble])


def build_dune(name: str) -> bpy.types.Object:
    # Long wind ridge — reads as a dune, not a pebble.
    parts = [
        primitive_ico("d1", 0.28, location=(0, 0, 0.1), subdivisions=0, scale=(2.4, 1.15, 0.85)),
        primitive_ico("d2", 0.18, location=(0.2, 0.04, 0.12), subdivisions=0, scale=(1.8, 1.0, 0.7)),
        primitive_ico("d3", 0.12, location=(-0.18, -0.05, 0.08), subdivisions=0, scale=(1.5, 0.95, 0.55)),
    ]
    assign(parts[0], mat("sand"))
    assign(parts[1], mat("sand_dark"))
    assign(parts[2], mat("sand"))
    return join_objects(name, parts)


def build_grass_tuft(name: str) -> bpy.types.Object:
    blades = []
    for i, x in enumerate((-0.03, 0.0, 0.03)):
        blade = primitive_cone(f"g{i}", 0.02, 0.12, location=(x, 0.01 * i, 0.06), vertices=4)
        assign(blade, mat("grass"))
        blades.append(blade)
    return join_objects(name, blades)


def build_house(name: str, *, wide: bool = False) -> bpy.types.Object:
    w = 0.22 if wide else 0.18
    d = 0.18 if wide else 0.16
    base = primitive_cube("base", 1.0, location=(0, 0, 0.015), scale=(0.14, 0.14, 0.015))
    assign(base, mat("stone"))
    body = primitive_cube("body", 1.0, location=(0, 0, 0.09), scale=(w, d, 0.12))
    assign(body, mat("plaster" if not wide else "plaster_warm"))
    roof = primitive_cone("roof", 0.15 if wide else 0.13, 0.12, location=(0, 0, 0.2), vertices=4)
    rotate_z(roof, 45)
    assign(roof, mat("roof_terracotta" if not wide else "roof_slate"))
    chimney = primitive_cube("chimney", 1.0, location=(0.06, -0.04, 0.24), scale=(0.035, 0.035, 0.08))
    assign(chimney, mat("stone"))
    door = primitive_cube("door", 1.0, location=(0, d * 0.52, 0.07), scale=(0.04, 0.01, 0.07))
    assign(door, mat("stone"))
    annex = None
    if wide:
        annex = primitive_cube("annex", 1.0, location=(0.14, 0.02, 0.07), scale=(0.1, 0.12, 0.1))
        assign(annex, mat("plaster_warm"))
    parts = [base, body, roof, chimney, door]
    if annex:
        parts.append(annex)
    return join_objects(name, parts)


def build_road(name: str) -> bpy.types.Object:
    bed = primitive_cube("bed", 1.0, location=(0, 0, 0.012), scale=(0.42, 0.1, 0.02))
    assign(bed, mat("stone"))
    edge_a = primitive_cube("ea", 1.0, location=(0, 0.055, 0.018), scale=(0.42, 0.02, 0.01))
    edge_b = primitive_cube("eb", 1.0, location=(0, -0.055, 0.018), scale=(0.42, 0.02, 0.01))
    assign(edge_a, mat("rock_dark"))
    assign(edge_b, mat("rock_dark"))
    return join_objects(name, [bed, edge_a, edge_b])


def build_dock(name: str) -> bpy.types.Object:
    deck = primitive_cube("deck", 1.0, location=(0, 0.08, 0.03), scale=(0.14, 0.3, 0.04))
    assign(deck, mat("dock"))
    post_a = primitive_cylinder("pa", 0.025, 0.12, location=(-0.05, 0.18, 0.04), vertices=6)
    post_b = primitive_cylinder("pb", 0.025, 0.12, location=(0.05, 0.18, 0.04), vertices=6)
    assign(post_a, mat("wood_dark"))
    assign(post_b, mat("wood_dark"))
    crate = primitive_cube("crate", 1.0, location=(0.02, 0.02, 0.08), scale=(0.06, 0.06, 0.06))
    assign(crate, mat("dock"))
    return join_objects(name, [deck, post_a, post_b, crate])


def build_barrel(name: str) -> bpy.types.Object:
    body = primitive_cylinder("body", 0.055, 0.1, location=(0, 0, 0.05), vertices=8)
    assign(body, mat("barrel"))
    rim = primitive_cylinder("rim", 0.058, 0.02, location=(0, 0, 0.09), vertices=8)
    assign(rim, mat("wood_dark"))
    return join_objects(name, [body, rim])


def build_crate(name: str) -> bpy.types.Object:
    box = primitive_cube("box", 1.0, location=(0, 0, 0.05), scale=(0.08, 0.08, 0.08))
    assign(box, mat("crate"))
    lid = primitive_cube("lid", 1.0, location=(0, 0, 0.095), scale=(0.085, 0.085, 0.015))
    assign(lid, mat("wood"))
    return join_objects(name, [box, lid])


def build_well(name: str) -> bpy.types.Object:
    base = primitive_cylinder("base", 0.09, 0.08, location=(0, 0, 0.04), vertices=8)
    assign(base, mat("stone"))
    water = primitive_cylinder("water", 0.06, 0.02, location=(0, 0, 0.07), vertices=8)
    assign(water, mat("water_deep"))
    post_a = primitive_cube("pa", 1.0, location=(-0.07, 0, 0.14), scale=(0.02, 0.02, 0.12))
    post_b = primitive_cube("pb", 1.0, location=(0.07, 0, 0.14), scale=(0.02, 0.02, 0.12))
    beam = primitive_cube("beam", 1.0, location=(0, 0, 0.2), scale=(0.16, 0.02, 0.02))
    for p in (post_a, post_b, beam):
        assign(p, mat("wood"))
    return join_objects(name, [base, water, post_a, post_b, beam])


def build_fence(name: str) -> bpy.types.Object:
    rail = primitive_cube("rail", 1.0, location=(0, 0, 0.08), scale=(0.28, 0.015, 0.02))
    assign(rail, mat("wood"))
    posts = []
    for i, x in enumerate((-0.12, 0.0, 0.12)):
        post = primitive_cube(f"p{i}", 1.0, location=(x, 0, 0.06), scale=(0.02, 0.02, 0.1))
        assign(post, mat("wood_dark"))
        posts.append(post)
    return join_objects(name, [rail, *posts])


def build_banner(name: str) -> bpy.types.Object:
    pole = primitive_cylinder("pole", 0.015, 0.28, location=(0, 0, 0.14), vertices=6)
    assign(pole, mat("wood_dark"))
    cloth = primitive_cube("cloth", 1.0, location=(0.05, 0, 0.22), scale=(0.08, 0.01, 0.1))
    assign(cloth, mat("banner_neutral"))
    return join_objects(name, [pole, cloth])


def build_token_disc(name: str) -> bpy.types.Object:
    disc = primitive_cylinder("disc", 0.12, 0.03, location=(0, 0, 0.015), vertices=12)
    assign(disc, mat("plaster"))
    rim = primitive_cylinder("rim", 0.125, 0.01, location=(0, 0, 0.03), vertices=12)
    assign(rim, mat("stone"))
    return join_objects(name, [disc, rim])


ASSETS = [
    ("environment/trees/tree_pine_a.glb", build_pine, {"name": "tree_pine_a"}, "environment", 80, 800),
    ("environment/trees/tree_pine_b.glb", build_pine, {"name": "tree_pine_b", "tall": True}, "environment", 80, 800),
    ("environment/trees/tree_oak_a.glb", build_oak, {"name": "tree_oak_a"}, "environment", 80, 800),
    ("environment/trees/tree_birch_a.glb", build_birch, {"name": "tree_birch_a"}, "environment", 80, 800),
    ("environment/vegetation/bush_a.glb", build_bush, {"name": "bush_a"}, "environment", 40, 400),
    ("environment/vegetation/bush_b.glb", build_bush, {"name": "bush_b", "wide": True}, "environment", 40, 400),
    ("environment/vegetation/grass_tuft_a.glb", build_grass_tuft, {"name": "grass_tuft_a"}, "environment", 20, 400),
    ("environment/rocks/rock_a.glb", build_rock, {"name": "rock_a", "variant": 0}, "environment", 20, 400),
    ("environment/rocks/rock_b.glb", build_rock, {"name": "rock_b", "variant": 1}, "environment", 20, 400),
    ("environment/rocks/rock_c.glb", build_rock, {"name": "rock_c", "variant": 2}, "environment", 20, 400),
    ("environment/mountains/mountain_peak_a.glb", build_mountain, {"name": "mountain_peak_a"}, "environment", 80, 800),
    ("environment/vegetation/dune_a.glb", build_dune, {"name": "dune_a"}, "environment", 20, 400),
    ("buildings/house_settlement_a.glb", build_house, {"name": "house_settlement_a"}, "buildings", 40, 800),
    ("buildings/house_settlement_b.glb", build_house, {"name": "house_settlement_b", "wide": True}, "buildings", 40, 800),
    ("props/road_segment_a.glb", build_road, {"name": "road_segment_a"}, "props", 20, 400),
    ("ports/dock_a.glb", build_dock, {"name": "dock_a"}, "ports", 40, 800),
    ("props/barrel_a.glb", build_barrel, {"name": "barrel_a"}, "props", 20, 400),
    ("props/crate_a.glb", build_crate, {"name": "crate_a"}, "props", 20, 400),
    ("props/well_a.glb", build_well, {"name": "well_a"}, "props", 20, 400),
    ("props/fence_a.glb", build_fence, {"name": "fence_a"}, "props", 20, 400),
    ("props/banner_a.glb", build_banner, {"name": "banner_a"}, "props", 20, 400),
    ("props/token_disc_a.glb", build_token_disc, {"name": "token_disc_a"}, "props", 20, 400),
]


def main() -> None:
    args = parse_args()
    out_root = Path(args.output)
    preview_root = Path(args.preview)
    repo_root = Path(args.repo_root)
    out_root.mkdir(parents=True, exist_ok=True)
    preview_root.mkdir(parents=True, exist_ok=True)

    manifest = []
    for rel, builder, kwargs, category, min_tris, max_tris in ASSETS:
        reset_scene()
        clear_orphaned_materials()
        obj = builder(**kwargs)
        path = out_root / rel
        meta = export_object_glb(
            obj,
            path,
            category=category,
            budget_max=max_tris,
        )
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
            "source": "tools/blender/generators/generate_h1_batch.py",
        }
        manifest.append(entry)
        print(f"OK {meta['id']} tris={meta['triangles']} -> {public_url}")

    # Convenience copies for meshCatalog fallback IDs used by the live board.
    alias_map = {
        "tree": "environment/trees/tree_pine_a.glb",
        "scrub": "environment/vegetation/bush_a.glb",
        "rock": "environment/rocks/rock_a.glb",
        "peak": "environment/mountains/mountain_peak_a.glb",
        "dune": "environment/vegetation/dune_a.glb",
        "settlement": "buildings/house_settlement_a.glb",
        "city": "buildings/house_settlement_b.glb",
    }
    for alias, src_rel in alias_map.items():
        src = out_root / src_rel
        dst = out_root / f"{alias}.glb"
        dst.write_bytes(src.read_bytes())
        meta_src = src.with_suffix(".meta.json")
        if meta_src.exists():
            dst.with_suffix(".meta.json").write_text(meta_src.read_text(encoding="utf-8"), encoding="utf-8")

    manifest_path = out_root / "h1-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Keep the client TypeScript mirror in sync (no runtime JSON import).
    ts_manifest = (
        Path(args.repo_root)
        / "apps/client/src/render3d/assets/h1ManifestData.ts"
    )
    ts_manifest.write_text(
        "/** Auto-synced from public/assets/models/h1-manifest.json (H1 Blender batch). */\n"
        f"export const H1_MANIFEST_DATA = {json.dumps(manifest, indent=2)} as const;\n",
        encoding="utf-8",
    )

    license_path = repo_root / "apps/client/public/assets/licenses/H1_ASSETS.md"
    license_path.parent.mkdir(parents=True, exist_ok=True)
    license_path.write_text(
        "\n".join(
            [
                "# CatanX H1 visual assets — provenance",
                "",
                "All models in this batch are original low-poly meshes generated by the",
                "CatanX Blender pipeline (`tools/blender/generators/generate_h1_batch.py`).",
                "",
                "- Author: CatanX Blender pipeline",
                "- License: Original project art (internal). Safe to redistribute with the repo.",
                "- No third-party meshes or Dorfromantik assets were used.",
                "",
                f"Asset count: {len(manifest)}",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"H1 batch complete: {len(manifest)} assets")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 — surface to Blender CLI
        print(f"ERROR: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
