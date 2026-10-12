#!/usr/bin/env python3
"""
package.py  -  developer tool (not needed by users).

    python package.py            copy the report engine into engine/ and build ../FEA_Report_Maker_v<version>.zip
    python package.py --sync     only copy the engine
"""
from __future__ import annotations

import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VERSION = re.search(r'^VERSION\s*=\s*"([^"]+)"', (ROOT / "app" / "server.py").read_text(encoding="utf-8"), re.M).group(1)
TOP = f"FEA_Report_Maker_v{VERSION}"          # the folder inside the ZIP and the name of the ZIP: a new version never mixes with an old folder
ENGINE_SRC = ROOT.parent / "report_builder"
KEEP_TOP = ["app", "engine", "examples", "docs", "settings.json", "requirements.txt", "README.txt",
            "start_windows.bat", "start_mac_linux.sh", "start_mac.command"]
SKIP_DIRS = {"__pycache__", ".venv", "work", ".pytest_cache"}
EXECUTABLE = {"start_mac_linux.sh", "start_mac.command"}


def sync_engine():
    dst = ROOT / "engine"
    if not ENGINE_SRC.exists():
        print("engine source not found - keeping the existing engine/ folder")
        return
    dst.mkdir(exist_ok=True)
    for mod in ("mw_report.py", "pptx_preview.py"):
        shutil.copy2(ENGINE_SRC / mod, dst / mod)
    for sub in ("assets", "fonts"):
        if (dst / sub).exists():
            shutil.rmtree(dst / sub)
        shutil.copytree(ENGINE_SRC / sub, dst / sub)
    print("engine synced:", ", ".join(sorted(p.name for p in dst.iterdir())))


def build_zip() -> Path:
    zpath = ROOT.parent / f"{TOP}.zip"
    for old in ROOT.parent.glob("FEA_Report_Maker*.zip"):          # keep ONE zip: no older version lying around next to it
        old.unlink()
    n = 0
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        (ROOT / "outputs").mkdir(exist_ok=True)
        z.writestr(zipfile.ZipInfo(f"{TOP}/outputs/_your_reports_appear_here.txt"),
                   "A copy of every report you download is kept in this folder.\n(The download itself goes to the Downloads folder of your browser.)\n")
        for name in KEEP_TOP:
            p = ROOT / name
            if not p.exists():
                print("  (missing, skipped)", name)
                continue
            files = [p] if p.is_file() else [f for f in sorted(p.rglob("*")) if f.is_file()]
            for f in files:
                if any(part in SKIP_DIRS for part in f.relative_to(ROOT).parts) or f.suffix == ".pyc":
                    continue
                arc = f"{TOP}/" + f.relative_to(ROOT).as_posix()
                info = zipfile.ZipInfo.from_file(f, arc)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o755 if f.name in EXECUTABLE else 0o644) << 16
                if f.suffix in (".bat", ".txt"):                          # Windows-friendly line endings
                    data = f.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
                    z.writestr(info, data)
                else:
                    z.writestr(info, f.read_bytes())
                n += 1
    print(f"wrote {zpath}  ({n} files, {zpath.stat().st_size / 1e6:.2f} MB)")
    return zpath


if __name__ == "__main__":
    sync_engine()
    if "--sync" not in sys.argv:
        build_zip()
