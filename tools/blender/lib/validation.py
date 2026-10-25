"""Asset validation helpers for Blender generators."""

from __future__ import annotations

from pathlib import Path


def assert_glb_exists(path: Path, min_bytes: int = 200) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing GLB: {path}")
    size = path.stat().st_size
    if size < min_bytes:
        raise RuntimeError(f"GLB too small ({size} B): {path}")


def assert_triangle_budget(triangles: int, min_tris: int, max_tris: int, asset_id: str) -> None:
    # Soft floor: warn only. Hard ceiling: reject overweight assets.
    if triangles < min_tris:
        print(f"WARN {asset_id}: {triangles} tris below soft minimum {min_tris}")
    if triangles > max_tris:
        raise RuntimeError(f"{asset_id}: {triangles} tris above maximum {max_tris}")
    if triangles < 8:
        raise RuntimeError(f"{asset_id}: degenerate mesh ({triangles} tris)")
