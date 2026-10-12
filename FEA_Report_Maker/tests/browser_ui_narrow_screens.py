"""Browser test: narrow screens (phone 390 px, small tablet 820 px): nothing may overflow sideways, bar buttons stay reachable.

    needs:  a running server (port 5055)        run:  python tests/browser_ui_narrow_screens.py
"""
from playwright.sync_api import sync_playwright
from pathlib import Path as _P
_HERE = _P(__file__).resolve().parent
_ROOT = _HERE.parent
_SHOTS = _HERE / "_shots"; _SHOTS.mkdir(exist_ok=True)
import os as _os
URL = _os.environ.get("FEA_URL", "http://127.0.0.1:5055"); SH = str(_SHOTS) + "/"
fails = []
def check(name, cond, info=""):
    print(("  ok   " if cond else "  FAIL ") + name + (f"   [{info}]" if (info and not cond) else ""))
    if not cond: fails.append(name)
import os
LAUNCH = {"executable_path": os.environ.get("CHROMIUM")} if os.environ.get("CHROMIUM") else {}
if LAUNCH: LAUNCH["args"] = ["--no-sandbox"]
with sync_playwright() as p:
    b = p.chromium.launch(**LAUNCH)
    for label, (w, h) in {"phone": (390, 844), "tablet": (820, 1100)}.items():
        ctx = b.new_context(viewport={"width": w, "height": h}, accept_downloads=True, device_scale_factor=2 if label == "phone" else 1)
        page = ctx.new_page()
        page.goto(URL); page.wait_for_selector(".chip")
        page.get_by_role("button", name="Try it with the 9 example pictures").click()
        page.wait_for_selector("#s-review:not([hidden])", timeout=120000)
        page.wait_for_function("S.build.status === 'ok' && document.querySelector('#pv-img').naturalWidth > 100", timeout=60000)
        page.wait_for_timeout(800)
        sw = page.evaluate("document.documentElement.scrollWidth"); cw = page.evaluate("document.documentElement.clientWidth")
        check(f"{label} ({w}px): no sideways scrolling", sw <= cw + 1, f"scrollWidth {sw} > {cw}")
        page.screenshot(path=SH + f"p5c_{label}_top.png")
        box = page.locator("#bar").bounding_box()
        for sel in ("#btn-preview", "#btn-pdf", "#btn-pptx"):
            bb = page.locator(sel).bounding_box()
            check(f"{label}: {sel} is inside the screen and tappable (>= 36 px high)", bb and bb["x"] >= 0 and bb["x"] + bb["width"] <= w + 1 and bb["height"] >= 36, str(bb))
        pv = page.locator("#pv-frame").bounding_box()
        check(f"{label}: the slide fits the width", pv["x"] >= 0 and pv["x"] + pv["width"] <= w + 1, str(pv))
        page.locator("#pv-frame").click(); page.wait_for_timeout(900)
        check(f"{label}: full-screen viewer opens", page.locator("#slidebox").is_visible())
        page.screenshot(path=SH + f"p5c_{label}_full.png")
        page.keyboard.press("Escape")
        with page.expect_download(timeout=60000) as dl:
            page.locator("#btn-pptx").click()
        check(f"{label}: download works", dl.value.suggested_filename.endswith(".pptx"))
        ctx.close()
    b.close()
print("\nFAILS:", fails if fails else "none")
