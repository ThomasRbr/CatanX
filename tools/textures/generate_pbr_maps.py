#!/usr/bin/env python3
"""Generate deterministic game-ready PBR maps from an authored diffuse source."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


def normalized(array: np.ndarray) -> np.ndarray:
    low, high = np.percentile(array, (1.0, 99.0))
    if high - low < 1e-6:
        return np.clip(array, 0.0, 1.0)
    return np.clip((array - low) / (high - low), 0.0, 1.0)


def blur(array: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(array, 0.0, 1.0) * 255), mode="L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255.0


def save_gray(array: np.ndarray, path: Path, quality: int = 92) -> None:
    image = Image.fromarray(np.uint8(np.clip(array, 0.0, 1.0) * 255), mode="L")
    image.save(path, quality=quality, optimize=True)


def generate(
    source: Path,
    output_dir: Path,
    stem: str,
    size: int,
    strength: float,
    roughness: float,
    saturation: float,
    brightness: float,
    contrast: float,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        albedo = ImageOps.fit(original.convert("RGB"), (size, size), method=Image.Resampling.LANCZOS)
    albedo = ImageEnhance.Color(albedo).enhance(saturation)
    albedo = ImageEnhance.Brightness(albedo).enhance(brightness)
    albedo = ImageEnhance.Contrast(albedo).enhance(contrast)

    albedo_path = output_dir / f"{stem}_albedo_v1.jpg"
    albedo.save(albedo_path, quality=92, optimize=True, progressive=True)

    rgb = np.asarray(albedo, dtype=np.float32) / 255.0
    luminance = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    broad = blur(luminance, max(2.0, size / 180.0))
    micro = luminance - broad
    height = normalized(broad * 0.58 + micro * 1.42)
    height = blur(height, 0.65)

    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    normal_rgb = np.uint8(np.clip(normal * 0.5 + 0.5, 0.0, 1.0) * 255)
    Image.fromarray(normal_rgb, mode="RGB").save(
        output_dir / f"{stem}_normal_v1.webp",
        format="WEBP",
        quality=90,
        method=6,
    )

    local_detail = np.clip(np.abs(micro) * 5.5, 0.0, 1.0)
    rough = np.clip(roughness + (0.5 - local_detail) * 0.13, 0.45, 1.0)
    cavity = np.clip(blur(height, max(2.0, size / 240.0)) - height, 0.0, 1.0)
    ao = np.clip(1.0 - cavity * 2.4, 0.48, 1.0)

    save_gray(height, output_dir / f"{stem}_height_v1.jpg")
    save_gray(rough, output_dir / f"{stem}_roughness_v1.jpg")
    save_gray(ao, output_dir / f"{stem}_ao_v1.jpg")

    print(f"generated {stem}: {size}x{size} -> {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("stem")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--strength", type=float, default=4.5)
    parser.add_argument("--roughness", type=float, default=0.9)
    parser.add_argument("--saturation", type=float, default=1.0)
    parser.add_argument("--brightness", type=float, default=1.0)
    parser.add_argument("--contrast", type=float, default=1.0)
    args = parser.parse_args()
    generate(
        args.source,
        args.output_dir,
        args.stem,
        args.size,
        args.strength,
        args.roughness,
        args.saturation,
        args.brightness,
        args.contrast,
    )


if __name__ == "__main__":
    main()
