"""Split a three-cell generated tree atlas and key its neutral studio backdrop.

The generator can bake a white/grey checker into otherwise production-ready
foliage. This tool removes only bright, nearly achromatic pixels, preserves the
coloured tree, trims the result and centres it on a transparent square canvas.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


def background_alpha(red: int, green: int, blue: int) -> int:
    high = max(red, green, blue)
    low = min(red, green, blue)
    chroma = high - low
    luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    if luminance >= 220 and chroma <= 34:
        return 0
    if luminance <= 196 or chroma >= 46:
        return 255
    brightness_keep = (220 - luminance) / 24
    colour_keep = (chroma - 34) / 12
    return round(255 * max(0.0, min(1.0, max(brightness_keep, colour_keep))))


def key_background(image: Image.Image) -> Image.Image:
    rgba = image.convert('RGBA')
    pixels = rgba.load()
    clean_margin = round(rgba.width * 0.065)
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, _ = pixels[x, y]
            alpha = 0 if x < clean_margin or x >= rgba.width - clean_margin else background_alpha(red, green, blue)
            pixels[x, y] = red, green, blue, alpha
    # Contract the keyed matte by one pixel so the light studio backdrop cannot
    # leak through alpha-tested mip levels as a white halo in the renderer.
    alpha = rgba.getchannel('A').filter(ImageFilter.MinFilter(3))
    alpha = alpha.point(lambda value: 255 if value >= 112 else 0)
    rgba.putalpha(alpha)
    return rgba


def frame_tree(image: Image.Image, size: int) -> Image.Image:
    alpha = image.getchannel('A')
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError('No foreground found after background keying')
    crop = image.crop(bounds)
    available_width = round(size * 0.86)
    available_height = round(size * 0.92)
    scale = min(available_width / crop.width, available_height / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    x = (size - resized.width) // 2
    y = size - resized.height - round(size * 0.035)
    canvas.alpha_composite(resized, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output_dir', type=Path)
    parser.add_argument('--size', type=int, default=1024)
    parser.add_argument('--version', default='v1')
    args = parser.parse_args()

    atlas = Image.open(args.source).convert('RGB')
    args.output_dir.mkdir(parents=True, exist_ok=True)
    names = ('spruce', 'pine', 'oak')
    for index, name in enumerate(names):
        left = round(index * atlas.width / 3)
        right = round((index + 1) * atlas.width / 3)
        cell = atlas.crop((left, 0, right, atlas.height))
        output = frame_tree(key_background(cell), args.size)
        output.save(args.output_dir / f'{name}_impostor_{args.version}.png', optimize=True)


if __name__ == '__main__':
    main()
