"""Downscale building and road textures to the size the camera can resolve.

Settlements and roads are small on screen — a house covers roughly 40-80 px at
the gameplay camera and about 300 px fully zoomed in, and its material repeats
2.15 times across the model. A 2048² map is therefore sampled at mip level 4 or
deeper: every one of those texels is averaged away before it reaches a pixel.

The cost of shipping them anyway is not subtle. Twenty 2048² maps upload roughly
335 MB to the GPU, and because `useTexture` loads them lazily on the first
settlement, that upload lands in a single frame *during play*. Profiling a
placement showed 2.1 s inside `texSubImage2D`.

Outputs `<stem>_s512.webp` next to the source. Run after changing any source.

Usage:  python tools/build_prop_textures.py [--dry-run]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
PUBLIC = REPO / "apps/client/public/assets/textures"

BUILDINGS = PUBLIC / "buildings/photoreal"
ROADS = PUBLIC / "roads/photoreal"

TARGET = 512
"""Albedo and normal keep a little more room than the strict need; roughness,
AO and height are low-frequency and lose nothing at half that."""
MASK_TARGET = 256

MASK_CHANNELS = ("roughness", "ao", "height")


def target_for(name: str) -> int:
    return MASK_TARGET if any(channel in name for channel in MASK_CHANNELS) else TARGET


def convert(path: Path, dry_run: bool) -> tuple[int, int]:
    image = Image.open(path)
    size = min(target_for(path.stem), image.size[0], image.size[1])
    out = path.with_name(f"{path.stem}_s{size}.webp")
    before = path.stat().st_size
    if dry_run:
        print(f"  {path.name:46s} {image.size[0]:>5} -> {size}")
        return before, before
    resized = image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    # Normals suffer most from compression artefacts, so they get more bits.
    quality = 94 if "normal" in path.stem else 90
    resized.save(out, format="WEBP", quality=quality, method=6)
    return before, out.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    sources: list[Path] = []
    for directory in (BUILDINGS, ROADS):
        if not directory.exists():
            continue
        for path in sorted(directory.iterdir()):
            if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            if path.stem.endswith(("_s512", "_s256")):
                continue
            # Impostors are billboards shown at their own resolution.
            if "impostor" in path.stem:
                continue
            sources.append(path)

    total_before = total_after = 0
    for path in sources:
        before, after = convert(path, args.dry_run)
        total_before += before
        total_after += after
    if not args.dry_run:
        print(f"{len(sources)} textures: {total_before / 1048576:.1f} MB -> {total_after / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
