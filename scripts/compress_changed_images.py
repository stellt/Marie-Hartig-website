#!/usr/bin/env python3
"""
compress_changed_images.py — Compress a specific list of image files.
Driven by .github/workflows/compress-images.yml, which passes the paths
that changed in the triggering push (Marie's CMS uploads land here).

Unlike compress_images.py this does NOT write to assets/images_backup/ —
in CI, git history is the backup, and that folder already has an unrelated,
unresolved duplicate-content situation (see CLAUDE.md) that a new writer
shouldn't add to.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from image_compress import compress_image, human_size, SUPPORTED


def main():
    paths = [Path(p) for p in sys.argv[1:]]
    images = [p for p in paths if p.exists() and p.suffix.lower() in SUPPORTED]

    if not images:
        print("No compressible image files in the given list.")
        return

    changed_any = False
    for img_path in images:
        try:
            before, after = compress_image(img_path)
            if after < before:
                changed_any = True
            saving = (1 - after / before) * 100 if before else 0
            print(f"  {img_path}  {human_size(before)} -> {human_size(after)}  ({saving:.0f}% smaller)")
        except Exception as e:
            print(f"  Skipped {img_path}: {e}")

    # Signal to the workflow whether there's anything worth committing.
    print(f"CHANGED={'true' if changed_any else 'false'}")


if __name__ == '__main__':
    main()
