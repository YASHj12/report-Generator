#!/usr/bin/env python3
"""
Version 2.2 self-test (no browser):   python tests/test_v22.py

  1. the page shows / the server reports its version, static files carry ?v=
  2. the HEAD check of a download does not create a copy; the real download does
  3. 'Open the Downloads folder' (only on the user's own computer)
  4. a picture that Tesseract cannot finish never blocks: it is handled manually, all the others carry on
  5. start-up with an OLDER copy (or another program) still running on the same port
"""
import http.server
import json
import os
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "app"))
sys.path.insert(0, str(ROOT / "engine"))
import analyzer            # noqa: E402
import server              # noqa: E402

EX = ROOT / "examples"
c = server.app.test_client()
fails = []


def check(name, cond, info=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"   [{info}]" if info and not cond else ""))
    if not cond:
        fails.append(name)


# ───────────────────────────────────────────────────────────────────────────────────────
print("1. version")
st = c.get("/api/status").get_json()
check("status says 2.2", st["version"] == "2.2", st["version"])
check("status names the program folder and the program", st["root"] == str(ROOT) and st["app"] == "FEA Report Maker")
r = c.get("/")
html = r.get_data(as_text=True)
check("page: app.js and style.css carry ?v=2.2", "app.js?v=2.2" in html and "style.css?v=2.2" in html)
check("page is never cached", "no-store" in r.headers.get("Cache-Control", ""))
check("static file is still served with the ?v= query", c.get("/static/app.js?v=2.2").status_code == 200)
js = c.get("/static/app.js").get_data(as_text=True)
check("page script shows the version chip", "chip-version" in js)

# ───────────────────────────────────────────────────────────────────────────────────────
print("2. a download: the page's HEAD check does not make a copy, the real download does")
with tempfile.TemporaryDirectory() as td:
    old_out = server.OUT
    server.OUT = Path(td) / "outputs"
    try:
        a = c.post("/api/analyze_example").get_json()
        cases = [{"n": k["n"], "name": k["name"], "subtitle": k["subtitle"], "short_name": k["short_name"], "bc_id": k["bc_id"],
                  "def_id": k["def_id"], "stress_id": k["stress_id"], "bc_items": k["bc_items"], "notes": [], "extras": [],
                  "def_max": k["def_max"], "stress_max": k["stress_max"]} for k in a["cases"]]
        body = {"sid": a["sid"], "cover": a["cover"], "short": a["cover"]["short"], "fos": 1.3, "yield": 380, "allowable": 292,
                "material": {"rows": [["IS 2062", "Duct", "191400", "0.3", "7.8E-9", "380", "292"]], "units": server.SETTINGS["units"]},
                "geometry": a["geometry"], "meshes": a["meshes"], "cases": cases}
        j = c.post("/api/build", json=body).get_json()
        url = f"/download/{a['sid']}/{j['key']}/pptx"
        h = c.head(url)
        check("HEAD answers 200 with the file headers", h.status_code == 200 and "attachment" in h.headers.get("Content-Disposition", ""), str(h.status_code))
        check("HEAD made no copy", not (server.OUT.exists() and any(server.OUT.iterdir())))
        g = c.get(url)
        check("GET downloads a real PowerPoint", g.status_code == 200 and g.data[:2] == b"PK" and len(g.data) > 100000, str(g.status_code))
        check("GET made exactly one copy in outputs/", server.OUT.exists() and len(list(server.OUT.iterdir())) == 1)
        check("the file of a build that does not exist gives a plain 404", c.head(f"/download/{a['sid']}/aaaaaaaaaaaa/pptx").status_code == 404)
    finally:
        server.OUT = old_out

# ───────────────────────────────────────────────────────────────────────────────────────
print("3. open the Downloads folder")
log = Path(tempfile.gettempdir()) / "fea_open_test.log"
log.unlink(missing_ok=True)
os.environ["FEA_TEST_OPEN_LOG"] = str(log)
server.RUNTIME["loopback"] = True
check("on the user's own computer the page may offer it", c.get("/api/status").get_json()["can_open_folder"] is True)
r = c.post("/api/open_downloads", json={})
check("the folder is opened (test hook)", r.get_json()["ok"] is True and log.exists())
log.unlink(missing_ok=True)
server.RUNTIME["loopback"] = False
check("in a shared/remote run the page does not offer it", c.get("/api/status").get_json()["can_open_folder"] is False)
r = c.post("/api/open_downloads", json={})
check("and the endpoint refuses (nothing opened)", r.get_json()["ok"] is False and not log.exists())
server.RUNTIME["loopback"] = True
del os.environ["FEA_TEST_OPEN_LOG"]

# ───────────────────────────────────────────────────────────────────────────────────────
print("4. a picture that cannot be read in time never blocks")
import pytesseract                                                   # noqa: E402

real_str, real_data = pytesseract.image_to_string, pytesseract.image_to_data
slow_names = {"image-1.png", "image-4.png"}                          # these two 'hang'
calls = {"slow": 0}


def pic_is_slow():
    return getattr(analyzer._TLS, "name", None) in slow_names


def fake_str(image, lang=None, config="", nice=0, output_type=None, timeout=0):
    if pic_is_slow():
        calls["slow"] += 1
        time.sleep(min(timeout or 99, 99))
        raise RuntimeError("Tesseract process timeout")
    return real_str(image, lang=lang, config=config, nice=nice, timeout=timeout) if output_type is None else real_str(image, lang=lang, config=config, nice=nice, output_type=output_type, timeout=timeout)


def fake_data(image, lang=None, config="", nice=0, output_type=None, timeout=0):
    if pic_is_slow():
        calls["slow"] += 1
        time.sleep(min(timeout or 99, 99))
        raise RuntimeError("Tesseract process timeout")
    kw = {"output_type": output_type} if output_type is not None else {}
    return real_data(image, lang=lang, config=config, nice=nice, timeout=timeout, **kw)


# the test marks which picture a worker thread is on (the real program does not need this)
real_one = analyzer.analyze_one


def tagged_one(path, idx, name=None):
    analyzer._TLS.name = name
    return real_one(path, idx, name)


pytesseract.image_to_string, pytesseract.image_to_data = fake_str, fake_data
analyzer.analyze_one = tagged_one
old_lim = (analyzer.OCR_CALL_TIMEOUT, analyzer.OCR_PICTURE_BUDGET)
analyzer.OCR_CALL_TIMEOUT, analyzer.OCR_PICTURE_BUDGET = 1.0, 3.0
try:
    paths = [EX / f"image-{k}.png" for k in range(1, 10)]
    t0 = time.time()
    res = analyzer.analyze(paths, server.SETTINGS, names=[p.name for p in paths])
    took = time.time() - t0
    by = {i["name"]: i for i in res["images"]}
    check("the whole job finishes in a few seconds, not never", took < 25, f"{took:.1f}s")
    check("the two slow pictures were given up", calls["slow"] >= 2, str(calls))
    for n in sorted(slow_names):
        i = by[n]
        check(f"{n}: handled in manual mode with a plain note", i.get("manual") is True and any("took too long" in t for t in i["notes"]), str(i["notes"])[:100])
    ok_pics = [i for k, i in by.items() if k not in slow_names]
    check("the other 7 pictures were read normally", all(not i.get("manual") for i in ok_pics))
    check("the stress pictures that were read still have their Max values (74.2 and 545 MPa)",
          by["image-3.png"]["max"] == 74.2 and by["image-6.png"]["max"] == 545, f"{by['image-3.png']['max']} {by['image-6.png']['max']}")
    check("the time limit of the thread is cleared afterwards", getattr(analyzer._TLS, "deadline", None) is None)
finally:
    pytesseract.image_to_string, pytesseract.image_to_data = real_str, real_data
    analyzer.analyze_one = real_one
    analyzer.OCR_CALL_TIMEOUT, analyzer.OCR_PICTURE_BUDGET = old_lim

res = analyzer.analyze([EX / f"image-{k}.png" for k in (1, 2, 3)], server.SETTINGS)
check("afterwards the normal reading works again", all(not i.get("manual") for i in res["images"]) and res["images"][0]["max"] is not None)

# ───────────────────────────────────────────────────────────────────────────────────────
print("5. start-up with an older copy (or another program) still running on the port")
PY = sys.executable


class Quiet(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass


class ReuseServer(socketserver.TCPServer):
    allow_reuse_address = True


def serve(handler_cls, port):
    srv = ReuseServer(("127.0.0.1", port), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class OldFea(Quiet):                         # what version 2.0 / 2.1 answers
    def do_GET(self):
        body = json.dumps({"version": "2.0", "ocr": True, "outputs": "C:\\old\\outputs"}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(body)


class Other(Quiet):                          # some other program on that port
    def do_GET(self):
        self.send_response(404); self.end_headers(); self.wfile.write(b"nothing here")


def start_server(port):
    p = subprocess.Popen([PY, str(ROOT / "app" / "server.py"), "--port", str(port), "--no-browser"], cwd=ROOT,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return p


def read_until(p, needle, secs=30):
    out, t0 = [], time.time()
    while time.time() - t0 < secs:
        line = p.stdout.readline()
        if not line:
            break
        out.append(line)
        if needle in line:
            break
    return "".join(out)


def status_of(port):
    import urllib.request
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/status", timeout=3) as r:
            return json.loads(r.read())
    except Exception:
        return None


def stop(p):
    p.terminate()
    try:
        p.wait(8)
    except subprocess.TimeoutExpired:
        p.kill()


for label, handler, expect_word in (("an older FEA Report Maker (2.0)", OldFea, "FEA Report Maker 2.0"), ("another program", Other, "another program")):
    srv = serve(handler, 5081)
    p = start_server(5081)
    try:
        out = read_until(p, "Open this address")
        check(f"{label}: the new copy says so", "NOTE" in out and expect_word in out, out[-300:])
        check(f"{label}: and starts on the NEXT port, not on the old one", "127.0.0.1:5082" in out, out[-200:])
        time.sleep(2.0)
        s2 = status_of(5082)
        check(f"{label}: port 5082 answers as version 2.2", bool(s2) and s2["version"] == "2.2", str(s2))
        s1 = status_of(5081)
        check(f"{label}: the old one on 5081 is untouched", (s1 or {}).get("version") != "2.2")
    finally:
        stop(p)
        srv.shutdown(); srv.server_close()
        time.sleep(0.5)

p1 = start_server(5083)
try:
    out1 = read_until(p1, "Open this address")
    time.sleep(2.0)
    check("a normal first start uses the port it was given", "127.0.0.1:5083" in out1 and "NOTE" not in out1, out1[-200:])
    p2 = start_server(5083)
    out2 = read_until(p2, "already running", 20)
    try:
        code = p2.wait(15)
    except subprocess.TimeoutExpired:
        code = None
        p2.kill()
    check("the SAME version in the SAME folder is not started twice", "already running" in out2 and code == 0, f"{out2[-200:]} code={code}")
finally:
    stop(p1)

# ───────────────────────────────────────────────────────────────────────────────────────
print("6. the start files (they cannot be run here on Windows, so they are checked as text)")
import re                                                          # noqa: E402

bat = (ROOT / "start_windows.bat").read_text(encoding="utf-8")
sh = (ROOT / "start_mac_linux.sh").read_text(encoding="utf-8")
labels = {m.group(1).lower() for m in re.finditer(r"^:([A-Za-z0-9_]+)\s*$", bat, re.M)}
gotos = {m.group(1).lower() for m in re.finditer(r"goto\s+:([A-Za-z0-9_]+)", bat, re.I)}
check("every 'goto' of start_windows.bat has its label", gotos <= labels, str(gotos - labels))
check("start_windows.bat is plain ASCII (no code-page trouble)", all(ord(ch) < 128 for ch in bat))
check("start_windows.bat has no tab characters", "\t" not in bat)
mark = "fea_ready_" + server.VERSION.replace(".", "")
check(f"both start files use the version marker {mark} (a new version reinstalls the packages)", mark in bat and mark in sh)
check("the Windows file checks that the ZIP was extracted", 'if not exist "app\\server.py"' in bat)
check("the Windows file does not trust the Microsoft Store shortcut (python --version must work)", "python --version" in bat and "py -3 --version" in bat)
check("the program is started with the private environment", '".venv\\Scripts\\python.exe" app\\server.py' in bat)
req = (ROOT / "requirements.txt").read_text(encoding="utf-8").lower()
check("requirements.txt lists what the program imports", all(k in req for k in ("flask", "python-pptx", "pillow", "numpy", "pytesseract")))

print()
print("ALL TESTS PASSED" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
