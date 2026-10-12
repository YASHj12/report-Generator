#!/usr/bin/env python3
"""
The program's own slide renderer (engine/pptx_preview.py).  Developer test (not shipped):   python tests/test_preview.py

 1. it draws every kind of slide the engine writes, without skipping anything, deterministically and from several threads at once
 2. when LibreOffice and pymupdf are installed: the position of every text line (x and baseline) and the pixels are compared with
    LibreOffice's own rendering of the same file.  Measured when this was written: x within 0.4 pt, baseline within 0.1 pt (tables 1.6 pt,
    a LibreOffice quirk), mean pixel difference about 1.5 / 255.
"""
import io
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "engine"))
import mw_report as mw                            # noqa: E402
import pptx_preview as pv                         # noqa: E402
import server                                     # noqa: E402
from PIL import Image, ImageChops                 # noqa: E402

EX = ROOT / "examples"
fails = []
TMP = Path(tempfile.mkdtemp(prefix="fea_pv_"))


def check(name, cond, info=""):
    print((("  ok   " if cond else "  FAIL ") + name + (f"   [{info}]" if info and not cond else "")))
    if not cond:
        fails.append(name)


# ───────────────────────────────────────── decks (no OCR needed: the roles of the 9 example pictures are known)
INFOS = [{"id": k, "path": str(EX / f"image-{k + 1}.png")} for k in range(9)]
COVER = {"title": "Static Structural Analysis Of MLD Blade", "report_no": "MWI/FEA/ACK-6203/01", "date": "1st Oct 2026", "client": "KCP"}
MAT = {"rows": [["IS 2062", "Duct", "191400", "0.3", "7.8E-9", "380", "292"]], "units": server.SETTINGS["units"]}


def payload(**over):
    cases = [{"n": 1, "name": "Pressure Only", "subtitle": "(Self Weight + Pressure)", "short_name": "Pressure Only", "bc_id": 1, "def_id": 0, "stress_id": 2,
              "bc_items": ["Design pressure 1000 mmWC applied which is 0.00981 MPa.", "Self weight considered.", "Fixed support applied on the left shaft.",
                           "Fixed support applied on the right shaft."], "notes": ["This load case is at the working temperature of 210 \u00b0C.", "Welds are not modelled."],
              "extras": [], "def_max": 0.085, "stress_max": 74.2},
             {"n": 2, "name": "Pressure + Moment", "subtitle": "(Self Weight + Pressure + Moment)", "short_name": "Pressure + Moment", "bc_id": 4, "def_id": 3, "stress_id": 5,
              "bc_items": ["Cylindrical support applied on the left shaft.", "Design pressure 1000 mmWC applied which is 0.00981 MPa.", "Self weight considered.",
                           "Moment of 1,000,000 N\u00b7mm (1000 N\u00b7m) applied at the shaft."], "notes": [], "extras": [], "def_max": 2.42, "stress_max": 545}]
    p = {"sid": "x", "cover": COVER, "short": "Blade", "fos": 1.3, "yield": 380, "allowable": 292, "show_utilisation": False, "material": MAT,
         "geometry": [{"id": 6, "heading": "Top view"}, {"id": 7, "heading": "Bottom view"}], "meshes": [{"id": 8, "heading": "Overall mesh"}], "cases": cases,
         "assumptions": ["Linear elastic, isotropic material behaviour (no plasticity).", "Static loading: inertia and dynamic effects are neglected."],
         "mesh_stats": {"type": "SOLID187", "elements": "654321", "nodes": "1234567"}}
    p.update(over)
    return p


def make(name, **over):
    out = TMP / f"{name}.pptx"
    cfg = server.build_cfg(payload(**over), INFOS, out)
    mw.build_report(cfg)
    return out


decks = {"complete": make("complete"),
         "frames": make("frames", missing="frame", geometry=[], meshes=[]),
         "text_only_setup": make("text_only", cases=[dict(payload()["cases"][0], bc_id=None, def_id=None), payload()["cases"][1]]),
         "no_yield": make("no_yield", yield_=None, allowable=None)}
many = [dict(payload()["cases"][k % 2], n=k + 1, name=f"Load case number {k + 1} with a fairly long name", short_name=f"Case {k + 1}") for k in range(9)]
many[0]["bc_items"] = ["A long sentence that describes a boundary condition in more words than fit on one line of the setup slide, so that it wraps. " * 2] * 8
decks["many_cases"] = make("many", cases=many)

# ───────────────────────────────────────── 1. drawing
print("1. every slide of every kind of deck is drawn")
for name, f in decks.items():
    d = pv.Deck(f)
    ims = [d.render(i, 640) for i in range(d.count())]
    check(f"{name}: {d.count()} slides drawn, nothing skipped", not d.unsupported and all(im.size == (640, 360) for im in ims), d.unsupported)
    check(f"{name}: no slide is blank", all(im.convert("L").getextrema()[0] < 200 for im in ims))
d = pv.Deck(decks["complete"])
a, b = d.render(5, 800), pv.Deck(decks["complete"]).render(5, 800)
check("drawing is deterministic (same file -> same pixels)", ImageChops.difference(a, b).getbbox() is None)
res = [None] * 4


def worker(k):
    res[k] = d.render(5, 800).tobytes()


ths = [threading.Thread(target=worker, args=(k,)) for k in range(4)]
[t.start() for t in ths]; [t.join() for t in ths]
check("four threads drawing the same deck at once give the same picture", len(set(res)) == 1 and res[0] == a.tobytes())
check("titles are read from the file", d.title(0).startswith("Static Structural") and d.title(1) == "1. Material Properties")
check("a 1920 px render works (no supersampling above 1800 px)", pv.Deck(decks["complete"]).render(0, 1920).size == (1920, 1080))
pdf = TMP / "fallback.pdf"
pv.images_to_pdf(d, pdf)
check("picture-based PDF fallback: a file with one page per slide", pdf.exists() and pdf.stat().st_size > 20000)
try:
    import pymupdf
    doc = pymupdf.open(str(pdf))
    check("... pages are 960 x 540 pt", len(doc) == d.count() and abs(doc[0].rect.width - 960) < 1 and abs(doc[0].rect.height - 540) < 1, (len(doc), doc[0].rect))
except ImportError:
    pymupdf = None
    print("  (pymupdf not installed: the PDF page check and the LibreOffice comparison are skipped)")

# text of the complete deck stays inside the slide
inside = all(-1 <= x <= 961 and -1 <= y <= 541 for x, y, *_ in d.text_lines(5)) and all(-1 <= x <= 961 and -1 <= y <= 541 for i in range(d.count()) for x, y, *_ in d.text_lines(i))
check("every text line of the complete report lies inside the slide", inside)

# ───────────────────────────────────────── 2. against LibreOffice
print("2. against LibreOffice's own rendering")
soffice = shutil.which("soffice") or shutil.which("libreoffice")
if not (soffice and pymupdf):
    print("  (LibreOffice or pymupdf missing - comparison skipped)")
else:
    norm = lambda t: re.sub(r"\s+", "", t.replace("\u00a0", " "))

    def lo_lines(page):
        out = []
        for blk in page.get_text("dict")["blocks"]:
            for ln in blk.get("lines", []):
                sp = [s for s in ln["spans"] if s["text"].strip()]
                if sp:
                    out.append(dict(text=norm("".join(s["text"] for s in ln["spans"])), x=sp[0]["origin"][0], y=sp[0]["origin"][1]))
        return out

    def my_lines(deck, i):
        groups = {}
        for x, base, text, size, bold, lab in deck.text_lines(i):
            groups.setdefault(round(base, 1), []).append((x, text, size, lab))
        out = []
        for base, items in groups.items():
            items.sort(); cur = [items[0]]; chunks = []
            for it in items[1:]:
                prev = cur[-1]
                if it[0] - (prev[0] + pv.text_w(prev[1], prev[2])) < prev[2] * 1.5:
                    cur.append(it)
                else:
                    chunks.append(cur); cur = [it]
            chunks.append(cur)
            for ch in chunks:
                m = dict(text=norm("".join(c[1] for c in ch)), x=ch[0][0], y=base)
                alts = [[m]]
                if ch[0][3] and len(ch) > 1:
                    alts.append([dict(text=norm(ch[0][1]), x=ch[0][0], y=base), dict(text=norm("".join(c[1] for c in ch[1:])), x=ch[1][0], y=base)])
                out.append(alts)
        return out

    for name in ("complete", "frames", "text_only_setup", "many_cases"):
        f = decks[name]
        outdir = TMP / ("lo_" + name); outdir.mkdir()
        subprocess.run([soffice, "-env:UserInstallation=file:///tmp/lo_profile_pvtest", "--headless", "--convert-to", "pdf", "--outdir", str(outdir), str(f)],
                       capture_output=True, timeout=300)
        doc = pymupdf.open(str(outdir / (f.stem + ".pdf")))
        dk = pv.Deck(f)
        dxs, dys, matched, total, diffs, unmatched = [], [], 0, 0, [], []
        for i in range(dk.count()):
            lo, me, used = lo_lines(doc[i]), my_lines(dk, i), set()
            for alts in me:
                if alts[0][0]["y"] > 541:                    # text that lies below the slide (an absurdly long list): LibreOffice does not output it either
                    continue
                total += 1
                for alt in alts:
                    ks = []
                    for m in alt:
                        cand = [(abs(l["x"] - m["x"]) + abs(l["y"] - m["y"]), k) for k, l in enumerate(lo) if k not in used and l["text"] == m["text"]]
                        ks.append(min(cand)[1] if cand else None)
                    if all(k is not None for k in ks) and len(set(ks)) == len(ks):
                        for m, k in zip(alt, ks):
                            used.add(k); dxs.append(m["x"] - lo[k]["x"]); dys.append(m["y"] - lo[k]["y"])
                        matched += 1
                        break
                else:                                       # LibreOffice may report a text box and a neighbouring list label as ONE line ("Note:1.")
                    m = alts[0][0]
                    cand = [(abs(l["x"] - m["x"]) + abs(l["y"] - m["y"]), k) for k, l in enumerate(lo) if k not in used and len(m["text"]) >= 3 and l["text"].startswith(m["text"])]
                    if cand:
                        k = min(cand)[1]; used.add(k); dxs.append(m["x"] - lo[k]["x"]); dys.append(m["y"] - lo[k]["y"]); matched += 1
                    else:
                        unmatched.append((i + 1, m["text"][:60], round(m["x"], 1), round(m["y"], 1)))
            pg = doc[i]; z = 960 / pg.rect.width
            pix = pg.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False)
            lo_im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            dd = ImageChops.difference(dk.render(i, 960), lo_im).convert("L")
            diffs.append(sum(i * n for i, n in enumerate(dd.histogram())) / (dd.width * dd.height))
        ratio = matched / max(1, total)
        if ratio < 0.93:
            from collections import Counter
            by_slide = Counter(u[0] for u in unmatched)
            print("     lines not found in LibreOffice's PDF, per slide:", {f"{k} ({dk.title(k - 1)[:28]})": v for k, v in sorted(by_slide.items())})
            print("     examples:", unmatched[:4])
        ax = sorted(abs(v) for v in dxs)
        check(f"{name}: {matched}/{total} text lines found in LibreOffice's PDF", ratio >= 0.93, f"{ratio:.2f}")
        check(f"{name}: x positions agree (95 % within 1.0 pt, max {max(ax):.2f})", ax[int(0.95 * len(ax))] <= 1.0 and ax[-1] <= 2.5, f"p95 {ax[int(0.95 * len(ax))]:.2f} max {ax[-1]:.2f}")
        check(f"{name}: baselines agree (median {statistics.median(dys):+.2f} pt, max {max(abs(v) for v in dys):.2f})", abs(statistics.median(dys)) <= 0.5 and max(abs(v) for v in dys) <= 2.2,
              f"median {statistics.median(dys):+.2f} max {max(abs(v) for v in dys):.2f}")
        check(f"{name}: pixels agree (mean difference {statistics.mean(diffs):.2f} / 255, worst slide {max(diffs):.2f})", statistics.mean(diffs) < 3.0 and max(diffs) < 6.0,
              f"{statistics.mean(diffs):.2f} / {max(diffs):.2f}")

shutil.rmtree(TMP, ignore_errors=True)
print()
print("ALL PREVIEW TESTS PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
