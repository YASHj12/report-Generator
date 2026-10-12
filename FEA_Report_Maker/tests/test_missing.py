#!/usr/bin/env python3
"""
Nothing may ever block a report.  Developer test (not shipped):   python tests/test_missing.py [--quick]

A. missing-picture sweep   every single picture dropped, every group of pictures dropped, every set of only 1 or 2 pictures kept
                           -> analyse -> build (both policies) -> draw every slide.            Always: HTTP 200, a drawable deck.
B. random damage           hundreds of randomly broken payloads (pictures removed, garbage numbers, blank yield, empty lists,
                           control characters, absurd lengths, nonsense layout names ...)       Always: HTTP 200, a drawable deck.
"""
import copy
import io
import itertools
import random
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "engine"))
import analyzer                                   # noqa: E402
import server                                     # noqa: E402
from PIL import Image                             # noqa: E402

QUICK = "--quick" in sys.argv
ONLY_B = "--only-b" in sys.argv
EX = ROOT / "examples"
c = server.app.test_client()
fails, builds = [], 0
SRC = sorted(EX.glob("*.png"))
NAMES = [p.name for p in SRC]


def check(name, cond, info=""):
    print((("  ok   " if cond else "  FAIL ") + name + (f"   [{info}]" if info and not cond else "")))
    if not cond:
        fails.append(name)


print("reading the 9 example pictures once (the reading of one picture does not depend on the others) ...")
BASE = [analyzer.analyze_one(p, k, p.name) for k, p in enumerate(SRC)]
ROLE = {i["name"]: (i["role"], i["case"] if "case" in i else None) for i in BASE}


def make_session(keep):
    sid, folder = server._new_session()
    infos = []
    for new_id, k in enumerate(keep):
        i = copy.deepcopy(BASE[k]); i["id"] = new_id
        dest = folder / f"{new_id:02d}_{NAMES[k]}"
        shutil.copyfile(SRC[k], dest); i["path"] = str(dest)
        infos.append(i)
    draft = analyzer.finish(infos, server.SETTINGS)
    server.save_infos(sid, infos)
    return sid, infos, draft


def payload_for(sid, infos, draft, **over):
    cover = analyzer.guess_cover(infos, server.SETTINGS)
    cases = [{"n": k["n"], "name": k["name"], "subtitle": k["subtitle"], "short_name": k["short_name"], "bc_id": k["bc_id"],
              "def_id": k["def_id"], "stress_id": k["stress_id"], "bc_items": [t.replace("[location - please confirm]", "the shaft") for t in k["bc_items"]],
              "notes": [], "extras": [{"id": e["id"], "kind": e["kind"], "heading": e["heading"]} for e in k["extras"]],
              "def_max": k["def_max"], "stress_max": k["stress_max"]} for k in draft["cases"]]
    p = {"sid": sid, "cover": cover, "short": cover["short"] or "Blade", "fos": 1.3, "yield": 380, "allowable": 292, "show_utilisation": False,
         "material": {"rows": [["IS 2062", "Duct", "191400", "0.3", "7.8E-9", "380", "292"]], "units": server.SETTINGS["units"]},
         "geometry": [dict(g, caption="") for g in draft["geometry"]], "meshes": [dict(g, caption="") for g in draft["meshes"]], "cases": cases}
    p.update(over)
    return p


def build_and_draw(p, label, width=420):
    """-> (titles, notes).  Records a failure (with the label) instead of raising."""
    global builds
    builds += 1
    try:
        r = c.post("/api/build", json=p)
        if r.status_code != 200:
            fails.append(f"{label}: HTTP {r.status_code} {r.get_data(as_text=True)[:200]}")
            print(f"  FAIL {label}: HTTP {r.status_code} {r.get_data(as_text=True)[:160]}")
            return None, None
        m = r.get_json()
        if len(m["slides"]) < 2:
            fails.append(f"{label}: fewer than 2 slides"); print(f"  FAIL {label}: only {len(m['slides'])} slides"); return None, None
        for n in range(len(m["slides"])):
            s = c.get(f"/api/slide/{p['sid']}/{m['key']}/{n}?w={width}")
            ok = s.status_code == 200
            if ok:
                im = Image.open(io.BytesIO(s.data)).convert("L")
                ok = im.size[0] == width and im.getextrema()[0] < 200            # not a blank page
            if not ok:
                fails.append(f"{label}: slide {n + 1} could not be drawn"); print(f"  FAIL {label}: slide {n + 1} not drawn ({s.status_code})"); return None, None
        return [x["title"] for x in m["slides"]], m["notes"]
    except Exception as e:                                                     # noqa: BLE001
        import traceback; traceback.print_exc()
        fails.append(f"{label}: EXCEPTION {type(e).__name__}: {e}"); print(f"  FAIL {label}: exception {type(e).__name__}: {e}")
        return None, None


# ───────────────────────────────────────────── A. sweep
print("\nA. missing-picture sweep")
ALL = list(range(9))
names_of = lambda ks: [NAMES[k] for k in ks]
subsets = {"nothing dropped": ALL}
for k in ALL:
    subsets[f"without {NAMES[k]}"] = [x for x in ALL if x != k]
roles = {n: BASE[k]["role"] for k, n in enumerate(NAMES)}
groups = {"case 1 pictures": ("image-1.png", "image-2.png", "image-3.png"), "case 2 pictures": ("image-4.png", "image-5.png", "image-6.png"),
          "geometry views": ("image-7.png", "image-8.png"), "mesh": ("image-9.png",), "geometry + mesh": ("image-7.png", "image-8.png", "image-9.png"),
          "all result plots": ("image-1.png", "image-3.png", "image-4.png", "image-6.png"), "all setup pictures": ("image-2.png", "image-5.png"),
          "all deformation plots": ("image-1.png", "image-4.png"), "all stress plots": ("image-3.png", "image-6.png"),
          "every case-2 picture + the mesh": ("image-4.png", "image-5.png", "image-6.png", "image-9.png")}
for gname, ns in groups.items():
    subsets[f"without {gname}"] = [k for k in ALL if NAMES[k] not in ns]
for k in ALL:
    subsets[f"only {NAMES[k]}"] = [k]
pairs = list(itertools.combinations(ALL, 2))
if QUICK:
    pairs = random.Random(1).sample(pairs, 8)
for a_, b_ in pairs:
    subsets[f"only {NAMES[a_]} + {NAMES[b_]}"] = [a_, b_]

t0 = time.time()
ref_titles = None
if ONLY_B:
    subsets = {}
for label, keep in subsets.items():
    sid, infos, draft = make_session(keep)
    res = {}
    for policy in ("skip", "frame"):
        p = payload_for(sid, infos, draft, missing=policy)
        titles, notes = build_and_draw(p, f"{label} [{policy}]")
        res[policy] = titles
        if titles is None:
            break
    if res.get("skip") and res.get("frame"):
        if len(res["frame"]) < len(res["skip"]):
            fails.append(f"{label}: 'frame' gave fewer slides than 'skip'"); print(f"  FAIL {label}: frame < skip")
    if label == "nothing dropped":
        ref_titles = res["skip"]
        check("reference: the complete set gives the 11-slide report", ref_titles and len(ref_titles) == 11, ref_titles)
    if label.startswith("without image-7.png") and res.get("skip"):
        pass
print(f"  {len(subsets)} picture sets x 2 policies swept in {time.time() - t0:.0f} s, {builds} reports built and drawn")
check("A: not a single picture set blocked the report", not [f for f in fails if "[" in f and "HTTP" in f or "EXCEPTION" in f or "not drawn" in f or "could not be drawn" in f])

# a few meaning checks on the sweep
if ONLY_B:
    pass
else:
  sid, infos, draft = make_session([k for k in ALL if NAMES[k] not in ("image-7.png", "image-8.png")])
  t, n = build_and_draw(payload_for(sid, infos, draft), "no geometry")
  check("no geometry pictures: no geometry slide, mesh becomes section 2", t and not any("Geometry" in x for x in t) and any(x.startswith("2.") and "Mesh" in x for x in t), t)
  sid, infos, draft = make_session([k for k in ALL if NAMES[k] not in ("image-4.png", "image-5.png", "image-6.png")])
  t, n = build_and_draw(payload_for(sid, infos, draft), "no case 2")
  check("a whole load case missing: the other case and the summary stay", t and any("Observation" in x for x in t) and t[-1] == "Final Summary" and len(t) == 8, t)
  sid, infos, draft = make_session([k for k in ALL if NAMES[k] != "image-3.png"])
  t, n = build_and_draw(payload_for(sid, infos, draft), "no stress plot")
  check("one missing result plot: the other fills the slide", t and any("Total Deformation" in x for x in t), t)

# ───────────────────────────────────────────── B. random damage
print("\nB. random damage")
sid, infos, draft = make_session(ALL)
base = payload_for(sid, infos, draft)
rng = random.Random(20261001)
GARBAGE_NUM = ["abc", "", None, "-5", "0", "1e999", "nan", "inf", "1,5", " 12 ", "1e-9", "٣", "0.0", "99999999999999999999"]
WEIRD_TEXT = ["", " ", "x" * 400, "Ω≈—“quotes” and ’ apostrophes", "line1\nline2", "tab\there", "ctrl\x00\x01\x0c char", "<b>html</b> & stuff", "[value - please confirm]",
              "日本語のテキスト", "😀 emoji"]
LAYOUTS = ["auto", "side", "stack", "separate", "nonsense", "", None, 5]


def damage(p, r):
    p = copy.deepcopy(p)
    for key in ("geometry", "meshes"):
        p[key] = [g for g in p[key] if r.random() > 0.3]
        for g in p[key]:
            if r.random() < 0.15: g["heading"] = r.choice(WEIRD_TEXT)
            if r.random() < 0.15: g["caption"] = r.choice(WEIRD_TEXT)
    for cs in p["cases"]:
        for k in ("bc_id", "def_id", "stress_id"):
            if r.random() < 0.25: cs[k] = r.choice([None, 999, "x", -1])
        for k in ("def_max", "stress_max"):
            if r.random() < 0.2: cs[k] = r.choice(GARBAGE_NUM)
        if r.random() < 0.2: cs["bc_items"] = []
        elif r.random() < 0.2: cs["bc_items"] = [r.choice(WEIRD_TEXT) for _ in range(r.randint(1, 16))]
        if r.random() < 0.2: cs["notes"] = [r.choice(WEIRD_TEXT) for _ in range(r.randint(1, 5))]
        for k in ("name", "short_name", "subtitle"):
            if r.random() < 0.2: cs[k] = r.choice(WEIRD_TEXT)
        if r.random() < 0.15: cs["extras"] = [{"id": r.choice([0, 1, 5, 999]), "kind": r.choice(["bc", "stress", "deformation", "other", "bogus"]), "heading": r.choice(WEIRD_TEXT)}]
        if r.random() < 0.15: cs["texts"] = {"observations": [r.choice(WEIRD_TEXT) for _ in range(r.randint(0, 5))], "stress_caption": r.choice(WEIRD_TEXT), "conclusion": r.choice(WEIRD_TEXT)}
        if r.random() < 0.1: cs["basis"] = r.choice(["asis", "singularity", "refine", "bogus"])
        if r.random() < 0.1: cs["sing_loc"], cs["stress_away"] = r.choice(WEIRD_TEXT), r.choice(GARBAGE_NUM)
        if r.random() < 0.1: cs["loc_stress"], cs["loc_def"] = r.choice(WEIRD_TEXT), r.choice(WEIRD_TEXT)
        if r.random() < 0.1: cs["react_applied"], cs["react_sum"] = r.choice(GARBAGE_NUM), r.choice(GARBAGE_NUM)
        if r.random() < 0.1: cs["layout"], cs["bc_layout"] = r.choice(LAYOUTS), r.choice(LAYOUTS)
    if r.random() < 0.1:                                                                      # many load cases
        extra = []
        for n in range(len(p["cases"]) + 1, len(p["cases"]) + r.randint(2, 10)):
            cs = copy.deepcopy(r.choice(p["cases"])); cs["n"] = n; cs["name"] = f"Load case number {n}"; extra.append(cs)
        p["cases"] += extra
    for cs in p["cases"]:
        if r.random() < 0.08:
            cs["def_max"], cs["stress_max"] = r.choice(["1e308", "1e-300", "0.0000001", "123456789"]), r.choice(["1e308", "1e-300", "0.0001", "9999999999"])
        if r.random() < 0.05: cs["bc_items"] = ["Fixed support applied on the shaft."] * 40
        if r.random() < 0.05: cs["notes"] = [r.choice(WEIRD_TEXT) for _ in range(30)]
    if r.random() < 0.05: p["cover"]["title"] = "T" * 1200
    if r.random() < 0.1: p["cases"] = []
    elif r.random() < 0.05: p["cases"] = p["cases"] + [copy.deepcopy(p["cases"][0])]          # the same case number twice
    if r.random() < 0.3: p["yield"], p["allowable"] = r.choice(GARBAGE_NUM), r.choice(GARBAGE_NUM)
    if r.random() < 0.2: p["fos"] = r.choice(GARBAGE_NUM)
    if r.random() < 0.15: p["def_limit"] = r.choice(GARBAGE_NUM)
    if r.random() < 0.2: p["short"] = r.choice(WEIRD_TEXT)
    if r.random() < 0.25:
        p["material"] = {"rows": r.choice([[], [["x"]], [[None] * 7], [["a", "b", "c", "d", "e", "f", "g", "h", "i"]], [[r.choice(WEIRD_TEXT) for _ in range(7)]]]), "units": r.choice(WEIRD_TEXT)}
    for k in ("title", "report_no", "date", "client", "revision", "prepared_by", "checked_by", "ref"):
        if r.random() < 0.15: p["cover"][k] = r.choice(WEIRD_TEXT)
    if r.random() < 0.15: p["cover"] = r.choice([{}, None])
    if r.random() < 0.2: p["assumptions"] = [r.choice(WEIRD_TEXT) for _ in range(r.randint(0, 40))]
    if r.random() < 0.2: p["mesh_stats"] = {k: r.choice(GARBAGE_NUM + ["SOLID187", "654321"]) for k in ("type", "elements", "nodes", "size", "skew_avg", "skew_max", "oq_min")}
    if r.random() < 0.2: p["layouts"] = {k: r.choice(LAYOUTS) for k in ("results", "geometry", "bc", "extras")}
    if r.random() < 0.5: p["missing"] = r.choice(["skip", "frame", "bogus", None])
    return p


N = 25 if QUICK else 500
t0 = time.time(); bad_before = len(fails)
for it in range(N):
    p = damage(base, rng)
    build_and_draw(p, f"random damage #{it}")
check(f"B: {N} randomly damaged payloads - every one built and every slide drawn", len(fails) == bad_before, [f for f in fails[bad_before:]][:3])
print(f"  {N} damaged payloads in {time.time() - t0:.0f} s")

# the same damage through the older /api/generate (HTTP 200 as well)
r = c.post("/api/generate", json={**damage(base, random.Random(7)), "make_pdf": False})
check("the older /api/generate survives damage too", r.status_code == 200, r.get_data(as_text=True)[:200])
for f in server.OUT.glob("FEA_Report_*"):
    f.unlink(missing_ok=True)

print()
print(f"ALL MISSING-CONTENT TESTS PASSED ({builds} reports built and drawn)" if not fails else f"{len(fails)} FAILED:\n  " + "\n  ".join(fails[:25]))
sys.exit(1 if fails else 0)
