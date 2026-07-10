#!/usr/bin/env python3
"""
Extract per-ship illustrations from the BFG Remastered Fleets PDF.

Each vessel page has: a faction header, a "<NAME> <CATEGORY>" title in
RedeyeSansW00-Bold, an "<N> PTS" span, and a landscape ship illustration
(greyscale art on black). We read the title, grab the ship art, and match
it to a ship id in data/ship_database.json by fuzzy name.

Output:
  images/ships/<shipId>.webp        (matched art, black bg, ~640px wide)
  scripts/art-extract-report.json   (coverage report)

Run: python scripts/extract-ship-art.py
"""
import fitz, json, re, os, io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF  = os.path.join(ROOT, 'BFG Remastered Official Fleets_WIP.pdf')
DB   = os.path.join(ROOT, 'data', 'ship_database.json')
OUT  = os.path.join(ROOT, 'images', 'ships')
REPORT = os.path.join(ROOT, 'scripts', 'art-extract-report.json')

os.makedirs(OUT, exist_ok=True)

CATEGORY_WORDS = ['grand cruiser','heavy cruiser','light cruiser','battlecruiser',
                  'battleship','cruiser','battle barge','battlebarge','frigate',
                  'destroyer','escort','raider','class']

def norm(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    for w in CATEGORY_WORDS:
        s = s.replace(w, ' ')
    return re.sub(r'\s+', ' ', s).strip()

# ── load DB, build name → id lookups ────────────────────────────────────────
db = json.load(open(DB, encoding='utf-8'))
ships = db['ships']
by_norm = {}       # normalized core name → [ids]
for sid, s in ships.items():
    key = norm(s['name'])
    by_norm.setdefault(key, []).append(sid)

def match_ship(title_name, pts):
    key = norm(title_name)
    if not key:
        return None
    # exact core-name match
    cands = by_norm.get(key, [])
    if len(cands) == 1:
        return cands[0]
    if len(cands) > 1:
        # disambiguate by points
        best = min(cands, key=lambda i: abs(ships[i]['pts'] - pts))
        return best
    # token-subset match: title tokens all appear in a ship's normalized name
    tset = set(key.split())
    if not tset:
        return None
    hits = []
    for nkey, ids in by_norm.items():
        nset = set(nkey.split())
        if tset and (tset <= nset or nset <= tset):
            hits.extend(ids)
    if hits:
        return min(hits, key=lambda i: abs(ships[i]['pts'] - pts))
    return None

# ── walk pages ──────────────────────────────────────────────────────────────
doc = fitz.open(PDF)
report = {'matched': [], 'unmatched_pages': [], 'no_art': []}
used_ids = set()

for pn in range(doc.page_count):
    page = doc[pn]
    spans = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                if 'Redeye' in s['font'] and s['size'] >= 17:
                    spans.append(s['text'].strip())
    if not spans:
        continue
    pts_span = next((t for t in spans if re.search(r'\d+\s*PTS', t, re.I)), None)
    if not pts_span:
        continue
    name_spans = [t for t in spans if not re.search(r'\d+\s*PTS', t, re.I)]
    if not name_spans:
        continue
    title = name_spans[0]
    pts = int(re.search(r'(\d+)\s*PTS', pts_span, re.I).group(1))

    sid = match_ship(title, pts)
    if not sid:
        report['unmatched_pages'].append({'page': pn, 'title': title, 'pts': pts})
        continue
    if sid in used_ids:
        continue  # first (usually primary) page wins

    # find ship art: largest landscape image that isn't the portrait background
    art_xref = None
    best_area = 0
    for img in page.get_images(full=True):
        xref, w, h = img[0], img[2], img[3]
        if w <= h:            # portrait → background texture
            continue
        if h > 900:           # oversized → background
            continue
        area = w * h
        if area > best_area:
            best_area, art_xref = area, xref
    if not art_xref:
        report['no_art'].append({'page': pn, 'title': title, 'sid': sid})
        continue

    pix = fitz.Pixmap(doc, art_xref)
    if pix.n - pix.alpha >= 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    png = pix.tobytes('png')
    im = Image.open(io.BytesIO(png)).convert('RGB')
    # downscale to max 720px wide, save webp
    if im.width > 720:
        im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, sid + '.webp'), 'WEBP', quality=82, method=6)
    used_ids.add(sid)
    report['matched'].append({'page': pn, 'title': title, 'pts': pts,
                              'sid': sid, 'dbName': ships[sid]['name']})

json.dump(report, open(REPORT, 'w', encoding='utf-8'), indent=1)
print(f"matched {len(report['matched'])} / {len(ships)} ships")
print(f"unmatched pages: {len(report['unmatched_pages'])}, no-art: {len(report['no_art'])}")
