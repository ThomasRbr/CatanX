"""Build the terrain PBR sets used by the continuous biome surface.

Replaces `build_pbr_from_albedo.py` for terrain. Two things it does differently,
both of which were costing real image quality:

1. **It never upscales.** The previous pipeline resampled 1254px sources up to
   2048px, which invents no detail and measurably destroyed it — Laplacian
   variance fell by a factor of six. Output size is clamped to the source.

2. **It prefers real scanned maps.** Where a Poly Haven photoscan is vendored,
   its own normal / roughness / AO are downscaled and used directly. Deriving a
   normal map from albedo luminance assumes dark means low, which is wrong for
   ground: a dark wet leaf is not a pit. Derivation is now the fallback, not the
   default, and works on a high-passed height so broad albedo shading no longer
   turns into terrain-scale bumps.

Usage:  python tools/build_terrain_pbr.py [--only STEM] [--dry-run]
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

REPO = Path(__file__).resolve().parents[1]
PHOTOREAL = REPO / "apps/client/public/assets/textures/terrain/photoreal"
POLYHAVEN = PHOTOREAL / "polyhaven"
SRC = REPO / "assets-src/textures"
IMAGEGEN = REPO / "art_sources/imagegen"

# Albedo and normal carry the detail the eye resolves; roughness and AO are
# low-frequency and do not need to match them texel for texel.
ALBEDO_SIZE = 2048
NORMAL_SIZE = 2048
MASK_SIZE = 1024


@dataclass
class BiomeSpec:
    stem: str
    version: str
    albedo: Path
    normal: Path | None = None
    roughness: Path | None = None
    ao: Path | None = None
    """Normal strength when derived. Ignored when a scanned normal exists."""
    relief: float = 3.0
    """Base roughness (0-1) when derived. Ignored when a scanned map exists."""
    roughness_base: float = 0.88
    notes: str = ""
    extra: dict = field(default_factory=dict)


SPECS: list[BiomeSpec] = [
    # --- Real Poly Haven photoscans (CC0). 4096 → 2048 is a true downscale. ---
    BiomeSpec(
        stem="meadow_lush_scan", version="v4",
        albedo=POLYHAVEN / "leafy_grass_diff_4k.jpg",
        normal=POLYHAVEN / "leafy_grass_nor_gl_4k.jpg",
        roughness=POLYHAVEN / "leafy_grass_rough_4k.jpg",
        ao=POLYHAVEN / "leafy_grass_ao_4k.jpg",
        notes="pasture",
    ),
    BiomeSpec(
        stem="forest_floor_scan", version="v4",
        albedo=POLYHAVEN / "forrest_ground_03_diff_4k.jpg",
        normal=POLYHAVEN / "forrest_ground_03_nor_gl_4k.jpg",
        roughness=POLYHAVEN / "forrest_ground_03_rough_4k.jpg",
        ao=POLYHAVEN / "forrest_ground_03_ao_4k.jpg",
        notes="forest floor",
    ),
    BiomeSpec(
        stem="ochre_clay_scan", version="v4",
        albedo=POLYHAVEN / "red_mud_stones_diff_4k.jpg",
        normal=POLYHAVEN / "red_mud_stones_nor_gl_4k.jpg",
        roughness=POLYHAVEN / "red_mud_stones_rough_4k.jpg",
        ao=POLYHAVEN / "red_mud_stones_ao_4k.jpg",
        notes="hill / clay",
    ),
    BiomeSpec(
        stem="warm_dune_scan", version="v4",
        albedo=POLYHAVEN / "sand_01_diff_4k.jpg",
        normal=POLYHAVEN / "sand_01_nor_gl_4k.jpg",
        roughness=POLYHAVEN / "sand_01_rough_4k.jpg",
        ao=POLYHAVEN / "sand_01_ao_4k.jpg",
        notes="desert",
    ),
    # --- No photoscan available: derive, but from the sharpest source. ---
    BiomeSpec(
        # v3, not v4. The v4 source is a polished slate slab with almost no
        # contrast, which is precisely why mountains read as poured concrete.
        # v3 is fractured rock with cracks and real relief.
        stem="alpine_strata_scan", version="v5",
        albedo=SRC / "alpine_strata_scan_source_v3.png",
        relief=4.6,
        roughness_base=0.82,
        notes="mountain (derived, fractured rock)",
    ),
    BiomeSpec(
        stem="wheat_rows", version="v2",
        albedo=SRC / "agriculture/wheat_rows_source_v1.png",
        relief=2.4,
        roughness_base=0.94,
        notes="plains (derived, directional crop rows)",
    ),
]


def fit(image: Image.Image, size: int) -> Image.Image:
    """Resample to `size`, never above the source's own resolution."""
    target = min(size, image.size[0], image.size[1])
    # Round down to a power of two: cleaner mip pyramid, no driver rescale.
    power = 1 << (target.bit_length() - 1)
    return image.resize((power, power), Image.Resampling.LANCZOS)


def save(image: Image.Image, path: Path, quality: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="WEBP", quality=quality, method=6)


def derive_height(albedo: Image.Image) -> np.ndarray:
    """High-passed luminance in 0..1, used as a stand-in for relief.

    The high pass matters: raw luminance treats a broad shadow or a colour
    change as elevation, which bakes phantom hills into the normal map.
    """
    luminance = albedo.convert("L")
    broad = luminance.filter(ImageFilter.GaussianBlur(radius=max(2, luminance.size[0] // 128)))
    detail = np.asarray(luminance, dtype=np.float32) - np.asarray(broad, dtype=np.float32)
    scale = max(1e-3, float(np.percentile(np.abs(detail), 99)))
    return np.clip(detail / (scale * 2.0) + 0.5, 0.0, 1.0)


def normal_from_height(height: np.ndarray, strength: float) -> Image.Image:
    gradient_z, gradient_x = np.gradient(height)
    nx = -gradient_x * strength * height.shape[0] / 512.0
    ny = gradient_z * strength * height.shape[0] / 512.0
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    stacked = np.stack((nx / length, ny / length, nz / length), axis=-1)
    return Image.fromarray(
        np.clip((stacked * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8), "RGB"
    )


def build(spec: BiomeSpec, dry_run: bool) -> None:
    albedo_source = Image.open(spec.albedo).convert("RGB")
    print(f"  {spec.stem}_{spec.version:<4} <- {spec.albedo.name} {albedo_source.size}")
    if dry_run:
        return

    albedo = fit(albedo_source, ALBEDO_SIZE)
    # No Color()/Contrast() reduction. The previous pipeline desaturated every
    # map by 18%, which is a large part of why the island read as grey mud.
    save(albedo, PHOTOREAL / f"{spec.stem}_albedo_{spec.version}.webp", 92)

    if spec.normal is not None:
        normal = fit(Image.open(spec.normal).convert("RGB"), NORMAL_SIZE)
    else:
        height = derive_height(fit(albedo_source, NORMAL_SIZE))
        normal = normal_from_height(height, spec.relief)
    save(normal, PHOTOREAL / f"{spec.stem}_normal_{spec.version}.webp", 94)

    if spec.roughness is not None:
        roughness = fit(Image.open(spec.roughness).convert("L"), MASK_SIZE)
    else:
        height = derive_height(fit(albedo_source, MASK_SIZE))
        # Raised micro-relief catches light; recesses hold moisture and dust.
        values = spec.roughness_base * 255.0 + (height - 0.5) * 46.0
        roughness = Image.fromarray(np.clip(values, 90, 252).astype(np.uint8), "L")
    save(roughness, PHOTOREAL / f"{spec.stem}_roughness_{spec.version}.webp", 90)

    if spec.ao is not None:
        ao = fit(Image.open(spec.ao).convert("L"), MASK_SIZE)
    else:
        height = derive_height(fit(albedo_source, MASK_SIZE))
        blurred = np.asarray(
            Image.fromarray((height * 255).astype(np.uint8), "L").filter(
                ImageFilter.GaussianBlur(radius=6)
            ),
            dtype=np.float32,
        ) / 255.0
        cavity = np.clip((height - blurred) * 2.2 + 1.0, 0.55, 1.0)
        ao = Image.fromarray((cavity * 255).astype(np.uint8), "L")
    save(ao, PHOTOREAL / f"{spec.stem}_ao_{spec.version}.webp", 90)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=None, help="build a single stem")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"terrain PBR -> {PHOTOREAL}")
    for spec in SPECS:
        if args.only and spec.stem != args.only:
            continue
        if not spec.albedo.exists():
            raise SystemExit(f"missing source: {spec.albedo}")
        build(spec, args.dry_run)
    print("done")


if __name__ == "__main__":
    main()
