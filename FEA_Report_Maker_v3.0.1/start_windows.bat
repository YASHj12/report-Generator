@echo off
setlocal
cd /d "%~dp0"
title FEA Report Maker
echo ==============================================================
echo   FEA Report Maker
echo ==============================================================
echo.

rem ---- 0. the ZIP file must be extracted first --------------------------------
if not exist "app\server.py" goto :notextracted

rem ---- 1. find Python (the Microsoft Store shortcut does not count) -------------
rem The new "Python install manager" can start to download Python by itself and ask a question that
rem nobody can see in this window. Here we only want to LOOK for Python, so that is switched off.
set "PYTHON_MANAGER_AUTOMATIC_INSTALL=false"
set "PY="
py -3 --version >nul 2>nul <nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto :havepython
python --version >nul 2>nul <nul
if not errorlevel 1 set "PY=python"
if not defined PY goto :nopython
:havepython

rem ---- 2. first start of this version: private environment + packages ----------
if exist ".venv\fea_ready_301" goto :run
echo   First start of this version: installing the needed Python packages.
echo   This needs internet and takes 1 to 5 minutes. The window may look quiet - that is normal.
echo   Please wait and do not close it. It is done only once.
echo.
if exist ".venv" rmdir /s /q ".venv"
%PY% -m venv ".venv"
if errorlevel 1 goto :novenv
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto :nopip
echo ready> ".venv\fea_ready_301"
echo   Packages installed.
echo.

rem ---- 3. run -----------------------------------------------------------------
:run
".venv\Scripts\python.exe" app\server.py %*
echo.
echo   The program has stopped.
pause
exit /b 0

:notextracted
echo   The program files were not found next to this file.
echo.
echo   You probably started it from INSIDE the ZIP file.
echo   1. Close this window.
echo   2. Right-click the ZIP file, choose "Extract All..." and click Extract.
echo   3. Open the new folder and double-click  start_windows.bat  there.
echo.
pause
exit /b 1

:nopython
echo   Python was not found on this computer.
echo.
echo   EASIEST WAY - the classic installer:
echo     1. Copy this address into your browser and press Enter:
echo          https://www.python.org/ftp/python/3.14.8/python-3.14.8-amd64.exe
echo        The installer file is downloaded.
echo     2. Open that file. On the FIRST screen tick  "Add python.exe to PATH"
echo        and click  "Install Now".
echo     3. When it says "Setup was successful", click Close.
echo     4. Close this window and double-click  start_windows.bat  again.
echo.
echo   Did you install the "Python install manager" instead? Then do this:
echo     1. Press the Windows key, type  cmd  and press Enter.
echo     2. In the black window type   py install 3.14   and press Enter.
echo        Answer  Y  if it asks.
echo     3. Close that window and double-click  start_windows.bat  again.
echo.
pause
exit /b 1

:novenv
echo.
echo   Could not set up the Python environment.
echo   - Python was only just installed?  Close this window and double-click this file again.
echo   - Python is not installed yet (or only the Microsoft Store shortcut exists)?
echo     Install it with the classic installer from this address:
echo          https://www.python.org/ftp/python/3.14.8/python-3.14.8-amd64.exe
echo     tick  "Add python.exe to PATH"  and double-click this file again.
echo.
if exist ".venv" rmdir /s /q ".venv"
pause
exit /b 1

:nopip
echo.
echo   The packages could not be installed. Please check the internet connection
echo   and double-click this file again.
echo.
if exist ".venv" rmdir /s /q ".venv"
pause
exit /b 1
