#!/usr/bin/env python3
"""
compress_images.py — Batch image optimiser for Marie Hartig Studio
Preserves ICC colour profiles so colours stay vibrant after compression.
"""

import shutil
from pathlib import Path
from PIL import Image, ImageCms

# ── CONFIG ──────────────────────────────────────────────────────────────────
ASSETS_DIR  = Path('assets/images')
BACKUP_DIR  = Path('assets/images_backup')
QUALITY     = 82       # slightly higher than before to preserve vibrancy
MAX_WIDTH   = 2400
MAX_HEIGHT  = 2400
BACKUP      = True
# ────────────────────────────────────────────────────────────────────────────

SUPPORTED = {'.jpg', '.jpeg', '.png', '.webp'}

def human_size(b):
    for unit in ['B', 'KB', 'MB', 'GB']:
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024

def compress_image(src: Path):
    original_size = src.stat().st_size
    img = Image.open(src)

    # ── Preserve ICC colour profile ──────────────────────────────────────
    # This is what keeps colours vibrant — Pillow strips profiles by default
    icc_profile = img.info.get('icc_profile')

    # Resize if over max dimensions
    w, h = img.size
    if w > MAX_WIDTH or h > MAX_HEIGHT:
        img.thumbnail((MAX_WIDTH, MAX_HEIGHT), Image.LANCZOS)

    suffix = src.suffix.lower()

    if suffix in ('.jpg', '.jpeg'):
        # Flatten any transparency onto white (JPEG doesn't support it)
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode in ('RGBA', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        # Save with ICC profile preserved
        save_kwargs = dict(quality=QUALITY, optimize=True, progressive=True)
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
        save_kwargs = dict(quality=QUALITY, method=6)
        if icc_profile:
            save_kwargs['icc_profile'] = icc_profile
        img.save(src, 'WEBP', **save_kwargs)

    return original_size, src.stat().st_size


def main():
    if not ASSETS_DIR.exists():
        print(f"❌  Folder not found: {ASSETS_DIR}")
        print("    Run this script from your repo root (the folder containing assets/)")
        return

    images = [p for p in ASSETS_DIR.rglob('*') if p.suffix.lower() in SUPPORTED]
    if not images:
        print("No images found.")
        return

    print(f"Found {len(images)} images in {ASSETS_DIR}\n")

    if BACKUP:
        if BACKUP_DIR.exists():
            print(f"Backup already exists at {BACKUP_DIR} — skipping backup.\n")
        else:
            print(f"Backing up originals to {BACKUP_DIR}/ ...")
            shutil.copytree(ASSETS_DIR, BACKUP_DIR)
            print("Backup complete.\n")

    total_before = total_after = skipped = 0

    for img_path in images:
        try:
            before, after = compress_image(img_path)
            total_before += before
            total_after  += after
            saving = (1 - after / before) * 100 if before else 0
            print(f"  ✓  {img_path.relative_to(ASSETS_DIR)}"
                  f"  {human_size(before)} → {human_size(after)}"
                  f"  ({saving:.0f}% smaller)")
        except Exception as e:
            print(f"  ⚠️  Skipped {img_path.name}: {e}")
            skipped += 1

    processed = len(images) - skipped
    print(f"\n{'─' * 60}")
    print(f"Done. {processed} images compressed, {skipped} skipped.")
    if total_before:
        print(f"Total: {human_size(total_before)} → {human_size(total_after)}"
              f"  ({(1 - total_after / total_before) * 100:.1f}% reduction)")
    if BACKUP:
        print(f"Originals backed up to: {BACKUP_DIR}/")
    print("\nCommit the updated assets/ folder to GitHub to deploy.")


if __name__ == '__main__':
    main()
