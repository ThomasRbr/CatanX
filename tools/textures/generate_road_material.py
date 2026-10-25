#!/usr/bin/env python3
"""Generate an original, deterministic dirt-road PBR set for CatanX."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


SIZE = 1024
OUTPUT = Path(__file__).resolve().parents[2] / "apps/client/public/assets/textures/roads/photoreal"


def smooth(array: np.ndarray, radius: float) -> np.ndarray:
    image = Image.fromarray(np.uint8(np.clip(array, 0, 1) * 255), mode="L")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(radius)), dtype=np.float32) / 255


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0xCA7A5)
    y, x = np.mgrid[0:SIZE, 0:SIZE].astype(np.float32)
    u = x / SIZE
    v = y / SIZE

    broad = smooth(rng.random((SIZE, SIZE), dtype=np.float32), 28)
    medium = smooth(rng.random((SIZE, SIZE), dtype=np.float32), 5)
    grit = rng.random((SIZE, SIZE), dtype=np.float32)
    # Two longitudinal wagon ruts with broken, rain-softened edges.
    rut_a = np.exp(-((u - 0.31 - np.sin(v * 12.4) * 0.012) / 0.052) ** 2)
    rut_b = np.exp(-((u - 0.69 + np.sin(v * 10.7) * 0.011) / 0.052) ** 2)
    ruts = (rut_a + rut_b) * (0.72 + medium * 0.28)
    stones = np.clip((grit - 0.88) * 8.5, 0, 1) * (0.35 + medium * 0.65)
    height = np.clip(0.52 + (broad - 0.5) * 0.75 + (medium - 0.5) * 0.22 - ruts * 0.24 + stones * 0.3, 0, 1)
    height = smooth(height, 0.75)

    base = np.array([0.34, 0.255, 0.16], dtype=np.float32)
    ochre = np.array([0.49, 0.36, 0.22], dtype=np.float32)
    dark = np.array([0.18, 0.135, 0.09], dtype=np.float32)
    tone = np.clip(0.28 + height[..., None] * 0.72, 0, 1)
    albedo = dark + (base - dark) * tone
    albedo += (ochre - base) * np.clip((broad - 0.47)[..., None] * 1.6, 0, 0.35)
    albedo += stones[..., None] * np.array([0.16, 0.15, 0.13], dtype=np.float32)
    albedo -= ruts[..., None] * np.array([0.055, 0.045, 0.03], dtype=np.float32)
    albedo = np.uint8(np.clip(albedo, 0, 1) * 255)
    Image.fromarray(albedo, mode="RGB").save(OUTPUT / "dirt_road_albedo_v1.jpg", quality=92, optimize=True, progressive=True)

    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 5.5
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * 5.5
    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    normal_rgb = np.uint8(np.clip(normal * 0.5 + 0.5, 0, 1) * 255)
    Image.fromarray(normal_rgb, mode="RGB").save(OUTPUT / "dirt_road_normal_v1.webp", format="WEBP", quality=90, method=6)

    roughness = np.clip(0.84 + (1 - medium) * 0.11 - stones * 0.16, 0.58, 0.98)
    ao = np.clip(1 - ruts * 0.22 - (1 - height) * 0.08, 0.62, 1)
    for name, data in (("height", height), ("roughness", roughness), ("ao", ao)):
        Image.fromarray(np.uint8(data * 255), mode="L").save(
            OUTPUT / f"dirt_road_{name}_v1.jpg", quality=92, optimize=True
        )
    print(f"generated dirt road PBR -> {OUTPUT}")


if __name__ == "__main__":
    main()
