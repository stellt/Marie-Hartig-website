#!/usr/bin/env python3
"""
image_compress.py — Shared compression logic for Marie Hartig Studio images.
Used by both compress_images.py (manual batch run) and the CI auto-compress
workflow (.github/workflows/compress-images.yml).

Bakes EXIF orientation into the pixels before resizing/saving. Skipping this
step is what caused the "sideways photos" bug fixed in commit e24c37d: some
viewers respect the EXIF Orientation tag and some don't, so any tool that
drops the tag without applying it first leaves the image sideways everywhere
that doesn't auto-rotate.
"""

from pathlib import Path
from PIL import Image, ImageOps

# Netlify Image CDN (js/img.js) serves srcset widths up to 1600px — never
# shrink originals below that or the CDN would have to upscale.
MAX_WIDTH = 2400
MAX_HEIGHT = 2400
QUALITY = 82

SUPPORTED = {'.jpg', '.jpeg', '.png', '.webp'}


def compress_image(src: Path, quality: int = QUALITY,
                    max_width: int = MAX_WIDTH, max_height: int = MAX_HEIGHT):
    """Compress src in place. Returns (size_before, size_after) in bytes."""
    original_size = src.stat().st_size
    img = Image.open(src)

    icc_profile = img.info.get('icc_profile')

    # Bake EXIF orientation into the actual pixels, then discard the tag —
    # leaving a stale Orientation tag around after this point risks a
    # double-rotation in any viewer that still reads it.
    img = ImageOps.exif_transpose(img)

    w, h = img.size
    if w > max_width or h > max_height:
        img.thumbnail((max_width, max_height), Image.LANCZOS)

    suffix = src.suffix.lower()

    if suffix in ('.jpg', '.jpeg'):
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode in ('RGBA', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        save_kwargs = dict(quality=quality, optimize=True, progressive=True)
        if icc_profile:
            save_kwargs['icc_profile'] = icc_profile
        img.save(src, 'JPEG', **save_kwargs)

    elif suffix == '.png':
        if img.mode not in ('RGB', 'RGBA', 'L', 'LA'):
            img = img.convert('RGBA')
        save_kwargs = dict(optimize=True)
        if icc_profile:
            save_kwargs['icc_profile'] = icc_profile
        img.save(src, 'PNG', **save_kwargs)

    elif suffix == '.webp':
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA' if img.mode in ('PA', 'LA') else 'RGB')
        save_kwargs = dict(quality=quality, method=6)
        if icc_profile:
            save_kwargs['icc_profile'] = icc_profile
        img.save(src, 'WEBP', **save_kwargs)

    else:
        raise ValueError(f"Unsupported image type: {suffix}")

    return original_size, src.stat().st_size


def human_size(b):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.1f} TB"
