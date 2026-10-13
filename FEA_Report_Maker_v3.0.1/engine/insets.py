# -*- coding: utf-8 -*-
"""
insets.py  -  looking at a picture (pixels only, offline, numpy + Pillow):

    contour_stats(img)   is this a colour-contour result picture?  (hue families of the rainbow scale + how they touch)
    find_max_tag(img)    where is the red "Max" flag that ANSYS draws on a result plot?
    content_mask(img)    which parts of a picture are drawn (model, text, legend) and which are empty background?
    plan_panel(...)      where do the smaller pictures (zoomed view, cut section) fit ON THE SAME SLIDE as the full view?

Used by the analyzer (a stress picture without legend is not a geometry picture) and by the report engine (zoomed / section
views are placed on the slide of their full view, in the free room, with a red box on the full view and an arrow).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

# hue families of the ANSYS rainbow scale (degrees) - in scale order, so neighbours in the list are neighbours on the scale
FAMILIES = (("red", (345, 360)), ("red", (0, 15)), ("orange", (15, 42)), ("yellow", (42, 72)),
            ("green", (72, 160)), ("cyan", (160, 200)), ("blue", (200, 265)))
FAM_NAMES = ("red", "orange", "yellow", "green", "cyan", "blue")


def _small(img: Image.Image, side: int = 640) -> Image.Image:
    img = img.convert("RGB")
    if max(img.size) > side:
        k = side / max(img.size)
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.BILINEAR)
    return img


# ═════════════════════════════════════════════ is it a colour-contour picture? ═════════════════════════════════════════════
def contour_stats(img: Image.Image) -> dict:
    """A contour plot (stress, deformation, ...) shows the rainbow scale: several hue families, and where two colours touch
    they are NEIGHBOURS on the scale (blue-cyan, cyan-green, green-yellow ...).  A multi-coloured CAD model touches in any
    order; a set-up picture has two or three flat colours; plain geometry and mesh pictures have almost no saturated colour."""
    im = _small(img)
    arr = np.asarray(im)
    hsv = np.asarray(im.convert("HSV")).astype(np.int32)
    H, W = hsv.shape[:2]
    deg = hsv[..., 0] * 360.0 / 255.0
    sat = (hsv[..., 1] >= 140) & (hsv[..., 2] >= 77)
    n_sat = int(sat.sum())
    lab = np.full((H, W), -1, dtype=np.int8)                      # family index per pixel (-1 = not saturated)
    fam = {k: 0 for k in FAM_NAMES}
    if n_sat:
        for name, (a, b) in FAMILIES:
            m = sat & (deg >= a) & (deg < b)
            lab[m] = FAM_NAMES.index(name)
            fam[name] += int(m.sum())
    floor = max(0.025 * n_sat, 0.0006 * W * H)
    present = [k for k in FAM_NAMES if fam[k] >= floor]
    # how do different families touch?  count horizontal + vertical neighbour pairs of different families
    adj = non = 0
    if len(present) >= 2:
        for l1, l2 in ((lab[:, :-1], lab[:, 1:]), (lab[:-1, :], lab[1:, :])):
            both = (l1 >= 0) & (l2 >= 0) & (l1 != l2)
            if both.any():
                d = np.abs(l1[both].astype(np.int16) - l2[both].astype(np.int16))
                # red (0) and blue (5) are far apart on the scale; red(0)-orange(1) ... cyan(4)-blue(5) are neighbours
                adj += int((d == 1).sum())
                non += int((d >= 2).sum())
    nonbg = (255 - arr.min(axis=2)) > 28
    return {"n_fam": len(present), "families": present, "sat_frac": n_sat / float(W * H),
            "sat_of_content": n_sat / max(1, int(nonbg.sum())), "content_frac": float(nonbg.mean()),
            "adjacent": (adj / float(adj + non)) if (adj + non) else 0.0, "pairs": adj + non, "counts": fam}


def is_contour_picture(st: dict) -> str:
    """'yes' | 'maybe' | 'no' from contour_stats()"""
    nf, sc, ad = st["n_fam"], st["sat_of_content"], st["adjacent"]
    if nf >= 3 and ad >= 0.55 and sc >= 0.10:
        return "yes"
    if nf >= 2 and sc >= 0.50 and ad >= 0.55:
        return "yes"
    if nf >= 3 and sc >= 0.05:
        return "maybe"
    if nf == 2 and sc >= 0.25:
        return "maybe"
    return "no"


# ═════════════════════════════════════════════ the red "Max" flag ═════════════════════════════════════════════
def _components(mask: np.ndarray, max_area: int = 20000):
    """4-connected components of a boolean mask via run-length union-find -> [(area, x0, y0, x1, y1, {row: (xmin, xmax)})]"""
    H, W = mask.shape
    parent = []
    runs = []                                                      # (row, x0, x1, id)

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    prev = []
    for y in range(H):
        row = mask[y]
        cur = []
        if row.any():
            d = np.diff(np.concatenate(([0], row.view(np.int8), [0])))
            starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0] - 1
            for s, e in zip(starts, ends):
                rid = len(parent)
                parent.append(rid)
                cur.append((s, e, rid))
                runs.append((y, s, e, rid))
            for s, e, rid in cur:                                  # touch a run of the previous row?
                for ps, pe, pid in prev:
                    if ps <= e and pe >= s:
                        a, b = find(rid), find(pid)
                        if a != b:
                            parent[a] = b
        prev = cur
    comps = {}
    for y, s, e, rid in runs:
        r = find(rid)
        c = comps.setdefault(r, [0, 10 ** 9, 10 ** 9, -1, -1, {}])
        c[0] += e - s + 1
        c[1], c[2], c[3], c[4] = min(c[1], s), min(c[2], y), max(c[3], e), max(c[4], y)
        sp = c[5].get(y)
        c[5][y] = (s, e) if sp is None else (min(sp[0], s), max(sp[1], e))
    return [tuple(c) for c in comps.values() if c[0] <= max_area]


def find_max_tag(img: Image.Image, skip_legend: bool = True):
    """The red 'Max' flag ANSYS puts on the place of the maximum: a solid red flag, wider than high, with light letters INSIDE it
    (holes in the red).  A red zone of the contour has no letters; a red arrow of the axis triad or of a load has no holes.
    -> {'bbox': (x0, y0, x1, y1) px of `img`, 'tip': (x, y), 'score': float} or None."""
    full = img.convert("RGB")
    k = 1.0
    if max(full.size) > 900:
        k = 900.0 / max(full.size)
        full = full.resize((max(1, round(full.width * k)), max(1, round(full.height * k))), Image.BILINEAR)
    a = np.asarray(full).astype(np.int16)
    H, W = a.shape[:2]
    red = (a[..., 0] > 170) & (a[..., 1] < 95) & (a[..., 2] < 95)
    if int(red.sum()) < 30:
        return None
    light = (a.min(axis=2) > 125) & (a[..., 0] > 190)
    best = None
    for area, x0, y0, x1, y1, spans in _components(red):
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        if area < 40 or bw < 14 or bh < 7 or bw / bh < 1.4 or bw / bh > 5.0:
            continue
        span_area = holes = 0
        for y, (s, e) in spans.items():
            seg = light[y, s:e + 1]
            span_area += e - s + 1
            holes += int(seg.sum())
        if span_area == 0:
            continue
        hf, fill = holes / span_area, span_area / float(bw * bh)
        if hf < 0.04 or hf > 0.5 or fill < 0.45:
            continue
        if skip_legend and x0 < 0.27 * W and y0 < 0.62 * H and bw / bh < 2.0:
            continue
        score = hf * 3 + fill
        if best is None or score > best[0]:
            best = (score, x0, y0, x1, y1)
    if best is None:
        return None
    _s, x0, y0, x1, y1 = best
    inv = 1.0 / k
    return {"bbox": (x0 * inv, y0 * inv, (x1 + 1) * inv, (y1 + 1) * inv), "tip": ((x1 + 1) * inv, (y0 + y1 + 1) / 2 * inv), "score": round(best[0], 3)}


# ═════════════════════════════════════════════ where is there room? ═════════════════════════════════════════════
def content_mask(img: Image.Image, cell_px: int = 6, margin_cells: int = 1):
    """-> (bool array [rows, cols] True where the picture is DRAWN, cell size in px of `img`).  Empty background (white or a faint
    gradient) is False.  `margin_cells` grows the drawn area so that a smaller picture never touches the model."""
    rgb = img.convert("RGB")
    W, H = rgb.size
    gw, gh = max(1, int(np.ceil(W / cell_px))), max(1, int(np.ceil(H / cell_px)))
    a = np.asarray(rgb.resize((gw * 3, gh * 3), Image.BOX)).astype(np.int16)       # 3 x 3 samples per cell
    ring = np.concatenate([a[:2].reshape(-1, 3), a[-2:].reshape(-1, 3), a[:, :2].reshape(-1, 3), a[:, -2:].reshape(-1, 3)])
    bg = np.median(ring, axis=0)
    diff = np.abs(a - bg).max(axis=2)
    drawn = diff > 16
    cells = drawn.reshape(gh, 3, gw, 3).any(axis=(1, 3))
    if margin_cells > 0:
        p = np.pad(cells, margin_cells)
        out = np.zeros_like(cells)
        for dy in range(-margin_cells, margin_cells + 1):
            for dx in range(-margin_cells, margin_cells + 1):
                out |= p[margin_cells + dy: margin_cells + dy + gh, margin_cells + dx: margin_cells + dx + gw]
        cells = out
    return cells, cell_px


def _grow(mask: np.ndarray, n: int) -> np.ndarray:
    """mask dilated by n cells (square)"""
    if n <= 0:
        return mask
    h, w = mask.shape
    p = np.pad(mask, n)
    out = np.zeros_like(mask)
    for dy in range(-n, n + 1):
        for dx in range(-n, n + 1):
            out |= p[n + dy:n + dy + h, n + dx:n + dx + w]
    return out


def _integral(occ: np.ndarray) -> np.ndarray:
    s = np.zeros((occ.shape[0] + 1, occ.shape[1] + 1), dtype=np.int32)
    s[1:, 1:] = occ.astype(np.int32).cumsum(axis=0).cumsum(axis=1)
    return s


def _free_positions(ii: np.ndarray, w: int, h: int) -> np.ndarray:
    """bool array [rows - h + 1, cols - w + 1]: True where a w x h block holds no occupied cell"""
    R, C = ii.shape[0] - 1, ii.shape[1] - 1
    if w > C or h > R or w < 1 or h < 1:
        return np.zeros((0, 0), dtype=bool)
    tot = ii[h:, w:] - ii[:-h, w:] - ii[h:, :-w] + ii[:-h, :-w]
    return tot == 0


def plan_panel(area, main_px, main_mask, main_cell_px, tiles, tri_left, cell=6.0, target=None, min_w=120.0, max_frac=0.44):
    """Where does the full view go and where do the smaller pictures (tiles) fit ON THE SAME SLIDE?

    area      (x0, y0, x1, y1) in points that may be used
    main_px   (w, h) of the full-view picture;  main_mask / main_cell_px: content_mask() of it
    tiles     [{'w': px, 'h': px, 'label_h': pt}]  the smaller pictures, in order of importance
    tri_left  callable(y_pt) -> x of the left edge of the corner triangle at that height (1e9 when none)
    target    (fx, fy): where the red 'Max' flag is on the full view (fractions) - tiles close to it come first
    -> {'strategy': 'overlay' | 'strip', 'main': (x, y, w, h), 'tiles': [(x, y, w, h_picture, label_h)]} or None

    overlay: the full view stays big and the pictures sit in its own empty background / the empty slide around it.
    strip  : (fallback) the full view shrinks and the pictures sit in a row below it."""
    ax0, ay0, ax1, ay1 = area
    aw, ah = ax1 - ax0, ay1 - ay0
    gw, gh = int(aw // cell), int(ah // cell)
    if gw < 8 or gh < 8 or not tiles:
        return None
    base = np.zeros((gh, gw), dtype=bool)
    for r in range(gh):                                              # the corner triangle
        edge = tri_left(ay0 + (r + 1) * cell)
        if edge < ax1:
            c0 = int(max(0, (edge - 8.0 - ax0) // cell))
            base[r, c0:] = True
    s_max = min(aw / main_px[0], ah / main_px[1])
    best = None
    anchors = ("tl", "tr", "bl", "br", "tc", "bc")
    for rel in (1.0, 0.92, 0.84, 0.76, 0.68, 0.6):
        mw_, mh_ = main_px[0] * s_max * rel, main_px[1] * s_max * rel
        for anc in anchors:
            mx = ax0 + {"l": 0.0, "r": aw - mw_, "c": (aw - mw_) / 2}[{"tl": "l", "bl": "l", "tr": "r", "br": "r", "tc": "c", "bc": "c"}[anc]]
            my = ay0 + (0.0 if anc in ("tl", "tr", "tc") else ah - mh_)
            if mx + mw_ > tri_left(my + mh_) - 6.0:
                continue
            occ = base.copy()
            # the drawn parts of the full view block their cells (plus one cell of air); its empty background stays free
            nw, nh = max(1, int(np.ceil(mw_ / cell))), max(1, int(np.ceil(mh_ / cell)))
            small = np.asarray(Image.fromarray(main_mask.astype(np.uint8) * 255).resize((nw, nh), Image.BOX)) > 0
            small = _grow(small, 1)
            gx0, gy0 = int(round((mx - ax0) / cell)), int(round((my - ay0) / cell))
            r0, c0, r1, c1 = max(0, gy0), max(0, gx0), min(gh, gy0 + nh), min(gw, gx0 + nw)
            if r1 > r0 and c1 > c0:
                occ[r0:r1, c0:c1] |= small[r0 - gy0:r1 - gy0, c0 - gx0:c1 - gx0]
            # a picture needs a slide that is not covered by the full view's own box either when it sticks out of the box:
            # that is allowed (free slide around the box)
            placed, ok, widths = [], True, []
            order = list(range(len(tiles)))
            for ti in order:
                t = tiles[ti]
                asp = t["w"] / float(t["h"])
                got = None
                for wpt in np.arange(min(aw * max_frac, 330.0), min_w - 1, -6.0):
                    wc = int(np.ceil(wpt / cell))
                    hpt = wpt / asp + t.get("label_h", 0.0)
                    hc = int(np.ceil(hpt / cell))
                    ok_pos = _free_positions(_integral(occ), wc, hc)
                    if ok_pos.size and ok_pos.any():
                        rr, cc = np.nonzero(ok_pos)
                        if target is not None:                         # nearest to the Max flag first
                            tx, ty = mx + target[0] * mw_, my + target[1] * mh_
                            cx = ax0 + (cc + wc / 2.0) * cell
                            cy = ay0 + (rr + hc / 2.0) * cell
                            pick = int(np.argmin((cx - tx) ** 2 + (cy - ty) ** 2))
                        else:                                          # corner preference: top-right, bottom-right, top-left, bottom-left
                            cxs, cys = (cc + wc / 2.0) / gw, (rr + hc / 2.0) / gh
                            pick = int(np.argmin(np.minimum(np.hypot(cxs - 1, cys - 0), np.hypot(cxs - 1, cys - 1)) * 1.0 +
                                                 0.3 * np.minimum(np.hypot(cxs - 0, cys - 0), np.hypot(cxs - 0, cys - 1))))
                        got = (ax0 + cc[pick] * cell, ay0 + rr[pick] * cell, wpt, wpt / asp, t.get("label_h", 0.0))
                        r_a, c_a = int(rr[pick]), int(cc[pick])
                        occ[max(0, r_a - 1):r_a + hc + 1, max(0, c_a - 1):c_a + wc + 1] = True       # one cell of air around every picture
                        break
                if got is None:
                    ok = False
                    break
                placed.append(got)
                widths.append(got[2])
            if not ok:
                continue
            score = rel * 100.0 + min(widths) / aw * 100.0 * 0.8 + sum(widths) / (aw * len(widths)) * 10.0
            if best is None or score > best[0]:
                best = (score, "overlay", (mx, my, mw_, mh_), placed)
        if best is not None and rel <= 1.0 and best[0] >= 100.0 + 8.0:      # the full view is at its biggest and the pictures fit nicely
            break
    if best is not None:
        return {"strategy": best[1], "main": best[2], "tiles": best[3], "score": round(best[0], 1)}
    # ---- fallback: the full view above, the pictures in a row below it
    n = len(tiles)
    gap = 10.0
    for strip_frac in (0.34, 0.40, 0.46):
        sh = ah * strip_frac
        mh_avail = ah - sh - gap
        s = min(aw / main_px[0], mh_avail / main_px[1])
        mw_, mh_ = main_px[0] * s, main_px[1] * s
        # pictures: equal height, as wide as the row allows
        h_pic = sh - max(t.get("label_h", 0.0) for t in tiles)
        asp = [t["w"] / float(t["h"]) for t in tiles]
        wsum = sum(a_ * h_pic for a_ in asp) + gap * (n - 1)
        if wsum > aw:
            h_pic *= (aw - gap * (n - 1)) / (wsum - gap * (n - 1))
            wsum = aw
        if min(a_ * h_pic for a_ in asp) < 80.0:
            continue
        x = ax0 + (aw - wsum) / 2.0
        y_row = ay0 + mh_ + gap
        out = []
        for t, a_ in zip(tiles, asp):
            out.append((x, y_row, a_ * h_pic, h_pic, t.get("label_h", 0.0)))
            x += a_ * h_pic + gap
        return {"strategy": "strip", "main": (ax0 + (aw - mw_) / 2.0, ay0, mw_, mh_), "tiles": out, "score": 0.0}
    return None
