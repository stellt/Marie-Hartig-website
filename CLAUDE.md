# Marie Hartig Studio website — handover notes

Static HTML/CSS/JS site (no build step) for a mural artist's portfolio, shop,
and contact site. Content is edited by the client (Marie, non-technical)
through a Decap CMS admin at `/admin/`, backed by `git-gateway` — every save
in the admin commits straight to `main` and Netlify auto-deploys.

- **Live site:** https://www.mariespaintedworlds.com
- **Repo:** https://github.com/stellt/Marie-Hartig-website
- **Hosting:** Netlify (Netlify Identity for CMS login, Netlify Forms for the
  newsletter, Netlify Image CDN for responsive images)
- **Admin config:** `admin/config.yml` (this is the ONLY config file Decap
  reads — it's at `admin/config.yml`, not repo-root `config.yml`)

## How content actually renders

Every page fetches its own JSON from `_content/*.json` or `_collections/*.json`
at load time and renders client-side. **A page editable in the CMS does
nothing unless the page's JS actually fetches and renders that JSON file** —
this was the root cause of most bugs fixed this session (CMS sections that
looked wired up but the page was still hardcoded HTML).

| Page(s) | Data file(s) | Notes |
|---|---|---|
| `pages/portfolio.html` | `_content/portfolio.json` | Ordered list (drag-reorder in CMS) + thumbnail per collection |
| `pages/collections/collection-*.html` (30 files) | `_collections/<slug>.json` | Generated from `scripts/generate-collection-pages.py` — **don't hand-edit these 30 files**, edit the template and regenerate |
| `pages/about-marie.html` | `_content/about-marie.json` | Ordered `sections` list; photo alternates left/right by index parity automatically |
| `pages/contact.html` | `_content/contact.json` | Also has the "Connect" newsletter form |
| `pages/process.html` | `_content/process.json` | Fixed 3-section shape (how_marie_works / process / investment), not a generic list |
| `index.html` (root) | `_content/slideshow-opening.json` via `js/slideshow.js` | "Opening Page Slideshow" in CMS — despite the name this drives the site's actual homepage |
| `pages/about.html` | `_content/slideshow-home.json` via `js/worlds.js` | "Home Page Slideshow" in CMS — despite the name this drives the fullscreen slideshow reached via index.html's "Explore" link, NOT the homepage. Images live in `assets/images_backup/slides/slide-NN.jpg` (see gotcha below) |
| `pages/shop-wall-tattoos.html`, `shop-art-prints.html`, `shop-wallpapers.html` | `_content/shop-tattoos.json`, `shop-prints.json`, `shop-wallpapers.json` | Fully wired; `shop.html` landing page intentionally still shows "Coming Soon" tiles that don't link anywhere — client asked to leave that gated for now |

## Gotchas discovered this session (read before touching image/list fields)

1. **Decap sometimes stores a single-field list item as a bare string instead
   of `{"fieldname": "..."}`.** Confirmed for image lists and text lists
   (`_collections/*.json` images/description, slideshow slides,
   about-marie.json paragraphs). Every render script that reads one of these
   must do `typeof item === 'string' ? item : item.image` (or `.text`), never
   assume the object shape. If you add a NEW single-field list anywhere,
   write it defensively from day one.

2. **`assets/images_backup/` is NOT a disposable backup folder** — it's
   misleadingly named but `assets/images_backup/slides/` is the real, live
   source for the About page slideshow. Don't delete this directory. The rest
   of `images_backup/` (portfolio, wall stickers, tattoos, wallpapers) does
   look like an actual duplicate backup of `assets/images/` — flagged to the
   client but not removed; ask before deleting anything in there.

3. **Local working copy can silently drift from `origin/main`.** Mid-session,
   three files (`shop-tattoos.json`, `shop-prints.json`, `shop-wallpapers.json`)
   existed on GitHub with real curated data but were missing from the local
   OneDrive-synced folder — a sync gap, not a git issue. Always
   `git fetch && git diff origin/main` (or at least `git show origin/main:<path>`)
   before regenerating/seeding any content file, to avoid clobbering real data
   that just isn't on disk locally.

4. **Browser caching makes local testing lie to you.** The local dev server
   (plain `python -m http.server` via `.claude/launch.json`, no cache
   headers) gets aggressively cached by the browser across reloads, especially
   `.js` files. If a fix "isn't working" locally right after editing, don't
   trust it — re-fetch the script with a cache-busting query param and
   re-execute it manually before concluding something's broken. (This is a
   testing-harness quirk only; it doesn't happen on the real deployed site.)

5. **Netlify Image CDN (`js/img.js`)** — all images across the site go
   through `/.netlify/images?url=...&w=...&q=75` via the `imgAttrs()` /
   `imgUrl()` / `imgSrcset()` helpers in `js/img.js`, so any device gets an
   appropriately-sized image instead of the multi-MB camera originals the
   client uploads. This works automatically for any future upload too — no
   pre-processing step needed. It only works on the real Netlify deployment;
   locally these URLs 404 (harmless — just can't verify actual image bytes
   load in local testing, only that markup is correct).

6. **Image paths should be root-absolute** (`/assets/images/...`), not
   relative (`../assets/...`) — relative paths break depending on how deep
   the consuming page is nested. Some older/CMS-authored entries still use
   relative paths; the render code normalizes them (see `slideSrc()` /
   `worldsSlideSrc()` in `js/slideshow.js` / `js/worlds.js`), but write new
   ones root-absolute.

## Useful commands

```bash
# Regenerate all 30 collection pages from the shared template after editing it
python scripts/generate-collection-pages.py

# Validate config.yml after any edit (YAML errors silently break the whole admin)
python -c "import yaml; yaml.safe_load(open('admin/config.yml', encoding='utf-8')); print('OK')"
```

## Known open items (not yet done, mentioned to client but not actioned)

- `assets/images_backup/` cleanup (see gotcha #2) — client hasn't decided
- Shop landing page (`shop.html`) still gates all 3 shop sections behind
  "Coming Soon" — client wants this left as-is until they're ready to launch
- Some `assets/images/...` originals are still huge (multi-MB) on disk; the
  Image CDN fixes *delivery* size but doesn't shrink the source files
  themselves (not a problem functionally, just repo bloat)

## Working with the client

Marie edits the live site directly through `/admin/` and does so often —
expect to `git pull` before starting any session, and always `git pull`
again right before pushing (this repo has had real concurrent-edit conflicts
resolved via normal merges, not force-pushes). She is not technical; when
something "doesn't show up," check the actual deployed data/HTML yourself
(curl the live site, check `_content`/`_collections` JSON) before asking her
for more details — most past reports of "it's not working" traced to a real,
findable bug rather than user error.
