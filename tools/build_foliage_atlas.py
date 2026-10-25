"""Build the foliage cluster atlas used by the volumetric 3D trees.

The photographed tree impostors are cut into branch sprays (conifers) and
leaf clusters (broadleaves). Each crop gets an organic alpha vignette so card
edges never show the rectangular crop, and colour is bled into the
transparent texels so mipmaps do not pick up dark fringes.

Layout (authored at 2048 x 1024, saved at 1024 x 512):
  row 0: two conifer branch sprays, 1024 x 512 each (trunk on the left)
  row 1: four broadleaf clusters, 512 x 512 each

Usage: python tools/build_foliage_atlas.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
VEG = ROOT / 'apps' / 'client' / 'public' / 'assets' / 'textures' / 'vegetation'
OUT = VEG / 'foliage_atlas_v1.png'

SPRUCE = Image.open(VEG / 'spruce_impostor_v3.png').convert('RGBA')
BEECH = Image.open(VEG / 'beech_impostor_v3.png').convert('RGBA')

BRANCHES = [
    (SPRUCE, (470, 580, 770, 730), False),
    (SPRUCE, (250, 880, 490, 1000), True),
]
CLUSTERS = [
    (BEECH, (560, 840, 940, 1220)),
    (BEECH, (100, 520, 480, 900)),
    (BEECH, (180, 100, 560, 480)),
    (BEECH, (520, 220, 900, 600)),
]


def noise(shape, seed, scale):
    rng = np.random.default_rng(seed)
    small = rng.random((max(2, shape[0] // scale), max(2, shape[1] // scale))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((shape[1], shape[0]), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32) / 255.0


def vignette(width, height, cx, cy, rx, ry, seed):
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    nx = (x / width - cx) / rx
    ny = (y / height - cy) / ry
    d = np.sqrt(nx * nx + ny * ny)
    d += (noise((height, width), seed, 24) - 0.5) * 0.35
    return np.clip((1.0 - d) / 0.28, 0.0, 1.0)


def bleed(rgba):
    """Fill transparent texels with nearby opaque colour."""
    arr = np.asarray(rgba, dtype=np.float32)
    alpha = arr[..., 3:4] / 255.0
    rgb = arr[..., :3]
    acc = rgb * alpha
    weight = alpha.copy()
    out_rgb = rgb.copy()
    for radius in (2, 6, 16, 40):
        blurred = np.asarray(
            Image.fromarray(np.clip(acc, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)),
            dtype=np.float32,
        )
        w = np.asarray(
            Image.fromarray(np.clip(weight[..., 0] * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius)),
            dtype=np.float32,
        )[..., None] / 255.0
        fill = blurred / np.maximum(w, 1e-3)
        empty = alpha < 0.5
        out_rgb = np.where(empty & (w > 0.02), fill, out_rgb)
    out = np.concatenate([np.clip(out_rgb, 0, 255), arr[..., 3:4]], axis=-1)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def prepare(image, box, size, flip, seed, branch):
    crop = image.crop(box)
    if flip:
        crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
    crop = crop.resize(size, Image.LANCZOS)
    arr = np.asarray(crop, dtype=np.float32)
    w, h = size
    if branch:
        # Spray: full strength along the branch, fading at the tip and edges.
        mask = vignette(w, h, 0.42, 0.5, 0.62, 0.52, seed)
    else:
        mask = vignette(w, h, 0.5, 0.5, 0.52, 0.52, seed)
    arr[..., 3] = arr[..., 3] * mask
    return bleed(Image.fromarray(arr.astype(np.uint8), 'RGBA'))


def main():
    atlas = Image.new('RGBA', (2048, 1024), (60, 80, 40, 0))
    for index, (image, box, flip) in enumerate(BRANCHES):
        cell = prepare(image, box, (1024, 512), flip, 11 + index, True)
        atlas.paste(cell, (index * 1024, 0))
    for index, (image, box) in enumerate(CLUSTERS):
        cell = prepare(image, box, (512, 512), False, 31 + index, False)
        atlas.paste(cell, (index * 512, 512))
    # Cards cover 30-80 px on screen: 1024 x 512 is already one mip above that.
    atlas = atlas.resize((1024, 512), Image.LANCZOS)
    atlas.save(OUT, optimize=True)
    print(f'wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
