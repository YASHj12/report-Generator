#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <stdio.h>
#include <wchar.h>

static void DeleteDirectoryRecursive(const wchar_t *dirPath) {
    wchar_t searchPath[MAX_PATH];
    _snwprintf(searchPath, MAX_PATH, L"%s\\*", dirPath);

    WIN32_FIND_DATAW fd;
    HANDLE hFind = FindFirstFileW(searchPath, &fd);
    if (hFind == INVALID_HANDLE_VALUE) return;

    do {
        if (wcscmp(fd.cFileName, L".") == 0 || wcscmp(fd.cFileName, L"..") == 0) continue;
        wchar_t itemPath[MAX_PATH];
        _snwprintf(itemPath, MAX_PATH, L"%s\\%s", dirPath, fd.cFileName);
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
            DeleteDirectoryRecursive(itemPath);
            RemoveDirectoryW(itemPath);
        } else {
            SetFileAttributesW(itemPath, FILE_ATTRIBUTE_NORMAL);
            DeleteFileW(itemPath);
        }
    } while (FindNextFileW(hFind, &fd));

    FindClose(hFind);
}

int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPWSTR lpCmdLine, int nCmdShow) {
    (void)hInstance;
    (void)hPrevInstance;
    (void)nCmdShow;

    BOOL silent = (lpCmdLine && (wcsstr(lpCmdLine, L"/S") || wcsstr(lpCmdLine, L"/s") || wcsstr(lpCmdLine, L"--silent")));
    if (!silent) {
        int ans = MessageBoxW(
            NULL,
            L"Do you want to uninstall FEA Report Maker v3.0.1 from your computer?",
            L"Uninstall FEA Report Maker v3.0.1",
            MB_ICONQUESTION | MB_YESNO | MB_DEFBUTTON2
        );
        if (ans != IDYES) return 0;
    }

    wchar_t appDir[MAX_PATH] = L"";
    GetModuleFileNameW(NULL, appDir, MAX_PATH);
    wchar_t *slash = wcsrchr(appDir, L'\\');
    if (slash) *slash = L'\0';

    // Remove Desktop shortcut
    wchar_t desktop[MAX_PATH] = L"";
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_DESKTOPDIRECTORY, NULL, 0, desktop))) {
        wchar_t lnk[MAX_PATH];
        _snwprintf(lnk, MAX_PATH, L"%s\\FEA Report Maker.lnk", desktop);
        DeleteFileW(lnk);
    }

    // Remove Start Menu folder
    wchar_t programs[MAX_PATH] = L"";
    if (SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_PROGRAMS, NULL, 0, programs))) {
        wchar_t smDir[MAX_PATH];
        _snwprintf(smDir, MAX_PATH, L"%s\\FEA Report Maker", programs);
        DeleteDirectoryRecursive(smDir);
        RemoveDirectoryW(smDir);
    }

    // Remove HKCU Uninstall registry entry (no admin rights needed)
    RegDeleteKeyW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\FEA_Report_Maker_v3.0.1");

    // Delete files inside appDir (except Uninstall.exe which is currently running)
    DeleteDirectoryRecursive(appDir);

    if (!silent) {
        MessageBoxW(
            NULL,
            L"FEA Report Maker v3.0.1 has been uninstalled.",
            L"Uninstall FEA Report Maker v3.0.1",
            MB_ICONINFORMATION | MB_OK
        );
    }

    // Self-delete Uninstall.exe and appDir after exit
    wchar_t cmdArgs[MAX_PATH * 2];
    _snwprintf(cmdArgs, MAX_PATH * 2, L"/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"%s\"", appDir);
    ShellExecuteW(NULL, L"open", L"cmd.exe", cmdArgs, L"C:\\", SW_HIDE);
    return 0;
}
