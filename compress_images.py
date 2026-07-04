#!/usr/bin/env python3
"""
compress_images.py — Batch image optimiser for Marie Hartig Studio
Preserves ICC colour profiles so colours stay vibrant after compression,
and bakes in correct EXIF orientation so photos don't end up sideways.

For the automated version that runs on every CMS upload, see
.github/workflows/compress-images.yml and scripts/compress_changed_images.py.
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'scripts'))
from image_compress import compress_image, human_size, SUPPORTED

# ── CONFIG ──────────────────────────────────────────────────────────────────
ASSETS_DIR  = Path('assets/images')
BACKUP_DIR  = Path('assets/images_backup')
BACKUP      = True
# ────────────────────────────────────────────────────────────────────────────


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
