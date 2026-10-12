#!/usr/bin/env python3
"""
FEA-judgement tests - one block per attack the council made.   python tests/test_fea.py
(no browser, no running server needed)
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "engine"))
import server                                    # noqa: E402
from pptx import Presentation                    # noqa: E402

c = server.app.test_client()
fails = []


def check(name, cond, info=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"   [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


def derive(cases, **kw):
    body = {"allowable": 292, "yield": 380, "fos": 1.3, "short": "Blade", "show_utilisation": False, "cases": cases}
    body.update(kw)
    return c.post("/api/derive", json=body).get_json()


def case(n=1, d=0.085, s=74.2, **kw):
    return {"n": n, "def_max": d, "stress_max": s, "legend": [], "stress_unit": "MPa", "def_unit": "mm", **kw}


def levels(r):
    return [(x["level"], x["text"]) for x in r["checks"]]


print("A1  the verdict tiers (Dr. Anand: 38,825 MPa is a bug report, not a verdict)")
for s, tier in ((74.2, "pass"), (292, "pass"), (300, "exceeds"), (380, "exceeds"), (545, "beyond_yield"), (759, "beyond_yield"), (760, "suspect"), (38825, "suspect")):
    check(f"{s:g} MPa against allowable 292 / yield 380 -> {tier}", derive([case(s=s)])["cases"]["1"]["tier"] == tier)
r = derive([case(s=38825)])
check("a suspect peak demands a decision (needs_basis)", r["cases"]["1"]["needs_basis"] is True)
check("...and the check list says 'singularity' loudly", any(l == "bad" and "singularity" in t for l, t in levels(r)))
r = derive([case(s=545)])
check("beyond yield: a note is added to the observations", any("above the yield strength of 380" in o for o in r["cases"]["1"]["texts"]["observations"]))
check("beyond yield but below 2x yield: no decision demanded", r["cases"]["1"]["needs_basis"] is False)
r = derive([case(s=200)])
check("a passing case gets no yield note", not any("yield" in o for o in r["cases"]["1"]["texts"]["observations"]))

print("A1b the three ways to report a suspect peak")
r = derive([case(s=38825, basis="singularity", sing_loc="the roller support", stress_away=150)])["cases"]["1"]
obs = " | ".join(r["texts"]["observations"])
check("singularity: location + 'singularity' + value away from it", "roller support" in obs and "singularity" in obs and "150" in obs)
check("singularity, away value within limit -> adequate, no corrective action", "structurally adequate" in obs and r["texts"]["conclusion"] == "")
check("singularity: the stress caption says so", "singularity" in r["texts"]["stress_caption"] and "within" in r["texts"]["stress_caption"])
r = derive([case(s=38825, basis="singularity", sing_loc="the roller support", stress_away=400)])["cases"]["1"]
check("singularity but the away-stress still exceeds -> inadequate + corrective action", "inadequate" in r["texts"]["observations"][-1] and "corrective" in r["texts"]["conclusion"])
r = derive([case(s=38825, basis="singularity")])["cases"]["1"]
check("singularity without the numbers leaves visible [placeholders] (never invented)", "[value - please confirm]" in " ".join(r["texts"]["observations"]) and "[location - please confirm]" in " ".join(r["texts"]["observations"]))
r = derive([case(s=38825, basis="refine", sing_loc="the shaft")])["cases"]["1"]
check("refine: no conclusion drawn", "cannot be drawn" in r["texts"]["observations"][-1] and "refinement" in r["texts"]["conclusion"].lower() and "mesh-dependent" in " ".join(r["texts"]["observations"]))
r = derive([case(s=38825, basis="asis")])["cases"]["1"]
check("'report as it is' keeps the template sentence", "structurally inadequate" in r["texts"]["observations"][-1] and r["needs_basis"] is False)

print("A1c summary table follows the basis")
cs = [case(1, s=74.2), case(2, s=38825, basis="singularity", sing_loc="the support", stress_away=150), case(3, s=38825, basis="refine"), case(4, s=545)]
rows = {}
for cc in cs:
    cc.update(short_name=f"C{cc['n']}", name=f"C{cc['n']}")
ctx = server.make_ctx({"allowable": 292, "yield": 380, "fos": 1.3, "short": "Blade", "show_utilisation": False})
comps = [server.compose_case(x, ctx) for x in cs]
rows = server.summary_rows(cs, comps, ctx)["rows"]
check("summary cells: value | away-from-peak | under review | exceeding", [r[2] for r in rows] == ["74.2 MPa", "150 MPa (away from local peak)", "Under review", "Exceeding Limit"], [r[2] for r in rows])

print("A7  utilisation, deformation limit, locations, reaction check (all optional)")
r = derive([case(s=74.2)], show_utilisation=True)["cases"]["1"]
check("utilisation shown in the within-limit sentence", "(utilisation 25 %)" in r["texts"]["observations"][1], r["texts"]["observations"][1])
r = derive([case(s=20.0)], show_utilisation=True)["cases"]["1"]
check("small utilisation keeps one decimal", "(utilisation 6.8 %)" in r["texts"]["observations"][1], r["texts"]["observations"][1])
r = derive([case(d=2.42, s=74.2)], def_limit=2.0)["cases"]["1"]
check("deformation over its limit -> 'adequate in strength, but the deformation exceeds' + corrective action",
      "exceeding the allowable deformation limit of 2 mm" in r["texts"]["observations"][0] and "adequate in strength" in r["texts"]["observations"][-1] and "corrective" in r["texts"]["conclusion"])
check("...and the deformation shows in the checks as a failure", any(l == "bad" and "allowable deformation" in t for l, t in levels(derive([case(d=2.42, s=74.2)], def_limit=2.0))))
r = derive([case(d=1.5, s=74.2)], def_limit=2.0)["cases"]["1"]
check("deformation within its limit stays adequate", "within the allowable deformation limit of 2 mm" in r["texts"]["observations"][0] and r["texts"]["conclusion"] == "")
r = derive([case(loc_stress="the weld toe at the hub", loc_def="the free end of the shaft")])["cases"]["1"]
obs = r["texts"]["observations"]
check("locations become sentences", "The maximum deformation occurs at the free end of the shaft." in obs and "The maximum von-Mises stress occurs at the weld toe at the hub." in obs)
r = derive([case(react_applied=1000, react_sum=1010)])
check("reaction check within 2 % is OK", any(l == "ok" and "difference 1.0 %" in t for l, t in levels(r)))
r = derive([case(react_applied=1000, react_sum=1100)])
check("reaction check beyond 2 % warns", any(l == "warn" and "10.0 %" in t for l, t in levels(r)))
check("...and is written into the observations", any("Reaction force check" in o for o in r["cases"]["1"]["texts"]["observations"]))

print("A8  units and material sanity (Ravi: units are blunder number one)")
def mat(**m): return derive([case()], material={"E": "191400", "nu": "0.3", "rho": "7.8E-9", **m})
check("good steel in t/mm3: no complaint", not [t for l, t in levels(mat()) if "Density" in t or "modulus" in t or "Poisson" in t])
check("density 7850 -> kg/m3 warning", any("kg/m" in t for l, t in levels(mat(rho="7850"))))
check("density 7.85E-6 -> kg/mm3 warning", any("kg/mm" in t for l, t in levels(mat(rho="7.85E-6"))))
check("E = 200 -> GPa warning", any("GPa" in t for l, t in levels(mat(E="200"))))
check("Poisson 0.7 -> warning", any("Poisson" in t for l, t in levels(mat(nu="0.7"))))
check("FOS below 1 -> warning", any("below 1" in t for l, t in levels(derive([case()], fos=0.8))))
check("gravity 9.81 with mm/s2 -> warning", any("9806.65" in t for l, t in levels(derive([case(gravity={"value": 9.81, "unit": "mm/s\u00b2"})]))))
check("gravity 9806.6 mm/s2 -> fine", not any("gravity" in t.lower() for l, t in levels(derive([case(gravity={"value": 9806.6, "unit": "mm/s\u00b2"})]))))
check("legend unit psi -> warning", any("psi" in t for l, t in levels(derive([case(stress_unit="psi")]))))

print("A8b mesh statistics (limits from the current ANSYS Meshing Help)")
def mesh(**m): return levels(derive([case()], mesh_stats=m))
check("skewness 0.95 -> 'bad (sliver)' warning", any(l == "warn" and "sliver" in t for l, t in mesh(skew_max="0.95")))
check("skewness 0.8 -> 'poor' info", any(l == "info" and "poor" in t for l, t in mesh(skew_max="0.8")))
check("skewness 0.6 -> nothing", not [t for l, t in mesh(skew_max="0.6") if "skewness" in t.lower()])
check("orthogonal quality 0.05 -> warning", any(l == "warn" and "orthogonal" in t for l, t in mesh(oq_min="0.05")))
check("average skewness 0.6 -> info", any("Average skewness" in t for l, t in mesh(skew_avg="0.6")))
check("mesh line text", server.mesh_line({"type": "SOLID187", "elements": "654321", "nodes": "1234567", "size": "10", "skew_avg": "0.283", "oq_min": "0.45"})
      == "SOLID187  |  Elements: 654,321  |  Nodes: 1,234,567  |  Element size: 10 mm  |  Avg. skewness 0.28  |  Min. orthogonal quality 0.45")
check("no mesh data -> no line", server.mesh_line({}) is None)

print("A9  additional views cannot beat the main plot")
r = derive([case(extras=[{"id": 1, "kind": "stress", "heading": "Section A", "max": 80.0}])])
check("a section showing MORE than the model maximum is flagged", any(l == "warn" and "cannot exceed" in t for l, t in levels(r)))
r = derive([case(extras=[{"id": 1, "kind": "stress", "heading": "Section A", "max": 41.7}])])
check("a normal section is not flagged", not any("cannot exceed" in t for l, t in levels(r)))

print("A3  layout planning (Sana / Kabir: legends must be readable)")
ex = sorted((ROOT / "examples").glob("*.png"))
a = c.post("/api/analyze", data={"files": [(io.BytesIO(p.read_bytes()), p.name) for p in ex]}, content_type="multipart/form-data").get_json()
sid = a["sid"]; cs = a["cases"]
def planbody(**kw):
    body = {"sid": sid, "allowable": 292, "yield": 380, "fos": 1.3, "short": "Blade", "show_utilisation": False, "geometry": a["geometry"], "meshes": a["meshes"],
            "cases": [{"n": k["n"], "def_max": k["def_max"], "stress_max": k["stress_max"], "legend": k["stress_legend"], "stress_unit": "MPa", "def_unit": "mm",
                       "bc_id": k["bc_id"], "def_id": k["def_id"], "stress_id": k["stress_id"], "bc_items": ["x"], "notes": [], "legend_px": k["legend_px"], "extras": []} for k in cs]}
    body.update(kw); return body
L = c.post("/api/derive", json=planbody()).get_json()["layout"]
check("normal screenshots keep the template's side-by-side (legend ~5.4 pt)", L["results"]["auto"] == "side" and 5.0 <= L["results"]["options"]["side"]["pt"] <= 6.0, L["results"])
check("geometry views of the blade stay side by side", L["geometry"]["effective"] == "side", L["geometry"])
check("one-per-slide would give the biggest legend (~9-10 pt)", L["results"]["options"]["separate"]["pt"] > 8)
check("stacked is WORSE than side-by-side for normal pictures", L["results"]["options"]["stack"]["pt"] < L["results"]["options"]["side"]["pt"])
L2 = c.post("/api/derive", json=planbody(layouts={"results": "separate", "geometry": "auto", "bc": "auto", "extras": "auto"})).get_json()["layout"]
check("an explicit choice is honoured", L2["results"]["effective"] == "separate" and L2["results"]["auto"] == "side")
b = planbody(); b["cases"][0]["layout"] = "separate"
L3 = c.post("/api/derive", json=b).get_json()["layout"]
check("a per-case override wins for that case only", L3["cases"]["1"]["effective_results"] == "separate" and L3["cases"]["2"]["effective_results"] == "side")
# huge legend text (as if the screenshot was taken with big fonts) -> legend is fine, not flagged; tiny text -> flagged
b = planbody()
for cc in b["cases"]: cc["legend_px"] = 4.0
chk = c.post("/api/derive", json=b).get_json()["checks"]
check("tiny screenshot text (4 px) is flagged as unreadable even in the best layout", any(x["level"] == "warn" and "no layout does better" in x["text"] for x in chk), [x["text"][:80] for x in chk])

print("A5  duplicates / auto-save / evidence")
dup = c.post("/api/analyze", data={"files": [(io.BytesIO(ex[0].read_bytes()), "a.png"), (io.BytesIO(ex[0].read_bytes()), "b.png")]}, content_type="multipart/form-data").get_json()
check("the same file twice is used once", sorted(i["role"] for i in dup["images"]).count("unused") == 1 and any("same picture" in w["text"] for w in dup["warnings"]))
r = c.post("/api/state", json={"sid": sid, "state": {"cover": {"report_no": "TEST-1"}, "x": 1}}); check("state saved", r.status_code == 200)
r = c.get("/api/last").get_json(); check("the last unfinished report can be resumed", r["found"] and r["sid"] == sid and r["state"]["x"] == 1 and r["title"] == "TEST-1")
c.post("/api/discard", json={"sid": sid}); check("...and discarded", c.get("/api/last").get_json().get("sid") != sid)
for kind in ("legend", "bc", "header"):
    r = c.get(f"/api/crop/{sid}/{cs[0]['stress_id']}/{kind}?w=300"); check(f"evidence crop '{kind}' is a picture", r.status_code == 200 and r.data[:4] == b"\x89PNG")
check("unknown crop kind is refused", c.get(f"/api/crop/{sid}/0/passwd").status_code == 404)

print()
print("ALL FEA TESTS PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
