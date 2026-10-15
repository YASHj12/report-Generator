#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <commctrl.h>
#include <shlobj.h>
#include <shellapi.h>
#include <objbase.h>
#include <shobjidl.h>
#include <shlguid.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>

#define MINIZ_EXPORT
#include "miniz.h"

#define IDI_MAINICON       101
#define IDC_EDIT_DIR       301
#define IDC_BTN_BROWSE     302
#define IDC_CHK_DESKTOP    303
#define IDC_CHK_STARTMENU  304
#define IDC_CHK_LAUNCH     305
#define IDC_PROGRESS       306
#define IDC_LBL_STATUS     307
#define IDC_BTN_INSTALL    308
#define IDC_BTN_CANCEL     309

#define WM_INSTALL_PROGRESS (WM_APP + 10)
#define WM_INSTALL_DONE     (WM_APP + 11)

static HWND g_hwnd = NULL;
static HWND g_hEditDir = NULL;
static HWND g_hBtnBrowse = NULL;
static HWND g_hChkDesktop = NULL;
static HWND g_hChkStartMenu = NULL;
static HWND g_hChkLaunch = NULL;
static HWND g_hProgress = NULL;
static HWND g_hStatus = NULL;
static HWND g_hBtnInstall = NULL;
static HWND g_hBtnCancel = NULL;

static HFONT g_hFontTitle = NULL;
static HFONT g_hFontSub = NULL;
static HFONT g_hFontUI = NULL;
static HFONT g_hFontBold = NULL;
static HBRUSH g_hBrushHeader = NULL;
static HBRUSH g_hBrushBg = NULL;

static wchar_t g_installDir[MAX_PATH] = L"";
static BOOL g_optDesktop = TRUE;
static BOOL g_optStartMenu = TRUE;
static BOOL g_optLaunch = TRUE;
static BOOL g_installing = FALSE;
static BOOL g_finished = FALSE;
static BOOL g_silentMode = FALSE;
static volatile LONG g_cancelRequested = 0;

static void EnsureParentDirectories(const wchar_t *filePath) {
    wchar_t tmp[MAX_PATH];
    wcsncpy(tmp, filePath, MAX_PATH - 1);
    tmp[MAX_PATH - 1] = L'\0';

    for (wchar_t *p = tmp; *p; p++) {
        if (*p == L'/' || *p == L'\\') {
            if (p > tmp && *(p - 1) != L':') {
                wchar_t ch = *p;
                *p = L'\0';
                CreateDirectoryW(tmp, NULL);
                *p = ch;
            }
        }
    }
}

static void CreateDirRecursive(const wchar_t *dirPath) {
    wchar_t tmp[MAX_PATH];
    _snwprintf(tmp, MAX_PATH, L"%s\\_", dirPath);
    EnsureParentDirectories(tmp);
}

static BOOL CreateShortcutLink(
    const wchar_t *targetExe,
    const wchar_t *workingDir,
    const wchar_t *lnkPath,
    const wchar_t *description,
    const wchar_t *iconPath
) {
    IShellLinkW *psl = NULL;
    HRESULT hr = CoCreateInstance(&CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER, &IID_IShellLinkW, (LPVOID *)&psl);
    if (FAILED(hr) || !psl) return FALSE;

    psl->lpVtbl->SetPath(psl, targetExe);
    psl->lpVtbl->SetWorkingDirectory(psl, workingDir);
    psl->lpVtbl->SetDescription(psl, description);
    if (iconPath && *iconPath) {
        psl->lpVtbl->SetIconLocation(psl, iconPath, 0);
    }

    IPersistFile *ppf = NULL;
    hr = psl->lpVtbl->QueryInterface(psl, &IID_IPersistFile, (LPVOID *)&ppf);
    if (SUCCEEDED(hr) && ppf) {
        EnsureParentDirectories(lnkPath);
        hr = ppf->lpVtbl->Save(ppf, lnkPath, TRUE);
        ppf->lpVtbl->Release(ppf);
    }
    psl->lpVtbl->Release(psl);
    return SUCCEEDED(hr);
}

static void RegisterUserUninstaller(const wchar_t *installDir) {
    HKEY hKey = NULL;
    const wchar_t *subKey = L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FEA_Report_Maker_v3.0.1";
    if (RegCreateKeyExW(HKEY_CURRENT_USER, subKey, 0, NULL, 0, KEY_WRITE, NULL, &hKey, NULL) != ERROR_SUCCESS) {
        return;
    }

    const wchar_t *dispName = L"FEA Report Maker v3.0.1";
    const wchar_t *dispVer  = L"3.0.1";
    const wchar_t *pub      = L"Mech Well";
    wchar_t iconPath[MAX_PATH];
    wchar_t uninstCmd[MAX_PATH + 16];
    _snwprintf(iconPath, MAX_PATH, L"%s\\FEA_Report_Maker.exe,0", installDir);
    _snwprintf(uninstCmd, MAX_PATH + 16, L"\"%s\\Uninstall.exe\"", installDir);

    RegSetValueExW(hKey, L"DisplayName", 0, REG_SZ, (const BYTE *)dispName, (DWORD)((wcslen(dispName) + 1) * sizeof(wchar_t)));
    RegSetValueExW(hKey, L"DisplayVersion", 0, REG_SZ, (const BYTE *)dispVer, (DWORD)((wcslen(dispVer) + 1) * sizeof(wchar_t)));
    RegSetValueExW(hKey, L"Publisher", 0, REG_SZ, (const BYTE *)pub, (DWORD)((wcslen(pub) + 1) * sizeof(wchar_t)));
    RegSetValueExW(hKey, L"InstallLocation", 0, REG_SZ, (const BYTE *)installDir, (DWORD)((wcslen(installDir) + 1) * sizeof(wchar_t)));
    RegSetValueExW(hKey, L"DisplayIcon", 0, REG_SZ, (const BYTE *)iconPath, (DWORD)((wcslen(iconPath) + 1) * sizeof(wchar_t)));
    RegSetValueExW(hKey, L"UninstallString", 0, REG_SZ, (const BYTE *)uninstCmd, (DWORD)((wcslen(uninstCmd) + 1) * sizeof(wchar_t)));

    DWORD one = 1;
    RegSetValueExW(hKey, L"NoModify", 0, REG_DWORD, (const BYTE *)&one, sizeof(one));
    RegSetValueExW(hKey, L"NoRepair", 0, REG_DWORD, (const BYTE *)&one, sizeof(one));
    RegCloseKey(hKey);
}

static DWORD WINAPI InstallWorkerThread(LPVOID lpParam) {
    (void)lpParam;
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    wchar_t selfExe[MAX_PATH] = L"";
    GetModuleFileNameW(NULL, selfExe, MAX_PATH);

    FILE *fp = _wfopen(selfExe, L"rb");
    if (!fp) {
        PostMessageW(g_hwnd, WM_INSTALL_DONE, 0, (LPARAM)_wcsdup(L"Could not open installer executable for reading."));
        CoUninitialize();
        return 1;
    }

    mz_zip_archive zip;
    ZeroMemory(&zip, sizeof(zip));
    if (!mz_zip_reader_init_cfile(&zip, fp, 0, 0)) {
        fclose(fp);
        PostMessageW(g_hwnd, WM_INSTALL_DONE, 0, (LPARAM)_wcsdup(L"Installer payload archive not found or corrupted."));
        CoUninitialize();
        return 1;
    }

    CreateDirRecursive(g_installDir);
    mz_uint totalFiles = mz_zip_reader_get_num_files(&zip);
    if (totalFiles == 0) {
        mz_zip_reader_end(&zip);
        fclose(fp);
        PostMessageW(g_hwnd, WM_INSTALL_DONE, 0, (LPARAM)_wcsdup(L"Installer payload archive is empty."));
        CoUninitialize();
        return 1;
    }

    for (mz_uint i = 0; i < totalFiles; i++) {
        if (InterlockedCompareExchange(&g_cancelRequested, 0, 0) != 0) {
            mz_zip_reader_end(&zip);
            fclose(fp);
            PostMessageW(g_hwnd, WM_INSTALL_DONE, 0, (LPARAM)_wcsdup(L"Installation was cancelled."));
            CoUninitialize();
            return 1;
        }

        mz_zip_archive_file_stat st;
        if (!mz_zip_reader_file_stat(&zip, i, &st)) continue;

        wchar_t relPath[MAX_PATH] = L"";
        MultiByteToWideChar(CP_UTF8, 0, st.m_filename, -1, relPath, MAX_PATH);
        for (wchar_t *p = relPath; *p; p++) {
            if (*p == L'/') *p = L'\\';
        }

        wchar_t outPath[MAX_PATH];
        _snwprintf(outPath, MAX_PATH, L"%s\\%s", g_installDir, relPath);

        if (mz_zip_reader_is_file_a_directory(&zip, i)) {
            CreateDirRecursive(outPath);
        } else {
            EnsureParentDirectories(outPath);
            SetFileAttributesW(outPath, FILE_ATTRIBUTE_NORMAL);
            FILE *outFp = _wfopen(outPath, L"wb");
            if (outFp) {
                mz_zip_reader_extract_to_cfile(&zip, i, outFp, 0);
                fclose(outFp);
            }
        }

        if ((i % 15 == 0) || (i + 1 == totalFiles)) {
            int permille = (int)(((unsigned long long)(i + 1) * 1000ULL) / (unsigned long long)totalFiles);
            wchar_t *statusText = (wchar_t *)calloc(MAX_PATH + 64, sizeof(wchar_t));
            if (statusText) {
                _snwprintf(statusText, MAX_PATH + 63, L"Installing (%d%%): %s", permille / 10, relPath);
            }
            PostMessageW(g_hwnd, WM_INSTALL_PROGRESS, (WPARAM)permille, (LPARAM)statusText);
        }
    }

    mz_zip_reader_end(&zip);
    fclose(fp);

    wchar_t launcherExe[MAX_PATH];
    wchar_t uninstExe[MAX_PATH];
    _snwprintf(launcherExe, MAX_PATH, L"%s\\FEA_Report_Maker.exe", g_installDir);
    _snwprintf(uninstExe, MAX_PATH, L"%s\\Uninstall.exe", g_installDir);

    if (g_optDesktop) {
        wchar_t desktop[MAX_PATH] = L"";
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_DESKTOPDIRECTORY, NULL, 0, desktop))) {
            wchar_t lnk[MAX_PATH];
            _snwprintf(lnk, MAX_PATH, L"%s\\FEA Report Maker.lnk", desktop);
            CreateShortcutLink(
                launcherExe,
                g_installDir,
                lnk,
                L"FEA Report Maker v3.0.1 - Static Structural FEA Report Generator",
                launcherExe
            );
        }
    }

    if (g_optStartMenu) {
        wchar_t programs[MAX_PATH] = L"";
        if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_PROGRAMS, NULL, 0, programs))) {
            wchar_t smAppLnk[MAX_PATH];
            wchar_t smUninstLnk[MAX_PATH];
            _snwprintf(smAppLnk, MAX_PATH, L"%s\\FEA Report Maker\\FEA Report Maker.lnk", programs);
            _snwprintf(smUninstLnk, MAX_PATH, L"%s\\FEA Report Maker\\Uninstall FEA Report Maker.lnk", programs);
            CreateShortcutLink(
                launcherExe,
                g_installDir,
                smAppLnk,
                L"FEA Report Maker v3.0.1 - Static Structural FEA Report Generator",
                launcherExe
            );
            CreateShortcutLink(
                uninstExe,
                g_installDir,
                smUninstLnk,
                L"Uninstall FEA Report Maker v3.0.1",
                uninstExe
            );
        }
    }

    RegisterUserUninstaller(g_installDir);
    PostMessageW(g_hwnd, WM_INSTALL_DONE, 1, 0);
    CoUninitialize();
    return 0;
}

static void BrowseForInstallFolder(HWND hwnd) {
    BROWSEINFOW bi;
    ZeroMemory(&bi, sizeof(bi));
    bi.hwndOwner = hwnd;
    bi.lpszTitle = L"Choose the folder where FEA Report Maker v3.0.1 should be installed (no administrator rights needed):";
    bi.ulFlags   = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_USENEWUI;

    LPITEMIDLIST pidl = SHBrowseForFolderW(&bi);
    if (pidl) {
        wchar_t chosen[MAX_PATH] = L"";
        if (SHGetPathFromIDListW(pidl, chosen) && *chosen) {
            wchar_t full[MAX_PATH];
            if (wcsstr(chosen, L"FEA_Report_Maker") != NULL) {
                wcsncpy(full, chosen, MAX_PATH);
            } else {
                _snwprintf(full, MAX_PATH, L"%s\\FEA_Report_Maker_v3.0.1", chosen);
            }
            SetWindowTextW(g_hEditDir, full);
        }
        CoTaskMemFree(pidl);
    }
}

static void LaunchInstalledApp(void) {
    wchar_t launcherExe[MAX_PATH];
    _snwprintf(launcherExe, MAX_PATH, L"%s\\FEA_Report_Maker.exe", g_installDir);
    ShellExecuteW(NULL, L"open", launcherExe, NULL, g_installDir, SW_SHOWNORMAL);
}

static void StartInstallation(void) {
    if (g_installing) return;
    GetWindowTextW(g_hEditDir, g_installDir, MAX_PATH);
    if (!g_installDir[0]) {
        MessageBoxW(g_hwnd, L"Please enter a valid installation folder.", L"FEA Report Maker Setup", MB_ICONWARNING | MB_OK);
        return;
    }

    g_optDesktop   = (SendMessageW(g_hChkDesktop, BM_GETCHECK, 0, 0) == BST_CHECKED);
    g_optStartMenu = (SendMessageW(g_hChkStartMenu, BM_GETCHECK, 0, 0) == BST_CHECKED);
    g_optLaunch    = (SendMessageW(g_hChkLaunch, BM_GETCHECK, 0, 0) == BST_CHECKED);

    g_installing = TRUE;
    EnableWindow(g_hEditDir, FALSE);
    EnableWindow(g_hBtnBrowse, FALSE);
    EnableWindow(g_hChkDesktop, FALSE);
    EnableWindow(g_hChkStartMenu, FALSE);
    EnableWindow(g_hBtnInstall, FALSE);
    SetWindowTextW(g_hStatus, L"Preparing installation...");

    HANDLE hThread = CreateThread(NULL, 0, InstallWorkerThread, NULL, 0, NULL);
    if (hThread) CloseHandle(hThread);
}

static LRESULT CALLBACK SetupWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE: {
        HWND hIntro = CreateWindowExW(
            0, L"STATIC",
            L"Welcome to the FEA Report Maker v3.0.1 Setup Wizard.\r\n"
            L"This offline installer bundles FEA Report Maker v3.0.1, Python 3.12, all required libraries, "
            L"and Tesseract OCR. It installs into your user folder without needing Administrator access.",
            WS_CHILD | WS_VISIBLE,
            24, 80, 550, 56,
            hwnd, NULL, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(hIntro, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        HWND hLblDir = CreateWindowExW(
            0, L"STATIC", L"Destination Folder (User-level, No Admin Required):",
            WS_CHILD | WS_VISIBLE,
            24, 146, 420, 20,
            hwnd, NULL, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(hLblDir, WM_SETFONT, (WPARAM)g_hFontBold, TRUE);

        g_hEditDir = CreateWindowExW(
            WS_EX_CLIENTEDGE, L"EDIT", g_installDir,
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | ES_AUTOHSCROLL,
            24, 170, 444, 28,
            hwnd, (HMENU)IDC_EDIT_DIR, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hEditDir, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        g_hBtnBrowse = CreateWindowExW(
            0, L"BUTTON", L"Browse...",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            478, 169, 96, 30,
            hwnd, (HMENU)IDC_BTN_BROWSE, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hBtnBrowse, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        g_hChkDesktop = CreateWindowExW(
            0, L"BUTTON", L"Create a Desktop shortcut (FEA Report Maker)",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
            24, 214, 480, 24,
            hwnd, (HMENU)IDC_CHK_DESKTOP, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hChkDesktop, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(g_hChkDesktop, BM_SETCHECK, BST_CHECKED, 0);

        g_hChkStartMenu = CreateWindowExW(
            0, L"BUTTON", L"Create Start Menu shortcuts",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
            24, 242, 480, 24,
            hwnd, (HMENU)IDC_CHK_STARTMENU, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hChkStartMenu, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(g_hChkStartMenu, BM_SETCHECK, BST_CHECKED, 0);

        g_hChkLaunch = CreateWindowExW(
            0, L"BUTTON", L"Launch FEA Report Maker when setup finishes",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_AUTOCHECKBOX,
            24, 270, 480, 24,
            hwnd, (HMENU)IDC_CHK_LAUNCH, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hChkLaunch, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(g_hChkLaunch, BM_SETCHECK, BST_CHECKED, 0);

        g_hStatus = CreateWindowExW(
            0, L"STATIC", L"Ready to install.",
            WS_CHILD | WS_VISIBLE | SS_LEFTNOWORDWRAP,
            24, 308, 550, 20,
            hwnd, (HMENU)IDC_LBL_STATUS, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hStatus, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        g_hProgress = CreateWindowExW(
            0, PROGRESS_CLASSW, NULL,
            WS_CHILD | WS_VISIBLE | PBS_SMOOTH,
            24, 332, 550, 24,
            hwnd, (HMENU)IDC_PROGRESS, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hProgress, PBM_SETRANGE, 0, MAKELPARAM(0, 1000));
        SendMessageW(g_hProgress, PBM_SETPOS, 0, 0);

        g_hBtnInstall = CreateWindowExW(
            0, L"BUTTON", L"Install",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
            356, 376, 104, 34,
            hwnd, (HMENU)IDC_BTN_INSTALL, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hBtnInstall, WM_SETFONT, (WPARAM)g_hFontBold, TRUE);

        g_hBtnCancel = CreateWindowExW(
            0, L"BUTTON", L"Cancel",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            470, 376, 104, 34,
            hwnd, (HMENU)IDC_BTN_CANCEL, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hBtnCancel, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        return 0;
    }

    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        RECT rcHeader = { 0, 0, 620, 68 };
        FillRect(hdc, &rcHeader, g_hBrushHeader);

        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, RGB(255, 255, 255));
        HFONT oldFont = (HFONT)SelectObject(hdc, g_hFontTitle);
        TextOutW(hdc, 24, 12, L"FEA Report Maker v3.0.1 Setup", 29);

        SelectObject(hdc, g_hFontSub);
        SetTextColor(hdc, RGB(185, 215, 242));
        TextOutW(hdc, 24, 40, L"Mech Well  \x2022  100% Offline Setup  \x2022  No Administrator Privileges Required", 73);
        SelectObject(hdc, oldFont);
        EndPaint(hwnd, &ps);
        return 0;
    }

    case WM_CTLCOLORSTATIC: {
        HDC hdc = (HDC)wParam;
        SetBkColor(hdc, RGB(244, 246, 249));
        SetTextColor(hdc, RGB(27, 48, 78));
        return (LRESULT)g_hBrushBg;
    }

    case WM_INSTALL_PROGRESS: {
        int permille = (int)wParam;
        wchar_t *txt = (wchar_t *)lParam;
        SendMessageW(g_hProgress, PBM_SETPOS, (WPARAM)permille, 0);
        if (txt) {
            SetWindowTextW(g_hStatus, txt);
            free(txt);
        }
        return 0;
    }

    case WM_INSTALL_DONE: {
        g_installing = FALSE;
        if (wParam == 1) {
            g_finished = TRUE;
            SendMessageW(g_hProgress, PBM_SETPOS, 1000, 0);
            SetWindowTextW(g_hStatus, L"Installation complete! Click Finish to start FEA Report Maker v3.0.1.");
            SetWindowTextW(g_hBtnInstall, L"Finish");
            EnableWindow(g_hBtnInstall, TRUE);
            EnableWindow(g_hBtnCancel, FALSE);
            EnableWindow(g_hChkLaunch, TRUE);
            if (g_silentMode) {
                DestroyWindow(hwnd);
            }
        } else {
            wchar_t *err = (wchar_t *)lParam;
            SetWindowTextW(g_hStatus, err ? err : L"Installation failed.");
            if (err && !g_silentMode) {
                MessageBoxW(hwnd, err, L"FEA Report Maker Setup", MB_ICONERROR | MB_OK);
            }
            if (err) free(err);
            EnableWindow(g_hEditDir, TRUE);
            EnableWindow(g_hBtnBrowse, TRUE);
            EnableWindow(g_hChkDesktop, TRUE);
            EnableWindow(g_hChkStartMenu, TRUE);
            EnableWindow(g_hBtnInstall, TRUE);
            if (g_silentMode) {
                DestroyWindow(hwnd);
            }
        }
        return 0;
    }

    case WM_COMMAND: {
        switch (LOWORD(wParam)) {
        case IDC_BTN_BROWSE:
            BrowseForInstallFolder(hwnd);
            return 0;
        case IDC_BTN_INSTALL:
            if (g_finished) {
                if (SendMessageW(g_hChkLaunch, BM_GETCHECK, 0, 0) == BST_CHECKED) {
                    LaunchInstalledApp();
                }
                DestroyWindow(hwnd);
            } else {
                StartInstallation();
            }
            return 0;
        case IDC_BTN_CANCEL:
            if (g_installing) {
                InterlockedExchange(&g_cancelRequested, 1);
            } else {
                DestroyWindow(hwnd);
            }
            return 0;
        }
        break;
    }

    case WM_CLOSE:
        if (g_installing) {
            InterlockedExchange(&g_cancelRequested, 1);
            return 0;
        }
        DestroyWindow(hwnd);
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPWSTR lpCmdLine, int nCmdShow) {
    (void)hPrevInstance;

    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);

    INITCOMMONCONTROLSEX icex;
    icex.dwSize = sizeof(icex);
    icex.dwICC = ICC_STANDARD_CLASSES | ICC_PROGRESS_CLASS | ICC_WIN95_CLASSES;
    InitCommonControlsEx(&icex);

    wchar_t localAppData[MAX_PATH] = L"";
    if (GetEnvironmentVariableW(L"LOCALAPPDATA", localAppData, MAX_PATH) && localAppData[0]) {
        _snwprintf(g_installDir, MAX_PATH, L"%s\\Programs\\FEA_Report_Maker_v3.0.1", localAppData);
    } else {
        wchar_t userProfile[MAX_PATH] = L"C:";
        GetEnvironmentVariableW(L"USERPROFILE", userProfile, MAX_PATH);
        _snwprintf(g_installDir, MAX_PATH, L"%s\\FEA_Report_Maker_v3.0.1", userProfile);
    }

    if (lpCmdLine && (wcsstr(lpCmdLine, L"/S") || wcsstr(lpCmdLine, L"/s") || wcsstr(lpCmdLine, L"--silent"))) {
        g_silentMode = TRUE;
    }

    g_hFontTitle = CreateFontW(-20, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontSub   = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontUI    = CreateFontW(-14, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontBold  = CreateFontW(-14, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");

    g_hBrushHeader = CreateSolidBrush(RGB(27, 48, 78));
    g_hBrushBg     = CreateSolidBrush(RGB(244, 246, 249));

    WNDCLASSEXW wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = SetupWndProc;
    wc.hInstance     = hInstance;
    wc.hIcon         = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_MAINICON));
    wc.hIconSm       = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_MAINICON));
    wc.hCursor       = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = g_hBrushBg;
    wc.lpszClassName = L"FEAReportMakerSetupWnd";
    RegisterClassExW(&wc);

    int w = 608, h = 460;
    int sx = (GetSystemMetrics(SM_CXSCREEN) - w) / 2;
    int sy = (GetSystemMetrics(SM_CYSCREEN) - h) / 2;

    g_hwnd = CreateWindowExW(
        0, wc.lpszClassName, L"FEA Report Maker v3.0.1 Setup",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        sx, sy, w, h,
        NULL, NULL, hInstance, NULL
    );

    if (g_silentMode) {
        SendMessageW(g_hChkLaunch, BM_SETCHECK, BST_UNCHECKED, 0);
        StartInstallation();
    } else {
        ShowWindow(g_hwnd, nCmdShow);
        UpdateWindow(g_hwnd);
    }

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        if (!IsDialogMessageW(g_hwnd, &msg)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    CoUninitialize();
    return 0;
}
