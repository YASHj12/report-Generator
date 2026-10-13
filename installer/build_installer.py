#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_installer.py - Builds the standalone Windows offline installer:
    FEA_Report_Maker_v3.0.1_Setup.exe

Key properties:
  * Never modifies any file inside FEA_Report_Maker_v3.0.1/
  * Requires NO administrator privileges (embedded `asInvoker` manifest)
  * Bundles Python 3.12.8 (64-bit Windows), all pip wheels, and portable Tesseract OCR
  * Guarantees .pptx and .pdf downloads go directly to the Windows File Explorer Downloads folder
"""
from __future__ import annotations

import glob
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
APP_SRC = REPO_ROOT / "FEA_Report_Maker_v3.0.1"
OUT_EXE = REPO_ROOT / "FEA_Report_Maker_v3.0.1_Setup.exe"

CACHE_DIR = Path("/tmp/build_check")
WHEELS_DIR = Path("/tmp/win_wheels")


def find_zig() -> str:
    for cand in (
        "/tmp/zig_pkg/ziglang/zig",
        shutil.which("zig"),
    ):
        if cand and Path(cand).exists():
            return str(cand)
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "--target", "/tmp/zig_pkg", "ziglang"
    ])
    return "/tmp/zig_pkg/ziglang/zig"


def ensure_cached_downloads() -> tuple[Path, Path]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    py_dir = CACHE_DIR / "python-3.12.8-embeddable-amd64-HEAD"
    if not py_dir.exists():
        print("Downloading Windows Python 3.12.8 embeddable runtime...")
        tar_data = urllib.request.urlopen(
            "https://codeload.github.com/dm1495122-dot/python-3.12.8-embeddable-amd64/tar.gz/HEAD",
            timeout=60,
        ).read()
        tar_path = CACHE_DIR / "py312.tar.gz"
        tar_path.write_bytes(tar_data)
        subprocess.check_call(["tar", "-xzf", str(tar_path), "-C", str(CACHE_DIR)])

    tess_dir = CACHE_DIR / "tesseract_portable_windows-HEAD"
    if not tess_dir.exists():
        print("Downloading portable Windows Tesseract OCR...")
        tar_data = urllib.request.urlopen(
            "https://codeload.github.com/zstrathe/tesseract_portable_windows/tar.gz/HEAD",
            timeout=60,
        ).read()
        tar_path = CACHE_DIR / "tess.tar.gz"
        tar_path.write_bytes(tar_data)
        subprocess.check_call(["tar", "-xzf", str(tar_path), "-C", str(CACHE_DIR)])

    WHEELS_DIR.mkdir(parents=True, exist_ok=True)
    if not list(WHEELS_DIR.glob("*.whl")):
        print("Downloading Windows cp312 wheels...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "download",
            "--dest", str(WHEELS_DIR),
            "--platform", "win_amd64",
            "--python-version", "3.12",
            "--only-binary=:all:",
            "flask>=3.0",
            "python-pptx>=0.6.23",
            "pillow>=10.1",
            "numpy>=1.24",
            "pytesseract>=0.3.10",
            "colorama",
        ])
    return py_dir, tess_dir


def compile_windows_binaries(zig: str, work_dir: Path) -> tuple[Path, Path, Path]:
    print("Compiling Windows icon and resources...")
    subprocess.check_call([sys.executable, str(HERE / "make_icon.py")])

    for name in ("launcher", "uninstall", "setup"):
        subprocess.check_call(
            [zig, "rc", "/fo", str(HERE / f"{name}.res"), str(HERE / f"{name}.rc")],
            cwd=str(HERE),
        )

    launcher_exe = work_dir / "FEA_Report_Maker.exe"
    uninstall_exe = work_dir / "Uninstall.exe"
    setup_stub_exe = work_dir / "SetupStub.exe"

    print("Compiling FEA_Report_Maker.exe (Windows GUI Launcher)...")
    subprocess.check_call([
        zig, "cc", "-target", "x86_64-windows-gnu", "-O2", "-s",
        "-Wl,--subsystem,windows", "-municode",
        str(HERE / "launcher.c"), str(HERE / "launcher.res"),
        "-luser32", "-lgdi32", "-lshell32", "-lcomctl32", "-lole32",
        "-o", str(launcher_exe),
    ])

    print("Compiling Uninstall.exe (Windows GUI Uninstaller)...")
    subprocess.check_call([
        zig, "cc", "-target", "x86_64-windows-gnu", "-O2", "-s",
        "-Wl,--subsystem,windows", "-municode",
        str(HERE / "uninstall.c"), str(HERE / "uninstall.res"),
        "-luser32", "-lshell32", "-ladvapi32",
        "-o", str(uninstall_exe),
    ])

    print("Compiling SetupStub.exe (Windows GUI Setup Wizard + miniz)...")
    miniz_dir = HERE / "miniz"
    subprocess.check_call([
        zig, "cc", "-target", "x86_64-windows-gnu", "-O2", "-s",
        "-Wl,--subsystem,windows", "-municode",
        "-DMINIZ_EXPORT=", f"-I{miniz_dir}",
        str(HERE / "setup.c"),
        str(miniz_dir / "miniz.c"),
        str(miniz_dir / "miniz_tdef.c"),
        str(miniz_dir / "miniz_tinfl.c"),
        str(miniz_dir / "miniz_zip.c"),
        str(HERE / "setup.res"),
        "-luser32", "-lgdi32", "-lshell32", "-lcomctl32", "-lole32", "-luuid", "-ladvapi32",
        "-o", str(setup_stub_exe),
    ])

    return launcher_exe, uninstall_exe, setup_stub_exe


def stage_payload(
    stage_dir: Path,
    py_dir: Path,
    tess_dir: Path,
    launcher_exe: Path,
    uninstall_exe: Path,
) -> None:
    print("Staging untouched FEA_Report_Maker_v3.0.1 application files...")
    shutil.copytree(APP_SRC, stage_dir, dirs_exist_ok=True)

    # Copy native Windows GUI launcher and uninstaller into root of installed directory
    shutil.copy2(launcher_exe, stage_dir / "FEA_Report_Maker.exe")
    shutil.copy2(uninstall_exe, stage_dir / "Uninstall.exe")

    # Stage portable Windows Tesseract OCR
    print("Staging portable Windows Tesseract OCR...")
    dst_tess = stage_dir / "tesseract"
    dst_tess.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tess_dir / "tesseract.exe", dst_tess / "tesseract.exe")
    shutil.copy2(tess_dir / "LICENSE", dst_tess / "LICENSE")
    dst_tessdata = dst_tess / "tessdata"
    dst_tessdata.mkdir(parents=True, exist_ok=True)
    shutil.copy2(tess_dir / "tessdata" / "eng.traineddata", dst_tessdata / "eng.traineddata")

    # Stage Windows Python 3.12.8 runtime into .venv/Scripts
    print("Staging Windows Python 3.12.8 runtime into .venv/Scripts...")
    venv_dir = stage_dir / ".venv"
    scripts_dir = venv_dir / "Scripts"
    site_pkgs = venv_dir / "Lib" / "site-packages"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    site_pkgs.mkdir(parents=True, exist_ok=True)

    for item in py_dir.iterdir():
        if item.name.startswith(".") or item.name in ("__install__.json", "python312", "python312._pth"):
            continue
        if item.is_file():
            shutil.copy2(item, scripts_dir / item.name)

    # Write python312._pth so python.exe loads stdlib, site-packages, app, engine, and sitecustomize.py
    pth_content = (
        "python312.zip\r\n"
        ".\r\n"
        "..\\Lib\\site-packages\r\n"
        "..\\..\r\n"
        "..\\..\\app\r\n"
        "..\\..\\engine\r\n"
        "import site\r\n"
    )
    (scripts_dir / "python312._pth").write_bytes(pth_content.encode("utf-8"))
    (venv_dir / "fea_ready_301").write_text("ready\n", encoding="utf-8")

    # Unpack Windows wheels into .venv/Lib/site-packages
    print("Unpacking Windows wheels into .venv/Lib/site-packages...")
    for whl in sorted(WHEELS_DIR.glob("*.whl")):
        with zipfile.ZipFile(whl) as zf:
            for member in zf.infolist():
                # Skip wheel tests to keep installer fast & compact
                parts = Path(member.filename).parts
                if any(p in ("tests", "test") for p in parts):
                    continue
                zf.extract(member, site_pkgs)

    # Also copy msvcp140-*.dll into .venv/Scripts/msvcp140.dll so C++ extensions always find it
    for dll in (site_pkgs / "numpy.libs").glob("msvcp140*.dll"):
        shutil.copy2(dll, scripts_dir / dll.name)
        shutil.copy2(dll, scripts_dir / "msvcp140.dll")
    for dll in (site_pkgs / "numpy.libs").glob("libscipy_openblas*.dll"):
        shutil.copy2(dll, scripts_dir / dll.name)

    # Copy sitecustomize.py into .venv/Lib/site-packages/sitecustomize.py
    shutil.copy2(HERE / "sitecustomize.py", site_pkgs / "sitecustomize.py")


def build_payload_zip(stage_dir: Path, zip_path: Path) -> int:
    print("Compressing payload archive...")
    count = 0
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for f in sorted(stage_dir.rglob("*")):
            if f.is_file():
                rel = f.relative_to(stage_dir).as_posix()
                zf.write(f, rel)
                count += 1
    return count


def main() -> None:
    zig = find_zig()
    py_dir, tess_dir = ensure_cached_downloads()

    with tempfile.TemporaryDirectory(prefix="fea_installer_build_") as td:
        work_dir = Path(td)
        launcher_exe, uninstall_exe, setup_stub_exe = compile_windows_binaries(zig, work_dir)

        stage_dir = work_dir / "stage"
        stage_dir.mkdir(parents=True, exist_ok=True)
        stage_payload(stage_dir, py_dir, tess_dir, launcher_exe, uninstall_exe)

        payload_zip = work_dir / "payload.zip"
        num_files = build_payload_zip(stage_dir, payload_zip)

        print(f"Creating {OUT_EXE.name} ({num_files} files)...")
        with open(OUT_EXE, "wb") as out_f:
            out_f.write(setup_stub_exe.read_bytes())
            out_f.write(payload_zip.read_bytes())

    size_mb = OUT_EXE.stat().st_size / (1024 * 1024)
    print(f"Done! Wrote {OUT_EXE} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
