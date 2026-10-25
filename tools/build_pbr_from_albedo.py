"""Build deterministic companion PBR maps from a neutral albedo source.

This is an asset-pipeline helper, not a runtime dependency. The generated maps
are deliberately conservative: authored scans can replace any channel later
without changing the renderer or material registry.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def save_jpeg(image: Image.Image, path: Path, quality: int = 94) -> None:
    image.save(path, format="JPEG", quality=quality, optimize=True, progressive=True)


def build_maps(source: Path, output_dir: Path, stem: str, size: int, version: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    albedo = Image.open(source).convert("RGB")
    albedo = ImageOps.fit(albedo, (size, size), method=Image.Resampling.LANCZOS)
    albedo = ImageEnhance.Color(albedo).enhance(0.82)
    albedo = ImageEnhance.Contrast(albedo).enhance(0.94)
    save_jpeg(albedo, output_dir / f"{stem}_albedo_{version}.jpg", 95)

    luminance = ImageOps.grayscale(albedo)
    broad = luminance.filter(ImageFilter.GaussianBlur(radius=1.1))
    height = ImageOps.autocontrast(broad, cutoff=(0.6, 0.6))
    save_jpeg(height, output_dir / f"{stem}_height_{version}.jpg", 94)

    values = np.asarray(height, dtype=np.float32) / 255.0
    gradient_z, gradient_x = np.gradient(values)
    strength = 3.4
    nx = -gradient_x * strength
    ny = gradient_z * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length, ny / length, nz / length), axis=-1)
    normal = np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    Image.fromarray(normal, "RGB").save(
        output_dir / f"{stem}_normal_{version}.webp",
        format="WEBP",
        quality=94,
        method=6,
    )

    # Crevices receive stronger occlusion, while exposed faces stay near white.
    local_mean = np.asarray(luminance.filter(ImageFilter.GaussianBlur(radius=7.0)), dtype=np.float32)
    detail = np.asarray(luminance, dtype=np.float32) - local_mean
    ao = np.clip(236.0 + detail * 0.52, 148.0, 255.0).astype(np.uint8)
    save_jpeg(Image.fromarray(ao, "L"), output_dir / f"{stem}_ao_{version}.jpg", 93)

    # Non-metal terrain remains mostly rough, with restrained variation.
    roughness = np.clip(220.0 - detail * 0.24, 174.0, 246.0).astype(np.uint8)
    save_jpeg(Image.fromarray(roughness, "L"), output_dir / f"{stem}_roughness_{version}.jpg", 93)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("stem")
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--version", default="v1")
    args = parser.parse_args()
    build_maps(args.source, args.output_dir, args.stem, args.size, args.version)


if __name__ == "__main__":
    main()
