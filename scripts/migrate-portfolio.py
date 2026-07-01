#!/usr/bin/env python3
"""
One-time migration: extract hardcoded content from pages/portfolio.html and
pages/collections/collection-*.html into the new Decap CMS data files:
  _content/portfolio.json   (master order + thumbnails, drives portfolio.html)
  _collections/<slug>.json  (per-collection content, drives collection-*.html)

Run once from the repo root: python scripts/migrate-portfolio.py
Safe to re-run — it always regenerates from the current HTML source files.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORTFOLIO_HTML = ROOT / "pages" / "portfolio.html"
COLLECTIONS_DIR = ROOT / "pages" / "collections"
CONTENT_OUT = ROOT / "_content" / "portfolio.json"
COLLECTIONS_OUT_DIR = ROOT / "_collections"


def normalize_image_path(src):
    """Strip leading ../ or ../../ and make root-absolute, e.g.
    '../../assets/images/portfolio/13 AUGSBURG TROPICS/x.jpg'
    -> '/assets/images/portfolio/13 AUGSBURG TROPICS/x.jpg'
    """
    stripped = re.sub(r'^(\.\./)+', '', src)
    return '/' + stripped.lstrip('/')


def slug_from_href(href):
    # 'collections/collection-urban.html' -> 'urban'
    filename = href.split('/')[-1]
    m = re.match(r'^collection-(.+)\.html$', filename)
    if not m:
        raise ValueError(f"Unexpected collection href: {href}")
    return m.group(1)


def migrate_portfolio_json():
    html = PORTFOLIO_HTML.read_text(encoding='utf-8')
    item_re = re.compile(
        r'<a class="portfolio-item" href="([^"]+)">\s*'
        r'<img src="([^"]+)" alt="[^"]*" loading="lazy"\s*/>\s*'
        r'<div class="portfolio-item-title">([^<]+)</div>\s*'
        r'</a>',
        re.DOTALL,
    )
    entries = []
    for href, img_src, title in item_re.findall(html):
        entries.append({
            "title": title.strip(),
            "slug": slug_from_href(href),
            "thumbnail": normalize_image_path(img_src),
        })

    if len(entries) != 30:
        raise AssertionError(f"Expected 30 portfolio entries, found {len(entries)}")

    CONTENT_OUT.parent.mkdir(parents=True, exist_ok=True)
    CONTENT_OUT.write_text(
        json.dumps({"collections": entries}, indent=2, ensure_ascii=False) + "\n",
        encoding='utf-8',
    )
    print(f"Wrote {CONTENT_OUT.relative_to(ROOT)} ({len(entries)} entries)")
    return entries


def migrate_collection(html_path, slug):
    html = html_path.read_text(encoding='utf-8')

    title_m = re.search(r'<h1 class="collection-title">([^<]+)</h1>', html)
    title = title_m.group(1).strip() if title_m else slug

    images = [
        normalize_image_path(src)
        for src in re.findall(
            r'<div class="collection-grid-item"><img src="([^"]+)"[^>]*/></div>', html
        )
    ]

    descriptions = [
        text.strip()
        for text in re.findall(r'<p class="collection-desc">([^<]*)</p>', html)
    ]

    location = ""
    loc_m = re.search(
        r'<div class="collection-meta-item">Location:\s*([^<]+)</div>', html
    )
    if loc_m:
        location = loc_m.group(1).strip()

    return {
        "title": title,
        "slug": slug,
        "images": [{"image": src} for src in images],
        "description": [{"text": t} for t in descriptions],
        "location": location,
        "year": "",
        "type": "",
    }


def migrate_collections_json():
    COLLECTIONS_OUT_DIR.mkdir(parents=True, exist_ok=True)
    html_files = sorted(COLLECTIONS_DIR.glob("collection-*.html"))
    if len(html_files) != 30:
        raise AssertionError(f"Expected 30 collection pages, found {len(html_files)}")

    for html_path in html_files:
        m = re.match(r'^collection-(.+)\.html$', html_path.name)
        slug = m.group(1)
        data = migrate_collection(html_path, slug)
        out_path = COLLECTIONS_OUT_DIR / f"{slug}.json"
        out_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding='utf-8'
        )
        print(
            f"Wrote {out_path.relative_to(ROOT)} "
            f"({len(data['images'])} images, {len(data['description'])} paragraphs, "
            f"location={'yes' if data['location'] else 'NONE'})"
        )


def cross_check(portfolio_entries):
    """Every slug referenced in portfolio.json must have a matching _collections/*.json."""
    missing = []
    for entry in portfolio_entries:
        if not (COLLECTIONS_OUT_DIR / f"{entry['slug']}.json").exists():
            missing.append(entry['slug'])
    if missing:
        raise AssertionError(f"portfolio.json references missing collection slugs: {missing}")
    print("Cross-check OK: all portfolio.json slugs have matching _collections/*.json")


if __name__ == "__main__":
    entries = migrate_portfolio_json()
    migrate_collections_json()
    cross_check(entries)
