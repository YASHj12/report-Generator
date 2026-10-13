# -*- coding: utf-8 -*-
"""
sitecustomize.py - Bundled runtime bootstrap for FEA Report Maker (Windows Offline Installer).

Loaded automatically by Python's `site` module at startup without modifying any file
in FEA_Report_Maker_v3.0.1.
  1. Configures DLL search directories and PATH for the bundled Python & NumPy/Pillow libraries.
  2. Points TESSERACT_CMD and TESSDATA_PREFIX to the bundled portable Tesseract OCR.
  3. Resolves the user's real Windows File Explorer Downloads folder (FOLDERID_Downloads)
     and guarantees that every downloaded .pptx / .pdf report lands directly in Downloads.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import os
import re
import shutil
import sys
import threading
import time
from datetime import datetime
from pathlib import Path


def _find_app_root() -> Path:
    here = Path(__file__).resolve()
    # Expected location: <ROOT>/.venv/Lib/site-packages/sitecustomize.py
    for p in here.parents:
        if (p / "app" / "server.py").exists():
            return p
    return here.parents[3] if len(here.parents) >= 4 else here.parent


ROOT = _find_app_root()


def _setup_environment() -> None:
    scripts_dir = ROOT / ".venv" / "Scripts"
    site_pkgs = ROOT / ".venv" / "Lib" / "site-packages"
    tess_dir = ROOT / "tesseract"

    extra_dirs = [scripts_dir, tess_dir]
    if site_pkgs.is_dir():
        for libs_dir in site_pkgs.glob("*.libs"):
            extra_dirs.append(libs_dir)

    path_parts = [str(d) for d in extra_dirs if d.is_dir()]
    if path_parts:
        cur_path = os.environ.get("PATH", "")
        os.environ["PATH"] = os.pathsep.join(path_parts + ([cur_path] if cur_path else []))

    if hasattr(os, "add_dll_directory"):
        for d in extra_dirs:
            if d.is_dir():
                try:
                    os.add_dll_directory(str(d))
                except OSError:
                    pass

    tess_exe = tess_dir / ("tesseract.exe" if os.name == "nt" else "tesseract")
    if tess_exe.is_file():
        os.environ.setdefault("TESSERACT_CMD", str(tess_exe))
        tessdata = tess_dir / "tessdata"
        if tessdata.is_dir():
            os.environ.setdefault("TESSDATA_PREFIX", str(tessdata))


def get_windows_downloads_folder() -> Path:
    """Return the user's real Windows File Explorer Downloads folder (FOLDERID_Downloads)."""
    if os.name == "nt":
        try:
            class GUID(ctypes.Structure):
                _fields_ = [
                    ("Data1", ctypes.c_ulong),
                    ("Data2", ctypes.c_ushort),
                    ("Data3", ctypes.c_ushort),
                    ("Data4", ctypes.c_ubyte * 8),
                ]

            # {374DE290-123F-4565-9164-39C4925E467B} = FOLDERID_Downloads
            folderid_downloads = GUID(
                0x374DE290,
                0x123F,
                0x4565,
                (ctypes.c_ubyte * 8)(0x91, 0x64, 0x39, 0xC4, 0x92, 0x5E, 0x46, 0x7B),
            )
            path_ptr = ctypes.c_wchar_p()
            hr = ctypes.windll.shell32.SHGetKnownFolderPath(
                ctypes.byref(folderid_downloads), 0, 0, ctypes.byref(path_ptr)
            )
            if hr == 0 and path_ptr.value:
                res = Path(path_ptr.value)
                ctypes.windll.ole32.CoTaskMemFree(path_ptr)
                if res.is_dir():
                    return res
        except Exception:
            pass
    dl = Path.home() / "Downloads"
    dl.mkdir(parents=True, exist_ok=True)
    return dl


_DL_LOCK = threading.Lock()
_RECENT_DL: dict = {}
_DL_ROUTE_RE = re.compile(r"^/download/([0-9a-f]{12})/([0-9a-f]{12})/(pptx|pdf)$")


def _sha1(path: Path) -> bytes:
    return hashlib.sha1(path.read_bytes()).digest()


def _ensure_in_downloads(src: Path, filename: str) -> None:
    """Wait briefly for the browser's own download to finish; if the file is not already
    in the user's Windows File Explorer Downloads folder, copy it there directly."""
    time.sleep(1.5)
    with _DL_LOCK:
        try:
            if not src.is_file():
                return
            dl_dir = get_windows_downloads_folder()
            dl_dir.mkdir(parents=True, exist_ok=True)
            src_size = src.stat().st_size
            src_hash = _sha1(src)

            # Check if the browser already saved this exact file into Downloads
            stem = Path(filename).stem
            suffix = Path(filename).suffix
            for cand in dl_dir.glob(f"{stem}*{suffix}"):
                try:
                    if cand.is_file() and cand.stat().st_size == src_size and _sha1(cand) == src_hash:
                        return
                except OSError:
                    continue

            dst = dl_dir / filename
            if dst.exists():
                try:
                    if dst.stat().st_size == src_size and _sha1(dst) == src_hash:
                        return
                except OSError:
                    pass
                dst = dl_dir / f"{stem}_{datetime.now():%H%M%S}{suffix}"
            shutil.copyfile(src, dst)
        except Exception:
            pass


def _install_flask_hook() -> None:
    try:
        import flask
    except ImportError:
        return

    orig_init = flask.Flask.__init__
    if getattr(orig_init, "_fea_hooked", False):
        return

    def _wrapped_init(self, *args, **kwargs):
        orig_init(self, *args, **kwargs)

        @self.after_request
        def _fea_after_download(response):
            try:
                from flask import request
                m = _DL_ROUTE_RE.match(request.path or "")
                if m and response.status_code == 200:
                    sid, key, kind = m.group(1), m.group(2), m.group(3)
                    token = (sid, key, kind)
                    now = time.monotonic()
                    with _DL_LOCK:
                        last = _RECENT_DL.get(token, 0.0)
                        if now - last < 3.0:
                            return response
                        _RECENT_DL[token] = now
                    build_dir = ROOT / "work" / "sessions" / sid / "builds" / key
                    src = build_dir / f"report.{kind}"
                    meta_f = build_dir / "meta.json"
                    if src.is_file() and meta_f.is_file():
                        name = json.loads(meta_f.read_text(encoding="utf-8")).get("name", "FEA_Report") + "." + kind
                        threading.Thread(target=_ensure_in_downloads, args=(src, name), daemon=True).start()
            except Exception:
                pass
            return response

    _wrapped_init._fea_hooked = True
    flask.Flask.__init__ = _wrapped_init


_setup_environment()
_install_flask_hook()
