#define UNICODE
#define _UNICODE
#define _WIN32_WINNT 0x0601
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <shlobj.h>
#include <stdio.h>
#include <wchar.h>

#define IDI_MAINICON      101
#define IDC_BTN_BROWSER   201
#define IDC_BTN_DOWNLOADS 202
#define IDC_BTN_OUTPUTS   203
#define IDC_BTN_EXIT      204
#define IDC_EDIT_LOG      205
#define IDC_LBL_STATUS    206
#define WM_APPEND_LOG     (WM_APP + 1)
#define WM_SERVER_URL     (WM_APP + 2)
#define WM_SERVER_EXITED  (WM_APP + 3)

static HWND g_hwnd = NULL;
static HWND g_hLog = NULL;
static HWND g_hStatus = NULL;
static HANDLE g_hProcess = NULL;
static HANDLE g_hJob = NULL;
static HANDLE g_hPipeRead = NULL;
static HFONT g_hFontTitle = NULL;
static HFONT g_hFontSub = NULL;
static HFONT g_hFontUI = NULL;
static HFONT g_hFontMono = NULL;
static HBRUSH g_hBrushHeader = NULL;
static HBRUSH g_hBrushBg = NULL;

static wchar_t g_appDir[MAX_PATH] = L"";
static wchar_t g_serverUrl[128] = L"http://127.0.0.1:5055";
static volatile LONG g_closing = 0;

static void GetAppDirectory(void) {
    GetModuleFileNameW(NULL, g_appDir, MAX_PATH);
    wchar_t *lastSlash = wcsrchr(g_appDir, L'\\');
    if (lastSlash) *lastSlash = L'\0';
}

static void AppendLogText(const wchar_t *text) {
    if (!g_hLog) return;
    int len = GetWindowTextLengthW(g_hLog);
    SendMessageW(g_hLog, EM_SETSEL, (WPARAM)len, (LPARAM)len);
    SendMessageW(g_hLog, EM_REPLACESEL, FALSE, (LPARAM)text);
}

static void StopServerProcess(void) {
    if (g_hProcess) {
        TerminateProcess(g_hProcess, 0);
        WaitForSingleObject(g_hProcess, 1500);
        CloseHandle(g_hProcess);
        g_hProcess = NULL;
    }
    if (g_hJob) {
        CloseHandle(g_hJob);
        g_hJob = NULL;
    }
}

static DWORD WINAPI LogReaderThread(LPVOID lpParam) {
    (void)lpParam;
    char buf[1024];
    DWORD bytesRead = 0;

    while (g_hPipeRead && ReadFile(g_hPipeRead, buf, sizeof(buf) - 1, &bytesRead, NULL) && bytesRead > 0) {
        buf[bytesRead] = '\0';

        // Normalize \n to \r\n for Win32 EDIT control
        char norm[2048];
        int j = 0;
        for (DWORD i = 0; i < bytesRead && j < (int)sizeof(norm) - 3; i++) {
            if (buf[i] == '\n' && (i == 0 || buf[i - 1] != '\r')) {
                norm[j++] = '\r';
            }
            norm[j++] = buf[i];
        }
        norm[j] = '\0';

        // Detect http://127.0.0.1:<port> in output
        const char *httpPos = strstr(norm, "http://127.0.0.1:");
        if (httpPos) {
            wchar_t *wUrl = (wchar_t *) calloc(128, sizeof(wchar_t));
            if (wUrl) {
                int k = 0;
                while (httpPos[k] && httpPos[k] != ' ' && httpPos[k] != '\r' && httpPos[k] != '\n' && k < 95) {
                    wUrl[k] = (wchar_t)httpPos[k];
                    k++;
                }
                wUrl[k] = L'\0';
                PostMessageW(g_hwnd, WM_SERVER_URL, 0, (LPARAM)wUrl);
            }
        }

        int wlen = MultiByteToWideChar(CP_UTF8, 0, norm, -1, NULL, 0);
        if (wlen > 0) {
            wchar_t *wbuf = (wchar_t *)malloc((size_t)wlen * sizeof(wchar_t));
            if (wbuf) {
                MultiByteToWideChar(CP_UTF8, 0, norm, -1, wbuf, wlen);
                PostMessageW(g_hwnd, WM_APPEND_LOG, 0, (LPARAM)wbuf);
            }
        }
    }

    if (g_hProcess) {
        WaitForSingleObject(g_hProcess, INFINITE);
    }
    if (!g_closing && g_hwnd) {
        PostMessageW(g_hwnd, WM_SERVER_EXITED, 0, 0);
    }
    return 0;
}

static BOOL StartServerProcess(void) {
    SetCurrentDirectoryW(g_appDir);

    wchar_t pyExe[MAX_PATH];
    _snwprintf(pyExe, MAX_PATH, L"%s\\.venv\\Scripts\\python.exe", g_appDir);
    if (GetFileAttributesW(pyExe) == INVALID_FILE_ATTRIBUTES) {
        wcsncpy(pyExe, L"python.exe", MAX_PATH);
    }

    wchar_t tessExe[MAX_PATH], tessData[MAX_PATH];
    _snwprintf(tessExe, MAX_PATH, L"%s\\tesseract\\tesseract.exe", g_appDir);
    _snwprintf(tessData, MAX_PATH, L"%s\\tesseract\\tessdata", g_appDir);
    if (GetFileAttributesW(tessExe) != INVALID_FILE_ATTRIBUTES) {
        SetEnvironmentVariableW(L"TESSERACT_CMD", tessExe);
        SetEnvironmentVariableW(L"TESSDATA_PREFIX", tessData);
    }
    SetEnvironmentVariableW(L"PYTHONUTF8", L"1");
    SetEnvironmentVariableW(L"PYTHONUNBUFFERED", L"1");

    wchar_t oldPath[8192] = L"";
    GetEnvironmentVariableW(L"PATH", oldPath, 8192);
    wchar_t newPath[10240];
    _snwprintf(newPath, 10240, L"%s\\.venv\\Scripts;%s\\tesseract;%s", g_appDir, g_appDir, oldPath);
    SetEnvironmentVariableW(L"PATH", newPath);

    SECURITY_ATTRIBUTES sa;
    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    HANDLE hWrite = NULL;
    if (!CreatePipe(&g_hPipeRead, &hWrite, &sa, 0)) {
        return FALSE;
    }
    SetHandleInformation(g_hPipeRead, HANDLE_FLAG_INHERIT, 0);

    g_hJob = CreateJobObjectW(NULL, NULL);
    if (g_hJob) {
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION jeli;
        ZeroMemory(&jeli, sizeof(jeli));
        jeli.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(g_hJob, JobObjectExtendedLimitInformation, &jeli, sizeof(jeli));
    }

    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    ZeroMemory(&pi, sizeof(pi));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = hWrite;
    si.hStdError = hWrite;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    wchar_t cmdLine[MAX_PATH * 2];
    _snwprintf(cmdLine, MAX_PATH * 2, L"\"%s\" -u \"%s\\app\\server.py\"", pyExe, g_appDir);

    BOOL ok = CreateProcessW(
        NULL,
        cmdLine,
        NULL,
        NULL,
        TRUE,
        CREATE_NO_WINDOW,
        NULL,
        g_appDir,
        &si,
        &pi
    );
    CloseHandle(hWrite);

    if (!ok) {
        CloseHandle(g_hPipeRead);
        g_hPipeRead = NULL;
        return FALSE;
    }

    g_hProcess = pi.hProcess;
    if (g_hJob) {
        AssignProcessToJobObject(g_hJob, g_hProcess);
    }
    CloseHandle(pi.hThread);

    HANDLE hThread = CreateThread(NULL, 0, LogReaderThread, NULL, 0, NULL);
    if (hThread) CloseHandle(hThread);
    return TRUE;
}

static void OpenDownloadsFolder(void) {
    HINSTANCE r = ShellExecuteW(g_hwnd, L"open", L"shell:Downloads", NULL, NULL, SW_SHOWNORMAL);
    if ((INT_PTR)r <= 32) {
        wchar_t userProfile[MAX_PATH] = L"";
        if (GetEnvironmentVariableW(L"USERPROFILE", userProfile, MAX_PATH)) {
            wchar_t dlPath[MAX_PATH];
            _snwprintf(dlPath, MAX_PATH, L"%s\\Downloads", userProfile);
            ShellExecuteW(g_hwnd, L"open", dlPath, NULL, NULL, SW_SHOWNORMAL);
        }
    }
}

static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
    case WM_CREATE: {
        g_hStatus = CreateWindowExW(
            0, L"STATIC",
            L"Starting FEA Report Maker v3.0.1... Your browser will open automatically.",
            WS_CHILD | WS_VISIBLE,
            20, 78, 600, 22,
            hwnd, (HMENU)IDC_LBL_STATUS, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hStatus, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        HWND hBtnBrowser = CreateWindowExW(
            0, L"BUTTON", L"Open App in Browser",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_DEFPUSHBUTTON,
            20, 108, 165, 36,
            hwnd, (HMENU)IDC_BTN_BROWSER, GetModuleHandleW(NULL), NULL
        );
        HWND hBtnDl = CreateWindowExW(
            0, L"BUTTON", L"Open Downloads Folder",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            195, 108, 175, 36,
            hwnd, (HMENU)IDC_BTN_DOWNLOADS, GetModuleHandleW(NULL), NULL
        );
        HWND hBtnOut = CreateWindowExW(
            0, L"BUTTON", L"Open Backup Outputs",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            380, 108, 155, 36,
            hwnd, (HMENU)IDC_BTN_OUTPUTS, GetModuleHandleW(NULL), NULL
        );
        HWND hBtnExit = CreateWindowExW(
            0, L"BUTTON", L"Stop && Exit",
            WS_CHILD | WS_VISIBLE | WS_TABSTOP | BS_PUSHBUTTON,
            545, 108, 95, 36,
            hwnd, (HMENU)IDC_BTN_EXIT, GetModuleHandleW(NULL), NULL
        );

        SendMessageW(hBtnBrowser, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(hBtnDl, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(hBtnOut, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);
        SendMessageW(hBtnExit, WM_SETFONT, (WPARAM)g_hFontUI, TRUE);

        g_hLog = CreateWindowExW(
            WS_EX_CLIENTEDGE, L"EDIT", L"",
            WS_CHILD | WS_VISIBLE | WS_VSCROLL | ES_MULTILINE | ES_AUTOVSCROLL | ES_READONLY,
            20, 156, 620, 210,
            hwnd, (HMENU)IDC_EDIT_LOG, GetModuleHandleW(NULL), NULL
        );
        SendMessageW(g_hLog, WM_SETFONT, (WPARAM)g_hFontMono, TRUE);
        return 0;
    }

    case WM_PAINT: {
        PAINTSTRUCT ps;
        HDC hdc = BeginPaint(hwnd, &ps);
        RECT rcHeader = { 0, 0, 680, 66 };
        FillRect(hdc, &rcHeader, g_hBrushHeader);

        SetBkMode(hdc, TRANSPARENT);
        SetTextColor(hdc, RGB(255, 255, 255));
        HFONT oldFont = (HFONT)SelectObject(hdc, g_hFontTitle);
        TextOutW(hdc, 20, 12, L"FEA Report Maker v3.0.1", 23);

        SelectObject(hdc, g_hFontSub);
        SetTextColor(hdc, RGB(185, 215, 242));
        TextOutW(hdc, 20, 39, L"Mech Well  \x2022  100% Local & Offline  \x2022  Downloads .pptx directly to your Downloads folder", 88);
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

    case WM_APPEND_LOG: {
        wchar_t *txt = (wchar_t *)lParam;
        if (txt) {
            AppendLogText(txt);
            free(txt);
        }
        return 0;
    }

    case WM_SERVER_URL: {
        wchar_t *url = (wchar_t *)lParam;
        if (url) {
            wcsncpy(g_serverUrl, url, 127);
            g_serverUrl[127] = L'\0';
            free(url);
            wchar_t statusMsg[256];
            _snwprintf(statusMsg, 256, L"Running at %s  \x2022  Leave this window open while working.", g_serverUrl);
            SetWindowTextW(g_hStatus, statusMsg);
        }
        return 0;
    }

    case WM_SERVER_EXITED: {
        SetWindowTextW(g_hStatus, L"The server has stopped. You may close this window.");
        return 0;
    }

    case WM_COMMAND: {
        switch (LOWORD(wParam)) {
        case IDC_BTN_BROWSER:
            ShellExecuteW(hwnd, L"open", g_serverUrl, NULL, NULL, SW_SHOWNORMAL);
            return 0;
        case IDC_BTN_DOWNLOADS:
            OpenDownloadsFolder();
            return 0;
        case IDC_BTN_OUTPUTS: {
            wchar_t outDir[MAX_PATH];
            _snwprintf(outDir, MAX_PATH, L"%s\\outputs", g_appDir);
            CreateDirectoryW(outDir, NULL);
            ShellExecuteW(hwnd, L"open", outDir, NULL, NULL, SW_SHOWNORMAL);
            return 0;
        }
        case IDC_BTN_EXIT:
            SendMessageW(hwnd, WM_CLOSE, 0, 0);
            return 0;
        }
        break;
    }

    case WM_CLOSE:
        InterlockedExchange(&g_closing, 1);
        StopServerProcess();
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
    (void)lpCmdLine;

    INITCOMMONCONTROLSEX icex;
    icex.dwSize = sizeof(icex);
    icex.dwICC = ICC_STANDARD_CLASSES | ICC_WIN95_CLASSES;
    InitCommonControlsEx(&icex);

    GetAppDirectory();

    g_hFontTitle = CreateFontW(-20, 0, 0, 0, FW_BOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontSub   = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontUI    = CreateFontW(-14, 0, 0, 0, FW_SEMIBOLD, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, DEFAULT_PITCH | FF_SWISS, L"Segoe UI");
    g_hFontMono  = CreateFontW(-13, 0, 0, 0, FW_NORMAL, FALSE, FALSE, FALSE, DEFAULT_CHARSET,
                               OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY, FIXED_PITCH | FF_MODERN, L"Consolas");

    g_hBrushHeader = CreateSolidBrush(RGB(27, 48, 78));
    g_hBrushBg     = CreateSolidBrush(RGB(244, 246, 249));

    WNDCLASSEXW wc;
    ZeroMemory(&wc, sizeof(wc));
    wc.cbSize        = sizeof(wc);
    wc.lpfnWndProc   = WndProc;
    wc.hInstance     = hInstance;
    wc.hIcon         = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_MAINICON));
    wc.hIconSm       = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_MAINICON));
    wc.hCursor       = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = g_hBrushBg;
    wc.lpszClassName = L"FEAReportMakerLauncherWnd";
    RegisterClassExW(&wc);

    int w = 668, h = 420;
    int sx = (GetSystemMetrics(SM_CXSCREEN) - w) / 2;
    int sy = (GetSystemMetrics(SM_CYSCREEN) - h) / 2;

    g_hwnd = CreateWindowExW(
        0, wc.lpszClassName, L"FEA Report Maker v3.0.1",
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
        sx, sy, w, h,
        NULL, NULL, hInstance, NULL
    );

    ShowWindow(g_hwnd, nCmdShow);
    UpdateWindow(g_hwnd);

    if (!StartServerProcess()) {
        AppendLogText(L"ERROR: Could not start the bundled Python server (.venv\\Scripts\\python.exe app\\server.py).\r\n");
        SetWindowTextW(g_hStatus, L"Could not start server. Please reinstall FEA Report Maker.");
    }

    MSG msg;
    while (GetMessageW(&msg, NULL, 0, 0) > 0) {
        if (!IsDialogMessageW(g_hwnd, &msg)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    StopServerProcess();
    return 0;
}
